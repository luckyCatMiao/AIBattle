#!/usr/bin/env python3
"""从公开回放分析对手（sol）的躲避方向偏好。只读取对局回放，不读取对手源码。"""
import gzip
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent as A

BASE = r'D:\extraProj\AIBattle\duel\arena\control\run-20261025-233938'


def run(path, my_idx):
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        d = json.load(f)
    frames = d['frames']
    sol_idx = 1 - my_idx
    ev = []
    for i in range(len(frames) - 1):
        st, nx = frames[i], frames[i + 1]
        sol = st['players'][sol_idx]
        sol2 = nx['players'][sol_idx]
        # 找最近、最紧迫的我方子弹（按未来 1s 内到 sol 当前点的最近距离）
        best = None
        for b in st['bullets']:
            if b['owner'] != my_idx:
                continue
            x, y, vx, vy = b['x'], b['y'], b['vx'], b['vy']
            mind = 1e9
            bt = 0
            for t in range(20):
                x, y, vx, vy = A.advance_bullet(x, y, vx, vy, 1)
                dd = math.hypot(x - sol['x'], y - sol['y'])
                if dd < mind:
                    mind = dd
                    bt = t
            if mind < 2.2:
                key = mind + 0.05 * bt
                if best is None or key < best[0]:
                    best = (key, b, mind, bt)
        if best is None:
            continue
        _k, b, mind, bt = best
        ux, uy = b['vx'] / 8.5, b['vy'] / 8.5
        relx, rely = sol['x'] - b['x'], sol['y'] - b['y']
        cross = ux * rely - uy * relx          # >0: sol 在弹道左侧
        if abs(cross) < 1e-6:
            continue
        # 远离弹道线的单位方向
        ax, ay = (-uy * (1 if cross > 0 else -1), ux * (1 if cross > 0 else -1))
        dx, dy = sol2['x'] - sol['x'], sol2['y'] - sol['y']
        mv = math.hypot(dx, dy)
        if mv < 0.2:
            continue
        away = (dx * ax + dy * ay) / mv      # +1 远离弹道线，-1 朝弹道线
        along = (dx * ux + dy * uy) / mv
        ev.append({
            't': st['now'], 'mv': mv, 'mind': mind, 'tca': bt,
            'away': away, 'along': along, 'dist': math.hypot(relx, rely),
            'side': 1 if cross > 0 else -1,
        })
    n = len(ev)
    if not n:
        return None
    away = sum(1 for e in ev if e['away'] > 0.35)
    toward = sum(1 for e in ev if e['away'] < -0.35)
    perp = sum(1 for e in ev if abs(e['along']) < 0.4)
    mean_away = sum(e['away'] for e in ev) / n
    # 按其所在侧继续外移（同侧躲）的比例
    same_side = sum(1 for e in ev if e['away'] > 0.35)
    return {
        'n': n, 'mean_away': round(mean_away, 3),
        'away_gt_0.35': round(100 * away / n, 1),
        'toward_lt_-0.35': round(100 * toward / n, 1),
        'perp_abs_along_lt0.4': round(100 * perp / n, 1),
        'mean_dist': round(sum(e['dist'] for e in ev) / n, 2),
        'mean_tca': round(sum(e['tca'] for e in ev) / n, 2),
        'same_side': same_side,
        'events': ev[:20],
    }


for gid, my_idx in (('r1-g1', 0), ('r1-g2', 1)):
    r = run(os.path.join(BASE, gid + '.json.gz'), my_idx)
    print('====', gid, 'my_idx', my_idx)
    for k, v in r.items():
        if k != 'events':
            print(' ', k, v)
    print('  first events:', json.dumps(r['events'][:5], ensure_ascii=False))
