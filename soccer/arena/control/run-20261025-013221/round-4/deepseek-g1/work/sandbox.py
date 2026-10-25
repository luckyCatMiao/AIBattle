#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sandbox: evaluate a shot policy at window starts against recorded opponent inputs.

For each window start where our team owns the ball, simulate ONE kick from the
carrier at frame 1 (the opponents' inputs for the next 20 frames are recorded and
independent of our action), then extrapolate with a chase model.

Usage: python -I work/sandbox.py <practice_dir> [...] [--maxd N] [--mode best|all|open]
"""
import gzip, json, math, os, sys
sys.path.insert(0, '.')
import agent_v50 as A

DIRV = {'N': (0.0, 0.0), 'U': (0, -1), 'D': (0, 1), 'L': (-1, 0), 'R': (1, 0),
        'UL': (-0.70710678, -0.70710678), 'UR': (0.70710678, -0.70710678),
        'DL': (-0.70710678, 0.70710678), 'DR': (0.70710678, 0.70710678)}


def run_shot(frames, windows, f0, me, op, st, u, ang, horizon=45):
    """Simulate a kick at frame f0+1 and chase afterwards. Returns (goal, frames)."""
    inp = []
    for k in range(20):
        row = []
        for unit in st.units:
            if unit.team == me:
                if unit is u and k == 0:
                    a = math.radians(ang)
                    row.append(('N', (math.cos(a), math.sin(a)), True))
                else:
                    row.append(('N', None, False))
            else:
                src = windows[f0 // 20]['inputs'][op][k][unit.index]
                aim = src.get('aim')
                av = None
                if aim is not None:
                    a = math.radians(aim)
                    av = (math.cos(a), math.sin(a))
                row.append((src['dir'], av, bool(src.get('kick'))))
        inp.append(row)
    goals = []
    for k in range(20):
        g = A.step(st, inp[k], st.kickoffTeam)
        if g >= 0:
            goals.append((k, g))
            break
    # extrapolate: opponents chase the ball; ours neutral
    if not goals:
        for k in range(20, horizon):
            row = []
            for unit in st.units:
                if unit.team == me:
                    row.append(('N', None, False))
                else:
                    d = A.move_dir(unit, st.bx, st.by, unit.team, forbid_box=True)
                    row.append((d, None, False))
            g = A.step(st, row, st.kickoffTeam)
            if g >= 0:
                goals.append((k, g))
                break
    return (goals[0][1] if goals else None), (goals[0][0] + 1 if goals else horizon)


def main():
    maxd = 26.0
    mode = 'best'
    dirs = []
    i = 1
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == '--maxd':
            i += 1
            maxd = float(sys.argv[i])
        elif a == '--mode':
            i += 1
            mode = sys.argv[i]
        else:
            dirs.append(a)
        i += 1
    stats = {'samples': 0, 'tried': 0, 'goals': 0, 'goalf': 0, 'immediate': 0,
             'by_dist': {}, 'near_miss': 0}
    for D in dirs:
        if not os.path.isdir(D):
            continue
        for fn in sorted(os.listdir(D)):
            if not fn.endswith('.json.gz'):
                continue
            d = json.load(gzip.open(os.path.join(D, fn), 'rt', encoding='utf-8'))
            seats = d['seats']
            me = seats.index('deepseek-g1')
            op = 1 - me
            frames = d['frames']
            windows = d['windows']
            for wi in range(len(windows)):
                f0 = windows[wi]['frame'] - 20
                if f0 < 0 or f0 + 20 >= len(frames):
                    continue
                fr = frames[f0]
                owner = fr['ball']['owner']
                if not owner or int(owner[1]) != me:
                    continue
                stats['samples'] += 1
                obs = dict(fr)
                obs['yourTeam'] = me
                st0 = A.state_from_obs(obs)
                A.update_vel_cache(obs)
                my = [q for q in st0.units if q.team == me]
                opp = [q for q in st0.units if q.team != me]
                ci = st0.owner
                if ci < 0 or st0.units[ci].team != me:
                    continue
                u = st0.units[ci]
                mates = [m for m in my if m.index != u.index]
                sh = A.best_open_shot(st0, u, opp, me, mates=mates, maxd=maxd)
                if sh is None:
                    continue
                stats['tried'] += 1
                st = st0.clone()
                u2 = [q for q in st.units if q.team == me and q.index == u.index][0]
                g, gf = run_shot(frames, windows, f0, me, op, st, u2, sh[1])
                if g == me:
                    stats['goals'] += 1
                    if gf <= 20:
                        stats['immediate'] += 1
                dd = int(sh[3] // 4) * 4
                key = (dd, 'goal' if g == me else 'no')
                stats['by_dist'][key] = stats['by_dist'].get(key, 0) + 1
    print('samples(our possession windows)=%d tried=%d goals=%d immediate=%d rate(tried)=%.3f rate(samples)=%.3f'
          % (stats['samples'], stats['tried'], stats['goals'], stats['immediate'],
             stats['goals'] / max(1, stats['tried']), stats['goals'] / max(1, stats['samples'])))
    print('by distance (4-cell bins):', sorted(stats['by_dist'].items()))


if __name__ == '__main__':
    main()
