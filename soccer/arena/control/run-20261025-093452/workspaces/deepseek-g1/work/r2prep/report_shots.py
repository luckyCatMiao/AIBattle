#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""汇总 analyze_shots.py 的 JSON：分人数、分我/敌的射门结果与守门员几何。"""
import json
import math
import sys

MY = 'deepseek-g1'


def load(p):
    return json.load(open(p, encoding='utf-8'))


def side_of(rec, team):
    seats = rec['seats']
    return 'me' if seats[team] == MY else 'op'


def bucket(d):
    if d is None:
        return '?'
    if d < 9:
        return '0-9'
    if d < 12:
        return '9-12'
    if d < 15:
        return '12-15'
    if d < 18:
        return '15-18'
    if d < 22:
        return '18-22'
    return '22+'


def report(recs, label):
    print('=' * 100)
    print(label, 'games', len(recs))
    # 按人数与阵营
    stat = {}
    for r in recs:
        n = r['teamSize']
        for side in ('me', 'op'):
            stat.setdefault((n, side), dict(kicks=0, ontarget=0, goals=0, saves=0,
                                            blocks=0, captured=0, other=0, rekick=0))
    goal_rows = []
    save_rows = []
    for r in recs:
        n = r['teamSize']
        for g in r['goals']:
            side = side_of(r, g['team'])
            stat[(n, side)]['goals'] += 1
            goal_rows.append((n, side, g))
        for k in r['kicks']:
            side = side_of(r, k['team'])
            s = stat[(n, side)]
            s['kicks'] += 1
            if k.get('on_target'):
                s['ontarget'] += 1
            res = k['result']
            if res == 'goal' and k.get('own'):
                pass
            if res == 'goal':
                pass
            elif res == 'captured':
                s['captured'] += 1
            elif res == 'rekick':
                s['rekick'] += 1
            else:
                s['other'] += 1
        for sv in r['saves']:
            side = 'me' if side_of(r, 1 - sv['team']) == 'me' else 'op'
            # save 事件的 team 是扑救方
            side = side_of(r, sv['team'])
            stat[(n, side)]['saves'] += 1
    print('%-3s %-3s %6s %6s %6s %6s %6s %6s %6s' %
          ('n', 'side', 'kicks', 'ontgt', 'goals', 'saves', 'capt', 'rekick', 'other'))
    for n in range(1, 7):
        for side in ('me', 'op'):
            s = stat.get((n, side))
            if not s:
                continue
            print('%-3d %-3s %6d %6d %6d %6d %6d %6d %6d' %
                  (n, side, s['kicks'], s['ontarget'], s['goals'], s['saves'],
                   s['captured'], s['rekick'], s['other']))
    # 进球几何
    print('\n-- 进球明细（keeper 几何）--')
    print('%-10s %-4s %-3s %6s %6s %6s %7s %7s %7s' %
          ('file', 'side', 'n', 'kx', 'ky', 'dist', 'flight', 'keep_perp', 'keep_d'))
    for n, side, g in goal_rows:
        if g['kick_frame'] is None:
            print('%-10s %-4s %-3d (no kick: own/deflection)' % (g.get('file', ''), side, n))
            continue
        print('%-10s %-4s %-3d %6.1f %6.1f %6.1f %7s %7s %7s' % (
            '', side, n, g['kx'], g['ky'], g['dist'] or -1,
            ('%.2f' % g['flight']) if g['flight'] is not None else '?',
            ('%.2f' % g['keep_perp']) if g['keep_perp'] is not None else '?',
            ('%.2f' % math.hypot(g['keep'][0] - g['kx'], g['keep'][1] - g['ky'])) if g['keep'] else '?'))
    # 进球距离分布
    print('\n-- 进球距离/飞行分布（side,n,distbucket）--')
    dist = {}
    for n, side, g in goal_rows:
        if g['dist'] is None:
            continue
        key = (side, bucket(g['dist']))
        dist[key] = dist.get(key, 0) + 1
    for k in sorted(dist):
        print('  %-3s %-6s %d' % (k[0], k[1], dist[k]))
    # 射门（on target）距离分布
    print('\n-- on-target 踢球距离分布（side,bucket）--')
    dist = {}
    for r in recs:
        for k in r['kicks']:
            if k.get('on_target'):
                side = side_of(r, k['team'])
                key = (side, bucket(k['dist']))
                dist[key] = dist.get(key, 0) + 1
    for k in sorted(dist):
        print('  %-3s %-6s %d' % (k[0], k[1], dist[k]))
    # 守门员对 on-target 球的垂距
    print('\n-- on-target 时守门员垂距（side, <0.5 / 0.5-0.82 / 0.82-1.5 / >1.5）--')
    agg = {}
    for r in recs:
        for k in r['kicks']:
            if not k.get('on_target') or k.get('keep_perp') is None:
                continue
            side = side_of(r, k['team'])
            p = k['keep_perp']
            b = '<0.5' if p < 0.5 else ('0.5-0.82' if p < 0.82 else ('0.82-1.5' if p < 1.5 else '>1.5'))
            agg.setdefault((side, b), 0)
            agg[(side, b)] += 1
    for side in ('me', 'op'):
        print(' ', side, {b: agg.get((side, b), 0) for b in ('<0.5', '0.5-0.82', '0.82-1.5', '>1.5')})


if __name__ == '__main__':
    recs = load(sys.argv[1])
    report(recs, sys.argv[2] if len(sys.argv) > 2 else sys.argv[1])
