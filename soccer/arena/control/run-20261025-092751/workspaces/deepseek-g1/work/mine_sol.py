#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 practice 回放中挖掘冻结 Sol 的行为模式 + 我方攻防结果。

用法: python -I work/mine_sol.py <dir1> [<dir2> ...]
"""
import gzip
import json
import math
import pathlib
import sys
from collections import Counter, defaultdict

W, H = 44, 26
GOAL_CX = {0: 1.0, 1: 43.0}
GOAL_TOP, GOAL_BOT = 10.0, 16.0


def dist(a, b, c, d):
    return math.hypot(a - c, b - d)


def load(path):
    with gzip.open(path, 'rt', encoding='utf-8') as fh:
        return json.load(fh)


def ray_goal(x, y, ang):
    """球从(x,y)以ang飞出是否能穿进球门框；返回穿过时y或None。"""
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = x, y
    vx, vy = 11.0 * ux, 11.0 * uy
    gx = 43.0 if ux > 0 else 1.0
    for _ in range(150):
        px += vx * 0.05
        py += vy * 0.05
        if py < 0.22:
            py = 0.22
            vy = -vy * 0.72
        elif py > H - 0.22:
            py = H - 0.22
            vy = -vy * 0.72
        vx *= 0.978
        vy *= 0.978
        if (gx > 20 and px >= gx) or (gx < 20 and px <= gx):
            if GOAL_TOP <= py <= GOAL_BOT:
                return py
            return None
        if px < 0.22 or px > W - 0.22:
            return None
        if abs(vx) + abs(vy) < 0.02:
            return None
    return None


def nearest_outfield(frame, team, x, y):
    best = None
    for u in frame['units']:
        if u['team'] != team or u.get('keeper'):
            continue
        d = dist(u['x'], u['y'], x, y)
        if best is None or d < best[0]:
            best = (d, u['index'], round(u['x'], 1), round(u['y'], 1))
    return best


def keeper_of(frame, team):
    for u in frame['units']:
        if u['team'] == team and u.get('keeper'):
            return u
    return None


def analyze_game(path, out):
    d = load(path)
    seats = d['seats']
    our = seats.index('deepseek-g1')
    opp = 1 - our
    ts = d['teamSize']
    frames = d['frames']
    final = d['final']
    events = final.get('events', [])
    rec = {'file': str(path), 'ts': ts, 'seat': our, 'seed': d.get('seed'),
           'score': d.get('scores'), 'winner': (seats[d['winner']] if d.get('winner') in (0, 1) else None)}
    last_kick = {0: None, 1: None}
    goals = []
    for e in events:
        et = e.get('type')
        if et == 'kick':
            last_kick[e.get('team')] = e
        elif et == 'goal':
            team = e.get('team')
            if e.get('ownGoal'):
                team = 1 - team
            lk = last_kick.get(team)
            fr = e.get('frame')
            f = frames[max(0, min(fr, len(frames) - 1) - 2)]
            gk = keeper_of(f, 1 - team)
            gk_d = (round(dist(gk['x'], gk['y'], GOAL_CX[1 - team], 13.0), 2)
                    if gk else None)
            gx = GOAL_CX[1 - team]
            kickd = (round(dist(lk['x'], lk['y'], gx, 13.0), 2) if lk else None)
            goals.append({
                't': e.get('t'), 'team': 'our' if team == our else 'opp',
                'kick': [round(lk['x'], 2), round(lk['y'], 2)] if lk else None,
                'ang': lk.get('angle') if lk else None,
                'dist': kickd, 'def_keeper_depth': gk_d,
                'def_nearest': nearest_outfield(f, 1 - team,
                                                lk['x'] if lk else 22,
                                                lk['y'] if lk else 13),
            })
    rec['goals'] = goals
    # 采样：每 20 帧的门将深度、双方阵型
    kdepth = {our: [], opp: []}
    for i in range(0, len(frames), 20):
        f = frames[i]
        for t in (0, 1):
            gk = keeper_of(f, t)
            if gk:
                kdepth[t].append(round(dist(gk['x'], gk['y'], GOAL_CX[t], 13.0), 2))
    rec['keeper_depth_median'] = {('our' if t == our else 'opp'):
                                  (sorted(v)[len(v)//2] if v else None)
                                  for t, v in kdepth.items()}
    # Sol 的踢球点
    sol_kicks = []
    for e in events:
        if e.get('type') == 'kick' and e.get('team') == opp:
            x, y, ang = e.get('x'), e.get('y'), e.get('angle')
            ry = ray_goal(x, y, ang) if ang is not None else None
            sol_kicks.append({'t': e.get('t'), 'x': round(x, 1), 'y': round(y, 1),
                              'ang': round(math.degrees(ang) % 360, 1) if ang is not None else None,
                              'ray_goal': ry is not None,
                              'dist': round(dist(x, y, GOAL_CX[opp], 13.0), 1),
                              'in_opp_half': (x - 22.0) * (1 if opp == 0 else -1) < 0})
    rec['sol_kicks'] = sol_kicks
    # 我方踢球点
    our_kicks = []
    for e in events:
        if e.get('type') == 'kick' and e.get('team') == our:
            x, y, ang = e.get('x'), e.get('y'), e.get('angle')
            ry = ray_goal(x, y, ang) if ang is not None else None
            our_kicks.append({'t': e.get('t'), 'x': round(x, 1), 'y': round(y, 1),
                              'ang': round(math.degrees(ang) % 360, 1) if ang is not None else None,
                              'ray_goal': ry is not None,
                              'dist': round(dist(x, y, GOAL_CX[our], 13.0), 1)})
    rec['our_kicks'] = our_kicks
    rec['stats'] = final.get('stats')
    out.append(rec)


def main():
    dirs = sys.argv[1:]
    files = []
    for dd in dirs:
        p = pathlib.Path(dd)
        if p.is_dir():
            files.extend(sorted(p.glob('r*-g*.json.gz')))
        elif p.exists():
            files.append(p)
    out = []
    for f in files:
        try:
            analyze_game(str(f), out)
        except Exception as e:
            print('ERR', f, repr(e), file=sys.stderr)
    # 汇总
    print('games', len(out))
    wins = sum(1 for r in out if r['winner'] == 'deepseek-g1')
    print('W/L/D', wins, sum(1 for r in out if r['winner'] == 'sol'),
          len(out) - wins - sum(1 for r in out if r['winner'] == 'sol'))
    print('\n## 每局摘要')
    for r in out:
        gs = ' '.join('%s@(%s,%s)d%s kd=%s' % (g['team'], g['kick'][0] if g['kick'] else '?',
                                                g['kick'][1] if g['kick'] else '?',
                                                g['dist'], g['def_keeper_depth'])
                       for g in r['goals'])
        print('ts=%d seat=%d seed=%s %s | %s | %s' %
              (r['ts'], r['seat'], r['seed'], (r['score'] or {}),
               r['winner'], gs))
    print('\n## 进球位置（按我方/对方）')
    for side in ('our', 'opp'):
        gs = [g for r in out for g in r['goals'] if g['team'] == side]
        print('--', side, 'n=', len(gs))
        for g in sorted(gs, key=lambda z: (z['dist'] or 0)):
            print('   t=%-6s kick=%s ang=%s dist=%s def_keeper_depth=%s def_nearest=%s' %
                  (g['t'], g['kick'], None if g['ang'] is None else round(math.degrees(g['ang'])%360,1),
                   g['dist'], g['def_keeper_depth'], g['def_nearest']))
    print('\n## 门将深度中位数（采样）')
    for r in out:
        print('  ts=%d seat=%d %s' % (r['ts'], r['seat'], r['keeper_depth_median']))
    print('\n## Sol 踢球统计')
    for r in out:
        n = len(r['sol_kicks'])
        n_ray = sum(1 for k in r['sol_kicks'] if k['ray_goal'])
        n_opp_half = sum(1 for k in r['sol_kicks'] if not k['in_opp_half'])
        print('  ts=%d seat=%d kicks=%d ray=%d deep=%d dists=%s' %
              (r['ts'], r['seat'], n, n_ray, n_opp_half,
               sorted(set(k['dist'] for k in r['sol_kicks'] if k['ray_goal']))[:8]))
    # 全局
    print('\n## 全局 Sol 射门（ray_goal）位置直方')
    hist = Counter()
    for r in out:
        for k in r['sol_kicks']:
            if k['ray_goal']:
                hist[(int(k['x'] // 4) * 4, int(k['y'] // 4) * 4, int(k['dist'] // 4) * 4)] += 1
    for k, v in sorted(hist.items(), key=lambda z: -z[1]):
        print('   x%02d-%02d y%02d-%02d d%02d-%02d: %d' % (k[0], k[0]+4, k[1], k[1]+4, k[2], k[2]+4, v))


if __name__ == '__main__':
    main()
