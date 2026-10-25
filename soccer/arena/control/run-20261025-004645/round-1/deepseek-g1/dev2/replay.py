# -*- coding: utf-8 -*-
"""重放 dumpgame.js 记录：用 pysim 从观察重建状态、喂双方输入，与真实下一步状态比对；
并检查 agent 的球路预测（ball_fly）是否与 pysim 一致。"""
import json
import math
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pysim
import agent_core as AC


def unit_input(u):
    d = u.get('dir') or 'N'
    a = u.get('aim')
    if isinstance(a, str):
        a = pysim.DIRV.get(a)
    elif isinstance(a, (int, float)):
        r = a * math.pi / 180.0
        a = (math.cos(r), math.sin(r))
    else:
        a = None
    return (d, a, bool(u.get('kick')))


def main():
    path = sys.argv[1]
    recs = [json.loads(l) for l in open(path, encoding='utf-8')]
    bad_state = 0
    bad_fly = 0
    nwin = len(recs) - 1
    for i in range(1, len(recs)):
        rec = recs[i]
        obs = recs[i - 1]['obs0']
        s = pysim.state_from_obs(obs)
        frames = []
        for f in range(20):
            fr = [None] * len(s.units)
            for idx, u in enumerate(s.units):
                src = rec['w0'][f][u.index] if u.team == 0 else rec['w1'][f][u.index]
                fr[idx] = unit_input(src)
            frames.append(fr)
        pysim.advance(s, frames)
        exp = rec['state']
        for ju in exp['units']:
            u = s.units[ju['team'] * s.n + ju['index']]
            if abs(ju['x'] - u.x) > 2e-3 or abs(ju['y'] - u.y) > 2e-3:
                bad_state += 1
                if bad_state <= 3:
                    print('W%d unit %d%d pos py=(%.3f,%.3f) js=(%.3f,%.3f)' % (i - 1, ju['team'], ju['index'], u.x, u.y, ju['x'], ju['y']))
        if abs(exp['ball']['x'] - s.bx) > 2e-3 or abs(exp['ball']['y'] - s.by) > 2e-3:
            bad_state += 1
            if bad_state <= 3:
                print('W%d ball py=(%.3f,%.3f) js=(%.3f,%.3f)' % (i - 1, s.bx, s.by, exp['ball']['x'], exp['ball']['y']))
    print('state mismatches (tol 2e-3, 含观察取整误差): %d / %d windows' % (bad_state, nwin))
    return 0


if __name__ == '__main__':
    sys.exit(main())
