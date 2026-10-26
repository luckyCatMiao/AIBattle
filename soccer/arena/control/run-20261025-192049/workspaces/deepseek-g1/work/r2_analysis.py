#!/usr/bin/env python3
"""Round-2 replay analysis: goals, shots, keeper context. Read-only on replays."""
import gzip, json, math, glob, os, sys

HZ = 20.0
FRICTION = 0.978
KICK_SPEED = 11.0
MOV = 3.15


def flight_time(d):
    """Discrete per-physics-frame model: v_n = 11*0.978^n, step = v_n/HZ."""
    if d <= 0:
        return 0.0
    v = KICK_SPEED
    x = 0.0
    n = 0
    while x < d and n < 400:
        x += v / HZ
        v *= FRICTION
        n += 1
    return n / HZ


def target_at_goal(x, y, ang, gx):
    dx, dy = math.cos(ang), math.sin(ang)
    if gx == 43.0:
        if dx <= 1e-6:
            return None
        t = (43.0 - x) / dx
    else:
        if dx >= -1e-6:
            return None
        t = (1.0 - x) / dx
    return y + dy * t, t, dx, dy


def load(path):
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        return json.load(f)


def analyze(path):
    d = load(path)
    seats = d['seats']
    our_team = seats.index('deepseek-g1')
    ts = d['teamSize']
    final = d['final']
    frames = d['frames']
    need = set()
    for e in d['events']:
        if e['type'] in ('goal', 'save', 'kick'):
            need.add(e['frame'])
            if e['type'] == 'goal':
                need.add(e['frame'] - 1)
                need.add(e['frame'] - 2)
                need.add(e['frame'] - 3)
    states = {}
    for fr in frames:
        f = fr['frame']
        if f in need:
            states[f] = {'ball': dict(fr['ball']), 'units': fr['units'], 'score': fr['score']}
    ev = d['events']
    goals = []
    for i, e in enumerate(ev):
        if e['type'] != 'goal':
            continue
        pre = states.get(e['frame'] - 1, {})
        b = pre.get('ball') or {}
        lk = None
        for j in range(i - 1, -1, -1):
            p = ev[j]
            if p['type'] == 'kick' and p['team'] == e['team'] and e['frame'] - p['frame'] <= 240:
                lk = p
                break
        shot = None
        if lk:
            tg = target_at_goal(lk['x'], lk['y'], lk['angle'], 43.0 if lk['team'] == 0 else 1.0)
            ty = tg[0] if tg else None
            dist = (43.0 - lk['x']) if lk['team'] == 0 else (lk['x'] - 1.0)
            ft = flight_time(dist)
            shot = {'frame': lk['frame'], 't': lk['t'], 'unit': lk['unit'],
                    'x': round(lk['x'], 3), 'y': round(lk['y'], 3),
                    'angle': round(lk['angle'], 4),
                    'target_y': None if ty is None else round(ty, 3),
                    'dist_to_goal': round(dist, 3), 'flight_s': round(ft, 3),
                    'dt_s': round((e['frame'] - lk['frame']) / HZ, 2)}
            keeper_uid = 't' + str(1 - e['team']) + 'u0'
            ku = next((u for u in pre.get('units', []) if u[0] == keeper_uid), None)
            if ku:
                shot['def_keeper'] = [round(ku[3], 2), round(ku[4], 2)]
                if ty is not None:
                    shot['keeper_dy'] = round(abs(ku[4] - ty), 2)
                    shot['keeper_reach_m'] = round(MOV * ft, 2)
        goals.append({'frame': e['frame'], 't': e['t'], 'team': e['team'],
                      'team_name': seats[e['team']], 'scorer': e.get('scorer'),
                      'ownGoal': e.get('ownGoal'), 'score': e.get('score'),
                      'goal_y': round(b.get('y'), 3) if b else None,
                      'goal_x': round(b.get('x'), 3) if b else None,
                      'lastTouch': b.get('lastTouch'), 'shot': shot})
    saves = []
    for i, e in enumerate(ev):
        if e['type'] != 'save':
            continue
        lk = None
        for j in range(i - 1, -1, -1):
            p = ev[j]
            if p['type'] == 'kick' and p['team'] != e['team'] and e['frame'] - p['frame'] <= 120:
                lk = p
                break
        s = {'frame': e['frame'], 't': e['t'], 'team': e['team'], 'unit': e.get('unit')}
        if lk:
            tg = target_at_goal(lk['x'], lk['y'], lk['angle'], 43.0 if lk['team'] == 0 else 1.0)
            s.update({'shot_frame': lk['frame'], 'shot_unit': lk['unit'],
                      'x': round(lk['x'], 3), 'y': round(lk['y'], 3),
                      'angle': round(lk['angle'], 4),
                      'target_y': None if not tg or tg[0] is None else round(tg[0], 3),
                      'dist_to_goal': round((43.0 - lk['x']) if lk['team'] == 0 else (lk['x'] - 1.0), 3)})
        saves.append(s)
    shots = []
    for i, e in enumerate(ev):
        if e['type'] != 'kick':
            continue
        gx = 43.0 if e['team'] == 0 else 1.0
        tg = target_at_goal(e['x'], e['y'], e['angle'], gx)
        if not tg:
            continue
        ty, t, dx, dy = tg
        if not (10.0 <= ty <= 16.0):
            continue
        dist = (43.0 - e['x']) if e['team'] == 0 else (e['x'] - 1.0)
        if dist <= 0:
            continue
        outcome = 'off'
        for j in range(i + 1, len(ev)):
            p = ev[j]
            if p['frame'] - e['frame'] > 120:
                break
            if p['type'] == 'goal':
                if (p['team'] == e['team'] and not p.get('ownGoal')) or (
                        p['team'] != e['team'] and p.get('ownGoal')):
                    outcome = 'goal'
                    break
                if p['team'] != e['team'] and not p.get('ownGoal'):
                    break
            if p['type'] == 'save' and p['team'] != e['team']:
                outcome = 'save'
                break
            if p['type'] == 'kick' and p['team'] == e['team']:
                break
        shots.append({'frame': e['frame'], 't': e['t'], 'team': e['team'],
                      'unit': e['unit'], 'x': round(e['x'], 3), 'y': round(e['y'], 3),
                      'angle': round(e['angle'], 4), 'target_y': round(ty, 3),
                      'dist_to_goal': round(dist, 3), 'flight_s': round(flight_time(dist), 3),
                      'outcome': outcome})

    def team_shots(team):
        arr = [s for s in shots if s['team'] == team]
        return {'n': len(arr),
                'goals': sum(1 for s in arr if s['outcome'] == 'goal'),
                'saves': sum(1 for s in arr if s['outcome'] == 'save'),
                'on_target': sum(1 for s in arr if s['outcome'] in ('goal', 'save'))}

    cards = []
    for e in ev:
        if e['type'] == 'card':
            cards.append({k: e.get(k) for k in ('frame', 't', 'team', 'unit', 'box', 'x', 'y', 'red', 'remaining')})
    st = final.get('stats') or d.get('stats')
    return {
        'id': d['id'], 'teamSize': ts, 'seats': seats, 'our_team': our_team,
        'opp_team': 1 - our_team,
        'score_us': d['scores']['deepseek-g1'], 'score_them': d['scores']['sol'],
        'winner': d['winner'], 'reason': d['reason'],
        'frames_count': final['frame'] + 1, 'final_tick': final['frame'],
        'sim_seconds': round(final['frame'] / HZ, 3), 'wall_duration_s': d['duration'],
        'stats': st,
        'goals': goals, 'saves': saves, 'shots': shots,
        'team_shots': {seats[t]: team_shots(t) for t in (0, 1)},
        'our_shots': team_shots(our_team), 'opp_shots': team_shots(1 - our_team),
        'our_goals': [g for g in goals if g['team'] == our_team],
        'opp_goals': [g for g in goals if g['team'] != our_team],
        'cards': cards,
    }


def main():
    pat = sys.argv[1] if len(sys.argv) > 1 else 'matches/r2-g*.json.gz'
    outpath = sys.argv[2] if len(sys.argv) > 2 else 'work/r2_analysis.json'
    paths = sorted(glob.glob(pat), key=lambda s: int(s.split('-g')[-1].split('.')[0]))
    res = [analyze(p) for p in paths]
    with open(outpath, 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print('wrote', outpath, 'games', len(res))


if __name__ == '__main__':
    main()
