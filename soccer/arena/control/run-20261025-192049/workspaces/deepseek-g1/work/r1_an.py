# -*- coding: utf-8 -*-
"""Round-1 replay analysis: goals, shots, saves, possession spells.

Reads only our own match replays.
"""
import gzip, json, glob, math, os, sys, collections

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MATCH = os.path.join(HERE, 'matches')
ME = 'deepseek-g1'


def load(gid):
    with gzip.open(os.path.join(MATCH, gid + '.json.gz'), 'rt', encoding='utf-8') as f:
        return json.load(f)


def unit_map(frame):
    fmt = frame.get('unitsFormat')  # absent; frames carry lists
    return frame


def units_of(d, fi):
    fr = d['frames'][fi]
    out = []
    for a in fr['units']:
        out.append(dict(id=a[0], team=a[1], index=a[2], x=a[3], y=a[4],
                        fx=a[5], fy=a[6], hasBall=a[7], keeper=a[8],
                        inOwnBox=a[9], kicks=a[10], goals=a[11], touches=a[12],
                        kickCd=a[13], controlLock=a[14]))
    return out


def attack_goal_x(team):
    return 43.0 if team == 0 else 1.0


def shot_target(kick):
    """Return (on_target, y_at_goal, dist) for a kick event."""
    x, y, ang = kick['x'], kick['y'], kick.get('angle', 0.0)
    gx = attack_goal_x(kick['team'])
    dx = math.cos(ang)
    dy = math.sin(ang)
    if abs(dx) < 1e-6:
        return False, None, None
    t = (gx - x) / dx
    if t <= 0:
        return False, None, None
    yy = y + dy * t
    dist = math.hypot(gx - x, 0)
    return (10.0 <= yy <= 16.0), yy, t


def game_summary(gid):
    d = load(gid)
    seats = d['seats']
    myteam = seats.index(ME)
    oppteam = 1 - myteam
    ev = d['events']
    goals = [e for e in ev if e['type'] == 'goal']
    saves = [e for e in ev if e['type'] == 'save']
    kicks = [e for e in ev if e['type'] == 'kick']
    tackles = [e for e in ev if e['type'] == 'tackle']

    def kick_near(goal, team, maxs=6.0):
        cands = [k for k in kicks if k['team'] == team and k['frame'] <= goal['frame']
                 and (goal['frame'] - k['frame']) <= maxs * 20]
        return cands[-1] if cands else None

    shots = []
    for k in kicks:
        on, yy, tt = shot_target(k)
        shots.append({'frame': k['frame'], 't': k['t'], 'team': k['team'],
                      'unit': k['unit'], 'x': k['x'], 'y': k['y'],
                      'angle': round(math.degrees(k.get('angle', 0)), 1),
                      'on_target': on, 'y_goal': None if yy is None else round(yy, 2),
                      'dist_x': round(abs(attack_goal_x(k['team']) - k['x']), 2)})
    # attach outcomes
    for s in shots:
        nxt_goal = next((g for g in goals if g['frame'] > s['frame'] and g['frame'] - s['frame'] <= 120
                         and g['team'] == s['team'] and g.get('scorer') == s['unit']), None)
        nxt_save = next((v for v in saves if v['frame'] > s['frame'] and v['frame'] - s['frame'] <= 120
                         and v['team'] != s['team']), None)
        s['goal'] = bool(nxt_goal)
        s['save'] = bool(nxt_save)
        s['flight_goal_s'] = None if not nxt_goal else round((nxt_goal['frame'] - s['frame']) / 20.0, 2)

    goal_rows = []
    for g in goals:
        k = kick_near(g, g['team'])
        row = {'team': g['team'], 't': g['t'], 'frame': g['frame'],
               'scorer': g.get('scorer'), 'own': g.get('ownGoal')}
        if k:
            on, yy, tt = shot_target(k)
            row.update({'kick_t': k['t'], 'kick_x': round(k['x'], 2), 'kick_y': round(k['y'], 2),
                        'kick_unit': k['unit'],
                        'angle_deg': round(math.degrees(k.get('angle', 0)), 1),
                        'dist_to_goal': round(abs(attack_goal_x(k['team']) - k['x']), 2),
                        'flight_s': round((g['frame'] - k['frame']) / 20.0, 2),
                        'aim_y': None if yy is None else round(yy, 2),
                        'on_target': on})
        else:
            row.update({'kick_t': None})
        goal_rows.append(row)

    # possession spells from frames: ball owner team (or lastTeam) - use ball owner/lastTeam
    spells = []  # (team, start_frame, end_frame, start_ball, end_ball)
    cur = None
    for fi, fr in enumerate(d['frames']):
        b = fr.get('ball') or {}
        t = b.get('lastTeam')
        if t is None:
            continue
        if cur is None or cur[0] != t:
            if cur:
                spells.append(cur + [fi - 1])
            cur = [t, fi, b.get('x'), b.get('y'), b.get('x'), b.get('y')]
        cur[4] = b.get('x'); cur[5] = b.get('y')
    if cur:
        spells.append(cur + [len(d['frames']) - 1])

    # our attacking spells detail
    my_spells = []
    for sp in spells:
        t, f0, x0, y0, x1, y1, f1 = sp
        if t == myteam:
            my_spells.append({'f0': f0, 'f1': f1, 's': round((f1 - f0 + 1) / 20.0, 2),
                              'x0': round(x0, 1), 'x1': round(x1, 1),
                              'adv': round((x1 - x0) * (1 if myteam == 0 else -1), 1),
                              'y0': round(y0, 1), 'y1': round(y1, 1)})

    # per-frame our units at opponent's shots / goals: distance of nearest defender to shot line
    def nearest_at(frame_no, team, x, y):
        us = units_of(d, min(frame_no, len(d['frames']) - 1))
        us = [u for u in us if u['team'] == team]
        return min(((math.hypot(u['x'] - x, u['y'] - y), u['id'], round(u['x'], 1), round(u['y'], 1)) for u in us),
                   default=None)

    return {
        'id': gid, 'teamSize': d['teamSize'], 'seats': seats, 'myteam': myteam,
        'score': d['scores'], 'frames': len(d['frames']), 'sim_s': round(len(d['frames']) / 20.0, 2),
        'duration': d['duration'], 'reason': d['reason'],
        'stats': d['final']['stats'], 'saves_stat': d.get('final', {}).get('saves'),
        'shots': shots, 'goals': goal_rows,
        'my_attacking_spells': my_spells,
        'kicks_by_team': dict(collections.Counter(k['team'] for k in kicks)),
        'tackles_by_team': dict(collections.Counter(k['team'] for k in tackles)),
    }


