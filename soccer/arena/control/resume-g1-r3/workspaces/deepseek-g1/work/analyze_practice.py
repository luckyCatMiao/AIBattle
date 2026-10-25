#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""分析 practice 回放：逐局比分、进球链、门将站位、控球/射门统计。

用法: python -I work/analyze_practice.py <practice_dir> [<practice_dir> ...]
输出: JSON lines + 汇总表到 stdout
"""
import gzip
import json
import math
import pathlib
import sys

W, H = 44, 26
GOAL_TOP, GOAL_BOT = 10.0, 16.0
GOAL_CX = {0: 1.0, 1: 43.0}
ATK = {0: 1.0, 1: -1.0}


def load(path):
    with gzip.open(path, 'rt', encoding='utf-8') as fh:
        return json.load(fh)


def dist(a, b, c, d):
    return math.hypot(a - c, b - d)


def analyze(path):
    d = load(path)
    seats = d['seats']
    ts = d['teamSize']
    our = seats.index('deepseek-g1')
    opp = 1 - our
    frames = d['frames']
    final = d['final']
    events = final.get('events', [])
    game = {
        'file': pathlib.Path(path).name,
        'seed': d.get('seed'),
        'teamSize': ts,
        'seat': our,
        'score': d.get('scores'),
        'winner': (seats[d['winner']] if d.get('winner') in (0, 1) else None),
        'reason': d.get('reason'),
        'our_goals': 0, 'opp_goals': 0,
        'goal_events': [], 'saves': [], 'fouls': [],
        'kicks': [0, 0], 'poss': [0, 0],
    }
    last_kick = {0: None, 1: None}
    for e in events:
        et = e.get('type')
        if et == 'goal':
            team = e.get('team')
            # scorer team: from team field; ownGoal counted for other team
            if e.get('ownGoal'):
                team = 1 - team
            lk = last_kick.get(team)
            game['goal_events'].append({
                't': e.get('t'), 'frame': e.get('frame'), 'team': team,
                'scorer': e.get('scorer'), 'ownGoal': e.get('ownGoal'),
                'kick_xy': [lk.get('x'), lk.get('y')] if lk else None,
                'kick_angle': lk.get('angle') if lk else None,
                'kick_t': lk.get('t') if lk else None,
            })
        elif et == 'kick':
            last_kick[e.get('team')] = e
        elif et == 'save':
            game['saves'].append({'t': e.get('t'), 'team': e.get('team'),
                                  'unit': e.get('unit')})
        elif et == 'foul':
            game['fouls'].append({'t': e.get('t'), 'team': e.get('team'),
                                  'x': e.get('x'), 'y': e.get('y')})
    for g in game['goal_events']:
        if g['team'] == our:
            game['our_goals'] += 1
        else:
            game['opp_goals'] += 1
        if g['kick_xy']:
            gx = GOAL_CX[1 - g['team']]
            g['dist_to_goal_center'] = round(dist(g['kick_xy'][0], g['kick_xy'][1], gx, 13.0), 2)
            # 落点估计：用 end frame 前最后一帧球位置
            fr = g['frame']
            if fr is not None and 0 <= fr < len(frames):
                ball = frames[max(0, min(fr, len(frames) - 1) - 2)]['ball']
                g['ball_at_goal'] = [round(ball['x'], 2), round(ball['y'], 2)]
    # keeper positioning at each goal kick frame + shot stats
    shots = {'our': [], 'opp': []}
    for e in events:
        if e.get('type') != 'kick':
            continue
        team = e.get('team')
        x, y = e.get('x'), e.get('y')
        ang = e.get('angle')
        if x is None:
            continue
        side = 'our' if team == our else 'opp'
        # 射线是否穿过对方球门框
        gx = GOAL_CX[1 - team]
        crossed = False
        typ = None
        if ang is not None and abs(math.cos(ang)) > 1e-6:
            ux, uy = math.cos(ang), math.sin(ang)
            D = 26.0
            # 逐帧飞行近似
            px, py = x, y
            vx, vy = 11.0 * ux, 11.0 * uy
            for _ in range(120):
                px += vx * 0.05
                py += vy * 0.05
                if py < 0.22 or py > H - 0.22:
                    if 0.22 < px < W - 0.22:
                        vy = -vy * 0.72
                        py = max(0.22, min(H - 0.22, py))
                vx *= 0.978
                vy *= 0.978
                if (gx > 20 and px >= gx) or (gx < 20 and px <= gx):
                    if GOAL_TOP <= py <= GOAL_BOT:
                        crossed = True
                        typ = round(py, 1)
                    break
                if px < 0.22 or px > W - 0.22:
                    break
                if abs(vx) + abs(vy) < 0.02:
                    break
        shots[side].append({'t': e.get('t'), 'frame': e.get('frame'),
                            'x': round(x, 2), 'y': round(y, 2),
                            'ang': ang, 'ray_goal': crossed, 'ray_y': typ})
    game['shots'] = {k: len(v) for k, v in shots.items()}
    game['shots_detail'] = shots
    # possession and goalie depth at opponent shot moments
    keeper_depth = []
    for sh in shots['opp']:
        if not sh['ray_goal']:
            continue
        fr = sh.get('frame')
        if fr is None:
            continue
        f = frames[max(0, min(fr, len(frames) - 1) - 2)]
        for u in f['units']:
            if u['team'] == our and u.get('keeper'):
                keeper_depth.append(round(dist(u['x'], u['y'], GOAL_CX[our], 13.0), 2))
    game['keeper_depth_at_opp_ray'] = keeper_depth
    if frames:
        st = frames[-1]['stats']
        game['kicks'] = [st[our]['kicks'], st[opp]['kicks']]
        game['poss'] = [st[our]['possession'], st[opp]['possession']]
        game['fouls_count'] = [st[our]['fouls'], st[opp]['fouls']]
    return game


def main():
    dirs = sys.argv[1:]
    files = []
    for dd in dirs:
        p = pathlib.Path(dd)
        if p.is_dir():
            files.extend(sorted(p.glob('r*-g*.json.gz')))
    games = []
    for f in files:
        try:
            games.append(analyze(str(f)))
        except Exception as e:
            print('ERR', f, repr(e), file=sys.stderr)
    for g in games:
        print(json.dumps(g, ensure_ascii=False))
    # 汇总
    if games:
        wins = sum(1 for g in games if g['winner'] == 'deepseek-g1')
        losses = sum(1 for g in games if g['winner'] == 'sol')
        draws = len(games) - wins - losses
        print('SUMMARY games=%d W=%d L=%d D=%d wr=%.1f%%' %
              (len(games), wins, losses, draws, 100.0 * wins / len(games)))
        by_ts = {}
        for g in games:
            b = by_ts.setdefault(g['teamSize'], [0, 0, 0, 0, 0])
            b[0] += 1
            if g['winner'] == 'deepseek-g1':
                b[1] += 1
            elif g['winner'] == 'sol':
                b[2] += 1
            b[3] += g['our_goals']
            b[4] += g['opp_goals']
        for ts in sorted(by_ts):
            n, w, l, gf, ga = by_ts[ts]
            print('  ts=%d n=%d W=%d L=%d GF=%d GA=%d' % (ts, n, w, l, gf, ga))


if __name__ == '__main__':
    main()
