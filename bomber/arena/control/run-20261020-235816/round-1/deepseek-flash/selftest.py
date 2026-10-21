#!/usr/bin/env python3
"""Offline self-play harness: agent vs scripted bots on the ported engine."""
import sys, json, random, importlib.util, argparse
sys.path.insert(0, '/workspace')
import engine

spec = importlib.util.spec_from_file_location('agentmod', '/workspace/agent.py')
amod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(amod)
Agent = amod.Agent


def make_obs(g, owner):
    fs = []
    for f in g.fighters:
        px = f.fromX + (f.x - f.fromX) * f.progress
        py = f.fromY + (f.y - f.fromY) * f.progress
        fs.append({'id': f.id, 'owner': f.owner, 'alive': f.alive, 'x': f.x, 'y': f.y,
                   'px': round(px, 2), 'py': round(py, 2), 'facing': f.facing,
                   'bombs': f.bombs, 'blast': f.blast, 'speed': f.speed,
                   'activeBombs': f.activeBombs})
    return {
        'id': 'test', 'seed': g.seed, 'status': g.status, 'yourPlayer': owner,
        'round': g.round, 'roundFrames': g.roundFrames,
        'map': {'width': engine.W, 'height': engine.H, 'tiles': list(g.tiles)},
        'spawns': [[x, y] for x, y in g.spawns],
        'timeLeft': max(0.0, 150 - g.roundFrames / 20.0),
        'players': [{'id': p['id'], 'wins': p['wins']} for p in g.players],
        'fighters': fs,
        'bombs': [{'id': b['id'], 'owner': b['owner'], 'x': b['x'], 'y': b['y'],
                   'fuse': b['fuse'], 'blast': b['blast']} for b in g.bombs],
        'blasts': [{'x': c['x'], 'y': c['y'], 'frames': c['frames'], 'owner': c['owner']}
                   for c in g.blasts],
        'drops': [{'id': d['id'], 'x': d['x'], 'y': d['y'], 'type': d['type']} for d in g.drops],
    }


class IdleBot:
    def decide(self, obs):
        return {'inputs': [{'dir': 'N', 'btn': None} for _ in range(20)]}


class RandomBot:
    def __init__(self, seed=0):
        self.r = random.Random(seed)

    def decide(self, obs):
        out = []
        for _ in range(20):
            d = self.r.choices(['N', 'U', 'D', 'L', 'R'], weights=[3, 1, 1, 1, 1])[0]
            b = 'BOMB' if self.r.random() < 0.02 else None
            out.append({'dir': d, 'btn': b})
        return {'inputs': out}


class FarmerBot:
    """Simple greedy farmer: adjacent soft wall -> bomb with a crude escape check."""
    def __init__(self, seed=0):
        self.r = random.Random(seed)
        self.a = Agent()   # reuse planning helpers? no: lightweight own logic

    def decide(self, obs):
        W, H = 19, 17
        tiles = obs['map']['tiles']
        me = [f for f in obs['fighters'] if f['owner'] == obs['yourPlayer']][0]
        x, y = me['x'], me['y']
        inp = [{'dir': 'N', 'btn': None} for _ in range(20)]
        mf = max(3, 6 - me['speed'])

        def empty(cx, cy):
            return 0 <= cx < W and 0 <= cy < H and tiles[cy * W + cx] == 0 and not any(
                b['x'] == cx and b['y'] == cy for b in obs['bombs'])

        dirs = [(1, 0, 'R'), (-1, 0, 'L'), (0, 1, 'D'), (0, -1, 'U')]
        # adjacent soft wall?
        wall = None
        for dx, dy, d in dirs:
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and tiles[ny * W + nx] == 2:
                wall = (nx, ny, d)
                break
        if wall and me['activeBombs'] < me['bombs']:
            nx, ny, d = wall
            # retreat: find an open neighbour != bomb-adjacent cell
            outs = [dd for ddx, ddy, dd in dirs if empty(x + ddx, y + ddy)]
            outs = [o for o in outs if o != {'R': 'L', 'L': 'R', 'U': 'D', 'D': 'U'}[d]]
            if outs:
                o = self.r.choice(outs)
                inp[0] = {'dir': o, 'btn': 'BOMB'}
                return {'inputs': inp}
        # BFS toward nearest drop or soft wall
        targets = set((dd['x'], dd['y']) for dd in obs['drops'])
        if not targets:
            for yy in range(H):
                for xx in range(W):
                    if tiles[yy * W + xx] == 2:
                        targets.add((xx, yy))
        from collections import deque
        prev = {(x, y): None}
        q = deque([(x, y)])
        goal = None
        while q:
            cx, cy = q.popleft()
            if (cx, cy) in targets and (cx, cy) != (x, y):
                goal = (cx, cy); break
            for dx, dy, d in dirs:
                nx, ny = cx + dx, cy + dy
                if empty(nx, ny) and (nx, ny) not in prev:
                    prev[(nx, ny)] = (cx, cy, d)
                    q.append((nx, ny))
        if goal:
            cell = goal
            step = None
            while prev[cell] is not None:
                px, py, d = prev[cell]
                step = d
                cell = (px, py)
            if step:
                for k in range(0, 20, mf):
                    inp[k]['dir'] = step
        return {'inputs': inp}


def run_game(p0, p1, seed=1, verbose=False, max_frames=None):
    g = engine.Game(['A', 'B'], seed=seed)
    bots = [p0, p1]
    frames = 0
    while g.status == 'playing':
        if max_frames and g.roundFrames >= max_frames:
            break
        ws = []
        for o in range(2):
            f = g.fighters[o]
            if not f.alive:
                ws.append([{'dir': 'N', 'btn': None}] * 20)
                continue
            obs = make_obs(g, o)
            try:
                w = bots[o].decide(obs)
                inputs = w.get('inputs') or []
            except Exception as e:
                if verbose:
                    print('bot error', o, e)
                inputs = []
            norm = [{'dir': 'N', 'btn': None}] * 20
            for i in range(min(20, len(inputs))):
                norm[i] = {'dir': inputs[i].get('dir', 'N'), 'btn': inputs[i].get('btn')}
            ws.append(norm)
        g.advance_window(ws)
        frames += 1
        if g.round > 1 and g.status == 'playing':
            pass
    return g


def summarize(g):
    return {
        'status': g.status, 'round': g.round,
        'wins': [p['wins'] for p in g.players],
        'log': g.roundLog,
    }


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--games', type=int, default=1)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--opp', default='idle')
    ap.add_argument('--frames', type=int, default=0)
    args = ap.parse_args()
    maker = {'idle': lambda: IdleBot(), 'random': lambda: RandomBot(7),
             'farmer': lambda: FarmerBot(7), 'self': lambda: Agent()}[args.opp]
    tot = [0, 0, 0]
    for i in range(args.games):
        a = Agent()
        b = maker()
        g = run_game(a, b, seed=args.seed + i, max_frames=args.frames or None)
        s = summarize(g)
        print(json.dumps(s, ensure_ascii=False))
