# -*- coding: utf-8 -*-
"""Shot lab v2: opponent re-plans only once per decision window (their real
pipeline), so a shot taken on frame 0 of a window is unseen for up to 1 s.
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
    ball = dict(x=st.bx, y=st.by, vx=st.bvx, vy=st.bvy, owner=owner)
    return units, ball, st.n


def opp_window(st, team, act_fn, horizon=20):
    """Roll a copy forward `horizon` frames to produce their window plan."""
    cp = st.clone()
    plan = []
    for f in range(horizon):
        units, ball, n = to_dict(cp)
        acts = O.policy({'units': units, 'ball': ball, 'teamSize': n}, team, 'main')
        row = []
        inp = []
        for u in cp.units:
            if u.team == team:
                a = acts[u.index]
                aa = math.radians(a['aim'])
                inp.append((a['dir'], (math.cos(aa), math.sin(aa)), a['kick']))
                row.append((a['dir'], (math.cos(aa), math.sin(aa)), a['kick']))
            else:
                inp.append(act_fn(cp, u))
        plan.append(row)
        A.step(cp, inp, 0)
    return plan


def mk_state(shooter, opp_keeper, opps, mine=(), owner=True):
    st = A.St()
    st.n = 2 + len(opps)
    st.units = []
    u = A.Unit(0, 0)
    u.x, u.y = shooter
    st.units.append(u)
    for i, (x, y) in enumerate(mine):
        v = A.Unit(0, i + 1)
        v.x, v.y = x, y
        st.units.append(v)
    k = A.Unit(1, 0)
    k.x, k.y = opp_keeper
    st.units.append(k)
    for i, (x, y) in enumerate(opps):
        v = A.Unit(1, i + 1)
        v.x, v.y = x, y
        st.units.append(v)
    st.bx, st.by = shooter[0] + 0.62, shooter[1]
    st.bvx = st.bvy = 0.0
    st.owner = 0 if owner else -1
    st.lastTouch = 't0u0' if owner else None
    st.lastTeam = 0 if owner else None
    st.score = [0, 0]
    st.frame = 0
    st.freeze = 0
    st.golden = False
    st.goldenEnd = 0
    st.kickoffTeam = 0
    st.status = 'playing'
    st.half = 1
    return st


def idle(cp, u):
    return ('N', None, False)


def run_windowed(shooter, aim_y, opp_keeper, opps, mine=(), horizon=60):
    st = mk_state(shooter, opp_keeper, opps, mine)
    ang = math.atan2(aim_y - shooter[1], 43.0 - shooter[0])
    plan = None
    plan_i = 0
    for f in range(horizon):
        if plan is None or plan_i >= len(plan):
            plan = opp_window(st, 1, idle, 20)
            plan_i = 0
        our = []
        for u in st.units:
            if u.team == 0:
                if u.index == 0 and f == 0 and st.owner == 0:
                    our.append(('N', (math.cos(ang), math.sin(ang)), True))
                else:
                    our.append(('N', None, False))
            else:
                our.append(plan[plan_i][u.index])
        plan_i += 1
        inp = our
        g = A.step(st, inp, 0)
        if g >= 0:
            return g == 0
    return False


def run_reactive(shooter, aim_y, opp_keeper, opps, mine=(), horizon=60):
    st = mk_state(shooter, opp_keeper, opps, mine)
    ang = math.atan2(aim_y - shooter[1], 43.0 - shooter[0])
    for f in range(horizon):
        units, ball, n = to_dict(st)
        acts = O.policy({'units': units, 'ball': ball, 'teamSize': n}, 1, 'main')
        inp = []
        for u in st.units:
            if u.team == 0:
                if u.index == 0 and f == 0 and st.owner == 0:
                    inp.append(('N', (math.cos(ang), math.sin(ang)), True))
                else:
                    inp.append(('N', None, False))
            else:
                a = acts[u.index]
                aa = math.radians(a['aim'])
                inp.append((a['dir'], (math.cos(aa), math.sin(aa)), a['kick']))
        g = A.step(st, inp, 0)
        if g >= 0:
            return g == 0
    return False


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'win'
    fn = run_windowed if mode == 'win' else run_reactive
    aims = (10.7, 11.6, 13.0, 14.4, 15.3)
    print('mode', mode, 'aims:', ' '.join('%5.1f' % y for y in aims))
    for sy in (3.0, 4.5, 6.0, 9.0, 13.0, 17.0, 20.0, 21.5, 23.0):
        row = []
        for ay in aims:
            ok = 0
            tot = 0
            for sx in (31.0, 32.0, 33.0, 34.0, 36.0, 38.0, 40.0, 41.5):
                # their chaser sits behind the ball on the opposite side of the shield
                opps = [(sx - 1.4, sy), (min(36.0, sx + 2.5), sy + (1.55 if sy < 13 else -1.55))]
                tot += 1
                if fn((sx, sy), ay, (40.7, 13.0), opps):
                    ok += 1
            row.append('%d/%d' % (ok, tot))
        print('y=%5.1f:' % sy, ' '.join('%6s' % v for v in row))


if __name__ == '__main__':
    main()
