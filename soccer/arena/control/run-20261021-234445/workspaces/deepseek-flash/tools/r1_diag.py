"""Round-1 diagnostic: our Brain vs scripted styles, with event accounting.

Usage: python3 tools/r1_diag.py [--n 2] [--seeds 3] [--opp sniper|chase|brain]
"""
import sys, os, math, time, argparse
sys.path.insert(0, '/workspace')
sys.path.insert(0, '/workspace/tools')

import soccer
import brain as brainmod
from soccer_meta import get_meta

META = get_meta()
RULES = META['rules']
W, H = META['W'], META['H']


def new_match(seed, n):
    w = soccer.World(W, H, META['tiles'], RULES, META['penaltyBoxes'], META['goals'], n)
    w.spawns = {int(k): v for k, v in META['spawns_by_n'][str(n)].items()}
    w.kickoffTeam = abs(seed) % 2
    for team in (0, 1):
        for i in range(n):
            u = w.add_unit(team, i, f't{team}u{i}')
            sx, sy = w.spawns[team][i]
            u['x'] = sx + 0.5
            u['y'] = sy + 0.5
            u['fx'] = 1.0 if team == 0 else -1.0
    w.ball = {'x': W / 2.0, 'y': H / 2.0, 'vx': 0.0, 'vy': 0.0,
              'owner': None, 'lastTouch': None, 'lastTeam': None}
    w.freeze = 0
    w.frame = 0
    w.status = 'playing'
    return w


def _box(team):
    b = META['penaltyBoxes'][str(team)]
    return b


def _outside_box_dir(u, tx, ty, box, margin=0.45):
    """One-step direction toward (tx,ty) that never moves closer to `box`
    once within margin (same idea as Brain.choose_dir)."""
    def bd(x, y):
        dx = max(box['x1'] - x, 0.0, x - box['x2'])
        dy = max(box['y1'] - y, 0.0, y - box['y2'])
        return math.hypot(dx, dy)
    cur = bd(u['x'], u['y'])
    sp = RULES['moveSpeed'] * 0.05
    best, bestd = 'N', 1e18
    for name, (vx, vy) in soccer.DIRS.items():
        if name == 'N':
            continue
        nx = max(RULES['unitRadius'], min(W - RULES['unitRadius'], u['x'] + vx * sp))
        ny = max(RULES['unitRadius'], min(H - RULES['unitRadius'], u['y'] + vy * sp))
        nd = bd(nx, ny)
        if nd < margin and nd < cur - 1e-9:
            continue
        d = math.hypot(tx - nx, ty - ny)
        if d < bestd:
            bestd, best = d, name
    return best


class SniperBot:
    """Shoot-on-sight: owner kicks toward a goal corner as soon as possible.

    Non-owners chase; index 0 (when n>1) tracks the line.  It never enters the
    opponent penalty box (that would concede a foul; the real round-1 opponent
    logged zero fouls)."""
    def __init__(self, team, shoot_range=24.0, aim_mode='corner'):
        self.team = team
        self.opp = 1 - team
        self.s = 1 if team == 0 else -1
        self.gx = (W - 1.0) if self.s > 0 else 1.0
        self.shoot_range = shoot_range
        self.aim_mode = aim_mode
        self.box = _box(1 - team)   # opponent box: keep out

    def _decide(self, u, sim):
        b = sim.ball
        team = u['team']
        s = 1 if team == 0 else -1
        gx = (W - 1.0) if s > 0 else 1.0
        box = _box(1 - team)
        n = len([x for x in sim.units if x['team'] == team])
        if b['owner'] == u['id']:
            dg = math.hypot(gx - u['x'], 13.0 - u['y'])
            if dg < self.shoot_range and u['kickCd'] <= 0 and u['controlLock'] <= 0:
                opp_k = None
                for o in sim.units:
                    if o['team'] != team and o['index'] == 0:
                        opp_k = o
                if opp_k is not None and opp_k['y'] > 13.0:
                    gy = 10.85
                elif opp_k is not None:
                    gy = 15.15
                else:
                    gy = 13.0
                ang = math.degrees(math.atan2(gy - u['y'], gx - u['x']))
                return {'dir': 'N', 'aim': ang, 'kick': True}
            tgt_y = 13.0 + (u['y'] - 13.0) * 0.2
            # aim slightly wide of the opponent box centre, stay outside it
            tx, ty = gx - s * 11.0, tgt_y
            d = _outside_box_dir(u, tx, ty, box)
            ang = math.degrees(math.atan2(ty - u['y'], tx - u['x']))
            return {'dir': d, 'aim': ang, 'kick': False}
        if u['index'] == 0 and n > 1:
            kx = gx - s * 2.6
            ty = max(10.9, min(15.1, 13.0 + (b['y'] - 13.0) * 0.6))
            ang = math.degrees(math.atan2(ty - u['y'], kx - u['x']))
            return {'dir': brainmod.oct_name(ang), 'aim': None, 'kick': False}
        # chase the ball, but stop at the opponent box edge (foul rule)
        tx, ty = b['x'], b['y']
        d = _outside_box_dir(u, tx, ty, box)
        return {'dir': d, 'aim': None, 'kick': False}

    def plan(self, w):
        n = w.teamSize
        sim = w.clone()
        frames = []
        for f in range(20):
            mine = {}
            for u in [x for x in sim.units if x['team'] == self.team]:
                mine[u['id']] = self._decide(u, sim)
            inputs = {u['id']: self._decide(u, sim) for u in sim.units}
            sim.step(inputs)
            frames.append([mine['t%du%d' % (self.team, i)] for i in range(n)])
        return frames


