#!/usr/bin/env python3
"""Run matches and summarise rounds + death events (positions, bomb owner, stats)."""
import sys, json
sys.path.insert(0, '/workspace')
import engine
from tools.bench import make_obs, load_agent


def run(Apath, Bpath, seed, maxw=5000, agg_flags=None):
    A = load_agent(Apath); B = load_agent(Bpath)
    ka = agg_flags or {}
    a = A(**ka.get('a', {})); b = B(**ka.get('b', {}))
    g = engine.Game(['A', 'B'], seed=seed)
    deaths = []
    prev_alive = [True, True]
    stat_hist = []  # (frame, statsA, statsB)
    evi = 0
    win = 0
    while g.status == 'playing' and win < maxw:
        ws = []
        for o in range(2):
            bot = a if o == 0 else b
            w = bot.decide(make_obs(g, o)); ins = w.get('inputs') or []
            norm = [{'dir': 'N', 'btn': None}] * 20
            norm = [dict(x) for x in norm]
            for i in range(min(20, len(ins))):
                norm[i] = ins[i]
            ws.append(norm)
        g.advance_window(ws)
        win += 1
        for ev in g.events[evi:]:
            if ev['type'] == 'death':
                f = g.fighters[ev['owner']]
                deaths.append({'round': g.round, 'frame': ev['frame'],
                               'owner': ev['owner'], 'x': ev['x'], 'y': ev['y'],
                               'by': ev.get('blastOwner')})
        evi = len(g.events)
        if win % 25 == 0:
            stat_hist.append((g.roundFrames, tuple((f.bombs, f.blast, f.speed) for f in g.fighters)))
    return {'wins': [p['wins'] for p in g.players],
            'log': [(r['round'], r['frames'], r['winner'], r['reason']) for r in g.roundLog],
            'deaths': deaths}


if __name__ == '__main__':
    ap = sys.argv[1]; bp = sys.argv[2]; start = int(sys.argv[3]); n = int(sys.argv[4])
    for s in range(start, start + n):
        r = run(ap, bp, s)
        print('seed', s, 'wins', r['wins'], 'log', r['log'])
        for d in r['deaths']:
            print('   death', json.dumps(d, ensure_ascii=False))
