#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Round-4 replay analyzer: per-game + aggregate stats vs Sol.

Usage: python -I work/ana4.py <practice_dir> [<practice_dir> ...]
"""
import gzip, json, math, os, sys

MOUTH_LO, MOUTH_HI = 10.5, 15.5
W, H = 44, 26
GOALX = {0: 43.0, 1: 1.0}


def load(p):
    with gzip.open(p, 'rt', encoding='utf-8') as fh:
        return json.load(fh)


def team_side(d, name):
    return d['seats'].index(name)


def owner_id(fr):
    return fr['ball'].get('owner')


def analyze_game(path, me_name='deepseek-g1'):
    d = load(path)
    me = team_side(d, me_name)
    op = 1 - me
    frames = d['frames']
    ev = d['final']['events']
    n = d['teamSize']
    wname = None if d['winner'] is None else d['seats'][d['winner']]
    out = {'id': d['id'], 'seed': d['seed'], 'n': n, 'seat': me,
           'score': d['scores'], 'winner': wname, 'frames': len(frames),
           'me': me, 'events': ev}
    # possession by zone
    poss = {0: 0, 1: 0}
    zone = {0: [0, 0, 0], 1: [0, 0, 0]}  # own / mid / final third frames
    owner_runs = {0: [], 1: []}
    cur = {0: None, 1: None}
    cur_start = {0: 0, 1: 0}
    for i, fr in enumerate(frames):
        oid = owner_id(fr)
        b = fr['ball']
        if oid:
            t = int(oid[1])
            poss[t] += 1
            # attacking third for team t: x > 29.33 if attacking right
            att = (b['x'] > W * 2.0 / 3) if t == 0 else (b['x'] < W / 3.0)
            own = (b['x'] < W / 3.0) if t == 0 else (b['x'] > W * 2.0 / 3)
            zone[t][2 if att else (0 if own else 1)] += 1
            if cur[t] != oid:
                if cur[t] is not None:
                    owner_runs[t].append((cur_start[t], i - 1, cur[t]))
                cur[t] = oid
                cur_start[t] = i
        else:
            if cur[0] is not None:
                owner_runs[0].append((cur_start[0], i - 1, cur[0])); cur[0] = None
            if cur[1] is not None:
                owner_runs[1].append((cur_start[1], i - 1, cur[1])); cur[1] = None
    for t in (0, 1):
        if cur[t] is not None:
            owner_runs[t].append((cur_start[t], len(frames) - 1, cur[t]))
    out['poss'] = poss
    out['zone'] = zone
    out['longest_run'] = {t: max([e - s + 1 for s, e, _ in owner_runs[t]] or [0]) for t in (0, 1)}
    # events by team
    kicks = {0: [], 1: []}
    goals = {0: [], 1: []}
    saves = {0: [], 1: []}
    tackles = {0: [], 1: []}
    fouls = {0: 0, 1: 0}
    for e in ev:
        ty = e['type']
        if ty == 'kick':
            kicks[e['team']].append(e)
        elif ty == 'goal':
            goals[e['team']].append(e)
        elif ty == 'save':
            saves[e['team']].append(e)
        elif ty == 'tackle':
            tackles[e['team']].append(e)
        elif ty == 'foul':
            fouls[e['team']] += 1
    out['kicks'] = kicks; out['goals'] = goals; out['saves'] = saves
    out['tackles'] = tackles; out['fouls'] = fouls
    # shots: kicks by team whose ray crosses goal mouth within 26 cells
    shots = {0: [], 1: []}
    for t in (0, 1):
        gx = GOALX[t]
        for k in kicks[t]:
            a = math.radians(k['angle'])
            ux, uy = math.cos(a), math.sin(a)
            x, y = k['x'], k['y']
            # walk straight ignoring walls up to goal line
            tgt = None
            for dist in [i * 0.25 for i in range(1, 121)]:
                px, py = x + ux * dist, y + uy * dist
                if px < 0.5 or px > W - 0.5:
                    break
                if (gx > 20 and px >= gx - 0.9) or (gx < 20 and px <= gx + 0.9):
                    if MOUTH_LO <= py <= MOUTH_HI:
                        tgt = (px, py, dist)
                    break
            if tgt:
                shots[t].append({'f': k['frame'], 'x': x, 'y': y, 'angle': k['angle'],
                                 'dist': tgt[2], 'ty': tgt[1]})
    out['shots'] = shots
    # keeper (index 0) positioning when opponent shoots and when we shoot
    keep = {}
    for t in (0, 1):
        # team t keeper
        ks = []
        for i, fr in enumerate(frames[::5]):
            u = [q for q in fr['units'] if q['team'] == t and q['index'] == 0][0]
            gx, gy = GOALX[1 - t], 13.0  # own goal x is GOALX[1-t]? GOALX[t] is attack goal
            own_gx = 1.0 if t == 0 else 43.0
            ks.append((fr['frame'], u['x'], u['y'], math.hypot(u['x'] - own_gx, u['y'] - 13.0),
                       u['keeper'], u['hasBall']))
        keep[t] = ks
    out['keeper'] = keep
    # shots detail: distance from keeper to shot line
    sd = {0: [], 1: []}
    for t in (0, 1):
        opp = 1 - t
        for s in shots[t]:
            fr = frames[s['f']]
            kp = [q for q in fr['units'] if q['team'] == opp and q['index'] == 0][0]
            own_gx = 1.0 if opp == 0 else 43.0
            kd = math.hypot(kp['x'] - own_gx, kp['y'] - 13.0)
            # perpendicular distance of keeper to shot ray
            a = math.radians(s['angle']); ux, uy = math.cos(a), math.sin(a)
            dx, dy = kp['x'] - s['x'], kp['y'] - s['y']
            proj = dx * ux + dy * uy
            perp = abs(dx * uy - dy * ux) if proj > 0 else 99
            sd[t].append({'f': s['f'], 'dist': s['dist'], 'keeper_d': kd, 'perp': perp,
                          'proj': proj, 'kx': kp['x'], 'ky': kp['y']})
    out['shot_keeper'] = sd
    # our keeper distance when opponents shoot
    return out


def main():
    dirs = sys.argv[1:] or ['.']
    games = []
    for dd in dirs:
        pj = os.path.join(dd, 'practice.json')
        recs = {}
        if os.path.exists(pj):
            recs = {r['game']: r for r in json.load(open(pj, encoding='utf-8'))['records']}
        for fn in sorted(os.listdir(dd)):
            if not fn.endswith('.json.gz'):
                continue
            g = int(fn.split('-g')[1].split('.')[0])
            r = analyze_game(os.path.join(dd, fn), 'deepseek-g1')
            r['rec'] = recs.get(g)
            r['dir'] = dd
            games.append(r)
    for r in games:
        me = r['me']; op = 1 - me
        sc_me = r['score'].get('deepseek-g1'); sc_op = r['score'].get('sol')
        k_me, k_op = r['kicks'][me], r['kicks'][op]
        sh_me, sh_op = r['shots'][me], r['shots'][op]
        print(f"{r['id']} n={r['n']} seat={me} {sc_me}:{sc_op} win={r['winner']} "
              f"poss={r['poss'][me]}:{r['poss'][op]} zone_me={r['zone'][me]} zone_op={r['zone'][op]} "
              f"longest={r['longest_run'][me]}/{r['longest_run'][op]} "
              f"kicks={len(k_me)}/{len(k_op)} ray_shots={len(sh_me)}/{len(sh_op)} "
              f"saves={len(r['saves'][me])}/{len(r['saves'][op])} "
              f"tackles={len(r['tackles'][me])}/{len(r['tackles'][op])} fouls={r['fouls'][me]}/{r['fouls'][op]}")
    # aggregate by n
    print('\n== by team size ==')
    for n in range(1, 7):
        gs = [r for r in games if r['n'] == n]
        if not gs:
            continue
        W_ = sum(1 for r in gs if r['winner'] == 'deepseek-g1')
        D_ = sum(1 for r in gs if r['winner'] is None)
        L_ = len(gs) - W_ - D_
        gf = sum(r['score']['deepseek-g1'] for r in gs)
        ga = sum(r['score']['sol'] for r in gs)
        km = sum(len(r['kicks'][r['me']]) for r in gs)
        ko = sum(len(r['kicks'][1 - r['me']]) for r in gs)
        sm = sum(len(r['shots'][r['me']]) for r in gs)
        so = sum(len(r['shots'][1 - r['me']]) for r in gs)
        pm = sum(r['poss'][r['me']] for r in gs)
        po = sum(r['poss'][1 - r['me']] for r in gs)
        zm = [sum(r['zone'][r['me']][i] for r in gs) for i in range(3)]
        zo = [sum(r['zone'][1 - r['me']][i] for r in gs) for i in range(3)]
        print(f"n={n} games={len(gs)} W-D-L={W_}-{D_}-{L_} gf:ga={gf}:{ga} "
              f"kicks={km}:{ko} rayshots={sm}:{so} poss={pm}:{po} zone_me={zm} zone_op={zo}")
    tot = len(games)
    W_ = sum(1 for r in games if r['winner'] == 'deepseek-g1')
    D_ = sum(1 for r in games if r['winner'] is None)
    print(f"TOTAL games={tot} W-D-L={W_}-{D_}-{tot-W_-D_} winrate={W_/tot:.3f}")


if __name__ == '__main__':
    main()
