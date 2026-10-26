# -*- coding: utf-8 -*-
"""Counterfactual replay harness.

Loads a recorded match, replays it with recorded inputs for both teams
(verifying exact fidelity), or with our own policy for our team while the
opponent keeps its recorded inputs (open-loop counterfactual).

Faithful to simulation.js: kickoff jitter RNG, red cards, kickoff at half time.
"""
import gzip, json, math, importlib.util, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)

_spec = importlib.util.spec_from_file_location('agmod', os.path.join(WS, 'agent.py'))
ag = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ag)

W, H = 44, 26
SPAWN_Y = {1: [13], 2: [9, 17], 3: [7, 13, 19], 4: [6, 10, 16, 20],
           5: [5, 9, 13, 17, 21], 6: [3, 7, 11, 15, 19, 23]}


class Rng(object):
    def __init__(self, seed):
        self.s = (int(seed) & 0xffffffff) or 1

    def next(self):
        self.s = (1664525 * self.s + 1013904223) & 0xffffffff
        return self.s / 4294967296.0

    def range(self, a, b):
        return a + (b - a) * self.next()


def spawn_rng(seed, n):
    return Rng((int(seed) & 0xffffffff) ^ ((n * 2654435761) & 0xffffffff))


def base_spawns(n, rng):
    out = {0: [], 1: []}
    for t in (0, 1):
        bx = 11 if t == 0 else W - 12
        for y in SPAWN_Y[n]:
            jx = bx + rng.range(-1.5, 1.5)
            jy = y + rng.range(-1.5, 1.5)
            jx = min(max(jx, ag.R_U + 1), W - ag.R_U - 1)
            jy = min(max(jy, ag.R_U + 1), H - ag.R_U - 1)
            out[t].append((jx, jy))
    return out


def make_state(n, spawns, ball_xy):
    s = ag.St()
    s.n = n
    s.units = []
    for t in (0, 1):
        for i in range(n):
            u = ag.Unit(t, i)
            x, y = spawns[t][i]
            u.x = x + 0.5
            u.y = y + 0.5
            u.fx = 1.0 if t == 0 else -1.0
            u.fy = 0.0
            s.units.append(u)
    s.bx, s.by = ball_xy
    s.bvx = s.bvy = 0.0
    s.owner = -1
    s.lastTouch = None
    s.lastTeam = None
    s.score = [0, 0]
    s.frame = 0
    s.freeze = 0
    s.golden = False
    s.goldenEnd = 0
    s.kickoffTeam = 0
    s.status = 'playing'
    s.half = 1
    return s


