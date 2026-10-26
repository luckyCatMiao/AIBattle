#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统计练习回放中的射门结果（按人数/距离/角度），用于评估射门模型。

用法: python -I work/mine_shots.py <dir1> [<dir2> ...]
"""
import gzip
import json
import math
import pathlib
import sys
from collections import defaultdict

W, H = 44, 26
GOAL_CX = {0: 1.0, 1: 43.0}


def dist(a, b, c, d):
    return math.hypot(a - c, b - d)


def ray_goal_y(x, y, ang):
    """球从(x,y)以 ang 飞出，返回进球门框时的 y（或 None）。含墙面反弹。"""
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = x, y
    vx, vy = 11.0 * ux, 11.0 * uy
    gx = 43.0 if ux > 0 else 1.0
    for _ in range(160):
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
            return py if 10.0 <= py <= 16.0 else None
        if px < 0.22 or px > W - 0.22:
            return None
        if abs(vx) + abs(vy) < 0.02:
            return None
    return None


def analyze(path, rows):
    d = json.load(gzip.open(path, 'rt', encoding='utf-8'))
    seats = d['seats']
    our = seats.index('deepseek-g1')
    opp = 1 - our
    ts = d['teamSize']
    frames = d['frames']
    ev = d['final'].get('events', [])
    kicks = [e for e in ev if e.get('type') == 'kick']
    # 事件索引：先按时间顺序处理，记住每队最后一次 kick
    last_kick = {}
    for e in ev:
        et = e.get('type')
        if et == 'kick':
            last_kick[e.get('team')] = e
        elif et == 'goal':
            team = e.get('team')
            if e.get('ownGoal'):
                team = 1 - team
            lk = last_kick.get(team)
            if lk is not None:
                lk['_goal'] = True
        elif et == 'save':
            sv_team = e.get('team')  # 扑救方
            # 找扑救前最后一脚对方射门
            best = None
            for k in kicks:
                if k.get('team') == 1 - sv_team and (k.get('t') or 0) <= (e.get('t') or 0):
                    if best is None or (k.get('t') or 0) > (best.get('t') or 0):
                        best = k
            if best is not None:
                best['_saved'] = True
    for e in kicks:
        team = e.get('team')
        x, y, ang = e.get('x'), e.get('y'), e.get('angle')
        if ang is None:
            continue
        ry = ray_goal_y(x, y, ang)
        if ry is None:
            continue
        gx = GOAL_CX[1 - team]
        rows.append({
            'ts': ts, 'side': 'our' if team == our else 'opp',
            'x': x, 'y': y, 'ang': ang, 'ry': ry,
            'dist': math.hypot(x - gx, y - 13.0),
            'lateral': abs(ry - 13.0),
            'scored': bool(e.get('_goal')), 'saved': bool(e.get('_saved')),
            't': e.get('t'),
        })


def main():
    rows = []
    files = []
    for dd in sys.argv[1:]:
        p = pathlib.Path(dd)
        if p.is_dir():
            files.extend(sorted(p.glob('r*-g*.json.gz')))
    for f in files:
        try:
            analyze(str(f), rows)
        except Exception as e:
            print('ERR', f, repr(e), file=sys.stderr)
    print('shots on target(ray):', len(rows))
    for side in ('our', 'opp'):
        print('\n###', side)
        bins = defaultdict(lambda: [0, 0, 0])  # n, scored, saved
        for r in rows:
            if r['side'] != side:
                continue
            b = min(5, int(r['dist'] // 4))
            key = (r['ts'], b * 4)
            bins[key][0] += 1
            bins[key][1] += 1 if r['scored'] else 0
            bins[key][2] += 1 if r['saved'] else 0
        for k in sorted(bins):
            n, sc, sv = bins[k]
            print('  ts=%d dist %2d-%2d n=%3d scored=%3d(%5.1f%%) saved=%2d' %
                  (k[0], k[1], k[1] + 4, n, sc, 100.0 * sc / n, sv))
    print('\n### 全体按距离')
    bins = defaultdict(lambda: [0, 0, 0])
    for r in rows:
        b = min(6, int(r['dist'] // 3))
        bins[b * 3][0] += 1
        bins[b * 3][1] += 1 if r['scored'] else 0
        bins[b * 3][2] += 1 if r['saved'] else 0
    for k in sorted(bins):
        n, sc, sv = bins[k]
        print('  dist %2d-%2d n=%3d scored=%3d(%5.1f%%) saved=%2d' %
              (k, k + 3, n, sc, 100.0 * sc / n, sv))
    print('\n### our 按 |ry-13|')
    bins = defaultdict(lambda: [0, 0])
    for r in rows:
        if r['side'] != 'our':
            continue
        b = min(3, int(r['lateral']))
        bins[b][0] += 1
        bins[b][1] += 1 if r['scored'] else 0
    for k in sorted(bins):
        n, sc = bins[k]
        print('  lateral %d-%d n=%3d scored=%3d(%5.1f%%)' % (k, k + 1, n, sc, 100.0 * sc / n))


if __name__ == '__main__':
    main()
