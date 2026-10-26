# -*- coding: utf-8 -*-
"""Fast local match harness: our policy vs a window-planned opponent model."""
import math, os, random, sys

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, WS)
import agent as A  # noqa: E402
import policy2 as P  # noqa: E402

P.set_engine(A.step)


def make_match(seed, n, jitter=True):
    rng = random.Random(seed * 7919 + n)
    global KICK_RNG
    KICK_RNG = random.Random(seed * 104729 + n)
    st = A.initial_state(n, kickoff_team=abs(seed) % 2)
    st.lastTouch = None
    st.lastTeam = None
    if jitter:
        for u in st.units:
            u.x += rng.uniform(-1.5, 1.5)
            u.y += rng.uniform(-1.5, 1.5)
            u.x = min(max(u.x, 1.34), 42.66)
            u.y = min(max(u.y, 1.34), 24.66)
    st.bx = 22.0 + rng.uniform(-1.2, 1.2)
    st.by = 13.0 + rng.uniform(-1.2, 1.2)
    st.freeze = 12
    return st


KICK_RNG = random.Random(1)


def kickoff_jitter(st, team):
    A.kickoff(st, team)
    for u in st.units:
        u.x += KICK_RNG.uniform(-1.5, 1.5)
        u.y += KICK_RNG.uniform(-1.5, 1.5)
        u.x = min(max(u.x, 1.34), 42.66)
        u.y = min(max(u.y, 1.34), 24.66)
    st.bx += KICK_RNG.uniform(-1.2, 1.2)
    st.by += KICK_RNG.uniform(-1.2, 1.2)


def opp_rows_for(st, opp, horizon=20):
    """Their plan: mirror-model rollout (their own policy plays BOTH teams),
    which is one of the candidate enemy models their decide() uses."""
    rows = []
    sim = st.clone()
    me = 1 - opp
    for f in range(horizon):
        act_o = P._opolicy(sim, opp, 'main')
        act_m = P._opolicy(sim, me, 'main')
        inp = []
        row = {}
        for u in sim.units:
            if u.team == opp:
                d, aim, kick = act_o[u.index]
                aa = math.radians(aim)
                inp.append((d, (math.cos(aa), math.sin(aa)), kick))
                row[u.index] = inp[-1]
            else:
                d, aim, kick = act_m[u.index]
                aa = math.radians(aim)
                inp.append((d, (math.cos(aa), math.sin(aa)), kick))
        rows.append(row)
        g = A.step(sim, inp, sim.kickoffTeam)
        if g >= 0 or sim.status != 'playing':
            break
    while len(rows) < horizon:
        rows.append({})
    return rows


def play(seed, n, me=0, max_frames=2801, verbose=False, opp_true=True):
    st = make_match(seed, n)
    opp = 1 - me
    goals = []
    stats = {'kicks': [0, 0], 'pos': [0, 0], 'shots': [0, 0], 'prev_speed': 0.0,
             'kicklog': [], 'own': [0, 0]}
    half_done = False
    while st.frame < max_frames and st.status == 'playing':
        # half time
        if not st.golden and st.half == 1 and st.frame >= 1200:
            st.half = 2
            kickoff_jitter(st, 1 - st.kickoffTeam)
        our = P.decide(st, me, n, A)
        their = opp_rows_for(st, opp) if opp_true else [{}] * 20
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
            if sp > 9.5 and stats['prev_speed'] < 9.5 and st.lastTeam is not None:
                lt = st.lastTeam
                stats['kicks'][lt] += 1
                d = abs((43.0 if lt == 0 else 1.0) - st.bx)
                if d < 26.0 and abs(st.by - 13.0) < 13.0:
                    stats['shots'][lt] += 1
                stats['kicklog'].append((round(st.frame / 20.0, 1), lt, round(st.bx, 1), round(st.by, 1)))
            stats['prev_speed'] = sp
            if st.owner >= 0:
                stats['pos'][st.units[st.owner].team] += 1
            if g >= 0:
                st.score[g] += 1
                goals.append((st.frame / 20.0, g))
                if st.golden:
                    st.status = 'finished'
                    break
                kickoff_jitter(st, 1 - g)
        if not st.golden and st.frame >= 2400:
            if st.score[0] == st.score[1]:
                st.golden = True
                st.goldenEnd = st.frame + 400
            else:
                st.status = 'finished'
    if st.status == 'playing':
        st.status = 'finished'
    stats['frames'] = st.frame
    return st.score, goals, st, stats


def main():
    n_games = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    seed0 = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
    only_n = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    w = d = l = 0
    for g in range(n_games):
        n = only_n or (g % 6 + 1)
        seed = seed0 + g
        me = g % 2
        sc, goals, st, stats = play(seed, n, me)
        ours, theirs = sc[me], sc[1 - me]
        res = 'W' if ours > theirs else ('D' if ours == theirs else 'L')
        if res == 'W':
            w += 1
        elif res == 'D':
            d += 1
        else:
            l += 1
        print('g%d n=%d me=%d  %d:%d %s  goals=%s kicks %s pos %s' % (g, n, me, ours, theirs, res,
              ','.join('%.0f%s' % (t, 'M' if tm == me else 'O') for t, tm in goals),
              stats['kicks'], stats['pos']))
    print('W/D/L %d/%d/%d' % (w, d, l))


if __name__ == '__main__':
    main()
