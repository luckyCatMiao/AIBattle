# -*- coding: utf-8 -*-
"""Local self-play harness using the Python engine inside agent.py.

Usage:
  python -I work/selfplay.py <policyA.py> <policyB.py> [games_per_size] [sizes]
Policy files must expose decide(st, me, n, A).
"""
import importlib.util, math, os, sys, time

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, WS)
import agent as A  # noqa: E402


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def play(pol0, pol1, n, seed, verbose=False):
    s = A.initial_state(n, kickoff_team=abs(seed) % 2)
    # JS createMatch: kickoff() sets freeze=12 at start
    s.freeze = 12
    half_done = False
    turns = 0
    t0 = time.time()
    while s.status == 'playing' and s.frame < 3200:
        # half-time reset
        if not half_done and s.half == 2 and s.frame >= 1200:
            A.kickoff(s, 1 - s.kickoffTeam)
            half_done = True
        if s.freeze > 0:
            # hosts output neutral frames while frozen; policies not called
            fr0 = [{} for _ in range(20)]
            fr1 = [{} for _ in range(20)]
        else:
            fr0 = pol0.decide(s.clone(), 0, n, A)
            fr1 = pol1.decide(s.clone(), 1, n, A)
        turns += 1
        for f in range(20):
            if s.status != 'playing':
                break
            inp = []
            for u in s.units:
                fr = fr0 if u.team == 0 else fr1
                cmd = None
                if f < len(fr) and isinstance(fr[f], dict):
                    cmd = fr[f].get((u.team, u.index))
                inp.append(cmd if cmd else ('N', None, False))
            g = A.step(s, inp, s.kickoffTeam)
            if g >= 0:
                s.score[g] += 1
                if s.golden:
                    s.status = 'finished'
                    break
                A.kickoff(s, 1 - g)
            if not half_done and s.half == 2 and s.frame >= 1200:
                A.kickoff(s, 1 - s.kickoffTeam)
                half_done = True
    dur = time.time() - t0
    if s.status != 'finished':
        # decide by score
        pass
    return {'score': tuple(s.score), 'winner': s.winner if s.status == 'finished' else
            (0 if s.score[0] > s.score[1] else (1 if s.score[1] > s.score[0] else None)),
            'frames': s.frame, 'secs': round(dur, 2)}


def main():
    pa = sys.argv[1]
    pb = sys.argv[2]
    games = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    sizes = [int(x) for x in sys.argv[4].split(',')] if len(sys.argv) > 4 else [1, 2, 3, 4, 5, 6]
    polA = load(pa, 'polA')
    polB = load(pb, 'polB')
    wins = draws = losses = 0
    rows = []
    for n in sizes:
        for i in range(games):
            seed = 1000 + n * 100 + i
            r = play(polA, polB, n, seed)
            w = r['winner']
            if w == 0: wins += 1
            elif w is None: draws += 1
            else: losses += 1
            rows.append((n, i, r))
            print('n=%d game=%d score=%s frames=%d secs=%.2f' % (n, i, r['score'], r['frames'], r['secs']), flush=True)
    print('TOTAL win-draw-loss %d-%d-%d  winrate %.3f' % (wins, draws, losses, wins / max(1, len(rows))))


if __name__ == '__main__':
    main()
