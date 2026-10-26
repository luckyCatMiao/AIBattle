# -*- coding: utf-8 -*-
"""For every goal, find the scoring team's last kick and keeper geometry.

Usage: python -I work/r2_goal_context.py <run_dir>
"""
import glob, gzip, json, math, os, sys

RUN = sys.argv[1]
PREFIX = sys.argv[2] if len(sys.argv) > 2 else 'r2'
LAM = -math.log(0.978) * 20.0


def dist(p, q):
    return math.hypot(p[0] - q[0], p[1] - q[1])


rows = []
for path in sorted(glob.glob(os.path.join(RUN, PREFIX + '-g*.json.gz')),
                   key=lambda p: int(os.path.basename(p).split('g')[1].split('.')[0])):
    d = json.load(gzip.open(path, 'rt', encoding='utf-8'))
    ev = d['events']
    frames = d['frames']
    fields = d['unitsFormat']
    kicks = [e for e in ev if e['type'] == 'kick']
    for g in [e for e in ev if e['type'] == 'goal']:
        st = g['team']
        prev = [k for k in kicks if k['team'] == st and k['frame'] < g['frame']]
        if not prev:
            continue
        k = prev[-1]
        target = 1.0 if st == 1 else 43.0
        x, y, a = k['x'], k['y'], k['angle']
        vx, vy = math.cos(a), math.sin(a)
        t = (target - x) / vx if abs(vx) > 1e-9 else 999
        y_end = y + vy * t
        d_goal = t * math.hypot(vx, vy)
        reach = 0 < d_goal < (11.0 / LAM) * 0.995
        travel = -math.log(max(1e-9, 1 - d_goal / (11.0 / LAM))) / LAM if reach else None
        def units_at(f):
            out = {}
            for u in frames[f]['units']:
                u = dict(zip(fields, u)) if isinstance(u, list) else u
                out[u['id']] = u
            return out
        prevf = frames[max(0, g['frame'] - 2)]
        b = prevf['ball']
        ug = units_at(max(0, g['frame'] - 2))
        uk = units_at(k['frame'])
        keeper = [u for u in ug.values() if u['team'] != st and u['keeper']]
        kp = keeper[0] if keeper else None
        kp_kick = [u for u in uk.values() if u['team'] != st and u['keeper']]
        kp_kick = kp_kick[0] if kp_kick else None
        # nearest defending field unit to the ball at goal-2
        near = min((u for u in ug.values() if u['team'] != st),
                   key=lambda u: dist((u['x'], u['y']), (b['x'], b['y'])))
        rows.append({
            'game': d['id'], 'ts': d['teamSize'], 'goal_t': g['t'], 'goal_f': g['frame'],
            'scorer': 'deepseek' if d['seats'][st] == 'deepseek-g1' else 'sol',
            'kick_f': k['frame'], 'kick_t': k['t'], 'kick_x': k['x'], 'kick_y': k['y'],
            'kick_dist': round(d_goal, 2), 'y_end': round(y_end, 2), 'travel': round(travel, 2) if travel else None,
            'delay': round(g['t'] - k['t'], 2),
            'keeper_at_goal2': (round(kp['x'], 2), round(kp['y'], 2)) if kp else None,
            'keeper_ball_dist_goal2': round(dist((kp['x'], kp['y']), (b['x'], b['y'])), 2) if kp else None,
            'nearest_def_ball_dist_goal2': round(dist((near['x'], near['y']), (b['x'], b['y'])), 2),
            'keeper_at_kick': (round(kp_kick['x'], 2), round(kp_kick['y'], 2)) if kp_kick else None,
        })

for r in rows:
    print('%(game)s n=%(ts)d %(goal_t)6.2f %(scorer)-8s kick@%(kick_t)6.2f '
          'from(%(kick_x)5.1f,%(kick_y)5.1f) dist=%(kick_dist)5.1f yend=%(y_end)5.1f '
          'travel=%(travel)s keeper@goal2=%(keeper_at_goal2)s k-b=%(keeper_ball_dist_goal2)s' % r)
