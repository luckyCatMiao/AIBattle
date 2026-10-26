#!/usr/bin/env python3
"""Fast in-process match runner using agent.py's physics (validated vs simulation.js)."""
import sys, os, math, json, random, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent as A

HIT_R = A.HIT_R

SPAWNS = ((5.0, 14.5), (34.0, 14.5))


def r3(v):
    return round(v * 1000) / 1000.0


class State(object):
    def __init__(self, seed=1, seconds=120.0):
        self.seed = seed
        self.limit = seconds
        self.frame = 0
        self.now = 0.0
        self.status = 'playing'
        self.winner = None
        self.reason = ''
        self.bullets = []
        self.next_bullet = 1
        self.track = []
        self.min_clear = [9e9, 9e9]
        self.danger_frames = [0, 0]
        self.events = []
        self.players = []
        for i in range(2):
            x, y = SPAWNS[i]
            self.players.append({'id': 'p%d' % i, 'index': i, 'name': 'P%d' % i,
                                 'alive': True, 'x': x, 'y': y,
                                 'fx': 1.0 if i == 0 else -1.0, 'fy': 0.0,
                                 'cooldown': 0, 'shots': 0, 'hits': 0})

    def emit(self, typ, **kw):
        self.events.append(dict(type=typ, frame=self.frame, t=round(self.now, 3), **kw))

    def snapshot(self, owner):
        return {
            'id': 'g%d' % self.seed, 'seed': self.seed, 'frame': self.frame,
            'now': r3(self.now), 'status': self.status, 'winner': self.winner,
            'reason': self.reason, 'yourPlayer': owner,
            'timeLeft': max(0.0, round((self.limit - self.now) * 10) / 10.0),
            'map': {'width': A.W, 'height': A.H, 'tiles': A.FIELD},
            'players': [{'id': p['id'], 'index': p['index'], 'name': p['name'],
                         'alive': p['alive'], 'x': r3(p['x']), 'y': r3(p['y']),
                         'fx': r3(p['fx']), 'fy': r3(p['fy']),
                         'cooldown': p['cooldown'], 'shots': p['shots'], 'hits': p['hits']}
                        for p in self.players],
            'bullets': [{'id': 'b%d' % b['nid'], 'owner': b['owner'],
                         'x': r3(b['x']), 'y': r3(b['y']),
                         'vx': r3(b['vx']), 'vy': r3(b['vy']),
                         'speed': round(math.hypot(b['vx'], b['vy']) * 100) / 100.0,
                         'bounces': b['bounces']}
                        for b in self.bullets],
            'events': self.events[-120:],
            'rules': {'hz': 20, 'decisionFrames': 3, 'playerRadius': 0.45,
                      'playerSpeed': 13, 'bulletRadius': 0.22, 'bulletSpeed': 8.5,
                      'fireCooldown': 1.2, 'matchSeconds': self.limit},
        }


