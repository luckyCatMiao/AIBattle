#!/usr/bin/env python3
"""Count how often the emergency (ms==-100) move branch fires."""
import sys
sys.path.insert(0, '/workspace')
import engine
from tools.bench import make_obs, load_agent


def run(path, opp_path, seed, nwin=400):
    A = load_agent(path)(); B = load_agent(opp_path)()
    g = engine.Game(['A', 'B'], seed=seed)
    tot = fb = notes = 0
    while g.status == 'playing' and tot < nwin:
        ws = []
        for o in range(2):
            bot = A if o == 0 else B
            r = bot.decide(make_obs(g, o))
            if o == 0:
                tot += 1
                if bot.info.get('ms') == -100.0:
                    fb += 1
                    notes += 1
            ins = r.get('inputs') or []
            norm = [dict(x) for x in ([{'dir': 'N', 'btn': None}] * 20)]
            for i in range(min(20, len(ins))):
                norm[i] = ins[i]
            ws.append(norm)
        g.advance_window(ws)
    return tot, fb


if __name__ == '__main__':
    p, o, s, n = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    t, f = run(p, o, s, n)
    print('decisions', t, 'fallback', f)
