#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Round-1 (20 games) replay analysis for the deepseek-g1 review.

Reads only our own official replays under matches/r1-g*.json.gz.
Outputs r1_analysis.json plus a compact console table.
"""
import collections
import glob
import gzip
import json
import math
import os

ME = 'deepseek-g1'
HZ = 20
FRIC = 0.978
BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(os.path.dirname(__file__), 'r1_analysis.json')


def load(path):
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        return json.load(f)


def ang_diff(a, b):
    d = abs(a - b) % (2 * math.pi)
    return min(d, 2 * math.pi - d)


def ray(ball, team):
    """Straight ball path after a kick: (crosses goal mouth, flight sec, y at line)."""
    x, y, vx, vy = ball['x'], ball['y'], ball['vx'], ball['vy']
    gx = 43.0 if team == 0 else 1.0
    if abs(vx) < 1e-9:
        return False, None, None
    t = (gx - x) / vx
    if t <= 0 or t > 6.0:
        return False, None, None
    yy = y + vy * t
    return (10.0 <= yy <= 16.0), t, yy


def band(d):
    if d < 8:
        return '0-8'
    if d < 12:
        return '8-12'
    if d < 18:
        return '12-18'
    if d < 25:
        return '18-25'
    return '25+'


def zone_counts(rep, me):
    """Possession frames split by own / middle / attacking third (attacking direction aware)."""
    z = collections.Counter()
    for fr in rep['frames']:
        owner = fr['ball'].get('owner')
        if not owner:
            continue
        team = int(owner[1])
        side = 'me' if team == me else 'opp'
        x = fr['ball']['x']
        prog = (x - 1.0) / 42.0 if team == 0 else (43.0 - x) / 42.0
        zone = 'own' if prog < 1 / 3 else 'mid' if prog < 2 / 3 else 'att'
        z[(side, zone)] += 1
    return {f'{k[0]}_{k[1]}': v for k, v in z.items()}


def longest_run(rep, me):
    """Longest uninterrupted possession by one of our units (owner unchanged)."""
    fr = rep['frames']
    best, cur = None, None
    for i, x in enumerate(fr):
        owner = x['ball'].get('owner')
        ours = owner is not None and owner.startswith(f't{me}u')
        if ours:
            if cur is None or owner != cur[2]:
                cur = [i, i, owner]
            else:
                cur[1] = i
        else:
            if cur is not None:
                if best is None or cur[1] - cur[0] > best[1] - best[0]:
                    best = cur
                cur = None
    if cur is not None and (best is None or cur[1] - cur[0] > best[1] - best[0]):
        best = cur
    if not best:
        return None
    a, b, owner = best
    pts = [(fr[i]['ball']['x'], fr[i]['ball']['y']) for i in range(a, b + 1)]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    travel = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
                 for i in range(len(pts) - 1))
    return {'unit': owner, 'start_frame': a, 'end_frame': b, 'frames': b - a + 1,
            'seconds': round((b - a + 1) / HZ, 2),
            'x_range': [round(min(xs), 2), round(max(xs), 2)],
            'y_range': [round(min(ys), 2), round(max(ys), 2)],
            'travel': round(travel, 1)}


def main():
    files = sorted(glob.glob(os.path.join(BASE, 'matches', 'r1-g*.json.gz')),
                   key=lambda p: int(os.path.basename(p).split('-g')[1].split('.')[0]))
    games, goals_all, saves_all, fouls_all = [], [], [], []
    for path in files:
        rep = load(path)
        gid = rep['id']
        seats = rep['seats']
        me = seats.index(ME)
        opp = 1 - me
        ev = rep['final']['events']
        frames = rep['frames']
        stats = rep['final']['stats']
        goals = [e for e in ev if e['type'] == 'goal']
        saves = [e for e in ev if e['type'] == 'save']
        fouls = [e for e in ev if e['type'] == 'foul']
        kicks = [e for e in ev if e['type'] == 'kick']

        cnt = {0: collections.Counter(), 1: collections.Counter()}
        rays = {0: [], 1: []}
        for k in kicks:
            team = k['team']
            b = frames[k['frame']]['ball']
            sp = math.hypot(b['vx'], b['vy'])
            hit, tt, yy = ray(b, team)
            if hit:
                cnt[team]['ray'] += 1
                rays[team].append({'frame': k['frame'], 't': round(k['frame'] / HZ, 2),
                                   'unit': k['unit'], 'from': [round(b['x'], 2), round(b['y'], 2)],
                                   'speed': round(sp, 2), 'flight': round(tt, 2),
                                   'goal_y': round(yy, 2)})
            gx, gy = (43.0 if team == 0 else 1.0), 13.0
            dist = math.hypot(gx - b['x'], gy - b['y'])
            if sp >= 7.0 and dist <= 30.0:
                va = math.atan2(b['vy'], b['vx'])
                ga = math.atan2(gy - b['y'], gx - b['x'])
                if ang_diff(va, ga) <= math.radians(25.0):
                    cnt[team]['att'] += 1
        for g in goals:
            cnt[g['team']]['goals'] += 1
        for s in saves:
            cnt[1 - s['team']]['saved_by_opp'] += 1

        goal_detail = []
        for g in goals:
            gf = g['frame']
            ks = [k for k in kicks if k['frame'] < gf]
            if not ks:
                continue
            k = ks[-1]
            gx, gy = (43.0 if g['team'] == 0 else 1.0), 13.0
            dist = math.hypot(gx - k['x'], gy - k['y'])
            flight_f = gf - k['frame']
            b = frames[k['frame']]['ball']
            sp0 = math.hypot(b['vx'], b['vy'])
            rec = {'game': gid, 'team': 'me' if g['team'] == me else 'opp',
                   'goal_frame': gf, 'goal_sec': round(gf / HZ, 2), 't': round(g['t'], 2),
                   'scorer': g.get('scorer'), 'score': g['score'],
                   'kick_frame': k['frame'], 'kick_sec': round(k['frame'] / HZ, 2),
                   'kicker_pos': [round(k['x'], 2), round(k['y'], 2)],
                   'distance': round(dist, 2), 'flight_sec': round(flight_f / HZ, 2),
                   'ball_speed_at_kick': round(sp0, 2),
                   'speed_at_line_est': round(sp0 * (FRIC ** flight_f), 2),
                   'setpiece': any(0 <= k['frame'] - f['frame'] <= 60 for f in fouls)}
            goal_detail.append(rec)
            goals_all.append(rec)

        save_detail = []
        for s in saves:
            sf = s['frame']
            shot_team = 1 - s['team']
            ks = [k for k in kicks if k['team'] == shot_team and k['frame'] < sf]
            if not ks:
                continue
            k = ks[-1]
            if sf - k['frame'] > 120:
                continue
            gx, gy = (43.0 if shot_team == 0 else 1.0), 13.0
            rec = {'game': gid, 'shot_team': 'me' if shot_team == me else 'opp',
                   'save_team': 'me' if s['team'] == me else 'opp',
                   'save_frame': sf, 'save_sec': round(sf / HZ, 2), 'kicker': k['unit'],
                   'kick_frame': k['frame'], 'kicker_pos': [round(k['x'], 2), round(k['y'], 2)],
                   'distance': round(math.hypot(gx - k['x'], gy - k['y']), 2),
                   'flight_sec': round((sf - k['frame']) / HZ, 2)}
            save_detail.append(rec)
            saves_all.append(rec)

        foul_detail = [{'game': gid, 'team': 'me' if f['team'] == me else 'opp',
                        'frame': f['frame'], 't': round(f['t'], 2), 'unit': f['unit'],
                        'box': f.get('box'), 'pos': [round(f['x'], 2), round(f['y'], 2)]}
                       for f in fouls]
        fouls_all.extend(foul_detail)

        gd_me = [x for x in goal_detail if x['team'] == 'me']
        gd_op = [x for x in goal_detail if x['team'] == 'opp']
        games.append({
            'id': gid, 'game': rep['game'], 'seed': rep['seed'], 'seats': seats,
            'seat': me, 'teamSize': rep['teamSize'], 'frames': len(frames),
            'sim_sec': round(len(frames) / HZ, 2), 'wall_duration': rep['duration'],
            'windows': len(rep['windows']),
            'score_me': rep['final']['score'][me], 'score_opp': rep['final']['score'][opp],
            'winner': rep['final'].get('winner'), 'reason': rep['final'].get('reason'),
            'kicks_me': stats[me]['kicks'], 'kicks_opp': stats[opp]['kicks'],
            'poss_me': stats[me]['possession'], 'poss_opp': stats[opp]['possession'],
            'fouls_me': stats[me]['fouls'], 'fouls_opp': stats[opp]['fouls'],
            'goals_me': len(gd_me), 'goals_opp': len(gd_op),
            'saves_me': sum(1 for s in saves if s['team'] == me),
            'saves_opp': sum(1 for s in saves if s['team'] == opp),
            'on_target_me': len(gd_me) + sum(1 for s in saves if s['team'] == opp),
            'on_target_opp': len(gd_op) + sum(1 for s in saves if s['team'] == me),
            'rays_me': cnt[me]['ray'], 'rays_opp': cnt[opp]['ray'],
            'att_me': cnt[me]['att'], 'att_opp': cnt[opp]['att'],
            'first_goal': ('me' if goal_detail and goal_detail[0]['team'] == 'me'
                           else 'opp' if goal_detail else None),
            'goal_detail': goal_detail, 'save_detail': save_detail, 'foul_detail': foul_detail,
            'ray_detail_me': rays[me], 'ray_detail_opp': rays[opp],
            'zones': zone_counts(rep, me), 'longest_run': longest_run(rep, me)})

    def agg(rs):
        keys = ['kicks_me', 'kicks_opp', 'poss_me', 'poss_opp', 'fouls_me', 'fouls_opp',
                'goals_me', 'goals_opp', 'saves_me', 'saves_opp', 'on_target_me',
                'on_target_opp', 'rays_me', 'rays_opp', 'att_me', 'att_opp']
        return {k: sum(r[k] for r in rs) for k in keys}

    def group(rs):
        a = agg(rs)
        return dict(games=len(rs),
                    w=sum(1 for r in rs if r['score_me'] > r['score_opp']),
                    d=sum(1 for r in rs if r['score_me'] == r['score_opp']),
                    l=sum(1 for r in rs if r['score_me'] < r['score_opp']),
                    gf=a['goals_me'], ga=a['goals_opp'], **a)

    by_size = {n: group([r for r in games if r['teamSize'] == n]) for n in range(1, 7)}
    by_size = {n: v for n, v in by_size.items() if v['games']}
    by_seat = {s: group([r for r in games if r['seat'] == s]) for s in (0, 1)}

    gbands = {'me': collections.Counter(), 'opp': collections.Counter()}
    sbands = {'me': collections.Counter(), 'opp': collections.Counter()}
    for g in goals_all:
        gbands[g['team']][band(g['distance'])] += 1
    for s in saves_all:
        sbands[s['shot_team']][band(s['distance'])] += 1

    half, buckets = collections.Counter(), collections.Counter()
    for g in goals_all:
        side, t = g['team'], g['goal_sec']
        half[(side, '1H' if t < 60 else '2H' if t < 120 else 'golden')] += 1
        buckets[(side, int(t // 15) * 15)] += 1

    data = {
        'meta': {'model': ME, 'games': len(games), 'hz': HZ,
                 'note': 'public duration is wall-clock; sim_sec = frames / 20'},
        'games': games, 'by_size': by_size, 'by_seat': by_seat,
        'totals': agg(games),
        'record': {'w': sum(1 for r in games if r['score_me'] > r['score_opp']),
                   'd': sum(1 for r in games if r['score_me'] == r['score_opp']),
                   'l': sum(1 for r in games if r['score_me'] < r['score_opp']),
                   'gf': sum(r['score_me'] for r in games),
                   'ga': sum(r['score_opp'] for r in games)},
        'goals_all': goals_all, 'saves_all': saves_all, 'fouls_all': fouls_all,
        'goal_bands': {k: dict(v) for k, v in gbands.items()},
        'save_bands': {k: dict(v) for k, v in sbands.items()},
        'half': {f'{k[0]}_{k[1]}': v for k, v in half.items()},
        'buckets': {f'{k[0]}_{k[1]}': v for k, v in buckets.items()},
        'first_goal': dict(collections.Counter(r['first_goal'] for r in games if r['first_goal'])),
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    print(f"{'id':7} {'n':>1} {'seat':>2} {'score':>5} {'frames':>6} {'sim_s':>6} "
          f"{'G':>5} {'rays':>7} {'onT':>7} {'sav':>5} {'poss':>9} {'foul':>5} "
          f"{'kick':>7} {'wall':>6}")
    for r in games:
        print(f"{r['id']:7} {r['teamSize']:1d} {r['seat']:2d} "
              f"{r['score_me']}-{r['score_opp']:<3} {r['frames']:6d} {r['sim_sec']:6.2f} "
              f"{r['goals_me']}:{r['goals_opp']:<3} {r['rays_me']:2d}/{r['rays_opp']:<2d} "
              f"{r['on_target_me']:2d}/{r['on_target_opp']:<2d} {r['saves_me']:2d}/{r['saves_opp']:<2d} "
              f"{r['poss_me']:4d}/{r['poss_opp']:<4d} {r['fouls_me']:2d}/{r['fouls_opp']:<2d} "
              f"{r['kicks_me']:2d}/{r['kicks_opp']:<2d} {r['wall_duration']:6.2f}")
    print('\nTotals:')
    print(json.dumps({k: data[k] for k in ('record', 'totals', 'goal_bands', 'save_bands',
                                           'half', 'first_goal')}, ensure_ascii=False, indent=1))
    print('\nBy size:')
    for n, a in by_size.items():
        print(n, a['games'], 'W-D-L', a['w'], a['d'], a['l'], 'GF-GA', a['gf'], a['ga'],
              'rays', a['rays_me'], a['rays_opp'], 'onT', a['on_target_me'], a['on_target_opp'],
              'fouls', a['fouls_me'], a['fouls_opp'], 'poss', a['poss_me'], a['poss_opp'])
    print('\nBy seat:')
    for s, a in by_seat.items():
        print(s, a['games'], 'W-D-L', a['w'], a['d'], a['l'], 'GF-GA', a['gf'], a['ga'],
              'rays', a['rays_me'], a['rays_opp'], 'onT', a['on_target_me'], a['on_target_opp'],
              'fouls', a['fouls_me'], a['fouls_opp'], 'poss', a['poss_me'], a['poss_opp'])
    print('\nWrote', OUT)


if __name__ == '__main__':
    main()