def step(st, held):
    if st.status != 'playing':
        return
    st.frame += 1
    st.now += A.DT
    # movement
    for i, p in enumerate(st.players):
        if not p['alive']:
            continue
        dx, dy = A.DIRV[held[i]['dir']]
        if dx or dy:
            p['fx'], p['fy'] = dx, dy
        p['x'], p['y'] = A.move_player(p['x'], p['y'], dx, dy)
    # firing
    for i, p in enumerate(st.players):
        if not p['alive']:
            continue
        if p['cooldown'] > 0:
            p['cooldown'] -= 1
            continue
        h = held[i]
        if h['aim']:
            p['fx'], p['fy'] = A.DIRV[h['aim']]
        if not h['fire']:
            continue
        f = (p['fx'], p['fy'])
        ln = math.hypot(f[0], f[1]) or 1.0
        ux, uy = f[0] / ln, f[1] / ln
        bx = p['x'] + ux * A.SPAWN_OFF
        by = p['y'] + uy * A.SPAWN_OFF
        if A.tile_at(bx, by) == 1:
            continue
        st.bullets.append({'nid': st.next_bullet, 'owner': i, 'x': bx, 'y': by,
                           'vx': ux * 8.5, 'vy': uy * 8.5, 'bounces': 0})
        st.track.append({'nid': st.next_bullet, 'owner': i, 'mind': 9e9,
                         't_fire': st.now, 't_min': 0.0})
        st.next_bullet += 1
        p['shots'] += 1
        p['cooldown'] = 24
        st.emit('fire', owner=i, x=r3(bx), y=r3(by))
    # bullets
    for b in st.bullets:
        b['x'], b['y'], b['vx'], b['vy'] = A.advance_bullet(b['x'], b['y'], b['vx'], b['vy'], 1)
    # shot threat tracking
    for tr in st.track:
        b = st.bullets[tr['nid'] - 1]
        vp = st.players[1 - tr['owner']]
        d = math.hypot(b['x'] - vp['x'], b['y'] - vp['y'])
        if d < tr['mind']:
            tr['mind'] = d
            tr['t_min'] = st.now - tr['t_fire']
    # player clearance
    for pi, p in enumerate(st.players):
        mc = 9e9
        for b in st.bullets:
            if b['owner'] == pi:
                continue
            d = math.hypot(b['x'] - p['x'], b['y'] - p['y'])
            if d < mc:
                mc = d
        if mc < st.min_clear[pi]:
            st.min_clear[pi] = mc
        if mc < 1.2:
            st.danger_frames[pi] += 1
    # hits
    for b in st.bullets:
        for i, p in enumerate(st.players):
            if not p['alive'] or i == b['owner']:
                continue
            if math.hypot(p['x'] - b['x'], p['y'] - b['y']) <= HIT_R:
                p['alive'] = False
                st.players[b['owner']]['hits'] += 1
                st.status = 'finished'
                st.winner = 1 - i
                st.reason = '%s 被击中' % p['name']
                st.emit('hit', owner=b['owner'], victim=i, x=r3(b['x']), y=r3(b['y']))
                return
    if st.now >= st.limit - 1e-9:
        st.status = 'finished'
        st.winner = None
        st.reason = '时间到，双方都还活着'


def run(pol0, pol1, seconds=120.0, seed=1, verbose=False, log=None):
    st = State(seed=seed, seconds=seconds)
    t0 = time.time()
    while st.status == 'playing':
        wins = []
        for owner in (0, 1):
            snap = st.snapshot(owner)
            pol = pol0 if owner == 0 else pol1
            raw = pol.decide(snap)
            if isinstance(raw, dict):
                raw = raw.get('inputs', raw)
            norm = []
            for i in range(3):
                f = raw[i] if i < len(raw) else {'dir': 'N', 'aim': None, 'fire': False}
                d = f.get('dir', 'N')
                d = 'N' if d is None else str(d).upper()
                aim = f.get('aim')
                aim = None if aim is None else str(aim).upper()
                norm.append({'dir': d, 'aim': aim, 'fire': bool(f.get('fire', False))})
            wins.append(norm)
        if verbose or log is not None:
            me = st.players[0]
            op = st.players[1]
            msg = 'f=%d t=%.2f me=(%.2f,%.2f) opp=(%.2f,%.2f) nb=%d cd=%d out=%s' % (
                st.frame, st.now, me['x'], me['y'], op['x'], op['y'], len(st.bullets), me['cooldown'],
                [(w['dir'], w['aim'], w['fire']) for w in wins[0]])
            if log is not None:
                log.write(msg + '\n')
            elif verbose:
                print(msg)
        for _ in range(3):
            if st.status != 'playing':
                break
            held = [wins[0][_], wins[1][_]]
            step(st, held)
    return {'winner': st.winner, 'reason': st.reason, 'frames': st.frame,
            'shots': [p['shots'] for p in st.players],
            'hits': [p['hits'] for p in st.players],
            'bullets': len(st.bullets), 'elapsed': time.time() - t0,
            'threat': shot_stats(st),
            'clear': [round(x, 3) for x in st.min_clear],
            'danger_frames': list(st.danger_frames), 'state': st}


