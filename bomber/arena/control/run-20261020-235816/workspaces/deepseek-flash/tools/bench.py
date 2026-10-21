#!/usr/bin/env python3
"""In-process benchmark harness for agent variants against scripted opponents."""
import sys, json, random, importlib.util, argparse, os
sys.path.insert(0, '/workspace')
import engine

def load_agent(path):
    spec = importlib.util.spec_from_file_location('agentmod_'+str(abs(hash(path))), path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.Agent

def make_obs(g, owner):
    fs = []
    for f in g.fighters:
        px = f.fromX + (f.x - f.fromX) * f.progress
        py = f.fromY + (f.y - f.fromY) * f.progress
        fs.append({'id': f.id, 'owner': f.owner, 'alive': f.alive, 'x': f.x, 'y': f.y,
                   'px': round(px, 2), 'py': round(py, 2), 'facing': f.facing,
                   'bombs': f.bombs, 'blast': f.blast, 'speed': f.speed,
                   'activeBombs': f.activeBombs, 'invulnerable': f.invulnUntil >= g.roundFrames})
    return {
        'id': 'test', 'seed': g.seed, 'status': g.status, 'yourPlayer': owner,
        'round': g.round, 'roundFrames': g.roundFrames, 'frame': g.roundFrames,
        'map': {'width': engine.W, 'height': engine.H, 'tiles': list(g.tiles)},
        'spawns': [[x, y] for x, y in g.spawns],
        'timeLeft': max(0.0, 150 - g.roundFrames / 20.0),
        'players': [{'id': p['id'], 'wins': p['wins'], 'alive': True} for p in g.players],
        'fighters': fs,
        'bombs': [{'id': b['id'], 'owner': b['owner'], 'x': b['x'], 'y': b['y'],
                   'fuse': b['fuse'], 'blast': b['blast']} for b in g.bombs],
        'blasts': [{'x': c['x'], 'y': c['y'], 'frames': c['frames'], 'owner': c['owner']}
                   for c in g.blasts],
        'drops': [{'id': d['id'], 'x': d['x'], 'y': d['y'], 'type': d['type']} for d in g.drops],
        'lastErrors': [],
    }

class IdleBot:
    def decide(self, obs):
        return {'inputs': [{'dir': 'N', 'btn': None} for _ in range(20)]}

class RandomBot:
    def __init__(self, seed=0, bomb_p=0.03):
        self.r = random.Random(seed); self.bomb_p = bomb_p
    def decide(self, obs):
        out = []
        for _ in range(20):
            d = self.r.choices(['N','U','D','L','R'], weights=[4,1,1,1,1])[0]
            b = 'BOMB' if self.r.random() < self.bomb_p else None
            out.append({'dir': d, 'btn': b})
        return {'inputs': out}

class FarmerBot:
    """Greedy: bomb adjacent soft wall, retreat to a neighbour, else BFS to nearest wall/drop."""
    def __init__(self, seed=0):
        self.r = random.Random(seed)
    def decide(self, obs):
        W, H = 19, 17
        tiles = obs['map']['tiles']
        me = [f for f in obs['fighters'] if f['owner'] == obs['yourPlayer']][0]
        x, y = me['x'], me['y']
        inp = [{'dir': 'N', 'btn': None} for _ in range(20)]
        mf = max(3, 6 - me['speed'])
        bombs = obs['bombs']
        def empty(cx, cy):
            return 0 <= cx < W and 0 <= cy < H and tiles[cy*W+cx] == 0 and not any(b['x']==cx and b['y']==cy for b in bombs)
        dirs = [(1,0,'R'),(-1,0,'L'),(0,1,'D'),(0,-1,'U')]
        wall = None
        for dx,dy,d in dirs:
            nx,ny = x+dx,y+dy
            if 0<=nx<W and 0<=ny<H and tiles[ny*W+nx]==2:
                wall=(nx,ny,d); break
        if wall and me['activeBombs'] < me['bombs']:
            outs=[dd for ddx,ddy,dd in dirs if empty(x+ddx,y+ddy)]
            if outs:
                o=self.r.choice(outs)
                inp[0]={'dir':o,'btn':'BOMB'}
                return {'inputs':inp}
        from collections import deque
        targets=set((dd['x'],dd['y']) for dd in obs['drops'])
        if not targets:
            for yy in range(H):
                for xx in range(W):
                    if tiles[yy*W+xx]==2: targets.add((xx,yy))
        prev={(x,y):None}; q=deque([(x,y)]); goal=None
        while q:
            cx,cy=q.popleft()
            if (cx,cy) in targets and (cx,cy)!=(x,y): goal=(cx,cy); break
            for dx,dy,d in dirs:
                nx,ny=cx+dx,cy+dy
                if empty(nx,ny) and (nx,ny) not in prev:
                    prev[(nx,ny)]=(cx,cy,d); q.append((nx,ny))
        if goal:
            cell=goal; step=None
            while prev[cell] is not None:
                px,py,d=prev[cell]; step=d; cell=(px,py)
            if step:
                for k in range(0,20,mf): inp[k]['dir']=step
        return {'inputs':inp}

def run_match(A_cls, B_cls, seed=1, max_windows=100000, record=False):
    g = engine.Game(['A','B'], seed=seed)
    a, b = A_cls(), B_cls()
    bots=[a,b]
    stats = {'windows':0, 'self_kills':0, 'deaths':0, 'errors':0,
             'maxstats':[None,None], 'bombcount':[0,0], 'pickups':[0,0]}
    # track bombs placed by each owner via event diffs -> use g.events
    ev_idx = 0
    while g.status == 'playing' and stats['windows'] < max_windows:
        ws=[]
        for o in range(2):
            f=g.fighters[o]
            if not f.alive:
                ws.append([{'dir':'N','btn':None}]*20); continue
            obs=make_obs(g,o)
            try:
                w=bots[o].decide(obs); inputs=w.get('inputs') or []
            except Exception as e:
                stats['errors']+=1
                if record: print('bot err',o,repr(e))
                inputs=[]
            norm=[{'dir':'N','btn':None}]*20
            for i in range(min(20,len(inputs))):
                fi=inputs[i] or {}
                norm[i]={'dir':fi.get('dir','N'),'btn':fi.get('btn')}
            ws.append(norm)
        g.advance_window(ws)
        stats['windows']+=1
        for ev in g.events[ev_idx:]:
            if ev['type']=='bomb': stats['bombcount'][ev['owner']]+=1
            if ev['type']=='pickup': stats['pickups'][ev['owner']]+=1
            if ev['type']=='death':
                pass
        ev_idx=len(g.events)
    out = {'status':g.status,'wins':[p['wins'] for p in g.players],'windows':stats['windows'],
           'errors':stats['errors'],'rounds':len(g.roundLog)}
    out['log']=[(r['round'],r['frames'],r['winner'],r['reason']) for r in g.roundLog]
    out['bombcount']=stats['bombcount']; out['pickups']=stats['pickups']
    out['finalstats']=[(f.bombs,f.blast,f.speed) for f in g.fighters]
    return out

if __name__ == '__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--a',default='/workspace/agent.py')
    ap.add_argument('--b',default='self')
    ap.add_argument('--seeds',type=int,default=6)
    ap.add_argument('--start',type=int,default=1)
    args=ap.parse_args()
    A=load_agent(args.a)
    if args.b=='self': B=load_agent(args.a)
    elif args.b=='idle': B=IdleBot
    elif args.b=='random': B=lambda: RandomBot(7)
    elif args.b=='farmer': B=lambda: FarmerBot(7)
    else: B=load_agent(args.b)
    tot=[0,0,0]; draws=0; frames=0; wins=0
    for i in range(args.seeds):
        seed=args.start+i
        r=run_match(A,B,seed=seed)
        w=r['wins']; tot[0]+=w[0]; tot[1]+=w[1]
        draws += sum(1 for l in r['log'] if l[2] is None)
        frames += sum(l[1] for l in r['log'])
        wins += 1 if w[0]>w[1] else 0
        print(json.dumps(r, ensure_ascii=False))
    n=args.seeds
    print('SUMMARY matches=%d A_wins=%d B_wins=%d A_series=%d draws_rounds=%d rounds=%d'
          % (n,tot[0],tot[1],wins,draws,len([0])))
