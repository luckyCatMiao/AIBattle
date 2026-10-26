# -*- coding: utf-8 -*-
"""Round-2 replay analysis: per-game goals, measured on-target shots, saves, possession.

Usage: python -I work/r2_analyze.py <run_dir>
Reads <run_dir>/r2-g*.json.gz. Writes JSON summary to stdout.
Shot definition: from kick position/angle, extrapolate the straight ball path;
"on target" = crosses the opponent goal line (x=1 for team 1, x=43 for team 0)
with 10 <= y <= 16 before hitting a side wall. "attempt" = crosses goal line
with 6 <= y <= 20. This is a geometric proxy, not an engine event.
"""
import gzip, glob, json, math, os, sys

RUN = sys.argv[1]
PREFIX = sys.argv[3] if len(sys.argv) > 3 else 'r2'
TEAM_OF_INTEREST = 'deepseek-g1'


def team_idx(seats, name):
    return seats.index(name)


def shot_geom(e):
    team = e['team']
    x, y, a = e['x'], e['y'], e['angle']
    vx, vy = math.cos(a), math.sin(a)
    if team == 0:  # attacks x=43
        if vx <= 1e-9:
            return None
        t = (43.0 - x) / vx
    else:          # team 1 attacks x=1
        if vx >= -1e-9:
            return None
        t = (1.0 - x) / vx
    if t <= 0:
        return None
    y_end = y + vy * t
    # side wall first?
    for wall in (0.22, 25.78):
        if abs(vy) > 1e-9:
            tw = (wall - y) / vy
            if 0 < tw < t:
                return {'on': False, 'attempt': False, 'y_end': y_end, 'blocked_wall': True,
                        'reach': False}
    # friction-limited reach: v(t)=11*exp(-lam*t), total distance 11/lam
    lam = -math.log(0.978) * 20.0
    d = t * math.hypot(vx, vy)  # straight-line distance to goal line
    reach = d < (11.0 / lam) * 0.995
    travel = -math.log(max(1e-9, 1.0 - d / (11.0 / lam))) / lam if reach else 0.0
    v_end = 11.0 * math.exp(-lam * travel) if reach else 0.0
    on = reach and 10.0 <= y_end <= 16.0
    attempt = reach and 6.0 <= y_end <= 20.0
    return {'on': on, 'attempt': attempt, 'y_end': round(y_end, 3),
            'dist': round(d, 2), 'time': round(t, 2), 'v_end': round(v_end, 2),
            'reach': reach}