def shot_stats(st):
    out = []
    for owner in (0, 1):
        ts = [t for t in st.track if t['owner'] == owner]
        n = len(ts) or 1
        row = {
            'shots': len(ts),
            'hit': sum(1 for t in ts if t['mind'] <= 0.67),
            'd1.5': sum(1 for t in ts if t['mind'] <= 1.5),
            'd3': sum(1 for t in ts if t['mind'] <= 3.0),
            'd5': sum(1 for t in ts if t['mind'] <= 5.0),
            'med_mind': sorted(t['mind'] for t in ts)[len(ts) // 2] if ts else None,
            'med_tmin': sorted(t['t_min'] for t in ts)[len(ts) // 2] if ts else None,
        }
        out.append(row)
    return out


# ------------------------------------------------------------------ baselines
class IdlePolicy(object):
    name = 'idle'

    def decide(self, snap):
        mi = snap['yourPlayer']
        me = snap['players'][mi]
        op = snap['players'][1 - mi]
        best, bd = 'R', -2
        for k in A.AIM_KEYS:
            dx, dy = A.DIRV[k]
            dot = (op['x'] - me['x']) * dx + (op['y'] - me['y']) * dy
            ln = math.hypot(op['x'] - me['x'], op['y'] - me['y']) or 1
            dot /= ln
            if dot > bd:
                bd, best = dot, k
        return [{'dir': 'N', 'aim': best, 'fire': True}] * 3


class RandomPolicy(object):
    name = 'random'

    def __init__(self, seed=1):
        self.r = random.Random(seed)

    def decide(self, snap):
        d = self.r.choice(A.MOVE_KEYS)
        a = self.r.choice(A.AIM_KEYS)
        return [{'dir': d, 'aim': a, 'fire': True}] * 3


class DodgePolicy(object):
    """simple: 3-frame greedy min-distance to enemy bullets, aim at opponent."""
    name = 'dodge'

    def decide(self, snap):
        mi = snap['yourPlayer']
        me = snap['players'][mi]
        op = snap['players'][1 - mi]
        enemies = [b for b in snap['bullets'] if b['owner'] != mi]
        # predicted bullet positions, 3 frames, exact
        preds = []
        for b in enemies:
            x, y, vx, vy = b['x'], b['y'], b['vx'], b['vy']
            pts = []
            for f in range(3):
                x, y, vx, vy = A.advance_bullet(x, y, vx, vy, 1)
                pts.append((x, y))
            preds.append(pts)
        best, bs = 'N', -1e9
        for dk in A.MOVE_KEYS:
            x, y = me['x'], me['y']
            path = []
            for f in range(3):
                x, y = A.move_player(x, y, *A.DIRV[dk])
                path.append((x, y))
            sc = 0.0
            for pts in preds:
                for f in range(3):
                    d = math.hypot(path[f][0] - pts[f][0], path[f][1] - pts[f][1])
                    if d < 0.9:
                        sc -= 1000
                    else:
                        sc += min(d, 4.0) - 0.35 * f
            if A.circle_hits_wall(x, y, 0.7):
                sc -= 50
            sc -= 0.15 * abs(math.hypot(x - op['x'], y - op['y']) - 9)
            if sc > bs:
                bs, best = sc, dk
        bd, bdot = 'R', -2
        for k in A.AIM_KEYS:
            dx, dy = A.DIRV[k]
            ln = math.hypot(op['x'] - me['x'], op['y'] - me['y']) or 1
            dot = ((op['x'] - me['x']) * dx + (op['y'] - me['y']) * dy) / ln
            if dot > bdot:
                bdot, bd = dot, k
        return [{'dir': best, 'aim': bd, 'fire': True}] * 3


class HunterPolicy(object):
    """aggressive: chase the opponent, dodge only bullets that are actually close."""
    name = 'hunter'

    def __init__(self, seed=1, jitter=0.0):
        self.r = random.Random(seed)
        self.jitter = jitter

    def decide(self, snap):
        mi = snap['yourPlayer']
        me = snap['players'][mi]
        op = snap['players'][1 - mi]
        enemies = [b for b in snap['bullets'] if b['owner'] != mi and
                   math.hypot(b['x'] - me['x'], b['y'] - me['y']) < 7.0]
        preds = []
        for b in enemies:
            x, y, vx, vy = b['x'], b['y'], b['vx'], b['vy']
            pts = []
            for f in range(3):
                x, y, vx, vy = A.advance_bullet(x, y, vx, vy, 1)
                pts.append((x, y))
            preds.append(pts)
        best, bs = 'N', -1e9
        for dk in A.MOVE_KEYS:
            x, y = me['x'], me['y']
            path = []
            for f in range(3):
                x, y = A.move_player(x, y, *A.DIRV[dk])
                path.append((x, y))
            sc = 0.0
            for pts in preds:
                for f in range(3):
                    d = math.hypot(path[f][0] - pts[f][0], path[f][1] - pts[f][1])
                    if d < 1.0:
                        sc -= 400
                    else:
                        sc += 3.0 * min(d, 3.0)
            d0 = math.hypot(me['x'] - op['x'], me['y'] - op['y'])
            d1 = math.hypot(x - op['x'], y - op['y'])
            sc += 6.0 * (d0 - d1)          # chase
            if A.circle_hits_wall(x, y, 0.7):
                sc -= 80
            if self.jitter:
                sc += self.r.uniform(-self.jitter, self.jitter)
            if sc > bs:
                bs, best = sc, dk
        bd, bdot = 'R', -2
        for k in A.AIM_KEYS:
            dx, dy = A.DIRV[k]
            ln = math.hypot(op['x'] - me['x'], op['y'] - me['y']) or 1
            dot = ((op['x'] - me['x']) * dx + (op['y'] - me['y']) * dy) / ln
            if dot > bdot:
                bdot, bd = dot, k
        return [{'dir': best, 'aim': bd, 'fire': True}] * 3


class RandomDodgePolicy(DodgePolicy):
    name = 'randomdodge'

    def __init__(self, seed=1, jitter=30.0):
        self.r = random.Random(seed)
        self.jitter = jitter

    def decide(self, snap):
        out = super().decide(snap)
        if self.r.random() < 0.25:
            out = [{'dir': self.r.choice(A.MOVE_KEYS),
                    'aim': self.r.choice(A.AIM_KEYS), 'fire': True}] * 3
        return out


def make(spec, seed=1):
    if spec == 'idle':
        return IdlePolicy()
    if spec == 'random':
        return RandomPolicy(seed)
    if spec == 'dodge':
        return DodgePolicy()
    if spec == 'hunter':
        return HunterPolicy(seed)
    if spec == 'hunterj':
        return HunterPolicy(seed, jitter=25.0)
    if spec == 'randomdodge':
        return RandomDodgePolicy(seed)
    if spec.startswith('agent'):
        params = {}
        if ':' in spec:
            for kv in spec.split(':', 1)[1].split(','):
                if not kv:
                    continue
                k, v = kv.split('=')
                try:
                    params[k] = int(v)
                except ValueError:
                    params[k] = float(v)
        if 'seed' not in params:
            params['seed'] = seed
        return A.Agent(params)
    raise ValueError(spec)


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--p0', default='agent')
    ap.add_argument('--p1', default='idle')
    ap.add_argument('--games', type=int, default=1)
    ap.add_argument('--seconds', type=float, default=120)
    ap.add_argument('--seedbase', type=int, default=0)
    ap.add_argument('--verbose', action='store_true')
    a = ap.parse_args()
    tally = [0, 0, 0]
    for g in range(a.games):
        res = run(make(a.p0, (a.seedbase + g) * 2 + 1), make(a.p1, (a.seedbase + g) * 2 + 2),
                  a.seconds, seed=a.seedbase + g + 1, verbose=a.verbose)
        if res['winner'] is None:
            tally[2] += 1
        else:
            tally[res['winner']] += 1
        print('game %d: winner=%r reason=%s frames=%d shots=%s hits=%s bullets=%d wall=%.2fs' % (
            g, res['winner'], res['reason'], res['frames'], res['shots'], res['hits'],
            res['bullets'], res['elapsed']))
        for owner, row in enumerate(res['threat']):
            print('   p%d threat: %s' % (owner, row))
        print('   min clearance %s danger_frames %s' % (res['clear'], res['danger_frames']))
    print('TALLY p0=%d p1=%d draw=%d' % tuple(tally))
