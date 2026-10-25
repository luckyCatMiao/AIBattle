#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Shot outcome analysis: for every kick, reconstruct the free-ball path from the
recorded frames, classify outcome, and measure defender/keeper clearance.

Usage: python -I work/shotana.py <practice_dir> [...]
"""
import gzip, json, math, os, sys

W, H = 44, 26
LO, HI = 10.5, 15.5
R_B = 0.22
FRIC = 0.978
WALLR = 0.72
DT = 0.05


def load(p):
    return json.load(gzip.open(p, 'rt', encoding='utf-8'))


def goal_x(team):
    # team attacks: team0 -> x=43, team1 -> x=1
    return 43.0 if team == 0 else 1.0


def mouth_points(team, bx, by, n=41):
    gx = goal_x(team)
    out = []
    for i in range(n):
        ty = LO + (HI - LO) * i / (n - 1)
        d = math.hypot(gx - bx, ty - by)
        if d < 0.6:
            continue
        ux, uy = (gx - bx) / d, (ty - by) / d
        out.append((ty, ux, uy, d))
    return out


def analyze_shot(frames, ev, kick, me_name):
    """Return dict with stats for this kick."""
    team = kick['team']
    f0 = kick['frame']
    bx, by = kick['x'], kick['y']
    a = kick['angle']
    ux, uy = math.cos(a), math.sin(a)
    # which goal is this aimed at?
    gx = goal_x(team)
    # straight-line crossing of x = gx
    if abs(ux) < 1e-6:
        return None
    t = (gx - bx) / ux
    if t <= 0:
        return None
    cy = by + uy * t
    on_goal = LO - 0.35 <= cy <= HI + 0.35 and t <= 30.0
    # actual ball path from frames (free-ball frames until possession/goal)
    path = []
    for i in range(f0, min(len(frames), f0 + 90)):
        b = frames[i]['ball']
        path.append((i, b['x'], b['y'], b['owner'], b['vx'], b['vy']))
        if b['owner']:
            break
    # find first event after kick
    nxt = None
    for e in ev:
        if e['frame'] > f0 and e['type'] in ('goal', 'save', 'kick', 'tackle', 'foul', 'kickoff'):
            nxt = e
            break
    outcome = 'none'
    if nxt is not None:
        if nxt['type'] == 'goal':
            outcome = 'goal_for' if nxt['team'] == team else 'own_goal'
        elif nxt['type'] == 'save':
            outcome = 'saved'
        elif nxt['type'] == 'kick':
            outcome = 'kicked_again'
        elif nxt['type'] in ('tackle',):
            outcome = 'tackled'
        elif nxt['type'] == 'foul':
            outcome = 'foul'
        elif nxt['type'] == 'kickoff':
            outcome = 'stoppage'
    # clearance: min distance of each opponent to the *actual ball path* while free
    opp = 1 - team
    opp_units = {u['index']: u for u in frames[f0]['units'] if u['team'] == opp}
    kp = opp_units.get(0)
    kx, ky = kp['x'], kp['y']
    min_keeper = 99.0
    min_keeper_f = None
    min_opp_field = 99.0
    for (i, x, y, owner, vx, vy) in path:
        if owner:
            break
        fr = frames[i]
        for u in fr['units']:
            if u['team'] != opp:
                continue
            d = math.hypot(u['x'] - x, u['y'] - y)
            if u['index'] == 0:
                if d < min_keeper:
                    min_keeper, min_keeper_f = d, i
            else:
                if d < min_opp_field:
                    min_opp_field = d
        # also keeper position (fixed) distance to ball path
    return {
        'f': f0, 'team': team, 'x': bx, 'y': by, 'ang': a,
        'cy': cy, 'on_goal': on_goal, 'dist_goal_center': math.hypot(gx - bx, 13.0 - by),
        'path': path, 'outcome': outcome, 'nxt': nxt,
        'min_keeper': min_keeper, 'min_opp_field': min_opp_field,
        'keeper_at_kick': (kx, ky), 'keeper_depth': math.hypot(kx - (1.0 if opp == 0 else 43.0), ky - 13.0),
    }


def main():
    games = []
    for dd in sys.argv[1:]:
        for fn in sorted(os.listdir(dd)):
            if not fn.endswith('.json.gz'):
                continue
            d = load(os.path.join(dd, fn))
            seats = d['seats']
            me = seats.index('deepseek-g1')
            ev = d['final']['events']
            frames = d['frames']
            shots = {'me': [], 'op': []}
            for k in ev:
                if k['type'] != 'kick':
                    continue
                r = analyze_shot(frames, ev, k, 'deepseek-g1')
                if r is None or not r['on_goal']:
                    continue
                who = 'me' if k['team'] == me else 'op'
                r['who'] = who
                shots[who].append(r)
            games.append((dd, fn, d, me, shots))
    agg = {'me': {}, 'op': {}}
    for dd, fn, d, me, shots in games:
        n = d['teamSize']
        print(f"== {fn} n={n} me_team={me} score {d['scores']}")
        for who in ('me', 'op'):
            for r in shots[who]:
                print(f"   {who} f{r['f']:5d} from ({r['x']:5.1f},{r['y']:5.1f}) ang {math.degrees(r['ang']):7.1f} "
                      f"d={r['dist_goal_center']:5.1f} cy={r['cy']:5.1f} {r['outcome']:12s} "
                      f"kmin={r['min_keeper']:5.2f} omin={r['min_opp_field']:5.2f} kdepth={r['keeper_depth']:4.1f}")
        # aggregate counters
        for who in ('me', 'op'):
            a = agg[who].setdefault(n, {'shots': 0, 'goal': 0, 'saved': 0, 'other': 0,
                                        'by_dist': [], 'by_kmin': []})
            for r in shots[who]:
                a['shots'] += 1
                if r['outcome'] == 'goal_for':
                    a['goal'] += 1
                elif r['outcome'] == 'saved':
                    a['saved'] += 1
                else:
                    a['other'] += 1
                a['by_dist'].append(round(r['dist_goal_center'], 1))
                a['by_kmin'].append(round(r['min_keeper'], 2))
    print('\n== aggregate (on-target ray shots) ==')
    for who in ('me', 'op'):
        for n in sorted(agg[who]):
            a = agg[who][n]
            print(f"{who} n={n} shots={a['shots']} goals={a['goal']} saved={a['saved']} other={a['other']} "
                  f"dist={sorted(a['by_dist'])} kmin={sorted(a['by_kmin'])}")


if __name__ == '__main__':
    main()
