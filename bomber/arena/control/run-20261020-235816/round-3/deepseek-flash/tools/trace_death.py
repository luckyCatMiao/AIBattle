#!/usr/bin/env python3
"""Trace the final frames before a chosen fighter dies with full board info."""
import sys
sys.path.insert(0, '/workspace')
import engine
from tools.bench import make_obs, load_agent


def run(Apath, Bpath, seed, target_round, victim, margin=60):
    A = load_agent(Apath); B = load_agent(Bpath)
    a = A(); b = B()
    g = engine.Game(['A', 'B'], seed=seed)
    hist = []
    evi = 0
    while g.status == 'playing':
        ws = []
        infos = []
        for o in range(2):
            bot = a if o == 0 else b
            r = bot.decide(make_obs(g, o)); ins = r.get('inputs') or []
            infos.append((r.get('note'), dict(bot.info)))
            norm = [dict(x) for x in ([{'dir': 'N', 'btn': None}] * 20)]
            for i in range(min(20, len(ins))):
                norm[i] = ins[i]
            ws.append(norm)
        if g.round == target_round:
            start_hist = len(hist)
            # replay frames manually to capture per-frame state
            for i in range(20):
                if g.status != 'playing':
                    break
                for o, f in enumerate(g.fighters):
                    if f.alive:
                        g.push_input(f, ws[o][i])
                g.step()
                hist.append({
                    'fr': g.roundFrames, 'i': i, 'round': g.round,
                    'stats': [(f.bombs, f.blast, f.speed) for f in g.fighters],
                    'pos': [(f.x, f.y, round(f.progress, 3)) for f in g.fighters],
                    'alive': [f.alive for f in g.fighters],
                    'bombs': [(x['owner'], x['x'], x['y'], x['fuse']) for x in g.bombs],
                    'blasts': sorted(set((c['x'], c['y'], c['frames']) for c in g.blasts)),
                    'drops': [(d['x'], d['y'], d['type']) for d in g.drops],
                    'inputs': ws,
                    'note': infos,
                })
                died = False
                for ev in g.events[evi:]:
                    if ev['type'] == 'death' and ev['owner'] == victim:
                        died = True
                evi = len(g.events)
                if died:
                    for h in hist[-margin:]:
                        print(h['round'], 'fr', h['fr'], 'i', h['i'])
                        print('   pos', h['pos'], 'alive', h['alive'], 'stats', h['stats'])
                        print('   bombs', h['bombs'])
                        print('   blasts', h['blasts'])
                        print('   inputs A', ''.join(('B' if u['btn'] else u['dir']) for u in h['inputs'][0]))
                        print('   inputs B', ''.join(('B' if u['btn'] else u['dir']) for u in h['inputs'][1]))
                        print('   note', h['note'][victim][0], {k: h['note'][victim][1].get(k) for k in
                              ('cur', 'enemy', 'note', 'bomb', 'move', 'bs', 'ms', 'mt', 'dirs', 'ready', 'active')})
                    return
            if g.round != target_round:
                return
        else:
            g.advance_window(ws)
            evi = len(g.events)
    print('round log', g.roundLog)


if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))
