# -*- coding: utf-8 -*-
"""Scenario: can we execute punt -> collect -> dribble to D=7 -> corner shot?"""
import math, os, sys

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, WS)
sys.path.insert(0, os.path.join(WS, 'work'))
import agent as A  # noqa: E402
import policy2 as P  # noqa: E402
import simtest as S  # noqa: E402

P.set_engine(A.step)


def mk(me, mine, theirs, owner_idx=0):
    st = A.St()
    st.n = len(mine)
    st.units = []
    for i, (x, y) in enumerate(mine):
        u = A.Unit(me, i)
        u.x, u.y = x, y
        st.units.append(u)
    for i, (x, y) in enumerate(theirs):
        u = A.Unit(1 - me, i)
        u.x, u.y = x, y
        st.units.append(u)
    o = st.units[owner_idx]
    st.bx, st.by = o.x + o.fx * 0.62, o.y
    st.bvx = st.bvy = 0.0
    st.owner = owner_idx
    st.lastTouch, st.lastTeam = 't%du%d' % (o.team, o.index), o.team
    st.score = [0, 0]
    st.frame = st.freeze = st.goldenEnd = 0
    st.golden = False
    st.kickoffTeam = 0
    st.status = 'playing'
    st.half = 1
    return st


def run(me, mine, theirs, secs=25, owner_idx=0, label=''):
    st = mk(me, mine, theirs, owner_idx)
    opp = 1 - me
    print('---', label)
    for s in range(secs):
        our = P.decide(st, me, st.n, A)
        their = S.opp_rows_for(st, opp)
        for f in range(20):
            if st.status != 'playing':
                break
            inp = []
            for u in st.units:
                if u.team == me:
                    inp.append(our[f].get((me, u.index)) or ('N', None, False))
                else:
                    inp.append(their[f].get(u.index) or ('N', None, False))
            g = A.step(st, inp, st.kickoffTeam)
            if g >= 0:
                st.score[g] += 1
                print('   GOAL %s at t=%.1f' % ('ME' if g == me else 'OPP', st.frame / 20.0))
                A.kickoff(st, 1 - g)
        if s % 3 == 0:
            print('   t=%2d ball(%4.1f,%4.1f) own=%s | %s | %s' % (
                s, st.bx, st.by, st.owner,
                ' '.join('M%d(%.1f,%.1f)' % (u.index, u.x, u.y) for u in st.units if u.team == me),
                ' '.join('O%d(%.1f,%.1f)' % (u.index, u.x, u.y) for u in st.units if u.team != me)))
    print('   score', st.score)


if __name__ == '__main__':
    # me=0 attacks +x.  keeper deep with ball, striker in the corridor, their chaser pressing
    run(0, [(2.5, 13.0), (38.4, 4.1)], [(39.5, 13.0), (40.7, 13.0)], 25, 0,
        'n=2 keeper has ball, chaser pressing keeper')
    run(0, [(2.5, 13.0), (30.0, 4.5)], [(39.5, 13.0), (40.7, 13.0)], 25, 0,
        'n=2 keeper has ball, striker at D=13')
