# -*- coding: utf-8 -*-
"""Shot lab: how often does a shot from position P into target y score?

Uses our exact Python engine (agent.pysim) plus the *reactive* port of the
opponent policy for their units (a conservative stand-in: their real keeper
only re-plans once per second, so the reactive model reacts faster).
"""
import math, os, sys

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, WS)
sys.path.insert(0, os.path.join(WS, 'work'))
import agent as A  # noqa: E402
import oppport as O  # noqa: E402

W = 44.0


def mk_state(shooter=(33.0, 13.0), opp_keeper=(40.7, 13.0), opps=(), mine=(), owner_me=True):
    st = A.St()
    st.n = 4
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
    st.owner = 0 if owner_me else -1
    st.score = [0, 0]
    st.frame = 0
    st.freeze = 0
    st.golden = False
    st.goldenEnd = 0
    st.kickoffTeam = 0
    st.status = 'playing'
    st.half = 1
    return st


def run_shot(shooter, aim_y, opp_keeper, opps, mine=(), shot_frame=0, horizon=45):
    st = mk_state(shooter, opp_keeper, opps, mine)
    # aim at (43, aim_y)
    ang = math.atan2(aim_y - shooter[1], 43.0 - shooter[0])
    goal = False
    for f in range(horizon):
        inp = []
        acts = O.policy({'units': [dict(id='t%du%d' % (u.team, u.index), team=u.team,
                                        index=u.index, x=u.x, y=u.y,
                                        facing={'x': u.fx, 'y': u.fy}) for u in st.units],
                         'ball': {'x': st.bx, 'y': st.by, 'vx': st.bvx, 'vy': st.bvy,
                                  'owner': ('t%du%d' % (st.units[st.owner].team, st.units[st.owner].index)) if st.owner >= 0 else None},
                         'teamSize': 4}, 1, 'main')
        for i, u in enumerate(st.units):
            if u.team == 0:
                if u.index == 0 and f == shot_frame and st.owner == 0:
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
    print('shooter_y \\ aim_y:', ' '.join('%5.1f' % y for y in (10.7, 11.6, 13.0, 14.4, 15.3)))
    for sy in (3.0, 4.5, 6.0, 9.0, 13.0, 17.0, 20.0, 21.5, 23.0):
        row = []
        for ay in (10.7, 11.6, 13.0, 14.4, 15.3):
            ok = 0
            for sx in (32.0, 33.0, 34.0, 36.0, 38.0, 40.0):
                # realistic: chaser near the shooter, line defender behind
                opps = [(sx + 1.2 if sx < 34 else 35.5, sy)]
                if run_shot((sx, sy), ay, (40.7, 13.0), opps):
                    ok += 1
            row.append(ok)
        print('y=%5.1f      :' % sy, ' '.join('%5d' % v for v in row))


if __name__ == '__main__':
    main()
