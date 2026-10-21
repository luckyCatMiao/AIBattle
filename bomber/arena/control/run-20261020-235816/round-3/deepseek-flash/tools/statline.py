#!/usr/bin/env python3
"""Print per-5s stats for both seats through one round of a match."""
import sys
sys.path.insert(0, '/workspace')
import engine
from tools.bench import make_obs, load_agent


def run(Apath, Bpath, seed, rnd):
    A = load_agent(Apath); B = load_agent(Bpath)
    a = A(); b = B()
    g = engine.Game(['A', 'B'], seed=seed)
    while g.status == 'playing' and g.round < rnd:
        ws = []
        for o in range(2):
            w = (a if o == 0 else b).decide(make_obs(g, o)); ins = w.get('inputs') or []
            norm = [dict(x) for x in ([{'dir': 'N', 'btn': None}] * 20)]
            for i in range(min(20, len(ins))):
                norm[i] = ins[i]
            ws.append(norm)
        g.advance_window(ws)
    print('round', g.round, 'spawns', g.spawns)
    rows = []
    while g.status == 'playing' and g.round == rnd:
        ws = []
        for o in range(2):
            w = (a if o == 0 else b).decide(make_obs(g, o)); ins = w.get('inputs') or []
            norm = [dict(x) for x in ([{'dir': 'N', 'btn': None}] * 20)]
            for i in range(min(20, len(ins))):
                norm[i] = ins[i]
            ws.append(norm)
        g.advance_window(ws)
        if g.round != rnd:
            break
        if g.roundFrames % 100 == 0:
            f0, f1 = g.fighters
            rows.append((g.roundFrames // 20,
                         (f0.bombs, f0.blast, f0.speed, f0.x, f0.y),
                         (f1.bombs, f1.blast, f1.speed, f1.x, f1.y),
                         len(g.drops), len(g.bombs)))
    for r in rows:
        print('t=%3ds A=%s B=%s drops=%d bombs=%d' % r)
    print('log', g.roundLog[-1] if g.roundLog else None)


if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
