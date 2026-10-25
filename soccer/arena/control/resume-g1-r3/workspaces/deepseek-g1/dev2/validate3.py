# -*- coding: utf-8 -*-
"""精确比对：pysim 从 frame0 起喂 dumpraw.js 的输入，逐窗口与 JS 原始内部状态比对。"""
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
    recs = [json.loads(l) for l in open(path, encoding='utf-8')]
    st0 = recs[0]['state']
    n = len(st0['units']) // 2
    s = pysim.initial_state(n, st0['kickoffTeam'])
    bad = 0
    for i in range(1, len(recs)):
        rec = recs[i]
        frames = []
        for f in range(20):
            fr = [None] * len(s.units)
            for idx, u in enumerate(s.units):
                src = rec['w0'][f][u.index] if u.team == 0 else rec['w1'][f][u.index]
                fr[idx] = unit_input(src)
            frames.append(fr)
        pysim.advance(s, frames)
        exp = recs[i]['state']
        ok = True
        msg = []
        for ju in exp['units']:
            u = s.units[ju['team'] * n + ju['index']]
            for k, mine in (('x', u.x), ('y', u.y), ('fx', u.fx), ('fy', u.fy),
                            ('kickCd', u.kickCd), ('controlLock', u.controlLock),
                            ('stealLock', u.stealLock), ('foulLock', u.foulLock)):
                if abs(ju[k] - mine) > 1e-9:
                    ok = False
                    msg.append('u%d%d.%s py=%r js=%r' % (ju['team'], ju['index'], k, mine, ju[k]))
        b = exp['ball']
        for k, mine in (('x', s.bx), ('y', s.by), ('vx', s.bvx), ('vy', s.bvy)):
            if abs(b[k] - mine) > 1e-9:
                ok = False
                msg.append('ball.%s py=%r js=%r' % (k, mine, b[k]))
        if (b['owner'] or None) != (pysim.unit_id(s.units[s.owner]) if s.owner >= 0 else None):
            ok = False
            msg.append('owner py=%s js=%s' % (pysim.unit_id(s.units[s.owner]) if s.owner >= 0 else None, b['owner']))
        if s.score != exp['score'] or s.frame != exp['frame'] or s.freeze != exp['freeze'] or s.status != exp['status']:
            ok = False
            msg.append('meta py=(f%d fr%d sc%s %s) js=(f%d fr%d sc%s %s)' % (s.frame, s.freeze, s.score, s.status, exp['frame'], exp['freeze'], exp['score'], exp['status']))
        if not ok:
            bad += 1
            if bad <= 4:
                print('window %d MISMATCH: %s' % (i - 1, '; '.join(msg[:6])))
    print('%s n=%d windows=%d mismatched=%d' % (os.path.basename(path), n, len(recs) - 1, bad))
    return 0 if bad == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
