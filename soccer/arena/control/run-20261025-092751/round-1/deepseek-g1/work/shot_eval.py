#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 pysim 评估射门：给定射门点与落点，模拟 Sol 门将模型（球-门中心连线 k 格）的反应。

用法: python -I work/shot_eval.py
"""
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import agent as ag  # noqa: E402

W, H = 44, 26


def make_state(shooter, gx, keeper_k=3.3, keeper_max_y=16.8):
    """shooter=(x,y,target_x,target_y). 我方为 team0 攻右门（gx=43），或镜像。"""
    team = 0 if gx > 20 else 1
    s = ag.St()
    s.n = 1
    su = ag.Unit(team, 0)
    su.x, su.y = shooter[0], shooter[1]
    # 门将属于另一队
    ku = ag.Unit(1 - team, 0)
    cx, cy = gx, 13.0
    dx, dy = shooter[0] - cx, shooter[1] - cy
    D = math.hypot(dx, dy) or 0.01
    k = min(keeper_k, D * 0.9)
    ku.x, ku.y = cx + dx / D * k, cy + dy / D * k
    ku.x = ag.clamp(ku.x, 0.7, W - 0.7)
    ku.y = ag.clamp(ku.y, 0.7, H - 0.7)
    s.units = [su, ku]
    # 球在射手脚下
    s.bx, s.by = shooter[0], shooter[1]
    s.owner = 0
    s.bvx = s.bvy = 0.0
    s.lastTouch = None
    s.lastTeam = None
    s.score = [0, 0]
    s.frame = 0
    s.freeze = 0
    s.golden = False
    s.goldenEnd = 0
    s.kickoffTeam = team
    s.status = 'playing'
    s.half = 1
    return s, su, ku, gx


def keeper_target(s, ku, gx, keeper_k):
    cx, cy = gx, 13.0
    dx, dy = s.bx - cx, s.by - cy
    D = math.hypot(dx, dy) or 0.01
    k = min(keeper_k, D)
    return cx + dx / D * k, ag.clamp(cy + dy / D * k, 9.2, 16.8)


def shoot(shooter, gx, target_y, keeper_k=3.3, maxf=200):
    s, su, ku, gx = make_state(shooter, gx, keeper_k)
    ang = math.atan2(target_y - shooter[1], gx - shooter[0])
    dirv = (math.cos(ang), math.sin(ang))
    # 第 0 帧：射手踢球；门将同时移动
    ktx, kty = keeper_target(s, ku, gx, keeper_k)
    kdir = ag.move_dir(ku, ktx, kty, ku.team, forbid_box=False)
    g = ag.step(s, [( 'N', dirv, True), (kdir, None, False)], s.kickoffTeam)
    if g >= 0:
        return 'goal', 1
    for f in range(1, maxf):
        ktx, kty = keeper_target(s, ku, gx, keeper_k)
        kdir = ag.move_dir(ku, ktx, kty, ku.team, forbid_box=False)
        g = ag.step(s, [('N', None, False), (kdir, None, False)], s.kickoffTeam)
        if g >= 0:
            return 'goal', f
        if s.owner == 1:
            return 'save', f
        if s.bvx == 0 and s.bvy == 0:
            return 'dead', f
    return 'timeout', maxf


def main():
    gx = 43.0
    spots = [
        ('wing_7_4.5', (36.0, 4.5)),
        ('wing_8_5', (35.0, 5.0)),
        ('wing_9_6', (34.0, 6.0)),
        ('wing_10_7', (33.0, 7.0)),
        ('wing_11_8', (32.0, 8.0)),
        ('wing_12_9', (31.0, 9.0)),
        ('wing_13_10', (30.0, 10.0)),
        ('wing_8_20.5', (35.0, 20.5)),
        ('wing_10_19.5', (33.0, 19.5)),
        ('center_11', (32.0, 13.0)),
        ('center_14', (29.0, 13.0)),
        ('center_17', (26.0, 13.0)),
        ('center_21', (22.0, 13.0)),
    ]
    targets = [10.4, 10.9, 11.4, 11.9, 12.4, 12.9, 13.4, 13.9, 14.4, 14.9, 15.4, 15.9]
    print('目标: 各射门点在不同落点的进球率（Sol 门将 k=3.3）')
    for kk in (2.5, 3.3, 4.2):
        print('\n==== keeper_k=%.1f ====' % kk)
        print('%-14s %s  best' % ('spot', ' '.join('%.1f' % t for t in targets)))
        for name, (x, y) in spots:
            res = []
            for t in targets:
                r, _ = shoot((x, y), gx, t, kk)
                res.append('G' if r == 'goal' else ('s' if r == 'save' else '.'))
            best = max(range(len(targets)), key=lambda i: (res[i] == 'G', -abs(targets[i] - 13)))
            print('%-14s %s  %.1f' % (name, '   '.join(res), targets[best]))


if __name__ == '__main__':
    main()
