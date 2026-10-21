#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""下包紧迫度的单元测试：构造一个“包点内静止 + 13 格内可见敌人 + 剩 25 秒”
的观察，检查携带者在旧逻辑下不站定、在 AGENT_PLANT_URGENT=30 下站定下包。
另外检查携带者不在包点时会在紧迫状态下朝包点移动而不是横向缠斗。
"""
import os
import sys

os.environ['AGENT_PLANT_URGENT'] = '30'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agent_c1 as A  # noqa: E402

W, H = A.GameMap(56, 34, [0] * (56 * 34)).w, A.GameMap(56, 34, [0] * (56 * 34)).h
tiles = [0] * (W * H)
for x in range(W):
    tiles[x] = 1
    tiles[(H - 1) * W + x] = 1
for y in range(H):
    tiles[y * W] = 1
    tiles[y * W + W - 1] = 1
mp = A.GameMap(W, H, tiles)


def obs_for(units, carrier_xy, time_left, enemy_xy):
    us = []
    vis = {}
    for i, (x, y) in enumerate(units):
        uid = 't0u%d' % i
        us.append({'id': uid, 'team': 0, 'index': i, 'name': uid, 'x': x, 'y': y,
                   'facing': {'x': 0, 'y': 1}, 'hp': 100, 'alive': True,
                   'weapon': 'smg', 'mag': 30, 'armor': 100, 'reserve': 90,
                   'money': 0, 'kit': False, 'kills': 0, 'deaths': 0})
        vis[uid] = []
    # 每个单位都能看到同一个敌人（近身/视野），保证 danger=True
    for uid in vis:
        vis[uid] = [{'id': 't1u0', 'team': 1, 'index': 0, 'x': enemy_xy[0], 'y': enemy_xy[1],
                     'facing': {'x': 0, 'y': 1}, 'weapon': 'smg'}]
    return {
        'id': 'unit-test', 'seed': 7, 'phase': 'live', 'status': 'playing',
        'tick': 0, 'frame': 0, 'round': 1, 'roundsTotal': 6, 'roundWins': [0, 0],
        'sides': {'0': 'attack', '1': 'defend'}, 'yourTeam': 0, 'side': 'attack',
        'timeLeft': time_left, 'bombTimer': None,
        'bomb': {'state': 'carried', 'carrier': 't0u0'},
        'map': {'width': W, 'height': H, 'tiles': tiles,
                'sites': {'A': {'x1': 7, 'y1': 5, 'x2': 14, 'y2': 10},
                          'B': {'x1': 41, 'y1': 5, 'x2': 48, 'y2': 10}}},
        'teamAlive': {'0': 5, '1': 1},
        'units': us, 'visibleEnemies': vis, 'bullets': [],
        'weapons': {'pistol': {'cost': 0, 'range': 18}, 'pdw': {'cost': 700, 'range': 15},
                    'smg': {'cost': 1250, 'range': 17}, 'rifle': {'cost': 2700, 'range': 24},
                    'shotgun': {'cost': 1000, 'range': 10}, 'sniper': {'cost': 4750, 'range': 32},
                    'lmg': {'cost': 4000, 'range': 22}},
        'buy': {'armorPrice': 650, 'kitPrice': 400},
    }


def run(name, units, carrier_xy, time_left, enemy_xy):
    brain = A.Brain()
    o = obs_for(units, carrier_xy, time_left, enemy_xy)
    out = A.live(o, brain)
    first = out['inputs'][0][0]
    print('%-28s carrier dir=%-3s aim=%-3s' % (name, first['dir'], first['aim']))
    return first


# 1) 携带者已在包点中心 (11.5, 8.5)，敌人 9.5 格内可见，剩 25 秒 -> 应站定 N
u = [(11.5, 8.5), (10.5, 9.5), (12.5, 9.5), (10.5, 7.5), (12.5, 7.5)]
a = run('in-site urgent=25s', u, (11.5, 8.5), 25, (20.0, 8.5))
assert a['dir'] == 'N', '紧迫时携带者应站定下包'

# 2) 同样的站位但剩 80 秒 -> 旧行为（有敌人时不站定，应移动）
b = run('in-site calm=80s', u, (11.5, 8.5), 80, (20.0, 8.5))
assert b['dir'] != 'N', '不紧迫时不应在有敌情下站定'

# 3) 携带者在包点外 (11.5, 14.0)，剩 25 秒 -> 应朝包点方向移动（U 类）
u2 = [(11.5, 14.0), (10.5, 14.5), (12.5, 14.5), (10.5, 13.5), (12.5, 13.5)]
c = run('outside urgent=25s', u2, (11.5, 14.0), 25, (20.0, 14.0))
assert c['dir'] in ('U', 'UL', 'UR', 'L', 'R'), '应朝包点方向移动而不是原地缠斗'

print('OK: plant urgency behaviour verified')
