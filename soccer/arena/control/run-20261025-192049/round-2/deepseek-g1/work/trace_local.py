# -*- coding: utf-8 -*-
"""Detailed local trace: our kicks / their kicks / goals with geometry."""
import math, os, sys

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, WS)
sys.path.insert(0, os.path.join(WS, 'work'))
import agent as A  # noqa: E402
import policy2 as P  # noqa: E402
import simtest as S  # noqa: E402

P.set_engine(A.step)


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    me = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    st = S.make_match(seed, n)
    opp = 1 - me
    prev = 0.0
    goals = []
    for sec in range(125):
        our = P.decide(st, me, n, A)
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
            sp = math.hypot(st.bvx, st.bvy)
            if sp > 9.5 and prev < 9.5:
                lt = st.lastTeam
                gx = 43.0 if lt == 0 else 1.0
                d = abs(gx - st.bx)
                ay = st.by + st.bvy / max(1e-6, abs(st.bvx)) * (gx - st.bx)
                tag = 'ME ' if lt == me else 'OPP'
                print('  kick %s t=%.1f (%.1f,%.1f) d=%.1f aim_y=%.1f own=%s | %s' % (
                    tag, st.frame / 20.0, st.bx, st.by, d, ay, st.owner,
                    ' '.join('%s%d(%.1f,%.1f)' % ('M' if u.team == me else 'O', u.index, u.x, u.y)
                             for u in st.units)))
            prev = sp
            if g >= 0:
                st.score[g] += 1
                print('GOAL %s t=%.1f  score %s' % ('ME' if g == me else 'OPP', st.frame / 20.0, st.score))
                S.kickoff_jitter(st, 1 - g)
        if st.frame >= 2400 and not st.golden:
            if st.score[0] == st.score[1]:
                st.golden = True
                st.goldenEnd = st.frame + 400
            else:
                break
        if st.status != 'playing':
            break
    print('final', st.score)


if __name__ == '__main__':
    main()