rows = []
for path in sorted(glob.glob(os.path.join(RUN, PREFIX + '-g*.json.gz')),
                   key=lambda p: int(os.path.basename(p).split('g')[1].split('.')[0])):
    d = json.load(gzip.open(path, 'rt', encoding='utf-8'))
    seats = d['seats']
    di = team_idx(seats, TEAM_OF_INTEREST)
    si = 1 - di
    ev = d['events']
    goals = [e for e in ev if e['type'] == 'goal']
    saves = [e for e in ev if e['type'] == 'save']
    kicks = [e for e in ev if e['type'] == 'kick']
    fouls = [e for e in ev if e['type'] == 'foul']
    st = d['final']['stats']

    per_team = {}
    for t in (0, 1):
        tk = [e for e in kicks if e['team'] == t]
        shots = [shot_geom(e) for e in tk]
        shots = [s for s in shots if s]
        per_team[t] = {
            'kicks': len(tk),
            'shots_on': sum(1 for s in shots if s['on']),
            'shots_attempt': sum(1 for s in shots if s['attempt']),
            'goals': sum(1 for g in goals if g['team'] == t and not g.get('ownGoal')),
            'own_goals': sum(1 for g in goals if g['team'] == t and g.get('ownGoal')),
            'saves': sum(1 for s in saves if s['team'] == t),
            'possession': st[t]['possession'],
            'on_shots': [{'f': e['frame'], 'x': e['x'], 'y': e['y'], 'd': s['dist'],
                          've': s['v_end'], 'yend': s['y_end']}
                         for e, s in zip(tk, [shot_geom(x) for x in tk])
                         if s and s['on']],
        }
    gtimes = [{'frame': g['frame'], 't': g['t'], 'team': 'deepseek' if g['team'] == di else 'sol',
               'scorer': g.get('scorer'), 'score': g.get('score')} for g in goals]
    wn = d['winner']
    winner_name = None if wn is None else seats[wn]
    rows.append({
        'id': d['id'], 'teamSize': d['teamSize'], 'seats': seats,
        'deepseek_team': di, 'score_deepseek': d['scores'][TEAM_OF_INTEREST],
        'score_sol': d['scores']['sol'], 'winner': winner_name,
        'result': 'W' if winner_name == TEAM_OF_INTEREST else ('D' if winner_name is None else 'L'),
        'frames': len(d['frames']), 'sim_seconds': round((len(d['frames']) - 1) / 20.0, 2),
        'wall_seconds': d['duration'], 'reason': d['reason'],
        'deepseek': per_team[di], 'sol': per_team[si],
        'goals': gtimes, 'fouls': {'deepseek': st[di]['fouls'], 'sol': st[si]['fouls']},
        'foul_events': len(fouls),
        'first_goal_t': gtimes[0]['t'] if gtimes else None,
        'half_goals_deepseek': [sum(1 for g in gtimes if g['team'] == 'deepseek' and g['t'] <= 60),
                                sum(1 for g in gtimes if g['team'] == 'deepseek' and g['t'] > 60)],
        'half_goals_sol': [sum(1 for g in gtimes if g['team'] == 'sol' and g['t'] <= 60),
                           sum(1 for g in gtimes if g['team'] == 'sol' and g['t'] > 60)],
    })

tot = {
    'games': len(rows),
    'wins': sum(1 for r in rows if r['result'] == 'W'),
    'draws': sum(1 for r in rows if r['result'] == 'D'),
    'losses': sum(1 for r in rows if r['result'] == 'L'),
    'gf': sum(r['score_deepseek'] for r in rows),
    'ga': sum(r['score_sol'] for r in rows),
    'kicks_d': sum(r['deepseek']['kicks'] for r in rows),
    'kicks_s': sum(r['sol']['kicks'] for r in rows),
    'on_d': sum(r['deepseek']['shots_on'] for r in rows),
    'on_s': sum(r['sol']['shots_on'] for r in rows),
    'att_d': sum(r['deepseek']['shots_attempt'] for r in rows),
    'att_s': sum(r['sol']['shots_attempt'] for r in rows),
    'saves_d': sum(r['deepseek']['saves'] for r in rows),
    'saves_s': sum(r['sol']['saves'] for r in rows),
    'pos_d': sum(r['deepseek']['possession'] for r in rows),
    'pos_s': sum(r['sol']['possession'] for r in rows),
}
by_size = {}
for r in rows:
    k = str(r['teamSize'])
    a = by_size.setdefault(k, {'games': 0, 'W': 0, 'D': 0, 'L': 0, 'gf': 0, 'ga': 0,
                              'on_d': 0, 'on_s': 0, 'kicks_d': 0, 'kicks_s': 0})
    a['games'] += 1
    a[r['result']] += 1
    a['gf'] += r['score_deepseek']
    a['ga'] += r['score_sol']
    a['on_d'] += r['deepseek']['shots_on']
    a['on_s'] += r['sol']['shots_on']
    a['kicks_d'] += r['deepseek']['kicks']
    a['kicks_s'] += r['sol']['kicks']
by_seat = {}
for r in rows:
    k = str(r['deepseek_team'])
    a = by_seat.setdefault(k, {'games': 0, 'W': 0, 'D': 0, 'L': 0, 'gf': 0, 'ga': 0})
    a['games'] += 1
    a[r['result']] += 1
    a['gf'] += r['score_deepseek']
    a['ga'] += r['score_sol']
out = json.dumps({'totals': tot, 'by_size': by_size, 'by_seat': by_seat, 'games': rows},
                 ensure_ascii=False, indent=1)
if len(sys.argv) > 2:
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        f.write(out)
else:
    print(out)
