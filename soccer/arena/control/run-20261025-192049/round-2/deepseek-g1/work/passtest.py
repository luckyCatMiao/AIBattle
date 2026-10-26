# -*- coding: utf-8 -*-
"""Scenario: within one window, A passes to poacher B in the corner corridor,
B controls and shoots at the near corner.  Opponent re-plans per window.
"""
import math, os, sys

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, WS)
sys.path.insert(0, os.path.join(WS, 'work'))
import agent as A  # noqa: E402
import oppport as O  # noqa: E402


def to_dict(st):
    units = [dict(id='t%du%d' % (u.team, u.index), team=u.team, index=u.index,
                  x=u.x, y=u.y, facing={'x': u.fx, 'y': u.fy}) for u in st.units]
    owner = None
    if st.owner >= 0:
        u = st.units[st.owner]
        owner = 't%du%d' % (u.team, u.index)
    return units, dict(x=st.bx, y=st.by, vx=st.bvx, vy=st.bvy, owner=owner), st.n


def opp_plan(st, team, our_fn, horizon=20):
    cp = st.clone()
    plan = []
    for f in range(horizon):
        units, ball, n = to_dict(cp)
        acts = O.policy({'units': units, 'ball': ball, 'teamSize': n}, team, 'main')
        row = [None] * len(cp.units)
        inp = []
        for u in cp.units:
            if u.team == team:
                a = acts[u.index]
                aa = math.radians(a['aim'])
                inp.append((a['dir'], (math.cos(aa), math.sin(aa)), a['kick']))
                row[u.index] = inp[-1]
            else:
                inp.append(our_fn(cp, u, f))
        plan.append(row)
        A.step(cp, inp, 0)
    return plan


def mk(n_opp, shooter, poacher, opps, keeper):
    st = A.St()
    st.n = max(2, n_opp + 1)
    st.units = []
    u = A.Unit(0, 0)
    u.x, u.y = shooter
    st.units.append(u)
    b = A.Unit(0, 1)
    b.x, b.y = poacher
    st.units.append(b)
    k = A.Unit(1, 0)
    k.x, k.y = keeper
    st.units.append(k)
    for i, (x, y) in enumerate(opps):
        v = A.Unit(1, i + 1)
        v.x, v.y = x, y
        st.units.append(v)
    st.bx, st.by = shooter[0] + 0.62, shooter[1]
    st.bvx = st.bvy = 0.0
    st.owner = 0
    st.lastTouch, st.lastTeam = 't0u0', 0
    st.score = [0, 0]
    st.frame = st.freeze = st.goldenEnd = 0
    st.golden = False
    st.kickoffTeam = 0
    st.status = 'playing'
    st.half = 1
    return st


def play(st, pass_frame=0, shot_at_y=10.7, horizon=60, verbose=False):
    """A (unit0) passes to B (unit1) at pass_frame; B shoots at shot_at_y once owning."""
    aim_pt = (43.0, shot_at_y)
    plan = None
    pi = 0
    kicked = False
    for f in range(horizon):
        if plan is None or pi >= len(plan):
            plan = opp_plan(st, 1, lambda cp, u, ff: ('N', None, False), 20)
            pi = 0
        inp = []
        for u in st.units:
            if u.team == 1:
                inp.append(plan[pi][u.index])
                continue
            if u.index == 0:  # passer
                if f == pass_frame and st.owner == 0:
                    b = [q for q in st.units if q.team == 0 and q.index == 1][0]
                    ang = math.atan2(b.y - (st.by - 0.62 * 0), b.x - u.x)
                    # aim at poacher's current pos (lead not modelled here)
                    ang = math.atan2(b.y - u.y, b.x - u.x)
                    inp.append(('N', (math.cos(ang), math.sin(ang)), True))
                    kicked = True
                else:
                    inp.append(('N', None, False))
            else:  # poacher
                if st.owner >= 0 and st.units[st.owner] is u:
                    ang = math.atan2(aim_pt[1] - u.y, aim_pt[0] - u.x)
                    inp.append(('N', (math.cos(ang), math.sin(ang)), True))
                else:
                    # run to the ball's predicted landing point
                    inp.append(('N', None, False))
        pi += 1
        g = A.step(st, inp, 0)
        if verbose:
            print(f, 'ball(%.2f,%.2f) v(%.1f,%.1f) owner=%s' % (st.bx, st.by, st.bvx, st.bvy, st.owner))
        if g >= 0:
            return g == 0
    return False


def main():
    cases = [
        ((33, 4.0), (38, 4.0), [(31.6, 4.0), (35.5, 5.55), (35.5, 2.45)], (40.7, 13.0)),
        ((34, 4.0), (39, 4.0), [(32.6, 4.0), (35.5, 5.55), (35.5, 2.45)], (40.7, 13.0)),
        ((33, 4.0), (39, 4.0), [(31.6, 4.0), (35.5, 5.55), (35.5, 2.45)], (40.7, 13.0)),
        ((33, 4.0), (38, 4.0), [(31.6, 4.0), (35.5, 5.55)], (40.7, 10.8)),
        ((31, 4.0), (38, 4.0), [(29.6, 4.0), (34.5, 5.55), (34.5, 2.45)], (40.7, 13.0)),
        ((33, 21.6), (38, 21.6), [(31.6, 21.6), (35.5, 20.05), (35.5, 23.05)], (40.7, 13.0)),
    ]
    for i, (a, b, opps, kp) in enumerate(cases):
        for ay in (10.7, 15.3):
            st = mk(len(opps), a, b, opps, kp)
            ok = play(st, 0, ay)
            print('case%d A%s B%s n_opp=%d aim=%.1f -> %s' % (i, a, b, len(opps), ay, ok))


if __name__ == '__main__':
    main()
