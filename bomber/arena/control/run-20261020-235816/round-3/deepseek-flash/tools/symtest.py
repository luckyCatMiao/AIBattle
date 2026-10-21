#!/usr/bin/env python3
"""Diagnostic: make drops four-way symmetric and see whether the seat that
moves second still develops more slowly (pure tie-break/planner asymmetry)."""
import sys
sys.path.insert(0, '/workspace')
import engine
from tools.bench import make_obs, load_agent

# symmetric drop table: all four mirror cells share the canonical cell's roll
def sym_roll(self, x, y):
    cx = min(x, engine.W - 1 - x)
    cy = min(y, engine.H - 1 - y)
    rng = engine.Rng(self.seed * 31 + self.round * 977 + cx * 131 + cy * 17)
    if rng.next() >= engine.POWERUP_CHANCE:
        return None
    pick = rng.next()
    acc = 0.0
    chosen = engine.POWERUP_TYPES[0]
    for t in engine.POWERUP_TYPES:
        acc += engine.POWERUP_WEIGHT[t]
        if pick <= acc:
            chosen = t
            break
    self.nextId += 1
    d = {"id": self.nextId, "x": x, "y": y, "type": chosen}
    self.drops.append(d)
    return d

engine.Game.roll_drop = sym_roll

if __name__ == '__main__':
    seed = int(sys.argv[1]); rnd = int(sys.argv[2])
    A = load_agent('/workspace/agent.py'); B = load_agent('/workspace/agent.py')
    a = A(); b = B(); g = engine.Game(['A', 'B'], seed=seed)
    while g.status == 'playing' and g.round < rnd:
        ws = []
        for o in range(2):
            r = (a if o == 0 else b).decide(make_obs(g, o)); ins = r.get('inputs') or []
            norm = [dict(x) for x in ([{'dir': 'N', 'btn': None}] * 20)]
            for i in range(min(20, len(ins))):
                norm[i] = ins[i]
            ws.append(norm)
        g.advance_window(ws)
    print('round', g.round, 'spawns', g.spawns)
    last = -1
    while g.status == 'playing' and g.round == rnd:
        ws = []
        for o in range(2):
            r = (a if o == 0 else b).decide(make_obs(g, o)); ins = r.get('inputs') or []
            norm = [dict(x) for x in ([{'dir': 'N', 'btn': None}] * 20)]
            for i in range(min(20, len(ins))):
                norm[i] = ins[i]
            ws.append(norm)
        g.advance_window(ws)
        if g.round != rnd:
            break
        t = g.roundFrames // 20
        if t // 10 != last // 10:
            last = t
            print('t=%3ds A=%s B=%s' % (t, tuple((f.bombs, f.blast, f.speed) for f in g.fighters)[0],
                                        tuple((f.bombs, f.blast, f.speed) for f in g.fighters)[1]))
    print(g.roundLog[-1] if g.roundLog else None)