class Game(object):
    """Faithful engine wrapper around agent.py primitives."""

    def __init__(self, replay):
        d = replay
        self.d = d
        self.n = d['teamSize']
        self.seed = d['seed']
        self.spawns = d['map']['spawns']
        if isinstance(self.spawns, dict):
            self.spawns = {int(k): [tuple(p) for p in v] for k, v in self.spawns.items()}
        else:
            self.spawns = {0: [tuple(p) for p in self.spawns[0]],
                           1: [tuple(p) for p in self.spawns[1]]}
        rng = spawn_rng(self.seed, self.n)
        # consume the spawn jitter exactly like createMatch
        spawns = base_spawns(self.n, rng)
        self.spawns = {0: [tuple(p) for p in spawns[0]], 1: [tuple(p) for p in spawns[1]]}
        ball = (22.0 + rng.range(-1.2, 1.2), 13.0 + rng.range(-1.2, 1.2))
        self.rng = rng
        self.s = make_state(self.n, self.spawns, ball)
        self.kickSequence = [(0, 0)]  # dummy, initial state already built
        self.events = []
        self.done = False

    # ---- faithful kickoff
    def kickoff(self, team, freeze=12):
        s = self.s
        for u in s.units:
            x, y = self.spawns[u.team][u.index]
            u.x = x + 0.5
            u.y = y + 0.5
            u.fx = 1.0 if u.team == 0 else -1.0
            u.fy = 0.0
            u.kickCd = u.controlLock = u.stealLock = u.foulLock = 0
        s.bx = 22.0 + self.rng.range(-1.2, 1.2)
        s.by = 13.0 + self.rng.range(-1.2, 1.2)
        s.bvx = s.bvy = 0.0
        s.owner = -1
        s.lastTouch = None
        s.lastTeam = None
        s.freeze = freeze
        s.kickoffTeam = team
        self.events.append(('kickoff', s.frame, team))

    def emit_goal(self, team):
        self.s.score[team] += 1
        self.events.append(('goal', self.s.frame, team))
        if self.s.golden:
            self.s.status = 'finished'
            self.done = True
            return
        self.kickoff(1 - team, 12)

    def commit_foul(self, u, box_team):
        s = self.s
        u.foulLock = int(round(ag.FOUL_LOCK * ag.HZ))
        self.events.append(('card', s.frame, u.team, u.index, round(u.x, 2), round(u.y, 2)))
        if u in s.units:
            s.units.remove(u)
        left = sum(1 for x in s.units if x.team == u.team)
        if left == 0:
            s.status = 'finished'
            self.done = True
            self.events.append(('forfeit', s.frame, u.team))
            return
        self.kickoff(1 - u.team, 12)

    def check_fouls(self):
        s = self.s
        for u in list(s.units):
            if u.foulLock > 0:
                continue
            if ag.in_penalty_box(1 - u.team, u.x, u.y):
                self.commit_foul(u, 1 - u.team)
                return True
        return False

    def check_clock(self):
        s = self.s
        if s.status != 'playing':
            return
        half_frames = int(round(60 * ag.HZ))
        match_frames = int(round(120 * ag.HZ))
        if not s.golden:
            if s.half == 1 and s.frame >= half_frames:
                s.half = 2
                self.kickoff(1 - s.kickoffTeam, 12)
            if s.frame >= match_frames:
                if s.score[0] == s.score[1]:
                    s.golden = True
                    s.goldenEnd = s.frame + int(round(20 * ag.HZ))
                else:
                    s.status = 'finished'
                    self.done = True
        elif s.frame >= s.goldenEnd:
            s.status = 'finished'
            self.done = True

    def step(self, inp_by_unit):
        """inp_by_unit: {(team,index): (dir, aimvec_or_None, kick)}"""
        s = self.s
        if s.status != 'playing':
            return
        s.frame += 1
        if s.freeze > 0:
            s.freeze -= 1
            self.check_clock()
            return
        for u in s.units:
            inp = inp_by_unit.get((u.team, u.index))
            if inp is None:
                inp = ('N', None, False)
            ag.update_unit(s, u, inp)
        ag.separate_units(s)
        if self.check_fouls():
            self.check_clock()
            return
        g = ag.update_ball(s)
        if g >= 0:
            self.emit_goal(g)
        self.check_clock()


def load(path):
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        return json.load(f)


def frame_units(d, fr):
    fmt = d.get('unitsFormat')
    if fmt:
        return {('t',): None} if False else [dict(zip(fmt, r)) for r in fr['units']]
    return fr['units']


def obs_from_frame(d, fr):
    fmt = d.get('unitsFormat')
    units = [dict(zip(fmt, r)) for r in fr['units']] if fmt else fr['units']
    return {
        'teamSize': d['teamSize'], 'units': units, 'ball': fr['ball'],
        'score': fr['score'], 'frame': fr['frame'], 'freeze': fr['freeze'],
        'golden': fr['golden'], 'half': fr['half'], 'timeLeft': fr.get('timeLeft'),
        'yourTeam': None, 'status': fr['status'],
    }


def make_aim(a):
    if a is None:
        return None
    r = math.radians(float(a) % 360.0)
    return (math.cos(r), math.sin(r))


def window_to_dict(d, w, team):
    """recorded window inputs for one team -> list[20] of {(team,index): (dir,aim,kick)}"""
    out = []
    for k in range(20):
        row = {}
        for idx, u in enumerate(w['inputs'][team][k]):
            row[(team, idx)] = (u['dir'], make_aim(u.get('aim')), bool(u.get('kick')))
        out.append(row)
    return out


def replay_recorded(path, verbose=False):
    """Full-fidelity check: apply recorded inputs for both teams."""
    d = load(path)
    g = Game(d)
    wins = d['windows']
    assert len(d['frames']) >= 20 * len(wins) + 1
    bad = 0
    for wi, w in enumerate(wins):
        rows = [window_to_dict(d, w, 0)[k] for k in range(20)]
        r1 = window_to_dict(d, w, 1)
        for k in range(20):
            inp = dict(rows[k]); inp.update(r1[k])
            g.step(inp)
        # compare with recorded frame
        fr = d['frames'][20 * (wi + 1)]
        fmt = d.get('unitsFormat')
        obs = obs_from_frame(d, fr)
        G = {(u['team'], u['index']): u for u in obs['units']}
        err = 0.0
        for u in g.s.units:
            r = G.get((u.team, u.index))
            if r is None:
                err = 99
                break
            err = max(err, abs(u.x - r['x']), abs(u.y - r['y']))
        be = max(abs(g.s.bx - fr['ball']['x']), abs(g.s.by - fr['ball']['y']))
        if err > 0.01 or be > 0.01:
            bad += 1
            if verbose:
                print('diverge at window', wi, 'frame', fr['frame'], 'err', round(err, 3), 'ball', round(be, 3),
                      'simscore', g.s.score, 'rec', fr['score'])
            # resync to recorded state (kickoff jitter etc.)
            g.s = ag.state_from_obs(obs)
            g.s.score = list(fr['score'])
            g.done = fr['status'] != 'playing'
            if g.done:
                g.s.status = 'finished'
    return g, bad, d




