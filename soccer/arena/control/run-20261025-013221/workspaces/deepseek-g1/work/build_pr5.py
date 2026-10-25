#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从实验版重建 pr5 状态（撤销 pr6 的三处进攻改动）。"""
import pathlib
p = pathlib.Path('agent_v27_experiment.py')
s = p.read_text(encoding='utf-8')

# 1) 自传球距离：始终短传
old = '''    depth0 = (u.x - MY_GOAL_X[me]) * ATK[me]
    ks = (8.0, 10.0, 12.0, 14.0) if depth0 > 14.0 else (16.0, 19.0, 22.0, 24.0)
    for k in ks:'''
new = '''    for k in (8.0, 10.0, 12.0, 14.0):'''
assert old in s
s = s.replace(old, new, 1)

# 2) 反击线固定 19
old2 = '''            cx = ogx + ATK[me] * (30.0 if depth_ball > 26.0 else 19.0)'''
new2 = '''            cx = ogx + ATK[me] * 19.0'''
assert old2 in s
s = s.replace(old2, new2, 1)

# 3) 控球时前锋回到底角/支撑点（撤销 launch_spot 替换）
old3 = '''                    elif depth_ball > 30.0:
                        roles[u.index] = ('striker', corner_spot(st, me, opp, bx, by, i2))
                    else:
                        roles[u.index] = ('striker', launch_spot(st, me, opp, u, by))'''
new3 = '''                    else:
                        roles[u.index] = ('striker', corner_spot(st, me, opp, bx, by, i2))'''
assert old3 in s
s = s.replace(old3, new3, 1)

pathlib.Path('agent_pr5.py').write_text(s, encoding='utf-8')
print('wrote agent_pr5.py')
