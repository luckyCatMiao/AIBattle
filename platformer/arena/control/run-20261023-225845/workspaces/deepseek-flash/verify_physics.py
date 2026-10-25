#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 verify_physics.js 导出的轨迹校验 agent.py 里的 Python 物理移植。"""
import json
import sys

import agent


def main():
    path = sys.argv[1]
    js = json.load(open(path, 'r', encoding='utf-8'))
    world = agent.World(js['level'])
    script = js['script']
    trace = js['trace']
    t0 = trace[0]
    st = (t0['x'], t0['y'], t0['vx'], t0['vy'], t0['og'])
    maxerr = 0.0
    deaths = 0
    bad = 0
    for i, act in enumerate(script):
        if i + 1 >= len(trace):
            break
        if trace[i]['deaths'] > 0:
            print('(stop at first death: frame %d, monster/碰撞不在本测试内)' % i)
            break
        st = agent.step(world.cols, world.w, world.h, st[0], st[1], st[2], st[3], st[4],
                        float(act['move']), bool(act['jump']))
        if st[1] < agent.DEATH_Y:
            deaths += 1
            st = (world.startX, 3.0001, 0.0, 0.0, True)
        ref = trace[i + 1]
        e = max(abs(st[0] - ref['x']), abs(st[1] - ref['y']),
                abs(st[2] - ref['vx']) * 0.1, abs(st[3] - ref['vy']) * 0.1)
        if e > maxerr:
            maxerr = e
        if e > 1e-6 or st[4] != ref['og']:
            bad += 1
            if bad < 6:
                print('MISMATCH frame %d: py=(%.9f,%.9f,%.6f,%.6f,%s) js=(%.9f,%.9f,%.6f,%.6f,%s)'
                      % (i + 1, st[0], st[1], st[2], st[3], st[4],
                         ref['x'], ref['y'], ref['vx'], ref['vy'], ref['og']))
    print('frames=%d mismatches=%d maxerr=%.3e deaths py=%d js=%d final x py=%.6f js=%.6f'
          % (len(trace) - 1, bad, maxerr, deaths, trace[-1]['deaths'], st[0], trace[-1]['x']))
    return 0 if bad == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
