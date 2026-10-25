# -*- coding: utf-8 -*-
"""从初始状态出发、喂同一批输入，逐窗口与官方 JS 观察精确比对（容差 1e-9）。"""
import json
import math
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pysim


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
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    recs = [json.loads(l) for l in open(path, encoding='utf-8')]
    n = recs[0]['obs']['teamSize']
    kt = abs(seed) % 2
    s = pysim.initial_state(n, kt)
    bad = 0
    for i, rec in enumerate(recs):
        frames = []
        for f in range(20):
            fr = [None] * len(s.units)
            for idx, u in enumerate(s.units):
                src = rec['w0'][f][u.index] if u.team == 0 else rec['w1'][f][u.index]
                fr[idx] = unit_input(src)
            frames.append(fr)
        pysim.advance(s, frames)
        # 与 recs[i+1] 的 obs 比对；最后一窗与 recs[i].obs+20 无关，跳过
        if i + 1 >= len(recs):
            break
        nxt = recs[i + 1]['obs']
        ok = True
        msg = []
        jmap = {(x['team'], x['index']): x for x in nxt['units']}
        for u in s.units:
            nu = jmap[(u.team, u.index)]
            if abs(nu['x'] - u.x) > 1e-9 or abs(nu['y'] - u.y) > 1e-9:
                ok = False
                msg.append('u%d%d pos py=(%.6f,%.6f) js=(%.6f,%.6f)' % (u.team, u.index, u.x, u.y, nu['x'], nu['y']))
            if abs(nu['facing']['x'] - u.fx) > 1e-9 or abs(nu['facing']['y'] - u.fy) > 1e-9:
                ok = False
                msg.append('u%d%d facing py=(%.6f,%.6f) js=(%.6f,%.6f)' % (u.team, u.index, u.fx, u.fy, nu['facing']['x'], nu['facing']['y']))
            if int(round((nu['kickCd'] or 0) * 20)) != u.kickCd:
                ok = False
                msg.append('u%d%d kickCd py=%d js=%s' % (u.team, u.index, u.kickCd, nu['kickCd']))
            if int(round((nu['controlLock'] or 0) * 20)) != u.controlLock:
                ok = False
                msg.append('u%d%d ctrlLock py=%d js=%s' % (u.team, u.index, u.controlLock, nu['controlLock']))
        nb = nxt['ball']
        if abs(nb['x'] - s.bx) > 1e-9 or abs(nb['y'] - s.by) > 1e-9:
            ok = False
            msg.append('ball py=(%.6f,%.6f) js=(%.6f,%.6f)' % (s.bx, s.by, nb['x'], nb['y']))
        if abs(nb['vx'] - s.bvx) > 1e-9 or abs(nb['vy'] - s.bvy) > 1e-9:
            ok = False
            msg.append('ballv py=(%.6f,%.6f) js=(%.6f,%.6f)' % (s.bvx, s.bvy, nb['vx'], nb['vy']))
        if nb['owner'] is not None:
            oid = pysim.unit_id(s.units[s.owner]) if s.owner >= 0 else None
            if oid != nb['owner']:
                ok = False; msg.append('owner py=%s js=%s' % (oid, nb['owner']))
        elif s.owner >= 0:
            ok = False; msg.append('owner py=%s js=None' % pysim.unit_id(s.units[s.owner]))
        if s.score != nxt['score']:
            ok = False; msg.append('score py=%s js=%s' % (s.score, nxt['score']))
        if not ok:
            bad += 1
            if bad <= 5:
                print('window %d MISMATCH: %s' % (i, '; '.join(msg)))
    print('seed=%d n=%d windows=%d mismatched=%d' % (seed, n, len(recs) - 1, bad))
    return 0 if bad == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
