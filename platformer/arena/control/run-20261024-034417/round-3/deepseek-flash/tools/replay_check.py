#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""离线回放真实观测：复现 agent 的逐窗口决策，并检查空中搜索的“末状态是否真能落地”。"""
import sys, os, json, io
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent as A
import probe as P

def main(path, lo, hi):
    obs = [json.loads(l) for l in io.open(path, encoding='utf-8')]
    ctx = {}
    for i, o in enumerate(obs):
        t = float(o.get('time') or 0)
        if o.get('status') != 'playing':
            continue
        plan = A.handle(o, ctx)
        if lo <= t <= hi:
            r = o['runners'][o['yourPlayer']]
            print(f"--- #{i} t={t} x={r['x']} y={r['y']} vx={r['vx']} vy={r['vy']} og={r['onGround']} plan={plan}")
            # 重建当前上下文里的 fds，检查各类搜索的末状态
            geom = ctx['geom']
            fds, mask = A.build_frame_data(ctx, o, t, 120)
            init = (r['x'], r['y'], r['vx'], r['vy'], bool(r['onGround']))
            st = A.search_survive(geom, fds, 0, init, 40, mask)
            print('   survive40:', 'None' if st is None else (round(st[0], 2), st[4], st[5]))
            for h in (34, 26):
                s = A.search_survive_air(geom, fds, 0, init, h, mask)
                print(f'   air{h}:', 'None' if s is None else [(round(m, 1), j) for (m, j) in s][:5])
            w = A.search_survive_wait(geom, fds, 0, init, 48, mask)
            print('   wait48:', 'None' if w is None else (round(w[0][0], 2), round(w[0][1], 2), w[0][4], w[1]))

if __name__ == '__main__':
    main(sys.argv[1], float(sys.argv[2]), float(sys.argv[3]))
