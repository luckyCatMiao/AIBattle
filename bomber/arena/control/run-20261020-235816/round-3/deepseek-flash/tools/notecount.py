import sys
from collections import Counter
sys.path.insert(0, '/workspace')
import engine
from tools.bench import make_obs, load_agent

p, o, seed = sys.argv[1], sys.argv[2], int(sys.argv[3])
A = load_agent(p)(); B = load_agent(o)()
g = engine.Game(['A', 'B'], seed=seed)
c = Counter(); deaths = 0
while g.status == 'playing':
    ws = []
    for k in range(2):
        bot = A if k == 0 else B
        r = bot.decide(make_obs(g, k))
        if k == 0:
            c[r.get('note')] += 1
        ins = r.get('inputs') or []
        norm = [dict(x) for x in ([{'dir': 'N', 'btn': None}] * 20)]
        for i in range(min(20, len(ins))): norm[i] = ins[i]
        ws.append(norm)
    g.advance_window(ws)
print(p, 'seed', seed, 'notes', dict(c), 'deaths', [(x[0], x[1], x[3]) for x in
      [(r['round'], r['frames'], r['winner']) for r in g.roundLog] if r[2] is not None])
