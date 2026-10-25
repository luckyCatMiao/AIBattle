# -*- coding: utf-8 -*-
"""Diagnose a single recorded snapshot with the agent's own world model.
usage: python -I dev/diag.py dev/rec/x.json <frame_index> [owner]
prints map around fighter, fire timeline info, escape reachability."""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent as A

W, H = 19, 17

def main():
    p = sys.argv[1]; wi = int(sys.argv[2]); owner = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    d = json.load(open(p, encoding='utf-8'))
    obs = dict(d['frames'][wi]); obs['yourPlayer'] = owner
    w = A.World.from_obs(obs)
    me = [f for f in w.fighters if f.owner == owner][0]
    opp = [f for f in w.fighters if f.owner != owner][0]
    print('frame idx', wi, 'tick', obs['tick'], 'round', obs['round'], 'me', (me.x, me.y), 'mp', me.move_progress,
          'speed', me.speed, 'blast', me.blast, 'bombs', me.bombs, 'active', me.active_bombs)
    print('opp', (opp.x, opp.y), 'blast', opp.blast, 'bombs', opp.bombs, 'active', opp.active_bombs)
    print('bombs', [(b['owner'], b['x'], b['y'], b['fuse'], b['blast']) for b in w.bombs])
    print('blasts', [(c[0], c[1], c[2]) for c in w.blasts])
    tiles = w.tiles
    print('   local map (rows y=%d..%d, x=%d..%d), @=me o=opp * = bomb' % (me.y-4, me.y+4, me.x-4, me.x+4))
    for y in range(max(0, me.y-4), min(H, me.y+5)):
        row = ''
        for x in range(max(0, me.x-4), min(W, me.x+5)):
            ch = {0: '.', 1: '#', 2: 'S'}.get(tiles[y*W+x], '?')
            if (x, y) == (me.x, me.y): ch = '@'
            elif (x, y) == (opp.x, opp.y): ch = 'o'
            for b in w.bombs:
                if (b['x'], b['y']) == (x, y): ch = '*'
            row += ch
        print('   %2d %s' % (y, row))
    maxfuse = max([b['fuse'] for b in w.bombs] or [0])
    horizon = max(70, maxfuse + 25)
    fire = A.fire_timeline(w, horizon)
    bomb_cells = set((b['x'], b['y']) for b in w.bombs)
    t0 = A.frames_until_free(me)
    arrive, prev, _ = A.dijkstra(fire, tiles, bomb_cells, (me.x, me.y), t0, me.speed, horizon)
    safe_end = [c for c, t in arrive.items() if A.safe_range(fire, c, t, horizon)]
    print('t0', t0, 'horizon', horizon, 'reachable', len(arrive), 'safe-to-horizon cells:', len(safe_end))
    if safe_end:
        print('  examples:', sorted(safe_end)[:12])
    else:
        print('  !! NO cell is safe to horizon -> emergency cannot find anything')
    opp_reach = A.opp_reach_set(w, opp, tiles, bomb_cells, 40 // max(3, 6-opp.speed) + 1)
    print('opp reach', len(opp_reach), 'bombs_left', opp.bombs - opp.active_bombs)
    for c in [(me.x, me.y)] + sorted(safe_end)[:8]:
        th, C = A.kill_threat(tiles, bomb_cells, c, opp_reach, opp.blast, me.speed, opp.bombs - opp.active_bombs)
        print('   danger', c, th, 'from', C)
    # what would emergency do?
    _, _, res = A.dijkstra(fire, tiles, bomb_cells, (me.x, me.y), t0, me.speed, horizon,
                           goal_fn=lambda c, tt: A.safe_range(fire, c, tt, horizon))
    print('emergency res:', res)
    if res:
        inp, alive, sim, _p20, _b20 = A.run_script(w, owner, res[1], set(), None, 20)
        print('run_script alive', alive, 'inputs', ''.join(d for d, b in inp[:20]))
    print('decide disabled; use --call to invoke decide')
    if '--call' in sys.argv:
        r = A.decide(obs)
        print('decide note:', r.get('note'))
        print('decide inputs:', ' '.join('%s%s' % (f['dir'], '*' if f['btn'] == 'BOMB' else '') for f in r['inputs']))

if __name__ == '__main__':
    main()
