import sys, json, math, heapq, time

DIR = {'N':(0.,0.),'U':(0.,-1.),'D':(0.,1.),'L':(-1.,0.),'R':(1.,0.),'UL':(-2**-.5,-2**-.5),'UR':(2**-.5,-2**-.5),'DL':(-2**-.5,2**-.5),'DR':(2**-.5,2**-.5)}
MOVES = list(DIR)
def aim(dx,dy):
    if abs(dx)+abs(dy)<1e-8: return 'U'
    return ['R','DR','D','DL','L','UL','U','UR'][int(math.floor(math.atan2(dy,dx)/(math.pi/4)+.5))%8]
def d2(a,b): return (a[0]-b[0])**2+(a[1]-b[1])**2

class Agent:
    def __init__(self, style='main'):
        self.style=style; self.key=None; self.round=None; self.fields={}; self.memory={}; self.oldbullets={}; self.last={}; self.elapsed=0
    def setup(self,o):
        key=(o.get('seed'),o['map']['width'],tuple(o['map']['tiles']))
        if key!=self.key:
            self.key=key; self.w=o['map']['width']; self.h=o['map']['height']; self.tiles=o['map']['tiles']; self.fields={}; self.neighbors={}
            for y in range(1,self.h-1):
                for x in range(1,self.w-1):
                    p=y*self.w+x
                    if self.tiles[p]: continue
                    ns=[]
                    for name,(dx,dy) in DIR.items():
                        if name=='N': continue
                        ax=round(dx); ay=round(dy); q=p+ax+ay*self.w
                        if self.tiles[q]: continue
                        if ax and ay and (self.tiles[p+ax] or self.tiles[p+ay*self.w]): continue
                        ns.append((q,1.41421356237 if ax and ay else 1.))
                    self.neighbors[p]=ns
        if self.round!=o['round'] or (o.get('frame',0)<self.elapsed):
            self.round=o['round']; self.memory={}; self.oldbullets={}; self.last={}; self.elapsed=0
            self.site='A' if (o.get('seed',1)+o['round'])%2==0 else 'B'
            self.contact=None
        self.o=o; self.team=o.get('yourTeam',o.get('yourPlayer',0)); self.side=o.get('side',o['sides'][str(self.team)])
    def wall(self,x,y):
        ix=int(math.floor(x)); iy=int(math.floor(y))
        return ix<0 or iy<0 or ix>=self.w or iy>=self.h or self.tiles[iy*self.w+ix]!=0
    def hits(self,x,y,r=.301):
        for iy in range(math.floor(y-r),math.floor(y+r)+1):
            for ix in range(math.floor(x-r),math.floor(x+r)+1):
                if ix<0 or iy<0 or ix>=self.w or iy>=self.h: return True
                if self.tiles[iy*self.w+ix] and (x-max(ix,min(x,ix+1)))**2+(y-max(iy,min(y,iy+1)))**2<r*r: return True
        return False
    def move(self,x,y,name):
        dx,dy=DIR[name]; nx=x+dx*.15; ny=y+dy*.15
        if not self.hits(nx,y): x=nx
        if not self.hits(x,ny): y=ny
        return x,y
    def los(self,x,y,xx,yy,r=0):
        n=max(1,math.ceil(math.hypot(xx-x,yy-y)/.18))
        for i in range(1,n+1):
            t=i/n; px=x+(xx-x)*t; py=y+(yy-y)*t
            if self.hits(px,py,r) if r else self.wall(px,py): return False
        return True
    def cell(self,p):
        x=max(1,min(self.w-2,int(p[0]))); y=max(1,min(self.h-2,int(p[1]))); q=y*self.w+x
        if q in self.neighbors: return q
        return min(self.neighbors,key=lambda v:(v%self.w+.5-p[0])**2+(v//self.w+.5-p[1])**2)
    def field(self,goal):
        q=self.cell(goal)
        if q in self.fields: return self.fields[q]
        dist={q:0.}; hp=[(0.,q)]
        while hp:
            d,p=heapq.heappop(hp)
            if d!=dist[p]: continue
            for n,c in self.neighbors[p]:
                z=d+c
                if z<dist.get(n,1e9): dist[n]=z; heapq.heappush(hp,(z,n))
        if len(self.fields)>200: self.fields={}
        self.fields[q]=dist
        return dist
    def route(self,p,goal):
        f=self.field(goal); q=self.cell(p); path=[]
        for _ in range(12):
            if f.get(q,1e8)<.1: break
            ns=self.neighbors.get(q,[])
            if not ns: break
            n=min(ns,key=lambda t:t[1]+f.get(t[0],1e9))[0]
            if f.get(n,1e9)>=f.get(q,1e9): break
            q=n; path.append((q%self.w+.5,q//self.w+.5))
        target=(q%self.w+.5,q//self.w+.5)
        for pt in reversed(path):
            if self.los(*p,*pt,.315): return pt
        return path[0] if path else goal
    def buy(self,o):
        buys=[]
        costs={'pistol':0,'pdw':700,'smg':1250,'shotgun':1000,'rifle':2700,'sniper':4750,'lmg':4000}
        for u in o['units']:
            m=u['money']; b={'unit':u['index']}; cur=u['weapon']
            # At eight tiles, volume and armour are more reliable than slow sniper shots.
            if m==800 and cur=='pistol':
                b['armor']=True; buys.append(b); continue
            if cur=='pistol' or cur in ('pdw','shotgun'):
                choices=['rifle','smg','pdw']
                for gun in choices:
                    if m>=costs[gun]+(650 if gun in ('rifle','smg') and u['armor']<50 else 0) and costs[gun]>costs[cur]:
                        b['weapon']=gun; m-=costs[gun]; break
            elif cur=='smg' and m>=3350:
                b['weapon']='rifle'; m-=2700
            if u['armor']<65 and m>=650: b['armor']=True; m-=650
            if self.side=='defend' and not u['kit'] and m>=400: b['kit']=True
            buys.append(b)
        return {'buys':buys}
    def observe(self,o):
        now=o.get('frame',0)/20; self.now=now
        seen={}
        for es in o.get('visibleEnemies',{}).values():
            for e in es: seen[e['id']]=e
        for eid,e in seen.items():
            old=self.memory.get(eid); vx=vy=0.
            if old and now>old['t'] and now-old['t']<=2:
                vx=(e['x']-old['x'])/(now-old['t']); vy=(e['y']-old['y'])/(now-old['t']); speed=math.hypot(vx,vy)
                if speed>3: vx*=3/speed; vy*=3/speed
            self.memory[eid]={**e,'t':now,'vx':vx,'vy':vy}
        self.enemies=[e for e in self.memory.values() if now-e['t']<5]
        if seen:
            self.contact=(sum(e['x'] for e in seen.values())/len(seen),sum(e['y'] for e in seen.values())/len(seen),now)
        self.projectiles=[]
        for b in o.get('bullets',[]):
            if b['team']==self.team: continue
            vx=vy=None
            old=self.oldbullets.get(b['id'])
            if old and now>old[2]: vx=(b['x']-old[0])/(now-old[2]); vy=(b['y']-old[1])/(now-old[2])
            else:
                e=self.memory.get(b['unit'])
                if e:
                    dx=b['x']-e['x']; dy=b['y']-e['y']; dd=math.hypot(dx,dy)
                    if dd>.3:
                        speed=o['weapons'][b['weapon']]['speed']; vx=dx/dd*speed; vy=dy/dd*speed
            if vx is not None: self.projectiles.append((b['x'],b['y'],vx,vy,o['weapons'][b['weapon']]['damage']))
        self.oldbullets={b['id']:(b['x'],b['y'],now) for b in o.get('bullets',[]) if b['team']!=self.team}
    def goals(self,o):
        us=o['units']; alive=[u for u in us if u['alive']]; b=o['bomb']; goals={}; holds={}
        sites=o['map']['sites']; chosen=sites[self.site]; center=((chosen['x1']+chosen['x2']+1)/2,(chosen['y1']+chosen['y2']+1)/2)
        if self.side=='attack':
            carrier=next((u for u in alive if u['id']==b.get('carrier')),None)
            if b['state']=='dropped':
                pick=min(alive,key=lambda u:self.field((b['x'],b['y'])).get(self.cell((u['x'],u['y'])),1e9)) if alive else None
                for u in alive: goals[u['index']]=(b['x'],b['y']) if u==pick else (b['x']+(u['index']%3-1)*1.2,b['y']-1.5)
            elif b['state']=='planted':
                for u in alive:
                    # Keep a crossfire close enough to contest a defuse.
                    offsets=[(-2.5,1.5),(2.5,1.5),(-1.5,-2.5),(1.5,-2.5),(0,3.5)]
                    dx,dy=offsets[u['index']]; desired=(b['x']+dx,b['y']+dy)
                    options=[]
                    for cy in range(max(1,int(b['y'])-4),min(self.h-1,int(b['y'])+5)):
                        for cx in range(max(1,int(b['x'])-4),min(self.w-1,int(b['x'])+5)):
                            if cy*self.w+cx not in self.neighbors: continue
                            pt=(cx+.5,cy+.5); dd=d2(pt,(b['x'],b['y']))
                            if 2<dd<16 and self.los(*pt,b['x'],b['y']): options.append(pt)
                    goals[u['index']]=min(options,key=lambda pt:d2(pt,desired)) if options else (b['x'],b['y'])
                    holds[u['index']]=True
            else:
                for u in alive:
                    i=u['index']; off=[(0,0),(-1.5,-1),(1.5,-1),(-2,1),(2,1)][i]
                    goals[i]=(center[0]+off[0],center[1]+off[1])
                    if u==carrier:
                        s=next((s for s in sites.values() if s['x1']<=int(u['x'])<=s['x2'] and s['y1']<=int(u['y'])<=s['y2']),None)
                        if s: goals[i]=(u['x'],u['y']); holds[i]='plant'
        else:
            if b['state']=='planted':
                pick=min(alive,key=lambda u:self.field((b['x'],b['y'])).get(self.cell((u['x'],u['y'])),1e9)+(0 if u['kit'] else 3)) if alive else None
                for u in alive:
                    goals[u['index']]=(b['x'],b['y'])
                    if d2((u['x'],u['y']),(b['x'],b['y']))<.88 and (u==pick or b.get('defuseProgress',0)>0): holds[u['index']]='defuse'
            elif self.contact and self.now-self.contact[2]<7:
                for u in alive: goals[u['index']]=self.contact[:2]
            else:
                for u in alive:
                    i=u['index']
                    if self.style=='rush': goals[i]=(27.5+(i-2)*.8,21.5)
                    else:
                        pts=[(23.5,7.5),(25.5,7.5),(28.5,7.5),(30.5,7.5),(32.5,7.5)]
                        goals[i]=pts[i]; holds[i]=True
        return goals,holds
    def combat_move(self,u,p,goal,t,idx,lastdir):
        nearby=[]
        for e in self.enemies:
            age=self.now-e['t']; ex=e['x']+e['vx']*min(t, .5); ey=e['y']+e['vy']*min(t,.5)
            if self.wall(ex,ey): ex=e['x']; ey=e['y']
            distance=math.hypot(ex-p[0],ey-p[1])
            if distance<10 and age<2.1 and self.los(*p,ex,ey): nearby.append((e,ex,ey,distance))
        if not nearby: return None
        target=min(nearby,key=lambda e:e[3]); _,ex,ey,ed=target
        route=self.route(p,goal)
        best=-1e30; chosen='N'
        for name in MOVES:
            x,y=p; risk=0; moved=0
            for k in range(8):
                xx,yy=self.move(x,y,name); moved+=math.hypot(xx-x,yy-y); x,y=xx,yy
                tt=(k+1)*.05
                for bx,by,vx,vy,dmg in self.projectiles:
                    bd=(x-bx-vx*(t+tt))**2+(y-by-vy*(t+tt))**2
                    if bd<.8: risk+=dmg*math.exp(-bd/.14)*.12
            # Continuous lateral motion defeats auto-aim's unled projectiles.
            score=0
            for e,ax,ay,dist in nearby:
                rx=p[0]-ax; ry=p[1]-ay; nd=math.hypot(x-ax,y-ay)
                lateral=abs((x-p[0])*ry-(y-p[1])*rx)/max(.5,dist)
                forward=((x-p[0])*rx+(y-p[1])*ry)/max(.5,dist)
                score+=3.8*min(lateral,1.0)/(1+.35*(len(nearby)-1))
                if nd<1.3: score-=(1.3-nd)*3
                if dist>3.2: score+=(dist-nd)*.65
                if dist<2.6: score+=(nd-dist)*.7
                if not self.los(x,y,ax,ay): score-=.8 if not u['reloading'] else -1.5
            score-=risk*.6
            score+=(math.hypot(p[0]-route[0],p[1]-route[1])-math.hypot(x-route[0],y-route[1]))*.8
            if name==lastdir: score+=.16
            if moved<.55 and name!='N': score-=2
            if name=='N': score-=1
            # Different squad members sidestep in different directions.
            score+=.025*math.sin((idx+1)*17+MOVES.index(name)*4)
            if score>best: best=score; chosen=name
        return chosen
    def live(self,o):
        self.observe(o); goals,holds=self.goals(o)
        inputs=[[{'dir':'N','aim':'N'} for _ in range(5)] for _ in range(20)]
        for u in o['units']:
            if not u['alive']: continue
            i=u['index']; p=(u['x'],u['y']); rawgoal=goals.get(i,p); q=self.cell(rawgoal); goal=(q%self.w+.5,q//self.w+.5)
            if holds.get(i) in ('plant','defuse'): goal=p
            lastdir=self.last.get(i,'N'); route=self.route(p,goal); combat=None
            for f in range(20):
                t=f*.05
                if f%5==0:
                    combat=None if holds.get(i) in ('plant','defuse') else self.combat_move(u,p,goal,t,i,lastdir)
                    route=self.route(p,goal)
                if holds.get(i) in ('plant','defuse'): dr='N'
                elif combat is not None: dr=combat
                elif d2(p,goal)<.07: dr='N'
                else:
                    best=1e9; dr='N'
                    for name in MOVES[1:]:
                        np=self.move(*p,name); cost=d2(np,route)
                        if d2(np,p)<.005: cost+=10
                        if cost<best: best=cost; dr=name
                p=self.move(*p,dr); lastdir=dr
                candidates=[]
                for e in self.enemies:
                    if self.now-e['t']>3: continue
                    ex=e['x']+e['vx']*min(t,.4); ey=e['y']+e['vy']*min(t,.4)
                    if self.wall(ex,ey): ex=e['x'];ey=e['y']
                    dd=d2(p,(ex,ey))
                    if dd<24**2 and self.los(*p,ex,ey): candidates.append((dd,ex,ey))
                if candidates:
                    _,ex,ey=min(candidates); am=aim(ex-p[0],ey-p[1])
                elif self.side=='attack' and o['bomb']['state']=='planted': am=aim(o['bomb']['x']-p[0],o['bomb']['y']-p[1])
                elif self.side=='defend' and not candidates:
                    if self.contact and self.now-self.contact[2]<12:
                        am=aim(self.contact[0]-p[0],self.contact[1]-p[1])
                    else: am=aim(27.8-p[0],30.5-p[1])
                elif dr!='N':
                    am=aim(27.8-p[0],3.5-p[1]) if p[1]>14 else aim(route[0]-p[0],route[1]-p[1])
                else:
                    # Scan while holding; aim is independent from locomotion.
                    k=int(self.now*4+f/5+i*1.6)%8
                    am=['D','DL','DR','L','R','U','UL','UR'][k]
                inputs[f][i]={'dir':dr,'aim':am}
            self.last[i]=lastdir
        self.elapsed=o.get('frame',0)
        return {'inputs':inputs}
    def act(self,o):
        self.setup(o)
        return self.buy(o) if o.get('phase')=='buy' else self.live(o)

def main():
    agent=Agent()
    for line in sys.stdin:
        try:
            obs=json.loads(line); result=agent.act(obs)
            print(json.dumps(result,separators=(',',':')),flush=True)
        except Exception as e:
            print('agent error: '+repr(e),file=sys.stderr,flush=True)
            print(json.dumps({'buys':[]} if '"buy"' in line else {'inputs':[[{'dir':'N','aim':'U'} for _ in range(5)] for _ in range(20)]}),flush=True)
if __name__=='__main__': main()
