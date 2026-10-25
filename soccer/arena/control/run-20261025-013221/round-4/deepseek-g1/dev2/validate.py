# -*- coding: utf-8 -*-
"""验证 pysim 与官方 simulation.js 逐帧一致：用 dump.jsonl 重放。"""
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
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dump.jsonl')
    recs = [json.loads(l) for l in open(path, encoding='utf-8')]
    bad = 0
    tot = 0
    for i in range(len(recs) - 1):
        rec = recs[i]
        nxtobs = recs[i + 1]['obs']
        s = pysim.state_from_obs(rec['obs'])
        frames = []
        for f in range(20):
            fr = [None] * len(s.units)
            for idx, u in enumerate(s.units):
                src = rec['w0'][f][u.index] if u.team == 0 else rec['w1'][f][u.index]
                fr[idx] = unit_input(src)
            frames.append(fr)
        pysim.advance(s, frames)
        ok = True
        msg = []
        jmap = {}
        for x in nxtobs['units']:
            jmap[(x['team'], x['index'])] = x
        for u in s.units:
            nu = jmap.get((u.team, u.index))
            if nu is None:
                ok = False; msg.append('unit missing'); continue
            if abs(nu['x'] - round(u.x, 3)) > 1e-9 or abs(nu['y'] - round(u.y, 3)) > 1e-9:
                ok = False
                msg.append('u%d%d pos py=(%.3f,%.3f) js=(%.3f,%.3f)' % (u.team, u.index, u.x, u.y, nu['x'], nu['y']))
            if abs(nu['facing']['x'] - round(u.fx, 3)) > 1e-6 or abs(nu['facing']['y'] - round(u.fy, 3)) > 1e-6:
                ok = False
                msg.append('u%d%d facing py=(%.3f,%.3f) js=(%.3f,%.3f)' % (u.team, u.index, u.fx, u.fy, nu['facing']['x'], nu['facing']['y']))
        nb = nxtobs['ball']
        if abs(nb['x'] - round(s.bx, 3)) > 1e-9 or abs(nb['y'] - round(s.by, 3)) > 1e-9:
            ok = False
            msg.append('ball py=(%.3f,%.3f) js=(%.3f,%.3f)' % (s.bx, s.by, nb['x'], nb['y']))
        if abs(nb['vx'] - round(s.bvx, 3)) > 1e-6 or abs(nb['vy'] - round(s.bvy, 3)) > 1e-6:
            ok = False
            msg.append('ballv py=(%.3f,%.3f) js=(%.3f,%.3f)' % (s.bvx, s.bvy, nb['vx'], nb['vy']))
        if nb['owner'] is not None:
            oid = pysim.unit_id(s.units[s.owner]) if s.owner >= 0 else None
            if oid != nb['owner']:
                ok = False; msg.append('owner py=%s js=%s' % (oid, nb['owner']))
        elif s.owner >= 0:
            ok = False; msg.append('owner py=%s js=None' % pysim.unit_id(s.units[s.owner]))
        if s.score != nxtobs['score']:
            ok = False; msg.append('score py=%s js=%s' % (s.score, nxtobs['score']))
        tot += 1
        if not ok:
            bad += 1
            if bad <= 8:
                print('window %d MISMATCH: %s' % (i, '; '.join(msg)))
    print('windows=%d mismatched=%d' % (tot, bad))
    return 0 if bad == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
