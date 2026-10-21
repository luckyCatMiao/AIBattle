import sys, json, math, heapq, traceback

DIR = {'N': (0.,0.), 'U': (0.,-1.), 'D': (0.,1.), 'L': (-1.,0.), 'R': (1.,0.), 'UL': (-2**-.5,-2**-.5), 'UR': (2**-.5,-2**-.5), 'DL': (-2**-.5,2**-.5), 'DR': (2**-.5,2**-.5)}
MOVES = list(DIR)

def aim(dx,dy):
    if abs(dx)+abs(dy)<1e-6: return 'U'
    return max(MOVES[1:], key=lambda k: dx*DIR[k][0]+dy*DIR[k][1])

class Agent:
    def __init__(self):
        self.key=None
        self.memory={}
        self.oldbullets={}
        self.last={}
        self.fields={}

    def wall(self,x,y):
        ix,iy=int(math.floor(x)),int(math.floor(y))
        return ix<0 or iy<0 or ix>=self.w or iy>=self.h or self.tiles[iy*self.w+ix]

    def clear(self,x,y,r=.30):
        for ty in range(int(y-r),int(y+r)+1):
            for tx in range(int(x-r),int(x+r)+1):
                if self.wall(tx+.5,ty+.5):
                    cx=max(tx,min(x,tx+1)); cy=max(ty,min(y,ty+1))
                    if (x-cx)**2+(y-cy)**2<r*r-1e-10: return False
        return True

    def move(self,x,y,k):
        dx,dy=DIR[k]; nx=x+dx*.15; ny=y+dy*.15
        if self.clear(nx,y): x=nx
        if self.clear(x,ny): y=ny
        return x,y

    def los(self,x,y,xx,yy):
        d=math.hypot(xx-x,yy-y); n=max(1,int(math.ceil(d/.18)))
        for i in range(1,n):
            if self.wall(x+(xx-x)*i/n,y+(yy-y)*i/n): return False
        return True

    def cell(self,x,y): return max(0,min(self.h-1,int(y)))*self.w+max(0,min(self.w-1,int(x)))

    def field(self,goals):
        key=tuple(sorted(set(goals)))
        if key in self.fields: return self.fields[key]
        d=[1e6]*(self.w*self.h); q=[]
        for p in key:
            if not self.tiles[p]: d[p]=0.; heapq.heappush(q,(0.,p))
        while q:
            v,p=heapq.heappop(q)
            if v!=d[p]: continue
            for t,c in self.neigh[p]:
                nv=v+c
                if nv<d[t]: d[t]=nv; heapq.heappush(q,(nv,t))
        if len(self.fields)>100: self.fields={}
        self.fields[key]=d
        return d

    def pointfield(self,x,y):
        p=self.cell(x,y)
        if self.tiles[p]:
            p=min(self.open,key=lambda t:(t%self.w+.5-x)**2+(t//self.w+.5-y)**2)
        return self.field([p])

    def steer(self,x,y,tx,ty):
        if math.hypot(tx-x,ty-y)<.10: return 'N'
        best=None
        for k in MOVES[1:]:
            xx,yy=self.move(x,y,k)
            score=(xx-tx)**2+(yy-ty)**2
            if math.hypot(xx-x,yy-y)<.07: score+=1.
            if best is None or score<best[0]: best=(score,k)
        return best[1]

    def route(self,x,y,field):
        p=self.cell(x,y)
        path=[]; seen=set()
        for _ in range(8):
            if p in seen: break
            seen.add(p); path.append(p)
            if field[p]<.01: break
            ns=self.neigh[p]
            if not ns: break
            p=min(ns,key=lambda a:field[a[0]]+a[1])[0]
        # Straight-line steering through the next few tile centers.
        target=path[0]
        for p in path[:5]:
            xx=p%self.w+.5; yy=p//self.w+.5
            dist=math.hypot(xx-x,yy-y)
            if dist>3.3: break
            steps=max(1,int(dist/.15)); ok=True
            for j in range(1,steps+1):
                if not self.clear(x+(xx-x)*j/steps,y+(yy-y)*j/steps): ok=False; break
            if ok: target=p
        return target%self.w+.5,target//self.w+.5

    def buy(self,o):
        out=[]
        for u in o['units']:
            money=u['money']; p={'unit':u['index']}; cur=u['weapon']
            # Armor doubles effective durability; prefer a complete SMG buy to a naked rifle.
            choice=None
            if cur in ('pistol','pdw','shotgun','smg'):
                if money>=3350: choice='rifle'
                elif cur in ('pistol','pdw','shotgun') and money>=1900: choice='smg'
                elif cur=='pistol' and money>=700: choice='pdw'
            if choice: p['weapon']=choice; money-=o['weapons'][choice]['cost']
            if money>=650 and u.get('armor',0)<75: p['armor']=True; money-=650
            if o['side']=='defend' and money>=400 and not u.get('kit'): p['kit']=True
            out.append(p)
        return {'buys':out}

    def setup(self,o):
        self.w=o['map']['width']; self.h=o['map']['height']; self.tiles=o['map']['tiles']
        self.open=[p for p,v in enumerate(self.tiles) if not v]
        self.neigh=[[] for _ in self.tiles]
        for p in self.open:
            x=p%self.w; y=p//self.w
            for dx,dy in [(1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)]:
                xx=x+dx; yy=y+dy
                if not (0<=xx<self.w and 0<=yy<self.h): continue
                t=yy*self.w+xx
                if self.tiles[t]: continue
                if dx and dy and (self.tiles[y*self.w+xx] or self.tiles[yy*self.w+x]): continue
                self.neigh[p].append((t,math.hypot(dx,dy)))
        self.fields={}; self.memory={}; self.oldbullets={}; self.last={}
        self.sitefields={}
        for k,s in o['map']['sites'].items():
            goals=[y*self.w+x for y in range(s['y1'],s['y2']+1) for x in range(s['x1'],s['x2']+1) if not self.tiles[y*self.w+x]]
            self.sitefields[k]=self.field(goals)
        u=o['units'][0]
        self.site=min(self.sitefields,key=lambda k:self.sitefields[k][self.cell(u['x'],u['y'])]+(.01 if k=='B' else 0))
        # Mirror the preferred site between rounds, preserving a five-player attack.
        if o['round']%3==2: self.site='B' if self.site=='A' else 'A'
        self.key=(o.get('id'),o['round'],o['yourTeam'])

    def act(self,o):
        key=(o.get('id'),o['round'],o['yourTeam'])
        if key!=self.key: self.setup(o)
        if o['phase']=='buy': return self.buy(o)
        if o['phase']!='live': return {'inputs':[[{'dir':'N','aim':'U'} for _ in range(5)] for _ in range(20)]}
        tick=o['tick']; team=o['yourTeam']; side=o['side']; bomb=o['bomb']; units=o['units']; alive=[u for u in units if u['alive']]
        sightings={}
        for es in o.get('visibleEnemies',{}).values():
            for e in es: sightings[e['id']]=e
        for eid,e in sightings.items():
            old=self.memory.get(eid); vx=vy=0.
            if old and tick>old['tick'] and tick-old['tick']<=40:
                vx=(e['x']-old['x'])/(tick-old['tick']); vy=(e['y']-old['y'])/(tick-old['tick'])
                sp=math.hypot(vx,vy)
                if sp>.151: vx*=.15/sp; vy*=.15/sp
            self.memory[eid]={**e,'tick':tick,'vx':vx,'vy':vy}
        enemies=[e for e in self.memory.values() if tick-e['tick']<=100]
        # Infer projectile velocity only from information in consecutive team observations.
        threats=[]
        for b in o.get('bullets',[]):
            if b['team']==team: continue
            prev=self.oldbullets.get(b['id']); vx=vy=None
            if prev and tick>prev[2]: vx=(b['x']-prev[0])/(tick-prev[2]); vy=(b['y']-prev[1])/(tick-prev[2])
            elif b['unit'] in self.memory:
                e=self.memory[b['unit']]; dx=b['x']-e['x']; dy=b['y']-e['y']; d=math.hypot(dx,dy)
                if d>.2:
                    sp=o['weapons'][b['weapon']]['speed']/20; vx=dx/d*sp; vy=dy/d*sp
            if vx is not None:
                traj=[]; x=b['x']; y=b['y']
                for f in range(20):
                    x+=vx; y+=vy
                    if self.wall(x,y): break
                    traj.append((x,y))
                threats.append((traj,o['weapons'][b['weapon']]['damage']))
        self.oldbullets={b['id']:(b['x'],b['y'],tick) for b in o.get('bullets',[])}
        retriever=None; defuser=None
        if alive and bomb['state']=='dropped' and 'x' in bomb:
            bf=self.pointfield(bomb['x'],bomb['y']); retriever=min(alive,key=lambda u:bf[self.cell(u['x'],u['y'])])['id']
        if alive and side=='defend' and bomb['state']=='planted':
            bf=self.pointfield(bomb['x'],bomb['y']); defuser=min(alive,key=lambda u:bf[self.cell(u['x'],u['y'])]+(0 if u.get('kit') else 4))['id']
        windows=[[None]*5 for _ in range(20)]
        for u in units:
            idx=u['index']; x=u['x']; y=u['y']; stationary=False; guard=None
            if not u['alive']:
                for f in range(20): windows[f][idx]={'dir':'N','aim':'U'}
                continue
            carrier=bomb.get('carrier')==u['id']
            if side=='attack':
                field=self.sitefields[self.site]
                if bomb['state']=='dropped' and u['id']==retriever: field=bf
                elif bomb['state']=='planted':
                    # Cover the planted bomb rather than chase defenders out of the site.
                    bx,by=bomb['x'],bomb['y']; offsets=[(-2,0),(2,0),(0,2),(-3,2),(3,2)]
                    ox,oy=offsets[idx]; field=self.pointfield(bx+ox,by+oy); guard=(28.,7.5)
                if carrier:
                    for s in o['map']['sites'].values():
                        if s['x1']<=int(x)<=s['x2'] and s['y1']<=int(y)<=s['y2']: stationary=True
            else:
                if bomb['state']=='planted':
                    field=bf; guard=(bomb['x'],bomb['y'])
                    if u['id']==defuser and math.hypot(x-bomb['x'],y-bomb['y'])<.88: stationary=True
                else:
                    # Two site anchors and a three-player central crossfire.
                    pos=[(12.5,10.5),(25.5,12.5),(28.5,11.5),(30.5,12.5),(43.5,10.5)][idx]
                    recent=[e for e in enemies if tick-e['tick']<=60]
                    if recent:
                        e=min(recent,key=lambda e:math.hypot(x-e['x'],y-e['y']))
                        if idx in (1,2,3) or math.hypot(x-e['x'],y-e['y'])<15: pos=(e['x'],e['y'])
                    field=self.pointfield(*pos); guard=(pos[0],30.)
            tx,ty=self.route(x,y,field)
            nav=aim(tx-x,ty-y) if math.hypot(tx-x,ty-y)>.16 else 'N'
            relevant=[]
            for e in enemies:
                age=tick-e['tick']; ex=e['x']+e['vx']*min(age,10); ey=e['y']+e['vy']*min(age,10)
                dist=math.hypot(ex-x,ey-y)
                if dist<o['weapons'][u['weapon']]['range']+2 and self.los(x,y,ex,ey): relevant.append((e,ex,ey,dist))
            relevant.sort(key=lambda a:a[3]); combat=bool(relevant and relevant[0][3]<18)
            if combat:
                e,ex,ey,dist=relevant[0]
                if not stationary:
                    candidates=[]
                    for k in MOVES:
                        px,py=x,y; pts=[]
                        for f in range(20): px,py=self.move(px,py,k); pts.append((px,py))
                        moved=math.hypot(px-x,py-y)
                        score=0.
                        # Maintain lateral motion: bullets are aimed at current, not leading positions.
                        dx=ex-x; dy=ey-y; dd=max(.1,dist)
                        lateral=abs((px-x)*dy-(py-y)*dx)/dd
                        score+=lateral*2.3
                        if k==self.last.get(u['id']): score+=.7
                        if moved<1 and k!='N': score-=5
                        enddist=math.hypot(px-ex,py-ey)
                        preferred=6.5 if u['weapon']!='shotgun' else 3.
                        score-=max(0,preferred-enddist)*.7
                        if dist>10: score+=(dist-enddist)*.5
                        # Stay responsive to the objective while fighting.
                        score+=(field[self.cell(x,y)]-field[self.cell(px,py)])*(.65 if side=='attack' or bomb['state']=='planted' else .20)
                        if not self.los(px,py,ex,ey): score-=1.8 if u['hp']>35 else -.5
                        for traj,damage in threats:
                            mind=100.
                            for f,(bx,by) in enumerate(traj):
                                ux,uy=pts[f]; ds=(ux-bx)**2+(uy-by)**2
                                if ds<mind: mind=ds
                            if mind<1.: score-=damage*.22*math.exp(-mind/.23)
                        candidates.append((score,k))
                    nav=max(candidates)[1]
            elif not stationary and threats:
                # A known projectile can also be dangerous after its shooter leaves sight.
                pass
            if stationary: nav='N'
            px,py=x,y
            for f in range(20):
                if not combat and not stationary:
                    if f%4==0: tx,ty=self.route(px,py,field)
                    nav=self.steer(px,py,tx,ty)
                    if side=='defend' and bomb['state']=='planted' and u['id']==defuser and math.hypot(px-bomb['x'],py-bomb['y'])<.82: nav='N'
                    if carrier:
                        if any(s['x1']<=int(px)<=s['x2'] and s['y1']<=int(py)<=s['y2'] for s in o['map']['sites'].values()): nav='N'; stationary=True
                px,py=self.move(px,py,nav)
                if relevant:
                    e,ex,ey,_=min(relevant,key=lambda a:(a[1]-px)**2+(a[2]-py)**2)
                    ax=ex+e['vx']*min(f,10); ay=ey+e['vy']*min(f,10)
                    facing=aim(ax-px,ay-py)
                elif guard and math.hypot(tx-px,ty-py)<3:
                    facing=aim(guard[0]-px,guard[1]-py)
                else:
                    facing=aim(tx-px,ty-py)
                    if nav=='N': facing='D' if side=='defend' else 'R' if self.site=='A' else 'L'
                    # Briefly check side lanes without giving up forward coverage for a full second.
                    if idx in (0,4) and f>=15 and (o['frame']//20)%3==1:
                        facing='R' if idx==0 else 'L'
                windows[f][idx]={'dir':nav,'aim':facing}
            self.last[u['id']]=nav
        return {'inputs':windows}

if __name__=='__main__':
    agent=Agent()
    for line in sys.stdin:
        try:
            obs=json.loads(line); result=agent.act(obs)
            print(json.dumps(result,separators=(',',':')),flush=True)
        except Exception:
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({'inputs':[[{'dir':'N','aim':'U'} for _ in range(5)] for _ in range(20)]}),flush=True)
