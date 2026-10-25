#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""分析死亡 dump：看死亡前各窗口的决策（新 API）。"""
import json
import sys
import glob
import os
import agent


def surv(w, st, acts, mons, frames=120):
    cur = list(mons)
    x, y, vx, vy, og = st
    for i in range(frames):
        a = acts[i] if i < len(acts) else (1.0, False)
        x, y, vx, vy, og = agent.step(w.cols, w.w, w.h, x, y, vx, vy, og, a[0], a[1])
        cur = agent.step_monsters(w.cols, w.w, w.h, cur)
        if y < agent.DEATH_Y:
            return ('PIT', i + 1)
        if agent.monster_hits(x, y, cur):
            return ('MONSTER', i + 1)
    return ('ALIVE', frames)


def main():
    files = sorted(glob.glob('_t/death_*.json'), key=os.path.getmtime)[-8:]
    for f in files:
        d = json.load(open(f, 'r', encoding='utf-8'))
        print('=====', os.path.basename(f), d['reason'], 'lastX=%.2f' % d['lastX'])
        for i, r in enumerate(d['ring']):
            o = r['obs']
            w = agent.World(o['level'])
            me = o['runners'][o['yourPlayer']]
            raw = r.get('raw') or {k: me[k] for k in ('x', 'y', 'vx', 'vy')}
            og = raw.get('og', me['onGround'])
            st = (raw['x'], raw['y'], raw['vx'], raw['vy'], og)
            mons = agent._norm_mons(o['monsters'])
            acts = [(fr[0]['move'], fr[0]['jump']) for fr in r['win']['inputs']]
            newacts, pred, mtr = agent.plan(w, st, mons)
            # 计划本身的完整执行结果
            res_plan = surv(w, st, newacts, mons)
            print('  w%d f=%d x=%.2f y=%.2f og=%d mons=%s act=%s | plan=%s -> survivors=%s'
                  % (i, o['frame'], raw['x'], raw['y'], og,
                     [(round(m[0], 1), m[2]) for m in mons], acts, newacts[:5], res_plan))


if __name__ == '__main__':
    main()
