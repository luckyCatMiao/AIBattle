#!/usr/bin/env python3
"""Compact window-level tracer for a death: A (owner 0) vs B (owner 1).

Usage: trace3w.py A B SEED ROUND VICTIM [LAST_N]
Prints the last N decision windows before the victim's death.
"""
import sys, json
sys.path.insert(0, '/workspace')
import engine
from tools.bench import make_obs, load_agent


def main():
    Apath, Bpath, seed, rnd, victim = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
    N = int(sys.argv[6]) if len(sys.argv) > 6 else 12
    A = load_agent(Apath); B = load_agent(Bpath)
    bots = [A(), B()]
    g = engine.Game(['A', 'B'], seed=seed)
    hist = []
    evi = 0
    while g.status == 'playing':
        ws, notes = [], []
        for o in range(2):
            try:
                r = bots[o].decide(make_obs(g, o))
                ins = r.get('inputs') or []
                notes.append((r.get('note'), dict(getattr(bots[o], 'info', {}))))
            except Exception as e:
                ins = []
                notes.append(('ERR:' + repr(e), {}))
            norm = [dict(x) for x in ([{'dir': 'N', 'btn': None}] * 20)]
            for i in range(min(20, len(ins))):
                norm[i] = ins[i]
            ws.append(norm)
        before = {'round': g.round, 'fr': g.roundFrames,
                  'pos': [(f.x, f.y) for f in g.fighters],
                  'stats': [(f.bombs, f.blast, f.speed) for f in g.fighters],
                  'note': notes,
                  'inp': [''.join(('B' if u['btn'] else u['dir']) for u in w) for w in ws]}
        g.advance_window(ws)
        hist.append(before)
        died = None
        for ev in g.events[evi:]:
            if ev['type'] == 'death':
                died = ev
        evi = len(g.events)
        if died is not None and died['owner'] == victim:
            print('DEATH', g.round, 'frame', died['frame'], 'pos', (died['x'], died['y']),
                  'blastOwner', died.get('blastOwner'))
            for h in hist[-N:]:
                print('r%d fr%d pos%s stats%s' % (h['round'], h['fr'], h['pos'], h['stats']))
                print('   A in %s note %s %s' % (h['inp'][0], h['note'][0][0],
                      {k: h['note'][0][1].get(k) for k in ('cur','enemy','aggro','note','hunt','stats','bomb','move','dirs')}))
                print('   B in %s note %s %s' % (h['inp'][1], h['note'][1][0],
                      {k: h['note'][1][1].get(k) for k in ('cur','enemy','aggro','note','hunt','stats','bomb','move','dirs')}))
            return
    print('no death; log', g.roundLog)


if __name__ == '__main__':
    main()
