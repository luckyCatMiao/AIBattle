# -*- coding: utf-8 -*-
"""Analyze practice replays: goals, kicks, possession, keeper positions.

Usage: python -I work/an3.py <run_dir> [prefix]
Replay files: <prefix>-g*.json.gz
"""
import gzip, glob, json, math, os, sys

RUN = sys.argv[1]
PREFIX = sys.argv[2] if len(sys.argv) > 2 else 'r1'
ME = 'deepseek-g1'
W, H = 44.0, 26.0
MOUTH_LO, MOUTH_HI = 10.5, 15.5


def load(path):
    return json.load(gzip.open(path, 'rt', encoding='utf-8'))


def units(fr):
    out = []
    for u in fr['units']:
        out.append(dict(zip(['id', 'team', 'index', 'x', 'y', 'fx', 'fy', 'hasBall',
                             'keeper', 'inOwnBox', 'kicks', 'goals', 'touches',
                             'kickCd', 'controlLock'], u)))
    return out


def goal_dist(team, x, y):
    gx = 43.0 if team == 0 else 1.0
    return math.hypot(gx - x, 13.0 - y)


def path_to_goal(team, x, y, ang):
    """Return crossing info if straight path crosses goal line in mouth."""
    vx, vy = math.cos(ang), math.sin(ang)
    if team == 0:
        if vx <= 1e-9:
            return None
        t = (43.0 - x) / vx
    else:
        if vx >= -1e-9:
            return None
        t = (1.0 - x) / vx
    if t <= 0:
        return None
    y_end = y + vy * t
    return t, y_end


def analyze(path):
    d = load(path)
    seats = d['seats']
    # team index of each seat
    tme = seats.index(ME) if ME in seats else 0
    opp = 1 - tme
    frames = d['frames']
    events = d['events']
    n = d['teamSize']
    kicks = [e for e in events if e['type'] == 'kick']
    goals = [e for e in events if e['type'] == 'goal']
    saves = [e for e in events if e['type'] == 'save']
    # possession
    poss = [0, 0]
    for fr in frames:
        b = fr.get('ball') or {}
        ow = b.get('owner')
        if ow:
            t = int(ow[1])
            poss[t] += 1
    # kick outcomes
    krows = []
    for i, e in enumerate(kicks):
        f = e['frame']
        team = e['team']
        x, y, a = e['x'], e['y'], e['angle']
        # find next possession event: scan next 120 frames for ball owner change
        nxt = None
        for fr in frames[f + 1:min(len(frames), f + 160)]:
            b = fr.get('ball') or {}
            ow = b.get('owner')
            if ow:
                nxt = (fr['frame'] - f, int(ow[1]), b['x'], b['y'])
                break
        # did a goal happen before next possession?
        goal = None
        for g in goals:
            if f < g['frame'] <= f + 160:
                goal = g
                break
        pg = path_to_goal(team, x, y, a)
        krows.append({
            'frame': f, 't': round(f / 20.0, 2), 'team': team, 'unit': e['unit'],
            'x': x, 'y': y, 'ang': a, 'dist': round(goal_dist(team, x, y), 2),
            'y_end': round(pg[1], 2) if pg else None,
            'next': nxt, 'goal': goal['team'] if goal else None,
        })
    # goal details
    grows = []
    for g in goals:
        f = g['frame']
        # last kick by scoring team before goal
        lk = None
        for e in reversed(kicks):
            if e['frame'] <= f and e['team'] == g['team']:
                lk = e
                break
        # last touch by any team
        rec = {'frame': f, 't': round(f / 20.0, 2), 'team': g['team'], 'ownGoal': g.get('ownGoal')}
        if lk:
            pg = path_to_goal(g['team'], lk['x'], lk['y'], lk['angle'])
            rec.update({'kick_t': round(lk['frame'] / 20.0, 2), 'kick_frame': lk['frame'],
                        'kick_x': lk['x'], 'kick_y': lk['y'],
                        'dist': round(goal_dist(g['team'], lk['x'], lk['y']), 2),
                        'y_end': round(pg[1], 2) if pg else None,
                        'flight': round((f - lk['frame']) / 20.0, 2)})
        # keeper of conceding team at goal frame - 2 frames and - 0.1s
        kt = 1 - g['team']
        for label, ff in (('keeper_at_0.05', max(0, f - 1)), ('keeper_at_0.1', max(0, f - 2)),
                          ('keeper_at_0.3', max(0, f - 6))):
            fr = frames[min(ff, len(frames) - 1)]
            ks = [u for u in units(fr) if u['team'] == kt and u['keeper']]
            b = fr['ball']
            if ks:
                k = ks[0]
                rec[label] = [round(math.hypot(k['x'] - b['x'], k['y'] - b['y']), 2),
                              round(k['x'], 2), round(k['y'], 2)]
        # ball y when crossing: use final ball pos
        bfr = frames[max(0, f - 1)]['ball']
        rec['ball_at_0.05'] = [bfr['x'], bfr['y']]
        grows.append(rec)
    # kick summary per team
    def summ(team):
        ks = [k for k in krows if k['team'] == team]
        if not ks:
            return {}
        ds = sorted(k['dist'] for k in ks)
        on = [k for k in ks if k['y_end'] is not None and MOUTH_LO <= k['y_end'] <= MOUTH_HI]
        near = [k for k in ks if k['dist'] <= 14]
        return {'kicks': len(ks), 'med_dist': ds[len(ds) // 2],
                'near14': len(near), 'on_target_geom': len(on),
                'goals_from_kick': sum(1 for k in ks if k['goal'] == team),
                'territory_x_mean': round(sum(k['x'] for k in ks) / len(ks), 1)}
    return {'id': d['id'], 'seed': d['seed'], 'teamSize': n, 'seat': seats.index(ME),
            'scores': d['scores'], 'winner': d['winner'], 'reason': d['reason'],
            'poss': poss, 'kicks': summ(tme), 'opp_kicks': summ(opp),
            'goals': grows, 'saves': len(saves),
            'our_saves': sum(1 for s in saves if s['team'] == tme),
            'opp_saves': sum(1 for s in saves if s['team'] == opp)}


paths = sorted(glob.glob(os.path.join(RUN, PREFIX + '-g*.json.gz')),
               key=lambda p: int(os.path.basename(p).split('g')[1].split('.')[0]))
allrows = []
for p in paths:
    r = analyze(p)
    allrows.append(r)
    print(json.dumps(r, ensure_ascii=False))

# aggregate
wins = sum(1 for r in allrows if r['winner'] == (0 if r['seat'] == 0 else 1))
print('\nAGG games=%d wins=%d' % (len(allrows), wins))
