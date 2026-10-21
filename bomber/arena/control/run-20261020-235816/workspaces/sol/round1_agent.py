import sys, json, math, heapq, time
from collections import deque

DIRS = [('U', 0, -1), ('D', 0, 1), ('L', -1, 0), ('R', 1, 0)]


def drop_type(seed, rnd, x, y):
    s = (seed * 31 + rnd * 977 + x * 131 + y * 17) & 0xffffffff
    s = s or 1
    s = (s * 1664525 + 1013904223) & 0xffffffff
    if s / 4294967296 >= .55:
        return None
    s = (s * 1664525 + 1013904223) & 0xffffffff
    p = s / 4294967296
    return 'bomb' if p <= .4 else 'blast' if p <= .75 else 'speed'


def duration(speed):
    p = 1 / max(3, 6 - speed)
    n, v = 1, p
    while v < 1:
        n += 1
        v = min(1, v + p)
    return n


class Forecast:
    def __init__(self, obs, extra=(), horizon=80):
        self.H = horizon
        self.W, self.N = obs['map']['width'], len(obs['map']['tiles'])
        self.tiles = obs['map']['tiles'][:]
        self.clear = [0 if v == 0 else 10000 for v in self.tiles]
        self.hazard = [0] * self.N
        self.block = [0] * self.N
        self.neighbors = [[] for _ in self.tiles]
        for i in range(self.N):
            x, y = i % self.W, i // self.W
            if self.tiles[i] == 1:
                continue
            for name, dx, dy in DIRS:
                xx, yy = x + dx, y + dy
                j = yy * self.W + xx
                if 0 <= xx < self.W and 0 <= yy < self.N // self.W and self.tiles[j] != 1:
                    self.neighbors[i].append((j, name))
        for b in obs['blasts']:
            n = min(horizon, b['frames'] - 1)
            if n >= 0:
                self.hazard[b['y'] * self.W + b['x']] |= (1 << (n + 1)) - 1
        bombs = []
        for b in obs['bombs']:
            bombs.append(dict(b, born=0, end=b['fuse'], done=False))
        for b in extra:
            bombs.append(dict(b, end=b['born'] + 40, done=False))
        self.bombs = bombs
        self.newdrops = []
        self.hit = {}
        def explode(b, t):
            if b['done']:
                return
            b['done'] = True
            b['end'] = t
            i = b['y'] * self.W + b['x']
            cells = [i]
            broken = []
            for _, dx, dy in (DIRS[3], DIRS[2], DIRS[1], DIRS[0]):
                for r in range(1, b['blast'] + 1):
                    x, y = b['x'] + dx*r, b['y'] + dy*r
                    if not (0 <= x < self.W and 0 <= y < self.N // self.W):
                        break
                    j = y*self.W+x
                    if self.tiles[j] == 1:
                        break
                    cells.append(j)
                    if self.tiles[j] == 2:
                        self.tiles[j] = 0
                        self.clear[j] = t
                        broken.append(j)
                        break
                    for other in bombs:
                        if not other['done'] and other['born'] < t and other['x'] == x and other['y'] == y:
                            explode(other, t)
                            break
            mask = ((1 << min(11, horizon-t+1))-1) << t
            for j in cells:
                self.hazard[j] |= mask
            self.hit[b.get('id')] = (cells, broken, t)
            self.newdrops = [(j, typ, born) for j, typ, born in self.newdrops if j not in cells]
            for j in broken:
                typ = drop_type(obs['seed'], obs['round'], j % self.W, j // self.W)
                if typ:
                    self.newdrops.append((j, typ, t))
        for t in range(1, horizon + 1):
            for b in bombs:
                if not b['done'] and b['born'] < t and b['end'] <= t:
                    explode(b, t)
        for b in bombs:
            i = b['y'] * self.W + b['x']
            end = min(horizon + 1, b['end'])
            if end > b['born']:
                self.block[i] |= ((1 << (end-b['born']))-1) << b['born']
        self.drops = []
        for d in obs['drops']:
            j = d['y'] * self.W + d['x']
            self.drops.append((j, d['type'], 0))
        self.drops += self.newdrops

    def alive(self, i, a, b):
        if b < a:
            return True
        return not (self.hazard[i] & (((1 << (b-a+1))-1) << a))


class Planner:
    def __init__(self, fc, speed):
        self.fc, self.d = fc, duration(speed)
        H, N, d = fc.H, fc.N, self.d
        self.ok = [bytearray(N) for _ in range(H+1)]
        self.viable = [bytearray(N) for _ in range(H+1)]
        for t in range(H):
            mask = ((1 << min(d, H-t))-1) << (t+1)
            bit = 1 << (t+1)
            row = self.ok[t]
            for i in range(N):
                if fc.clear[i] <= t+1 and not (fc.block[i] & bit) and not (fc.hazard[i] & mask):
                    row[i] = 1
        for i in range(N):
            if fc.clear[i] <= H and not (fc.hazard[i] >> H & 1):
                self.viable[H][i] = 1
        for t in range(H-1, -1, -1):
            now, nxt = self.viable[t], self.viable[t+1]
            dest = self.viable[min(H, t+d)]
            ok = self.ok[t]
            bit = 1 << (t+1)
            for i in range(N):
                if fc.clear[i] > t or fc.hazard[i] >> t & 1:
                    continue
                if nxt[i] and not (fc.hazard[i] & bit):
                    now[i] = 1
                else:
                    for j, _ in fc.neighbors[i]:
                        if ok[j] and dest[j]:
                            now[i] = 1
                            break

    def search(self, start, t0, limit=45):
        fc, d = self.fc, self.d
        N = fc.N
        parents = {t0*N+start: None}
        buckets = [[] for _ in range(limit+1)]
        if t0 > limit:
            return parents, []
        buckets[t0].append(start)
        nodes = []
        for t in range(t0, limit+1):
            for i in buckets[t]:
                key = t*N+i
                nodes.append((i,t,key))
                if t < limit and self.viable[t+1][i] and fc.alive(i,t+1,t+1):
                    k = (t+1)*N+i
                    if k not in parents:
                        parents[k] = (key,'N',1)
                        buckets[t+1].append(i)
                tt = t+d
                if tt > limit:
                    continue
                ok, viable = self.ok[t], self.viable[tt]
                for j, name in fc.neighbors[i]:
                    k = tt*N+j
                    if k not in parents and ok[j] and viable[j]:
                        parents[k] = (key,name,d)
                        buckets[tt].append(j)
        return parents, nodes

    def path(self, parents, key):
        rev = []
        while parents[key] is not None:
            prev, name, n = parents[key]
            rev.append([name] + ['N']*(n-1))
            key = prev
        return [v for block in reversed(rev) for v in block]

    def escape(self, start, t0, until, potential=None):
        fc, d = self.fc, self.d
        i, t = start, t0
        out = []
        while t < until:
            choices = []
            if self.viable[min(fc.H,t+1)][i] and fc.alive(i,t+1,t+1):
                choices.append((i,'N',1))
            for j, name in fc.neighbors[i]:
                if self.ok[t][j] and self.viable[min(fc.H,t+d)][j]:
                    choices.append((j,name,d))
            if not choices:
                out += ['N']*(until-t)
                break
            def score(c):
                j, name, n = c
                # Prefer a refuge with no upcoming flame and several exits.
                hazard = (fc.hazard[j] >> (t+1))
                danger = 0 if not hazard else 6/(1+(hazard & -hazard).bit_length())
                value = (potential[j] if potential else 0)
                return value - danger + .035*len(fc.neighbors[j]) - (.015 if name != 'N' else 0)
            j, name, n = max(choices, key=score)
            out.extend([name]+['N']*(n-1))
            i, t = j, t+n
        return out[:until-t0]


class Agent:
    def __init__(self):
        self.prev = None
        self.last = None
        self.memory = {}

    def itemvalue(self, typ, f):
        if typ == 'speed':
            return [22,20,14,0][min(3,f['speed'])]
        if typ == 'bomb':
            return [0,18,13,9,5,3,0][min(6,f['bombs'])]
        return [0,19,17,13,10,6,0][min(6,f['blast'])]

    def cooldown(self, obs, f):
        # Use the previous exact interpolation, not only a rounded pixel value:
        # at base speed 0.9999999999999999 is still one frame from ready.
        if self.prev and self.prev['round'] == obs['round'] and self.prev['tick'] == obs['tick']:
            pred = self.prev
            if pred['x'] == f['x'] and pred['y'] == f['y']:
                progress = pred.get('progress',1)
                n = 0
                while progress < 1:
                    n += 1
                    progress = min(1,progress+1/max(3,6-f['speed']))
                return n
        dist = abs(f['px']-f['x'])+abs(f['py']-f['y'])
        if dist < .005:
            return 0
        p = round((1-dist)*max(3,6-f['speed']))/max(3,6-f['speed'])
        n = 0
        while p < 1:
            n += 1
            p = min(1,p+1/max(3,6-f['speed']))
        return n

    def static_values(self, obs, fc, f, enemy):
        N, W = fc.N, fc.W
        ex, ey = enemy['x'], enemy['y']
        # Wall-weighted distance supplies direction even before a passage is open.
        distances = [1e9]*N
        ei = ey*W+ex
        distances[ei] = 0
        heap = [(0,ei)]
        while heap:
            cost, i = heapq.heappop(heap)
            if cost != distances[i]:
                continue
            for j, _ in fc.neighbors[i]:
                nc = cost + (6 if obs['map']['tiles'][j] == 2 else 1)
                if nc < distances[j]:
                    distances[j] = nc
                    heapq.heappush(heap,(nc,j))
        values = [0.0]*N
        wall_scores = [0.0]*N
        attack_scores = [0.0]*N
        for i in range(N):
            if obs['map']['tiles'][i] == 1:
                continue
            x,y = i%W,i//W
            walls, attack = 0.,0.
            for _,dx,dy in DIRS:
                for r in range(1,f['blast']+1):
                    xx,yy=x+dx*r,y+dy*r
                    if not (0<=xx<W and 0<=yy<N//W):
                        break
                    j=yy*W+xx
                    tile=obs['map']['tiles'][j]
                    if tile == 1:
                        break
                    if tile == 2:
                        typ=drop_type(obs['seed'],obs['round'],xx,yy)
                        bonus=self.itemvalue(typ,f)*.7 if typ else 0
                        # Prefer opening towards the opponent, not farming the back corner forever.
                        forward=max(-2,min(3,(distances[i]-distances[j])))
                        walls += 4.5 + bonus + .6*forward
                        break
                    if xx==ex and yy==ey:
                        attack += 9 + 1.5*f['blast']
                    elif abs(xx-ex)+abs(yy-ey)==1:
                        attack += 1.5
            sep=abs(x-ex)+abs(y-ey)
            if sep <= 2:
                attack += 3
            farm_scale = 1 if f['speed']<2 or f['blast']<3 or f['bombs']<3 else .65
            if obs.get('timeLeft',150)<55:
                farm_scale *= .5
            wall_scores[i]=walls*farm_scale
            attack_scores[i]=attack
            values[i]=walls*farm_scale + attack
        return values, wall_scores, attack_scores, distances

    def enemy_risk(self, obs, fc, enemy):
        # During our blind one-second window, an opponent can extend an existing
        # fire line by planting a bomb. Treat such reachable chain extensions as
        # hazards, rather than assuming that all currently empty cells stay empty.
        W, N = fc.W, fc.N
        start = enemy['y']*W+enemy['x']
        d = duration(enemy['speed'])
        cd = self.cooldown(obs, enemy) if enemy['owner']==obs['yourPlayer'] else 0
        earliest = {start: cd+1}
        queue = deque([start])
        while queue:
            i = queue.popleft()
            t = earliest[i]
            if t+d > 19:
                continue
            for j, _ in fc.neighbors[i]:
                if obs['map']['tiles'][j] == 0 and not (fc.block[j] >> t & 1) and j not in earliest:
                    earliest[j] = t+d
                    queue.append(j)
        original = fc.hazard[:]
        extras = [dict(b) for b in fc.bombs if b['born'] > 0]
        for i, born in earliest.items():
            times = original[i] >> (born+1)
            if not times:
                continue
            t = born+1+(times & -times).bit_length()-1
            if t > 40:
                continue
            bomb = {'id':'enemy-risk','owner':enemy['owner'],'x':i%W,'y':i//W,
                    'blast':enemy['blast'],'born':born,'fuse':40}
            risk = Forecast(obs,extras+[bomb],fc.H)
            # Simulate the complete recursive explosion: a new bomb can remove
            # a wall before the parent ray reaches it, exposing distant bombs.
            for j in range(N):
                fc.hazard[j] |= risk.hazard[j]

    def decide(self, obs):
        owner=obs['yourPlayer']
        f=obs['fighters'][owner]
        enemies=[e for e in obs['fighters'] if e['owner']!=owner and e['alive']]
        if not f['alive'] or not enemies or obs['status']!='playing':
            return {'inputs':[{'dir':'N','btn':None} for _ in range(20)]}
        enemy=enemies[0]
        fc=Forecast(obs)
        natural=fc.hazard[:]
        self.enemy_risk(obs,fc,enemy)
        plan=Planner(fc,f['speed'])
        W,N=fc.W,fc.N
        start=f['y']*W+f['x']
        cd=self.cooldown(obs,f)
        if not plan.viable[min(cd,fc.H)][start]:
            fc.hazard=natural
            plan=Planner(fc,f['speed'])
        t0=cd
        parents,nodes=plan.search(start,t0,45)
        values,walls,attacks,dist=self.static_values(obs,fc,f,enemy)
        capacity=f['activeBombs']<f['bombs']
        drop_at={}
        for j,typ,born in fc.drops:
            drop_at[j]=(typ,born)
        # Candidate sites at their earliest useful, safe arrival.
        candidates=[]
        seen=set()
        for i,t,key in nodes:
            if not plan.viable[t][i]:
                continue
            if i in drop_at:
                typ,born=drop_at[i]
                future=fc.hazard[i] >> max(t,born)
                if t>=born and not (fc.hazard[i] >> t & 1):
                    # A pickup needs one idle frame after arrival; future fire is fine if we leave.
                    gain=self.itemvalue(typ,f)
                    if gain>0 and fc.alive(i,t+1,t+1):
                        candidates.append((gain/(t+7), 'drop',i,t,key))
            if i in seen or t>35:
                continue
            # Avoid considering a bomb on top of another bomb, including during cooldown.
            if fc.block[i] >> (t+1) & 1:
                continue
            seen.add(i)
            if capacity and values[i] > 1:
                score=values[i]/(t+19)
                # Threatening an enemy later than two seconds is less reliable.
                score -= attacks[i]*.35/(t+19) if t>12 else 0
                candidates.append((score,'bomb',i,t,key))
        candidates.sort(reverse=True)
        chosen=None
        checked=0
        for score,kind,i,t,key in candidates:
            if chosen and score<chosen[0]:
                break
            if kind=='drop':
                # Arrival is not pickup: pickup occurs on the next ready frame.
                # Replan immediately with the faster movement increment after a
                # speed item, otherwise old seven-frame timing can miss turns.
                speed=f['speed']
                typ,born=drop_at[i]
                if typ=='speed':
                    speed=min(3,speed+1)
                pickup_plan=Planner(fc,speed)
                if not pickup_plan.viable[min(fc.H,t+1)][i]:
                    continue
                chosen=(score,kind,i,t,key,pickup_plan,fc)
                continue
            if checked>=10:
                continue
            checked+=1
            born=t+1
            bomb={'id':'candidate','owner':owner,'x':i%W,'y':i//W,'blast':f['blast'],'born':born,'fuse':40}
            ff=Forecast(obs,[bomb])
            self.enemy_risk(obs,ff,enemy)
            pp=Planner(ff,f['speed'])
            # Existing path must still survive any accelerated chain reaction.
            path=plan.path(parents,key)
            valid=pp.viable[born][i] and ff.alive(i,t,born)
            if valid:
                idx=start
                tt=t0
                for name in path:
                    tt+=1
                    if name!='N':
                        dx,dy=next((dx,dy) for nm,dx,dy in DIRS if nm==name)
                        idx+=dx+dy*W
                    if not ff.alive(idx,tt,tt):
                        valid=False
                        break
            if not valid:
                continue
            # A bomb with no marginal wall destruction and no pressure is wasteful.
            cells,broken,boom=ff.hit.get('candidate',([],[],80))
            marginal=[j for j in broken if fc.clear[j]>boom]
            actual=walls[i] if marginal else 0
            if broken:
                actual*=len(marginal)/len(broken)
            actual+=attacks[i]
            score=actual/(t+19)
            if score<.045:
                continue
            if chosen is None or score>chosen[0]:
                chosen=(score,kind,i,t,key,pp,ff)
        note=''
        out=['N']*cd
        bombs=set()
        if chosen:
            score,kind,i,t,key,pp,ff=chosen
            path=plan.path(parents,key)
            out+=path
            if kind=='bomb':
                # Only commit within this window, and always leave the button released at its end.
                if t<18:
                    bombs.add(t)
                    out.append('N')
                    # Head towards useful ground while respecting the full escape horizon.
                    potential=[-.012*min(100,d) for d in dist]
                    for j,typ,born in ff.drops:
                        gain=self.itemvalue(typ,f)
                        for k in range(N):
                            dd=abs(k%W-j%W)+abs(k//W-j//W)
                            potential[k]+=gain*.012/(dd+2)
                    out+=pp.escape(i,t+1,20,potential)
                    note='安全放弹撤离'
                else:
                    if t<20:
                        out+=plan.escape(i,t,20,[-.012*min(100,d) for d in dist])
                    note='前往炸墙/进攻点'
            else:
                out.append('N')
                out+=pp.escape(i,t+1,20,[-.01*min(100,d) for d in dist]) if t+1<20 else []
                note='拾取道具'
        if not chosen:
            # No useful bomb or item: close distance using the safest reachable state.
            opts=[]
            for i,t,key in nodes:
                if t<4 or not plan.viable[t][i]:
                    continue
                improvement=dist[start]-dist[i]
                val=improvement/(t+5)
                # Stay out of an enemy's immediate flame corridor if not attacking.
                opts.append((val,-dist[i],-t,key,i,t))
            if opts:
                _,_,_,key,i,t=max(opts)
                out+=plan.path(parents,key)
                if t<20:
                    out+=plan.escape(i,t,20,[-.015*min(100,d) for d in dist])
            else:
                out+=plan.escape(start,t0,20)
            note='避火接近'
        if len(out)<20:
            # All paths above are extended with certified safe moves, not blind neutral padding.
            out+=['N']*(20-len(out))
        inputs=[{'dir':out[k],'btn':'BOMB' if k in bombs else None} for k in range(20)]
        inputs=self.shield(obs,inputs,cd,fc,enemy)
        self.predict(obs,inputs,cd)
        return {'inputs':inputs,'note':note}

    def shield(self,obs,inputs,cd,fc,enemy):
        f=obs['fighters'][obs['yourPlayer']]
        W=fc.W
        i=f['y']*W+f['x']
        speed=f['speed']
        progress=0.0 if cd else 1.0
        if cd:
            for _ in range(duration(speed)-cd):
                progress=min(1,progress+1/max(3,6-speed))
        extras=[]
        cache={}
        drops={j:(typ,born) for j,typ,born in fc.drops}
        out=[]
        for t,act in enumerate(inputs,1):
            act=dict(act)
            if progress<1:
                progress=min(1,progress+1/max(3,6-speed))
                act['btn']=None
                out.append(act)
                continue
            item=drops.get(i)
            if item and item[1]<=t:
                typ,_=drops.pop(i)
                if typ=='speed':
                    speed=min(3,speed+1)
            if speed not in cache:
                cache[speed]=Planner(fc,speed)
            pp=cache[speed]
            if act['btn']=='BOMB':
                b={'id':'shield','owner':f['owner'],'x':i%W,'y':i//W,'blast':f['blast'],'born':t,'fuse':40}
                ff=Forecast(obs,extras+[b])
                self.enemy_risk(obs,ff,enemy)
                bp=Planner(ff,speed)
                if bp.viable[t][i] and ff.alive(i,t,t):
                    extras.append(b)
                    fc,pp=ff,bp
                    cache={speed:pp}
                else:
                    act['btn']=None
            choices=[]
            if pp.viable[t][i] and fc.alive(i,t,t):
                choices.append(('N',i))
            for j,name in fc.neighbors[i]:
                if pp.ok[t-1][j] and pp.viable[min(fc.H,t-1+pp.d)][j]:
                    choices.append((name,j))
            matching=[v for v in choices if v[0]==act['dir']]
            if matching:
                name,j=matching[0]
            elif choices:
                def rating(v):
                    name,j=v
                    h=fc.hazard[j]>>t
                    return (0 if not h else -10/(1+(h & -h).bit_length()))+.01*len(fc.neighbors[j])
                name,j=max(choices,key=rating)
            else:
                name,j=act['dir'],i
            act['dir']=name
            if name!='N' and j!=i:
                i=j
                progress=1/max(3,6-speed)
            out.append(act)
        return out

    def predict(self,obs,inputs,cd):
        f=obs['fighters'][obs['yourPlayer']]
        x,y,speed=f['x'],f['y'],f['speed']
        progress=1.0
        if cd:
            # Recover the same binary floating-point progress as the engine.
            progress=0.0
            for _ in range(duration(speed)-cd):
                progress=min(1,progress+1/max(3,6-speed))
        fc=Forecast(obs)
        drops={(d['x'],d['y']):(d['type'],0) for d in obs['drops']}
        for j,typ,born in fc.newdrops:
            drops[(j%fc.W,j//fc.W)]=(typ,born)
        extra=set()
        for t,act in enumerate(inputs,1):
            if progress<1:
                progress=min(1,progress+1/max(3,6-speed))
                continue
            item=drops.get((x,y))
            if item and item[1]<=t:
                typ,_=drops.pop((x,y))
                if typ=='speed':
                    speed=min(3,speed+1)
            if act['btn']=='BOMB':
                extra.add((x,y))
            if act['dir']!='N':
                _,dx,dy=next(v for v in DIRS if v[0]==act['dir'])
                xx,yy=x+dx,y+dy
                if 0<=xx<fc.W and 0<=yy<fc.N//fc.W:
                    j=yy*fc.W+xx
                    if fc.clear[j]<=t and not (fc.block[j]>>t&1) and (xx,yy) not in extra:
                        x,y=xx,yy
                        progress=1/max(3,6-speed)
        p=progress
        cd=0
        while p<1:
            cd+=1
            p=min(1,p+1/max(3,6-speed))
        self.prev={'tick':obs['tick']+20,'round':obs['round'],'x':x,'y':y,'speed':speed,'cooldown':cd,'progress':progress}


if __name__=='__main__':
    agent=Agent()
    for line in sys.stdin:
        try:
            obs=json.loads(line)
            ans=agent.decide(obs)
            print(json.dumps(ans,separators=(',',':')),flush=True)
        except Exception:
            import traceback
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({'inputs':[{'dir':'N','btn':None} for _ in range(20)]}),flush=True)
