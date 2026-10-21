import sys, json, math, heapq
from collections import deque

DIR = {'N':(0.,0.),'U':(0.,-1.),'D':(0.,1.),'L':(-1.,0.),'R':(1.,0.),'UL':(-.7071067811865476,-.7071067811865476),'UR':(.7071067811865476,-.7071067811865476),'DL':(-.7071067811865476,.7071067811865476),'DR':(.7071067811865476,.7071067811865476)}
MOVES=list(DIR)

def aim(dx,dy):
    if abs(dx)+abs(dy)<.001: return 'U'
    return ['R','DR','D','DL','L','UL','U','UR'][int(math.floor(math.atan2(dy,dx)/(math.pi/4)+.5))%8]

def dist(a,b): return math.hypot(a[0]-b[0],a[1]-b[1])

class Agent:
    def __init__(self, mode='main'):
        self.mode=mode; self.mapkey=None; self.round=None; self.memory={}; self.prevbullets={}; self.fields={}
    def initmap(self,o):
        m=o['map']; key=(o.get('seed'),tuple(m['tiles']))
        if key==self.mapkey: return
        self.mapkey=key; self.w=m['width']; self.h=m['height']; self.tiles=m['tiles']; self.fields={}; self.adj={}
        for y in range(1,self.h-1):
            for x in range(1,self.w-1):
                k=y*self.w+x
                if self.tiles[k]: continue
                ns=[]
                for name,(dx,dy) in DIR.items():
                    if name=='N':continue
                    ix=round(dx); iy=round(dy); nk=k+iy*self.w+ix
                    if self.tiles[nk]:continue
                    if ix and iy and (self.tiles[k+ix] or self.tiles[k+iy*self.w]):continue
                    ns.append((nk,1.41421356237 if ix and iy else 1))
                self.adj[k]=ns
    def wall(self,x,y):
        ix=int(math.floor(x));iy=int(math.floor(y))
        return ix<0 or iy<0 or ix>=self.w or iy>=self.h or self.tiles[iy*self.w+ix]!=0
    def fits(self,x,y):
        for iy in range(math.floor(y-.3),math.floor(y+.3)+1):
            for ix in range(math.floor(x-.3),math.floor(x+.3)+1):
                if self.wall(ix+.5,iy+.5):
                    cx=max(ix,min(x,ix+1));cy=max(iy,min(y,iy+1))
                    if (x-cx)**2+(y-cy)**2<.09-1e-10:return False
        return True
    def move(self,x,y,d):
        dx,dy=DIR[d]; nx=x+dx*.15
        if self.fits(nx,y):x=nx
        ny=y+dy*.15
        if self.fits(x,ny):y=ny
        return x,y
    def los(self,x,y,xx,yy):
        n=max(1,int(math.hypot(xx-x,yy-y)*5))
        return all(not self.wall(x+(xx-x)*i/n,y+(yy-y)*i/n) for i in range(1,n))
    def cell(self,p):return int(p[1])*self.w+int(p[0])
    def nearest(self,p):
        k=self.cell(p)
        if k in self.adj:return k
        return min(self.adj,key=lambda a:(a%self.w+.5-p[0])**2+(a//self.w+.5-p[1])**2)
    def field(self,p):
        goal=self.nearest(p)
        if goal not in self.fields:
            ds={goal:0.}; q=[(0.,goal)]
            while q:
                d,k=heapq.heappop(q)
                if d>ds[k]:continue
                for nk,c in self.adj[k]:
                    nd=d+c
                    if nd<ds.get(nk,1e9):ds[nk]=nd;heapq.heappush(q,(nd,nk))
            self.fields[goal]=ds
        return self.fields[goal]
    def waypoint(self,p,g):
        ds=self.field(g); k=self.nearest(p)
        path=[k]
        for _ in range(7):
            if ds.get(k,1e9)<.01:break
            ns=self.adj[k]
            nk=min(ns,key=lambda a:ds.get(a[0],1e9)+a[1])[0] if ns else k
            if ds.get(nk,1e9)>=ds.get(k,1e9):break
            path.append(nk);k=nk
        best=(path[0]%self.w+.5,path[0]//self.w+.5)
        for k in path:
            v=(k%self.w+.5,k//self.w+.5)
            # Swept circle, including clearance at corners.
            n=max(1,int(dist(p,v)*8))
            if all(self.fits(p[0]+(v[0]-p[0])*t/n,p[1]+(v[1]-p[1])*t/n) for t in range(1,n+1)):best=v
            else:break
        if ds.get(self.nearest(p),999)<1.5 and self.los(*p,*g) and self.fits(*g):best=g
        return best
    def buy(self,o):
        out=[]
        for u in o['units']:
            money=u['money']; p={'unit':u['index']}; cur=u['weapon']; armor=u.get('armor',0)
            # Armor doubles effective life; prioritize it over a small gun upgrade.
            if money>=650 and armor<45:p['armor']=True;money-=650
            if cur in ('pistol','pdw','shotgun','smg'):
                if money>=2700 and cur!='rifle':p['weapon']='rifle';money-=2700
                elif money>=1250 and cur in ('pistol','pdw','shotgun'):p['weapon']='smg';money-=1250
                elif money>=700 and cur=='pistol':p['weapon']='pdw';money-=700
            if o['side']=='defend' and not u.get('kit') and money>=400:p['kit']=True;money-=400
            out.append(p)
        return {'buys':out}
    def act(self,o):
        self.initmap(o)
        if o['phase']=='buy':return self.buy(o)
        if self.round!=(o.get('id'),o['round']):
            self.round=(o.get('id'),o['round']);self.memory={};self.prevbullets={};self.momentum={}
        tick=o['tick']; us=o['units']; alive=[u for u in us if u['alive']]; attack=o['side']=='attack'; bomb=o['bomb']
        enemies={}
        for es in o.get('visibleEnemies',{}).values():
            for e in es:enemies[e['id']]=e
        for eid,e in enemies.items():
            old=self.memory.get(eid)
            vx=vy=0.
            if old and tick>old[1]:
                dt=(tick-old[1])/20;vx=(e['x']-old[0]['x'])/dt;vy=(e['y']-old[0]['y'])/dt
                speed=math.hypot(vx,vy)
                if speed>3.1:vx=vy=0.
            self.memory[eid]=(e,tick,vx,vy)
        known=[v for v in self.memory.values() if tick-v[1]<=40]
        # Team communications influence movement/aim only; the engine still enforces firing.
        sites=o['map']['sites']; label='A' if (o.get('seed',1)+o['round'])%2==0 else 'B'
        if self.mode=='rushA':label='A'
        if self.mode=='rushB':label='B'
        site=sites[label]; center=((site['x1']+site['x2']+1)/2,(site['y1']+site['y2']+1)/2)
        carrier=next((u for u in alive if u['id']==bomb.get('carrier')),None)
        goals={}; stationary=set()
        planted=bomb['state']=='planted'
        if planted:bp=(bomb['x'],bomb['y'])
        else:bp=None
        # Retake upon plant or firm contact; keep the squad concentrated in the fight.
        contact=None
        if not attack and known:
            contact=min(known,key=lambda v:min(dist((u['x'],u['y']),(v[0]['x'],v[0]['y'])) for u in alive) if alive else 999)[0]
        defuser=None
        if planted and not attack and alive:
            defuser=min(alive,key=lambda u:self.field(bp).get(self.nearest((u['x'],u['y'])),999)+(0 if u.get('kit') else 2))['id']
        for u in alive:
            i=u['index'];p=(u['x'],u['y'])
            if attack:
                if planted:
                    # Stay close enough to trade and stop a defuse, but keep strafing.
                    g=(bp[0]+[-2,2,-3,3,0][i],bp[1]+[2,2,0,0,3][i])
                elif bomb['state']=='dropped':g=(bomb['x'],bomb['y'])
                else:
                    g=center
                    if carrier and u['id']!=carrier['id']:
                        g=(center[0]+[0,-1.5,1.5,-2.5,2.5][i],center[1]+[0,1,1,2,2][i])
                    s=next((s for s in sites.values() if s['x1']<=int(u['x'])<=s['x2'] and s['y1']<=int(u['y'])<=s['y2']),None)
                    if carrier and u['id']==carrier['id'] and s:
                        stationary.add(u['id']);g=p
            elif planted:
                g=bp
                if u['id']==defuser and dist(p,bp)<.85:stationary.add(u['id']);g=p
                elif u['id']!=defuser and dist(p,bp)<2.7:g=p
            elif contact:
                g=(contact['x'],contact['y'])
            else:
                side='A' if i<3 else 'B'
                s=sites[side]; cx=(s['x1']+s['x2']+1)/2
                g=(cx+[-1.5,1.5,0,-1,1][i],11.5 if i in (0,3) else 9.5)
                if self.mode=='rush':g=(27.5,22.5)
                if self.mode=='turret':g=(25.5+i,8.5)
            if not self.fits(*g):
                k=self.nearest(g);g=(k%self.w+.5,k//self.w+.5)
            goals[u['id']]=g
        # Visible projectile velocity is reconstructed from consecutive observations when available.
        bullets=[]
        for b in o.get('bullets',[]):
            if b['team']==o['yourTeam']:continue
            old=self.prevbullets.get(b['id']);vx=vy=0.
            if old and tick>old[2]:vx=(b['x']-old[0])/(tick-old[2]);vy=(b['y']-old[1])/(tick-old[2])
            else:
                shooter=self.memory.get(b.get('unit'))
                if shooter:
                    sx=shooter[0]['x'];sy=shooter[0]['y']
                else:
                    # First sight of a bullet: spawn/approach prior, not hidden state.
                    sx=27.5;sy=3.5 if attack else 30.5
                dx=b['x']-sx;dy=b['y']-sy;ln=math.hypot(dx,dy) or 1
                speed=o['weapons'][b['weapon']]['speed']/20;vx=dx/ln*speed;vy=dy/ln*speed
            if vx or vy:bullets.append((b['x'],b['y'],vx,vy))
        self.prevbullets={b['id']:(b['x'],b['y'],tick) for b in o.get('bullets',[])}
        frames=[[{'dir':'N','aim':'N'} for _ in range(5)] for _ in range(20)]
        for u in alive:
            uid=u['id'];idx=u['index']; x=u['x'];y=u['y'];g=goals[uid];fixed=uid in stationary
            nearby=[]
            for e,et,vx,vy in known:
                if dist((x,y),(e['x'],e['y']))<19 and self.los(x,y,e['x'],e['y']):nearby.append((e,et,vx,vy))
            wp=self.waypoint((x,y),g)
            if not nearby and any(math.hypot(b[0]-x,b[1]-y)<8 for b in bullets):
                sx=27.5;sy=3.5 if attack else 30.5
                nearby.append(({'x':sx,'y':sy,'weapon':'pistol'},tick,0.,0.))
            last=self.momentum.get(uid,'N'); virtual=[]
            for f in range(20):
                threats=[]
                for e,et,vx,vy in nearby:
                    age=(tick-et+f)/20;ex=e['x']+vx*min(age,.6);ey=e['y']+vy*min(age,.6)
                    if self.wall(ex,ey):ex=e['x'];ey=e['y']
                    threats.append((ex,ey,e))
                    if f%4==0:
                        dx=x-ex;dy=y-ey;ln=math.hypot(dx,dy) or 1
                        if ln<o['weapons'][e['weapon']]['range'] and self.los(x,y,ex,ey):
                            speed=o['weapons'][e['weapon']]['speed']/20
                            virtual.append((ex+dx/ln*.38,ey+dy/ln*.38,dx/ln*speed,dy/ln*speed,f))
                if f%5==0:wp=self.waypoint((x,y),g)
                if fixed:d='N'
                elif threats and self.mode not in ('rushA','rushB','rush','camp'):
                    # Evaluate candidate strafes against past and projected enemy fire.
                    best=1e30;d='N'
                    target=min(threats,key=lambda e:math.hypot(e[0]-x,e[1]-y))
                    for name in MOVES:
                        nx,ny=self.move(x,y,name)
                        if name!='N' and math.hypot(nx-x,ny-y)<.06:continue
                        ddx,ddy=DIR[name];fx=nx+ddx*.15*5;fy=ny+ddy*.15*5
                        if not self.fits(fx,fy):fx=nx;fy=ny
                        score=dist((nx,ny),wp)*1.5
                        if name=='N':score+=.5
                        if name!=last:score+=.055
                        tx,ty,_=target;er=math.hypot(tx-x,ty-y) or 1
                        radial=((nx-x)*(tx-x)+(ny-y)*(ty-y))/er
                        score+=abs(radial)*2.6
                        if er<2.4:score+=radial*5
                        for bx,by,bvx,bvy in bullets:
                            for h in (0,3,6):
                                sep=math.hypot(nx+ddx*.15*h-bx-bvx*(f+h+1),ny+ddy*.15*h-by-bvy*(f+h+1))
                                if sep<.7:score+=(.7-sep)*8
                        for bx,by,bvx,bvy,bf in virtual:
                            dt=f-bf+5
                            sep=math.hypot(fx-bx-bvx*dt,fy-by-bvy*dt)
                            if sep<.75:score+=(.75-sep)*4
                        if score<best:best=score;d=name
                else:
                    if dist((x,y),g)<.22:d='N'
                    else:
                        d=min(MOVES,key=lambda n:dist(self.move(x,y,n),wp)+(.005 if n!=last else 0))
                x,y=self.move(x,y,d); last=d
                if threats:
                    target=min(threats,key=lambda e:math.hypot(e[0]-x,e[1]-y));a=aim(target[0]-x,target[1]-y)
                elif planted:
                    if attack:a=aim(bp[0]-x,bp[1]-y) if dist((x,y),bp)>1.5 else 'D'
                    else:a=aim(g[0]-x,g[1]-y) if dist((x,y),g)>1 else 'D'
                elif known:
                    e=min(known,key=lambda e:dist((x,y),(e[0]['x'],e[0]['y'])))[0];a=aim(e['x']-x,e['y']-y)
                elif not attack:
                    a='D' if f%20<12 else ('DL' if idx%2==0 else 'DR')
                else:
                    a=aim(wp[0]-x,wp[1]-y)
                    if f>=14 and int(o['frame']/20)%3==idx%3:a='U' if y>12 else ('R' if label=='A' else 'L')
                frames[f][idx]={'dir':d,'aim':a}
            self.momentum[uid]=last
        return {'inputs':frames}

def main():
    agent=Agent(sys.argv[1] if len(sys.argv)>1 else 'main')
    for line in sys.stdin:
        if not line.strip():continue
        o=json.loads(line)
        result=agent.act(o)
        print(json.dumps(result,separators=(',',':')),flush=True)

if __name__=='__main__':main()
