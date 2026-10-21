import sys, json, math, heapq

DIRS = {'N':(0.,0.), 'U':(0.,-1.), 'D':(0.,1.), 'L':(-1.,0.), 'R':(1.,0.), 'UL':(-.7071067811865476,-.7071067811865476), 'UR':(.7071067811865476,-.7071067811865476), 'DL':(-.7071067811865476,.7071067811865476), 'DR':(.7071067811865476,.7071067811865476)}
MOVES = list(DIRS.items())[1:]

def direction(dx,dy):
    if abs(dx)+abs(dy)<1e-8: return 'N'
    return max(MOVES, key=lambda z:z[1][0]*dx+z[1][1]*dy)[0]

class Agent:
    def __init__(self, variant='main'):
        self.variant=variant
        self.key=None
        self.memory={}
        self.fields={}
        self.prev={}

    def wall(self,x,y):
        ix,iy=math.floor(x),math.floor(y)
        return ix<0 or iy<0 or ix>=self.w or iy>=self.h or self.tiles[iy*self.w+ix]!=0

    def collision(self,x,y):
        for iy in range(math.floor(y-.3),math.floor(y+.3)+1):
            for ix in range(math.floor(x-.3),math.floor(x+.3)+1):
                if self.wall(ix+.5,iy+.5):
                    cx=max(ix,min(x,ix+1)); cy=max(iy,min(y,iy+1))
                    if (x-cx)**2+(y-cy)**2 < .09-1e-10: return True
        return False

    def move(self,x,y,d):
        dx,dy=DIRS[d]; nx=x+dx*.15; ny=y+dy*.15
        if not self.collision(nx,y): x=nx
        if not self.collision(x,ny): y=ny
        return x,y

    def los(self,x,y,tx,ty):
        n=max(1,math.ceil(math.hypot(tx-x,ty-y)/.1))
        for i in range(1,n):
            if self.wall(x+(tx-x)*i/n,y+(ty-y)*i/n): return False
        return True

    def field(self,target):
        tx,ty=map(math.floor,target); key=(tx,ty)
        if key in self.fields: return self.fields[key]
        if self.wall(tx+.5,ty+.5):
            opens=[(abs(x-tx)+abs(y-ty),x,y) for y in range(self.h) for x in range(self.w) if not self.wall(x+.5,y+.5)]
            _,tx,ty=min(opens)
        dist={(tx,ty):0.}; q=[(0.,tx,ty)]
        while q:
            v,x,y=heapq.heappop(q)
            if v>dist[x,y]+1e-8: continue
            for _,(dx,dy) in MOVES:
                ix=int(round(dx)); iy=int(round(dy)); nx=x+ix; ny=y+iy
                if self.wall(nx+.5,ny+.5): continue
                if ix and iy and (self.wall(x+ix+.5,y+.5) or self.wall(x+.5,y+iy+.5)): continue
                nv=v+(1.41421356237 if ix and iy else 1.)
                if nv<dist.get((nx,ny),1e9):
                    dist[nx,ny]=nv; heapq.heappush(q,(nv,nx,ny))
        self.fields[key]=dist
        return dist

    def nav(self,x,y,target):
        tx,ty=target
        if math.hypot(tx-x,ty-y)<.12: return 'N'
        if math.hypot(tx-x,ty-y)<4 and self.los(x,y,tx,ty):
            d=direction(tx-x,ty-y); nx,ny=self.move(x,y,d)
            if math.hypot(nx-tx,ny-ty)<math.hypot(x-tx,y-ty)-.025: return d
        f=self.field(target)
        cx,cy=math.floor(x),math.floor(y)
        candidates=[]
        for iy in range(cy-1,cy+2):
            for ix in range(cx-1,cx+2):
                if (ix,iy) not in f: continue
                px,py=ix+.5,iy+.5
                if not self.los(x,y,px,py): continue
                if ix!=cx and iy!=cy and (self.wall(ix+.5,cy+.5) or self.wall(cx+.5,iy+.5)): continue
                cost=math.hypot(px-x,py-y)+1.08*f[ix,iy]
                if (ix,iy)==(math.floor(tx),math.floor(ty)): px,py=tx,ty; cost=math.hypot(px-x,py-y)
                candidates.append((cost,px,py))
        if not candidates: return 'N'
        _,px,py=min(candidates)
        d=direction(px-x,py-y)
        nx,ny=self.move(x,y,d)
        if math.hypot(nx-x,ny-y)<.04:
            ds=[(math.hypot(self.move(x,y,k)[0]-px,self.move(x,y,k)[1]-py),k) for k,_ in MOVES]
            d=min(ds)[1]
        return d

    def buy(self,o):
        buys=[]
        for u in o['units']:
            m=u['money']; p={'unit':u['index']}; cur=u['weapon']
            # Armor is more valuable than a marginal pistol-round gun upgrade.
            if self.variant=='pdw':
                choices=['rifle','smg','pdw']
                for w in choices:
                    c=o['weapons'][w]['cost']
                    if m>=c and o['weapons'][cur]['cost']<c:
                        p['weapon']=w;m-=c;break
            else:
                if cur not in ('rifle','sniper','lmg'):
                    if m>=3350: p['weapon']='rifle';m-=2700
                    elif m>=1900 and cur not in ('smg',): p['weapon']='smg';m-=1250
                if m>=650 and u['armor']<75: p['armor']=True;m-=650
                if cur=='pistol' and 'weapon' not in p and m>=700: p['weapon']='pdw';m-=700
            if m>=650 and not p.get('armor') and u['armor']<75: p['armor']=True;m-=650
            if o['side']=='defend' and not u['kit'] and m>=400: p['kit']=True
            buys.append(p)
        return {'buys':buys}

    def act(self,o):
        if o['phase']=='buy': return self.buy(o)
        if o['phase']!='live': return {'inputs':[]}
        key=(o['id'],o['round'])
        if self.key!=key:
            self.key=key; self.memory={}; self.prev={}; self.fields={}
            self.w=o['map']['width'];self.h=o['map']['height'];self.tiles=o['map']['tiles']
            self.left=(o['round']%3!=2)
            if self.variant=='right': self.left=False
        frame=o['frame']; side=o['side']; units=o['units']; bomb=o['bomb']
        alive=[u for u in units if u['alive']]
        seen={e['id']:e for es in o['visibleEnemies'].values() for e in es}
        for eid,e in seen.items():
            old=self.memory.get(eid)
            vx=vy=0.
            if old and frame>old['frame'] and frame-old['frame']<=40:
                dt=(frame-old['frame'])/20
                vx=max(-3,min(3,(e['x']-old['x'])/dt));vy=max(-3,min(3,(e['y']-old['y'])/dt))
            self.memory[eid]=dict(e,frame=frame,vx=vx,vy=vy)
        # Public death messages identify eliminated opponents without adding hidden vision.
        opponent=1-o['yourTeam']
        opponent_name=next((p['name'] for p in o['players'] if p['id']==opponent),'')
        dead=set()
        for event in o.get('events',[]):
            if event.get('type')=='death' and event.get('t',0)>=(o['tick']-frame)/20:
                text=event.get('text','').split('击倒 ')[-1]
                for j in range(5):
                    if text==opponent_name+' #'+str(j+1): dead.add('t'+str(opponent)+'u'+str(j))
        for eid in dead: self.memory.pop(eid,None)
        enemies=[e for e in self.memory.values() if frame-e['frame']<=60]
        fresh=[e for e in enemies if frame-e['frame']<=20]
        # Prefer a single five-unit entry; no friendly collision or friendly fire.
        sx=9.7 if self.left else 30.3
        plant=(sx,7.55)
        targets={}; holds={}
        if side=='attack':
            carrier=next((u for u in alive if u['id']==bomb.get('carrier')),None)
            picker=min(alive,key=lambda u:math.hypot(u['x']-bomb.get('x',20),u['y']-bomb.get('y',12))) if alive else None
            for u in alive:
                i=u['index']; x,y=u['x'],u['y']
                if bomb['state']=='planted':
                    bx,by=bomb['x'],bomb['y']
                    # Stay close enough to punish a defuser, covering multiple approaches.
                    spots=[(bx+.15,by+.15),(bx+.25,by+.25),(bx+.35,by+.15),(bx+.15,by+.35),(bx+.35,by+.35)]
                    targets[i]=spots[i];holds[i]=False
                elif bomb['state']=='dropped' and u==picker:
                    targets[i]=(bomb['x'],bomb['y']); holds[i]=False
                else:
                    # Bottom corridor bypasses the lower vertical cover.
                    if y>20.8 and ((self.left and x>12) or (not self.left and x<28)):
                        targets[i]=(sx,21.5)
                    elif y>13.1:
                        targets[i]=(sx+(i-2)*.22,13.3 if y>14 else 10.)
                    else:
                        targets[i]=plant if u==carrier else (sx+(i-2)*.35,7.6+(i%2)*.4)
                    site=next((s for s in o['map']['sites'].values() if s['x1']<=math.floor(x)<=s['x2'] and s['y1']<=math.floor(y)<=s['y2']),None)
                    holds[i]=bool(u==carrier and site)
        else:
            positions=[(9.3,8.7),(10.5,8.7),(19.6,9.0),(29.5,8.7),(30.7,8.7)]
            if bomb['state']=='planted':
                for u in alive:
                    targets[u['index']]=(bomb['x'],bomb['y']);holds[u['index']]=math.hypot(u['x']-bomb['x'],u['y']-bomb['y'])<.88
            else:
                contacts=[e for e in fresh if e['y']<14]
                for u in alive:
                    i=u['index'];targets[i]=positions[i];holds[i]=False
                    if contacts:
                        e=min(contacts,key=lambda e:math.hypot(e['x']-u['x'],e['y']-u['y']))
                        # Rotate supporting defenders once an entry is actually observed.
                        if math.hypot(e['x']-u['x'],e['y']-u['y'])>7:
                            targets[i]=(e['x'],max(3.,e['y']-3))
        simulated={u['index']:[u['x'],u['y']] for u in alive}
        output=[]
        for t in range(20):
            row=[]
            for u in units:
                i=u['index']
                if not u['alive']: row.append({'dir':'N','aim':'N'});continue
                x,y=simulated[i];target=targets[i]
                d='N' if holds.get(i) else self.nav(x,y,target)
                candidates=[]
                for e in enemies:
                    age=(frame-e['frame'])/20
                    lead=min(.5,age+t/20)
                    ex=e['x']+e['vx']*lead;ey=e['y']+e['vy']*lead
                    if self.wall(ex,ey): ex,ey=e['x'],e['y']
                    dd=math.hypot(ex-x,ey-y)
                    if dd<o['weapons'][u['weapon']]['range'] and self.los(x,y,ex,ey): candidates.append((dd+age*1.5,ex,ey,e,dd))
                if candidates:
                    _,ex,ey,e,dd=min(candidates,key=lambda z:z[0])
                    aim=direction(ex-x,ey-y)
                    if frame-e['frame']<=20 and not holds.get(i):
                        # Stop to preserve a clean firing lane rather than running into a stack.
                        if dd>=3.0 and dd<8.5: d='N'
                        if u['reloading'] and dd<5:
                            retreat=direction(x-ex,y-ey)
                            if not self.collision(x+DIRS[retreat][0]*.6,y+DIRS[retreat][1]*.6): d=retreat
                elif side=='defend' and bomb['state']!='planted':
                    if y<10.8: aim='D'
                    else: aim=direction(target[0]-x,target[1]-y)
                elif bomb['state']=='planted':
                    if side=='attack': aim=direction(bomb['x']-x,bomb['y']-y) if math.hypot(x-bomb['x'],y-bomb['y'])>1 else 'D'
                    else: aim=direction(target[0]-x,target[1]-y)
                else:
                    if y>12.8: aim='U'
                    elif x<14: aim='UR' if y<8 else 'U'
                    elif x>26: aim='UL' if y<8 else 'U'
                    else: aim='U'
                if aim=='N': aim='D' if side=='defend' else 'U'
                simulated[i]=list(self.move(x,y,d))
                row.append({'dir':d,'aim':aim})
            output.append(row)
        return {'inputs':output}

def main():
    a=Agent()
    for line in sys.stdin:
        if not line.strip(): continue
        observation={}
        try:
            observation=json.loads(line)
            result=a.act(observation)
            print(json.dumps(result,separators=(',',':')),flush=True)
        except Exception as exc:
            print(str(exc),file=sys.stderr,flush=True)
            fallback={'buys':[]} if observation.get('phase')=='buy' else {'inputs':[[{'dir':'N','aim':'U'} for _ in range(5)] for _ in range(20)]}
            print(json.dumps(fallback),flush=True)

if __name__=='__main__': main()
