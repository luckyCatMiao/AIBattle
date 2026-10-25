#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate markdown tables for review.md from r1_analysis.json."""
import json
import os

HERE = os.path.dirname(__file__)
D = json.load(open(os.path.join(HERE, 'r1_analysis.json'), encoding='utf-8'))


def result(r):
    if r['score_me'] > r['score_opp']:
        return '胜'
    if r['score_me'] < r['score_opp']:
        return '负'
    return '平'


def seat_label(r):
    return '队0（左）' if r['seat'] == 0 else '队1（右）'


lines = []
lines.append('### A. 20 局总览（我方视角）\n')
lines.append('| 对局 | 人数 | 我方位置 | 结果 | 比分(我:对) | 帧数 | 模拟秒 | 战报时长(s) | 进球(我:对) | 射门射线(我/对) | 射正(我/对) | 扑救(我/对) | 控球帧(我/对) | 犯规(我/对) | 踢球(我/对) |')
lines.append('|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
for r in D['games']:
    lines.append('| {id} | {n} | {seat} | {res} | {sm}:{so} | {fr} | {ss:.2f} | {wd:.2f} | {gm}:{go} | {rm}/{ro} | {tm}/{to} | {svm}/{svo} | {pm}/{po} | {fm}/{fo} | {km}/{ko} |'.format(
        id=r['id'], n=r['teamSize'], seat=seat_label(r), res=result(r), sm=r['score_me'], so=r['score_opp'],
        fr=r['frames'], ss=r['sim_sec'], wd=r['wall_duration'], gm=r['goals_me'], go=r['goals_opp'],
        rm=r['rays_me'], ro=r['rays_opp'], tm=r['on_target_me'], to=r['on_target_opp'],
        svm=r['saves_me'], svo=r['saves_opp'], pm=r['poss_me'], po=r['poss_opp'],
        fm=r['fouls_me'], fo=r['fouls_opp'], km=r['kicks_me'], ko=r['kicks_opp']))

lines.append('\n### B. 分人数汇总\n')
lines.append('| 人数 | 局数 | 胜-平-负 | 进球:失球 | 射门射线(我/对) | 射正(我/对) | 扑救(我/对) | 控球帧(我/对) | 犯规(我/对) |')
lines.append('|---:|---:|---|---:|---:|---:|---:|---:|---:|')
for n in sorted(D['by_size'], key=int):
    a = D['by_size'][n]
    lines.append(f"| {n} | {a['games']} | {a['w']}-{a['d']}-{a['l']} | {a['gf']}:{a['ga']} | {a['rays_me']}/{a['rays_opp']} | {a['on_target_me']}/{a['on_target_opp']} | {a['saves_me']}/{a['saves_opp']} | {a['poss_me']}/{a['poss_opp']} | {a['fouls_me']}/{a['fouls_opp']} |")

lines.append('\n### C. 我方进球日志（17 球）\n')
lines.append('| 对局 | 进球帧 | 进球秒 | 射门帧 | 射门秒 | 射门点 | 距门中心 | 飞行秒 | 到门线速度(估算) | 比分 |')
lines.append('|---|---:|---:|---:|---:|---|---:|---:|---:|---:|')
for g in D['goals_all']:
    if g['team'] != 'me':
        continue
    lines.append('| {game} | {gf} | {gs:.2f} | {kf} | {ks:.2f} | ({x:.1f},{y:.1f}) | {d:.2f} | {fl:.2f} | {sp:.2f} | {sc} |'.format(
        game=g['game'], gf=g['goal_frame'], gs=g['goal_sec'], kf=g['kick_frame'], ks=g['kick_sec'],
        x=g['kicker_pos'][0], y=g['kicker_pos'][1], d=g['distance'], fl=g['flight_sec'],
        sp=g['speed_at_line_est'], sc=':'.join(str(v) for v in g['score'])))

lines.append('\n### D. 对方进球日志（32 球）\n')
lines.append('| 对局 | 进球帧 | 进球秒 | 射门帧 | 射门秒 | 射门点 | 距门中心 | 飞行秒 | 到门线速度(估算) | 比分 |')
lines.append('|---|---:|---:|---:|---:|---|---:|---:|---:|---:|')
for g in D['goals_all']:
    if g['team'] != 'opp':
        continue
    lines.append('| {game} | {gf} | {gs:.2f} | {kf} | {ks:.2f} | ({x:.1f},{y:.1f}) | {d:.2f} | {fl:.2f} | {sp:.2f} | {sc} |'.format(
        game=g['game'], gf=g['goal_frame'], gs=g['goal_sec'], kf=g['kick_frame'], ks=g['kick_sec'],
        x=g['kicker_pos'][0], y=g['kicker_pos'][1], d=g['distance'], fl=g['flight_sec'],
        sp=g['speed_at_line_est'], sc=':'.join(str(v) for v in g['score'])))

lines.append('\n### E. 犯规分布\n')
lines.append('| 对局 | 人数 | 犯规数 | 犯规者(次数) | 典型事件坐标 |')
lines.append('|---|---:|---:|---|---|')
for r in D['games']:
    if not r['foul_detail']:
        continue
    from collections import Counter
    c = Counter(f['unit'] for f in r['foul_detail'])
    units = ', '.join(f'{u}×{n}' for u, n in c.most_common())
    pos = ', '.join(f"({f['pos'][0]:.1f},{f['pos'][1]:.1f})" for f in r['foul_detail'][:4])
    lines.append(f"| {r['id']} | {r['teamSize']} | {len(r['foul_detail'])} | {units} | {pos} |")

open(os.path.join(HERE, 'tables.md'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('wrote tables.md', len(lines), 'lines')
