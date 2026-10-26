# -*- coding: utf-8 -*-
"""Can a shielded carrier advance against a faster chaser?"""
import math, os, sys

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, WS)
sys.path.insert(0, os.path.join(WS, 'work'))
import agent as A  # noqa: E402
import policy2 as P  # noqa: E402
import oppport as O  # noqa: E402

P.set_engine(A.step)


def mk(carrier, chaser, me=0):
    st = A.St()
    st.n = 1
    st.units = []
    u = A.Unit(me, 0)
    u.x, u.y = carrier
    st.units.append(u)
    o = A.Unit(1 - me, 0)
    o.x, o.y = chaser
    st.units.append(o)
    st.bx, st.by = carrier[0] + 0.62, carrier[1]
    st.bvx = st.bvy = 0.0
    st.owner = 0
    st.lastTouch, st.lastTeam = 't%du0' % me, me
    st.score = [0, 0]
    st.frame = st.freeze = st.goldenEnd = 0
    st.golden = False
    st.kickoffTeam = 0
    st.status = 'playing'
    st.half = 1
    return st


def run(carrier, chaser, target, frames=120, me=0):
    st = mk(carrier, chaser, me)
    a = 1.0 if me == 0 else -1.0
    for f in range(frames):
        inp = []
        for u in st.units:
            if u.team == me:
                near = [x for x in st.units if x.team != me]
                n0 = min(near, key=lambda z: math.hypot(z.x - u.x, z.y - u.y)) if near else None
                if n0 is not None and math.hypot(n0.x - u.x, n0.y - u.y) < 4.0:
                    ang = math.atan2(u.y - n0.y, u.x - n0.x)
                else:
                    ang = math.atan2(target[1] - u.y, target[0] - u.x)
                d = P.move_dir_avoid(u, target[0], target[1], me, near, False, 0.85, P.DRIB)
                inp.append((d, (math.cos(ang), math.sin(ang)), False))
            else:
                acts = P._opolicy(st, 1 - me, 'main')
                idx = [i for i, x in enumerate(st.units) if x.team == 1 - me].index(
                    st.units.index(u))
                aa = math.radians(acts[idx][1])
                inp.append((acts[idx][0], (math.cos(aa), math.sin(aa)), acts[idx][2]))
        A.step(st, inp, 0)
        if f % 20 == 0:
            own = st.owner
            print('  f%3d carrier(%.1f,%.1f) chaser(%.1f,%.1f) owner=%s' % (
                f, st.units[0].x, st.units[0].y, st.units[1].x, st.units[1].y,
                'ME' if own == 0 else ('OPP' if own == 1 else 'loose')))
    return st


if __name__ == '__main__':
    print('chaser head-on at +4:')
    run((30, 13), (26, 13), (18, 13))
    print('chaser behind at -3:')
    run((30, 13), (33, 13), (18, 13))
    print('chaser beside:')
    run((30, 13), (29, 16), (18, 13))