def r3(v):
    return round(float(v) * 1000.0) / 1000.0


def obs_from_state(s, n, time_left=None):
    units = []
    for u in s.units:
        units.append({
            'id': 't%du%d' % (u.team, u.index), 'team': u.team, 'index': u.index,
            'x': r3(u.x), 'y': r3(u.y),
            'facing': {'x': r3(u.fx), 'y': r3(u.fy)},
            'hasBall': s.owner >= 0 and s.units[s.owner] is u,
            'keeper': u.index == 0,
            'inOwnBox': ag.in_penalty_box(u.team, u.x, u.y),
            'kickCd': r3(u.kickCd / 20.0), 'controlLock': r3(u.controlLock / 20.0),
        })
    oid = None
    if s.owner >= 0:
        ou = s.units[s.owner]
        oid = 't%du%d' % (ou.team, ou.index)
    if time_left is None:
        time_left = max(0.0, 120.0 - s.frame / 20.0)
    return {'teamSize': n, 'units': units,
            'ball': {'x': r3(s.bx), 'y': r3(s.by), 'vx': r3(s.bvx), 'vy': r3(s.bvy),
                     'owner': oid, 'lastTouch': s.lastTouch, 'lastTeam': s.lastTeam},
            'score': list(s.score), 'frame': s.frame,
            'freeze': round(s.freeze / 20.0, 2), 'golden': s.golden,
            'half': s.half, 'timeLeft': time_left, 'status': s.status}


def obs_state(s, n, time_left=None):
    return ag.state_from_obs(obs_from_state(s, n, time_left))

def public_copy(s):
    c = s.clone()
    for u in c.units:
        u.stealLock = 0
        u.foulLock = 0
    return c


def run_policy(path, decide_fn, max_windows=None, verbose=False, resync_each=False):
    """Replay with our policy for our team and recorded opponent inputs."""
    d = load(path)
    g = Game(d)
    us = d['seats'].index('deepseek-g1')
    wins = d['windows']
    for wi, w in enumerate(wins):
        if g.done or g.s.status != 'playing':
            break
        if max_windows is not None and wi >= max_windows:
            break
        tl = None
        if g.s.golden and g.s.goldenEnd:
            tl = max(0.0, (g.s.goldenEnd - g.s.frame) / 20.0)
        src = obs_state(g.s, d['teamSize'], tl)
        frames = decide_fn(src, us, d['teamSize'])
        opp = window_to_dict(d, w, 1 - us)
        for k in range(20):
            inp = dict(opp[k])
            inp.update(frames[k])
            g.step(inp)
        if verbose and wi % 10 == 0:
            print('  w%3d f%5d score %s ball(%.1f,%.1f)' % (wi, g.s.frame, g.s.score, g.s.bx, g.s.by))
        if resync_each:
            fr = d['frames'][min(20 * (wi + 1), len(d['frames']) - 1)]
            obs = obs_from_frame(d, fr)
            ns = ag.state_from_obs(obs)
            ns.score = list(g.s.score)
            ns.frame = fr['frame']
            ns.golden = fr['golden']
            ns.half = fr['half']
            ns.freeze = fr['freeze']
            ns.kickoffTeam = 0
            g.s = ns
            g.done = fr['status'] != 'playing'
    return g


def old_agent_decide(st, me, n):
    import time
    if st.freeze > 0 or st.status != 'playing':
        return [{} for _ in range(20)]
    sc = st.score
    ag.GAME_CTX['desp'] = (sc[me] <= sc[1 - me]) and st.frame > 2400 - 1000
    fr = ag.decide_window(st, me, n)
    out = []
    for f in fr:
        row = {}
        if f is None:
            out.append(row)
            continue
        for i, u in enumerate(st.units):
            if u.team != me:
                continue
            d_, aim, kick = f[i]
            row[(u.team, u.index)] = (d_, aim, bool(kick))
        out.append(row)
    return out


def policy_decide(st, me, n):
    import policy
    return policy.decide(st, me, n, ag)