def main():
    gids = ['r1-g%d' % i for i in range(1, 21)]
    summ = [game_summary(g) for g in gids]
    out = os.path.join(HERE, 'work', 'r1_summary.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(summ, f, ensure_ascii=False, indent=1)
    print('wrote', out)
    # aggregate
    print('\n=== per game ===')
    for s in summ:
        mt = s['myteam']
        my = s['score'][ME]
        op = s['score']['sol']
        my_shots = [x for x in s['shots'] if x['team'] == mt]
        op_shots = [x for x in s['shots'] if x['team'] != mt]
        my_on = sum(1 for x in my_shots if x['on_target'])
        op_on = sum(1 for x in op_shots if x['on_target'])
        print(f"{s['id']:6s} {s['teamSize']}v{s['teamSize']} seats={s['seats']} "
              f"score {my}:{op} frames={s['frames']} sim={s['sim_s']}s dur={s['duration']}s "
              f"kicks my/op={len(my_shots)}/{len(op_shots)} onT={my_on}/{op_on} "
              f"goals={sum(1 for g in s['goals'] if g['team']==mt)}/{sum(1 for g in s['goals'] if g['team']!=mt)}")
    print('\n=== goals detail ===')
    for s in summ:
        if not s['goals']:
            continue
        print(s['id'], 'ts', s['teamSize'])
        for g in s['goals']:
            side = 'ME ' if g['team'] == s['myteam'] else 'OPP'
            print('  ', side, 't=%.2f f=%d' % (g['t'], g['frame']), g.get('scorer'),
                  'kick(t=%s,x=%s,y=%s,dist=%s,ang=%s,unit=%s) flight=%s aim_y=%s onT=%s' % (
                      g.get('kick_t'), g.get('kick_x'), g.get('kick_y'), g.get('dist_to_goal'),
                      g.get('angle_deg'), g.get('kick_unit'), g.get('flight_s'),
                      g.get('aim_y'), g.get('on_target')))


if __name__ == '__main__':
    main()
