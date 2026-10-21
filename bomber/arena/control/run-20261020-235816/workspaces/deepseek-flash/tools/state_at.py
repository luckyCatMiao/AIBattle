#!/usr/bin/env python3
"""Print a board snapshot at a given round frame for a match."""
import sys
sys.path.insert(0, '/workspace')
import engine
from tools.bench import make_obs, load_agent


def run(Apath, Bpath, seed, rnd, fr):
    A = load_agent(Apath); B = load_agent(Bpath)
    a = A(); b = B()
    g = engine.Game(['A', 'B'], seed=seed)
    last = None
    while g.status == 'playing':
        if g.round > rnd or (g.round == rnd and g.roundFrames > fr):
            break
        ws = []
        for o in range(2):
            bot = a if o == 0 else b
            w = bot.decide(make_obs(g, o)); ins = w.get('inputs') or []
            norm = [dict(x) for x in ([{'dir': 'N', 'btn': None}] * 20)]
            for i in range(min(20, len(ins))):
                norm[i] = ins[i]
            ws.append(norm)
        if g.round == rnd and g.roundFrames + 20 > fr:
            last = {'fr': g.roundFrames, 'ws': ws, 'info': (a.info, b.info)}
        g.advance_window(ws)
        if g.roundLog and last is not None:
            break
    print('last window info', last)
    tiles = g.tiles
    bombs = {(x['x'], x['y']): x for x in g.bombs}
    blasts = {(c['x'], c['y']) for c in g.blasts}
    drops = {(d['x'], d['y']): d['type'] for d in g.drops}
    print('round', g.round, 'frame', g.roundFrames, 'stats',
          [(f.bombs, f.blast, f.speed, f.x, f.y, f.alive) for f in g.fighters])
    print('drops', drops)
    for y in range(engine.H):
        row = ''
        for x in range(engine.W):
            c = (x, y)
            if any(f.alive and (f.x, f.y) == c for f in g.fighters):
                row += str([f.owner for f in g.fighters if (f.x, f.y) == c][0])
            elif c in blasts:
                row += '*'
            elif c in bombs:
                row += 'o'
            elif c in drops:
                row += {'bomb': 'b', 'blast': 'f', 'speed': 's'}[drops[c]]
            else:
                row += '.#%'[tiles[y * engine.W + x]]
        print('%2d %s' % (y, row))


if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))
