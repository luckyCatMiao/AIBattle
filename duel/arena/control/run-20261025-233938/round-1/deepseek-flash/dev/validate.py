#!/usr/bin/env python3
"""Replay a harness dump in Python (agent.py physics) and compare to the JS engine."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent as A


def normalize(raw):
    if not isinstance(raw, dict):
        raise ValueError('frame must be object')
    d = raw.get('dir')
    d = 'N' if d is None else str(d).upper()
    if d not in A.DIRV:
        raise ValueError('bad dir ' + str(d))
    aim = raw.get('aim')
    aim = None if aim is None else str(aim).upper()
    if aim is not None and aim not in A.DIRV:
        raise ValueError('bad aim')
    fire = raw.get('fire', False)
    if fire is None:
        fire = False
    if not isinstance(fire, bool):
        raise ValueError('bad fire')
    return {'dir': d, 'aim': aim, 'fire': fire}


def step(state, held):
    # 1) movement
    for i, p in enumerate(state['players']):
        if not p['alive']:
            continue
        dx, dy = A.DIRV[held[i]['dir']]
        if dx or dy:
            p['fx'], p['fy'] = dx, dy
        p['x'], p['y'] = A.move_player(p['x'], p['y'], dx, dy)
    # 2) firing
    for i, p in enumerate(state['players']):
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
        state['bullets'].append({'owner': i, 'x': bx, 'y': by, 'vx': ux * 8.5, 'vy': uy * 8.5})
        p['shots'] += 1
        p['cooldown'] = 24
    # 3) bullets
    for b in state['bullets']:
        b['x'], b['y'], b['vx'], b['vy'] = A.advance_bullet(b['x'], b['y'], b['vx'], b['vy'], 1)
    # 4) hits
    for b in state['bullets']:
        for i, p in enumerate(state['players']):
            if not p['alive'] or i == b['owner']:
                continue
            d = math.hypot(p['x'] - b['x'], p['y'] - b['y'])
            if d <= A.HIT_R:
                p['alive'] = False
                state['finished'] = True
                state['winner'] = 1 - i
                return
    if state['now'] + A.DT >= state['limit'] - 1e-9:
        state['finished'] = True


def from_snap(snap, limit):
    st = {'players': [], 'bullets': [], 'finished': False, 'winner': None,
          'now': float(snap['now']), 'limit': limit}
    for p in snap['players']:
        st['players'].append({'x': float(p['x']), 'y': float(p['y']),
                              'fx': float(p['fx']), 'fy': float(p['fy']),
                              'cooldown': int(p['cooldown']), 'shots': int(p['shots']),
                              'alive': bool(p['alive'])})
    for b in snap['bullets']:
        st['bullets'].append({'owner': int(b['owner']), 'x': float(b['x']), 'y': float(b['y']),
                              'vx': float(b['vx']), 'vy': float(b['vy'])})
    return st


def cmp_state(st, snap):
    errs = []
    for i, p in enumerate(st['players']):
        q = snap['players'][i]
        for k in ('x', 'y'):
            if abs(p[k] - q[k]) > 0.003:
                errs.append('p%d.%s %r != %r' % (i, k, p[k], q[k]))
        if p['cooldown'] != q['cooldown']:
            errs.append('p%d.cooldown %d != %d' % (i, p['cooldown'], q['cooldown']))
        if p['shots'] != q['shots']:
            errs.append('p%d.shots %d != %d' % (i, p['shots'], q['shots']))
    if len(st['bullets']) != len(snap['bullets']):
        errs.append('bullets %d != %d' % (len(st['bullets']), len(snap['bullets'])))
    else:
        for i, (b, q) in enumerate(zip(st['bullets'], snap['bullets'])):
            for k in ('x', 'y', 'vx', 'vy'):
                if abs(b[k] - q[k]) > 0.004:
                    errs.append('b%d.%s %r != %r' % (i, k, b[k], q[k]))
    return errs


def main(path):
    recs = [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()]
    by = {}
    for r in recs:
        by.setdefault(r['seed'], []).append(r)
    total = 0
    bad = 0
    for seed, rs in by.items():
        # group into windows: pairs (owner 0, owner1) sharing frame
        windows = {}
        for r in rs:
            windows.setdefault(r['frame'], {})[r['owner']] = r
        frames = sorted(windows)
        for idx, f in enumerate(frames[:-1]):
            w = windows[f]
            if 0 not in w or 1 not in w:
                continue
            snap = w[0]['snap']
            limit = 120.0
            st = from_snap(snap, limit)
            inputs = [w[0]['raw'], w[1]['raw']]
            helds = []
            for owner in (0, 1):
                raw = inputs[owner]
                if isinstance(raw, dict) and 'inputs' in raw:
                    raw = raw['inputs']
                if not isinstance(raw, list):
                    continue
                norm = []
                for i in range(3):
                    norm.append(normalize(raw[i]) if i < len(raw) else {'dir': 'N', 'aim': None, 'fire': False})
                helds.append(norm)
            if len(helds) != 2:
                continue
            for i in range(3):
                st['now'] += A.DT
                step(st, [helds[0][i], helds[1][i]])
                if st['finished']:
                    break
            nxt = windows[frames[idx + 1]][0]['snap']
            errs = cmp_state(st, nxt)
            total += 1
            if errs:
                bad += 1
                if bad <= 12:
                    print('seed %s frame %s -> %s' % (seed, f, '; '.join(errs[:6])))
    print('windows compared: %d, mismatches: %d' % (total, bad))


if __name__ == '__main__':
    main(sys.argv[1])