class RecBrain(brainmod.Brain):
    """Brain that records owner-shot evaluations for diagnostics."""
    def __init__(self, team):
        super().__init__(team)
        self.shot_calls = 0
        self.shot_yes = 0
        self.owner_bins = {}
        self.owner_frames = 0
        self.shot_log = []

    def pick_shot_target(self, w, u, min_clear=0.18):
        r = super().pick_shot_target(w, u, min_clear)
        self.shot_calls += 1
        if r is not None:
            self.shot_yes += 1
            ev = super().shot_eval(w, u, r)
            opps = self.opp_units(w)
            near = min(opps, key=lambda o: math.hypot(o['x'] - u['x'], o['y'] - u['y'])) if opps else None
            self.shot_log.append((w.frame, round(u['x'], 1), round(u['y'], 1), r,
                                  None if ev is None else round(ev[0], 2),
                                  None if near is None else (round(near['x'], 1), round(near['y'], 1),
                                                             round(math.hypot(near['x'] - u['x'], near['y'] - u['y']), 1))))
        bx = int(u['x'] // 4) * 4
        by = int(u['y'] // 4) * 4
        self.owner_bins[(bx, by)] = self.owner_bins.get((bx, by), 0) + 1
        return r

    def top_bins(self, k=6):
        return sorted(self.owner_bins.items(), key=lambda kv: -kv[1])[:k]


def run(me, opp, seed, n, max_frames=None):
    w = new_match(seed, n)
    max_frames = max_frames or int((RULES['matchSeconds'] + RULES['goldenGoalSeconds'] + 5) * RULES['hz'])
    while w.status == 'playing' and w.frame < max_frames:
        f0 = me.plan(w)
        f1 = opp.plan(w)
        for i in range(20):
            if w.status != 'playing':
                break
            inputs = {}
            for team, frames in ((0, f0), (1, f1)):
                fr = frames[i] if i < len(frames) else None
                for idx in range(n):
                    uid = f't{team}u{idx}'
                    inp = fr[idx] if fr and idx < len(fr) else {'dir': 'N', 'aim': None, 'kick': False}
                    inputs[uid] = inp
            w.step(inputs)
    return w


def _shot_line(e, team):
    """Classify a kick event by its initial velocity line: 'on', 'off' or None."""
    vx, vy = e.get('vx', 0.0), e.get('vy', 0.0)
    gx = (W - 1.0) if team == 0 else 1.0
    if abs(vx) < 1e-9:
        return None
    t = (gx - e['x']) / vx
    if t <= 0:
        return None
    y = e['y'] + vy * t
    if 10.5 + 0.05 <= y <= 15.5 - 0.05:
        return 'on'
    if 0.0 <= y <= H:
        return 'off'
    return None


def _shot_outcomes(evs, team):
    out = {'goal': 0, 'saved': 0, 'stolen': 0, 'cleared': 0, 'other': 0}
    for i, e in enumerate(evs):
        if e.get('type') != 'kick' or e.get('team') != team:
            continue
        if _shot_line(e, team) != 'on':
            continue
        res = 'other'
        for e2 in evs[i + 1:]:
            if e2.get('frame', 0) - e.get('frame', 0) > 80:
                break
            t = e2.get('type')
            if t == 'goal':
                res = 'goal' if e2.get('team') == team else 'other'
                break
            if t == 'save':
                res = 'goal' if e2.get('team') == team else 'saved'
                break
            if t == 'tackle':
                res = 'stolen' if e2.get('team') != team else 'other'
                break
            if t == 'kick':
                res = 'cleared' if e2.get('team') != team else 'other'
                break
        out[res] = out.get(res, 0) + 1
    return out


def print_shot_sequences(w, team, limit=6):
    evs = w.events
    n = 0
    for i, e in enumerate(evs):
        if e.get('type') == 'kick' and e.get('team') == team and _shot_line(e, team) == 'on':
            seq = []
            for e2 in evs[i:i + 9]:
                seq.append((e2.get('frame'), e2.get('type'), e2.get('team'),
                            e2.get('x'), e2.get('y')))
            print('   seq', seq)
            n += 1
            if n >= limit:
                break


def summarize(w, team):
    ev = w.events
    goals_for = sum(1 for e in ev if e['type'] == 'goal' and e.get('team') == team)
    goals_against = sum(1 for e in ev if e['type'] == 'goal' and e.get('team') == 1 - team)
    saves_for = sum(1 for e in ev if e['type'] == 'save' and e.get('team') == team)
    saves_against = sum(1 for e in ev if e['type'] == 'save' and e.get('team') == 1 - team)
    kicks = [e for e in ev if e['type'] == 'kick']
    kicks_for = sum(1 for e in kicks if e.get('team') == team)
    kicks_against = sum(1 for e in kicks if e.get('team') == 1 - team)
    on_for = sum(1 for e in kicks if e.get('team') == team and _shot_line(e, team) == 'on')
    off_for = sum(1 for e in kicks if e.get('team') == team and _shot_line(e, team) == 'off')
    on_against = sum(1 for e in kicks if e.get('team') == 1 - team and _shot_line(e, 1 - team) == 'on')
    off_against = sum(1 for e in kicks if e.get('team') == 1 - team and _shot_line(e, 1 - team) == 'off')
    fouls_for = sum(1 for e in ev if e['type'] == 'foul' and e.get('team') == team)
    fouls_against = sum(1 for e in ev if e['type'] == 'foul' and e.get('team') == 1 - team)
    shot_out = _shot_outcomes(ev, team)
    return dict(score=w.score, gf=goals_for, ga=goals_against,
                saves_for=saves_for, saves_against=saves_against,
                kicks_for=kicks_for, kicks_against=kicks_against,
                on_for=on_for, off_for=off_for, on_against=on_against, off_against=off_against,
                shot_out=shot_out,
                fouls_for=fouls_for, fouls_against=fouls_against,
                frames=w.frame, status=w.status)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--n', type=int, default=2)
    ap.add_argument('--seeds', type=int, default=3)
    ap.add_argument('--opp', default='sniper')
    a = ap.parse_args()
    t0 = time.time()
    rows = []
    for seed in range(1, a.seeds + 1):
        for seat in (0, 1):
            me = RecBrain(seat)
            if a.opp == 'sniper':
                op = SniperBot(1 - seat)
            elif a.opp == 'chase':
                from match import ChaseBot
                op = ChaseBot(1 - seat)
            else:
                op = brainmod.Brain(1 - seat)
            if seat == 0:
                w = run(me, op, seed, a.n)
            else:
                w = run(op, me, seed, a.n)
            s = summarize(w, seat)
            rows.append(s)
            bs = getattr(me, 'stats', {})
            print(f'seed {seed} n={a.n} seat={seat} score {s["score"][seat]}:{s["score"][1-seat]} '
                  f'gf {s["gf"]} ga {s["ga"]} kicks {s["kicks_for"]}/{s["kicks_against"]} '
                  f'aim-on {s["on_for"]}/{s["on_against"]} aim-off {s["off_for"]}/{s["off_against"]} '
                  f'saves {s["saves_for"]}/{s["saves_against"]} fouls {s["fouls_for"]}/{s["fouls_against"]} '
                  f'plan shots={bs.get("shots", 0)} passes={bs.get("passes", 0)} '
                  f'shot-eval {me.shot_yes}/{me.shot_calls} bins {me.top_bins(4)} '
                  f'out {s["shot_out"]} frames {s["frames"]}')
            if seed == 1 and seat == 0:
                print_shot_sequences(w, seat)
                for row in me.shot_log[:12]:
                    print('   shot', row)
    print(f'elapsed {time.time()-t0:.1f}s')
