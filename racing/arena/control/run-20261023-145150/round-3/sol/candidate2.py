import sys, json, math, bisect

DT = 0.05

def clamp(v, a, b):
    return max(a, min(b, v))

def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi

class Track:
    def __init__(self, data):
        self.data = data
        self.tiles = data['tiles']
        self.w = data['width']
        self.h = data['height']
        self.half = data['halfWidth']
        p = [(q['x'], q['y']) for q in data['points']]
        self.p = p
        self.cum = [0.0]
        for a,b in zip(p, p[1:] + p[:1]):
            self.cum.append(self.cum[-1] + math.hypot(a[0]-b[0], a[1]-b[1]))
        self.length = self.cum[-1]
        self.n = int(math.ceil(self.length / 0.6))
        self.ds = self.length / self.n
        self.path = [self.at(i*self.ds) for i in range(self.n)]

    def at(self, s):
        s %= self.length
        i = min(len(self.p)-1, bisect.bisect_right(self.cum,s)-1)
        a,b = self.p[i],self.p[(i+1)%len(self.p)]
        t = (s-self.cum[i]) / (self.cum[i+1]-self.cum[i])
        return a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t

    def nearest(self, x,y, hint=None):
        if hint is None:
            ids = range(self.n)
        else:
            k = int(hint / self.ds)
            ids = ((k+j)%self.n for j in range(-15, 31))
        best = min(ids, key=lambda i:(self.path[i][0]-x)**2+(self.path[i][1]-y)**2)
        # Project onto the adjacent segments.
        ans=(1e20,0.0,0.0)
        for i in ((best-1)%self.n,best):
            a,b = self.path[i], self.path[(i+1)%self.n]
            dx,dy=b[0]-a[0],b[1]-a[1]
            t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy+1e-20),0,1)
            ex,ey=x-a[0]-t*dx,y-a[1]-t*dy
            d=ex*ex+ey*ey
            if d<ans[0]:
                ans=(d,(i+t)*self.ds,(dx*ey-dy*ex)/(math.hypot(dx,dy)+1e-20))
        return ans[1]%self.length,ans[2]

    def tile(self,x,y):
        ix,iy=math.floor(x),math.floor(y)
        if ix<0 or iy<0 or ix>=self.w or iy>=self.h: return 2
        return self.tiles[iy*self.w+ix]

    def wall(self,x,y):
        r=.55; k=r*math.sqrt(.5)
        return any(self.tile(x+dx,y+dy)==2 for dx,dy in ((-r,0),(r,0),(0,-r),(0,r),(-k,-k),(k,-k),(-k,k),(k,k)))


def physics(c,u,t):
    x,y,a,vx,vy,charge,energy,drifting = c
    th,st,dr,bo=u
    fx,fy=math.cos(a),math.sin(a)
    vf=vx*fx+vy*fy; vl=-vx*fy+vy*fx
    off=t.tile(x,y)==1
    drift=dr and abs(vf)>4 and abs(st)>.15 and not off
    if th>0: vf+=17*th*(.35 if off else 1)*DT
    elif th<0:
        vf=vf-26*DT if vf>.5 else max(-5,vf-8*DT)
    vf*=math.exp(-.6*DT)
    if off: vf*=.94
    if abs(vf)>.25:
        a+=st*3.2*min(abs(vf)/8,1)*(1.6 if drift else 1)*(1 if vf>0 else -1)*DT
    vl*=.985 if drift else .8
    if drift: charge=min(1,charge+(abs(vl)*.12+abs(vf)*.02)*.55*DT)
    elif drifting:
        if charge>.02: energy=min(1,energy+charge)
        charge=0
    boosting=bo and energy>.02
    if boosting: vf+=30*DT; energy=max(0,energy-.6*DT)
    cap=7 if off else (23 if boosting else 14)
    if vf>cap: vf=max(cap,vf-.9)
    vf=max(-5,vf)
    vx=fx*vf-fy*vl; vy=fy*vf+fx*vl
    nx=x+vx*DT
    if not t.wall(nx,y): x=nx
    else: vx=-vx*.45; vy*=.9
    ny=y+vy*DT
    if not t.wall(x,ny): y=ny
    else: vy=-vy*.45; vx*=.9
    return [x,y,a,vx,vy,charge,energy,drift]

class Agent:
    def __init__(self):
        self.track=None
        self.key=None

    def control(self,c,s):
        t=self.track
        x,y,a,vx,vy,ch,en,dr=c
        speed=math.hypot(vx,vy)
        # Pursuit anticipates the normal-grip lateral relaxation delay.
        look=3.0+speed*.32
        tx,ty=t.at(s+look)
        desired=math.atan2(ty-y,tx-x)
        slip=wrap(math.atan2(vy,vx)-a) if speed>1 else 0
        err=wrap(desired-a)
        steer=clamp((err-slip*.65)*2.0,-1,1)
        p0=t.at(s+3); p1=t.at(s+13); p2=t.at(s+23)
        curvature=abs(wrap(math.atan2(p2[1]-p1[1],p2[0]-p1[0])-math.atan2(p1[1]-p0[1],p1[0]-p0[0])))
        straight=curvature<.18 and abs(err)<.18 and abs(slip)<.25
        drift=straight and speed>9 and self.frame%20<18
        if drift:
            steer=steer/1.6
            if abs(steer)<.155: steer=.155 if steer>=0 else -.155
        boost=straight
        self.frame+=1
        return (1,steer,drift,boost)

    def act(self,o):
        key=(o.get('seed'),o.get('id'))
        if self.track is None or self.key!=key:
            self.track=Track(o['track']); self.key=key
        car=o['cars'][o['yourPlayer']]
        self.frame=o.get('frame',0)
        c=[car[k] for k in ('x','y','angle','vx','vy','driftCharge','boostEnergy','drifting')]
        s,_=self.track.nearest(c[0],c[1])
        inputs=[]
        countdown=round(o.get('countdownLeft',0)*20)
        for i in range(20):
            if i<countdown:
                u=(1,0,False,False)
            else:
                s,_=self.track.nearest(c[0],c[1],s)
                u=self.control(c,s)
                c=physics(c,u,self.track)
            inputs.append([dict(throttle=u[0],steer=u[1],drift=u[2],boost=u[3])])
        return {'inputs':inputs}

def main():
    agent=Agent()
    for line in sys.stdin:
        if line.strip():
            o=json.loads(line)
            print(json.dumps(agent.act(o),separators=(',',':'),allow_nan=False),flush=True)

if __name__=='__main__': main()
