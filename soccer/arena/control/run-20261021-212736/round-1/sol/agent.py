import sys, json, math

DIRS = [('N',0.,0.),('R',1.,0.),('DR',2**-.5,2**-.5),('D',0.,1.),('DL',-2**-.5,2**-.5),('L',-1.,0.),('UL',-2**-.5,-2**-.5),('U',0.,-1.),('UR',2**-.5,-2**-.5)]
SPEED=3.15
STEP=.1575

def clamp(x,a,b): return max(a,min(b,x))
def dist(a,b): return math.hypot(a['x']-b['x'],a['y']-b['y'])
def angle(x,y): return math.degrees(math.atan2(y,x))%360

def wall(x,y,r):
    k=r*.7071067811865476
    for dx,dy in ((r,0),(-r,0),(0,r),(0,-r),(k,k),(k,-k),(-k,k),(-k,-k)):
        xx,yy=x+dx,y+dy
        if xx<0 or xx>=44 or yy<1 or yy>=25 or ((xx<1 or xx>=43) and not 10<=yy<16): return True
    return False

def move(u,dx,dy):
    for axis,d in (('x',dx),('y',dy)):
        x,y=u['x'],u['y']
        if axis=='x': x+=d
        else: y+=d
        if not wall(x,y,.34): u[axis]+=d
        else:
            dd=math.copysign(.17,d) if d else 0
            x,y=u['x'],u['y']
            if axis=='x': x+=dd
            else: y+=dd
            if not wall(x,y,.34): u[axis]+=dd
    u['x']=clamp(u['x'],.34,43.66);u['y']=clamp(u['y'],.34,25.66)

class World:
    def __init__(self,o):
        self.units=[]
        for q in o['units']:
            u=dict(q);u['fx']=q['facing']['x'];u['fy']=q['facing']['y']
            u['cd']=round(q.get('kickCd',0)*20);u['lock']=round(q.get('controlLock',0)*20);u['steal']=0
            self.units.append(u)
        self.ball=dict(o['ball']);self.freeze=round(o.get('freeze',0)*20);self.frame=o['frame'];self.n=o['teamSize'];self.reset=False
        self.lookup={u['id']:u for u in self.units}
        for event in o.get('events',[]):
            if event.get('type')=='kickoff' and event.get('frame',0)>0:
                self.freeze=max(0,12-(self.frame-event['frame']))
            if event.get('type')=='tackle' and event.get('from') in self.lookup:
                self.lookup[event['from']]['steal']=max(0,4-(self.frame-event.get('frame',0)))
    def step(self,actions):
        self.frame+=1
        if self.freeze>0:
            self.freeze-=1;return
        b=self.ball
        for u,a in zip(self.units,actions):
            u['cd']=max(0,u['cd']-1);u['lock']=max(0,u['lock']-1);u['steal']=max(0,u['steal']-1)
            dr,aim,kick=a
            _,dx,dy=DIRS[dr]
            if aim is not None:
                rad=math.radians(aim);u['fx']=math.cos(rad);u['fy']=math.sin(rad)
            elif dx or dy: u['fx'],u['fy']=dx,dy
            move(u,dx*STEP,dy*STEP)
            if kick and b['owner']==u['id'] and u['cd']==0 and u['lock']==0:
                b['owner']=None;b['x']=u['x']+u['fx']*.59;b['y']=u['y']+u['fy']*.59
                if wall(b['x'],b['y'],.22):b['x'],b['y']=u['x'],u['y']
                b['vx']=u['fx']*14;b['vy']=u['fy']*14
                u['cd']=7;u['lock']=6
        for i,a in enumerate(self.units):
            for c in self.units[i+1:]:
                dx,dy=c['x']-a['x'],c['y']-a['y'];d=math.hypot(dx,dy)
                if 1e-6<d<.68:
                    push=(.68-d)/2;dx*=push/d;dy*=push/d
                    if not wall(a['x']-dx,a['y']-dy,.34):a['x']-=dx;a['y']-=dy
                    if not wall(c['x']+dx,c['y']+dy,.34):c['x']+=dx;c['y']+=dy
        if b['owner']:
            u=self.lookup[b['owner']];b['x']=u['x']+u['fx']*.62;b['y']=u['y']+u['fy']*.62
            if wall(b['x'],b['y'],.22): b['x'],b['y']=u['x'],u['y']
            b['vx']=b['vy']=0
        else:
            for _ in range(4):
                b['x']+=b['vx']*.0125;b['y']+=b['vy']*.0125
                if 10.5<=b['y']<=15.5 and (b['x']<=1 or b['x']>=43):self.reset=True;return
                if wall(b['x'],b['y'],.22):
                    px=b['x']-b['vx']*.0125;py=b['y']-b['vy']*.0125
                    if wall(b['x'],py,.22):b['x']=px;b['vx']*=-.72
                    if wall(px,b['y'],.22):b['y']=py;b['vy']*=-.72
                    if wall(b['x'],b['y'],.22):b['x'],b['y']=px,py;b['vx']*=-.72;b['vy']*=-.72
            b['vx']*=.97;b['vy']*=.97
        if b['owner']:
            u=self.lookup[b['owner']]
            eligible=[v for v in self.units if v['team']!=u['team'] and v['lock']==0 and v['steal']==0]
            if eligible:
                v=min(eligible,key=lambda v:dist(v,b))
                if dist(v,b)<.82 and dist(v,b)+.12<dist(u,b):b['owner']=v['id'];u['steal']=4
        else:
            eligible=[v for v in self.units if v['lock']==0 and v['steal']==0]
            if eligible:
                v=min(eligible,key=lambda v:dist(v,b))
                if dist(v,b)<.82:b['owner']=v['id'];b['vx']=b['vy']=0

def toward(u,x,y):
    return min(range(9),key=lambda j:(u['x']+DIRS[j][1]*STEP-x)**2+(u['y']+DIRS[j][2]*STEP-y)**2)

def intercept(u,b):
    x,y=b['x'],b['y'];vx,vy=b['vx'],b['vy']
    best=(x,y);cost=1e9
    for t in range(1,81):
        nx,ny=x+vx*.05,y+vy*.05
        if wall(nx,ny,.22):
            if wall(nx,y,.22):vx*=-.72;nx=x
            if wall(x,ny,.22):vy*=-.72;ny=y
        x,y=nx,ny;vx*=.97;vy*=.97
        d=math.hypot(x-u['x'],y-u['y'])
        gap=d-.82-t*STEP
        if t>=u['lock'] and gap<=0:return x,y,t
        if gap<cost:best=(x,y);cost=gap
    return best[0],best[1],80+max(0,cost)/STEP

def shot(u,enemies,sgn):
    gx=43 if sgn==1 else 1
    best=(-1e9,0,0)
    for gy in (10.65,11.2,11.8,12.4,13.,13.6,14.2,14.8,15.35):
        dx,dy=gx-u['x'],gy-u['y'];d=math.hypot(dx,dy)
        if d>22.5 or dx*sgn<0:continue
        fx,fy=dx/d,dy/d
        length=d-.59
        if length>=23.333:continue
        endtime=math.log(max(.001,1-length/23.333))/math.log(.97)*.05
        margin=9.
        for e in enemies:
            ex,ey=e['x']-u['x'],e['y']-u['y']
            along=ex*fx+ey*fy-.59
            # Reachable interception along the ray, sampled near projection.
            for delta in (-1.1,0.,1.1):
                a=clamp(along+delta,.7,length)
                t=math.log(max(.001,1-a/23.333))/math.log(.97)*.05
                bx=u['x']+fx*(a+.59);by=u['y']+fy*(a+.59)
                dd=math.hypot(e['x']-bx,e['y']-by)
                reach=.78+SPEED*max(0,t-.18)
                margin=min(margin,dd-reach)
        val=margin-.16*endtime
        if val>best[0]:best=(val,angle(dx,dy),endtime)
    return best

def carry(u,friends,enemies,sgn):
    gx=43 if sgn==1 else 1
    sh=shot(u,enemies,sgn)
    nearest=min((dist(u,e) for e in enemies),default=99)
    if u['cd']<=1 and u['lock']<=1 and sh[0]>.05:
        return toward(u,gx,13),sh[1],True
    best=(-1e9,0,sgn,0)
    for j,(_,dx,dy) in enumerate(DIRS):
        x,y=u['x']+dx*.75,u['y']+dy*.75
        if wall(u['x']+dx*STEP,u['y']+dy*STEP,.34):continue
        # Distance potential bends wide attacks towards the goal mouth.
        goal_y=clamp(y,11.2,14.8)
        val=-math.hypot(gx-x,goal_y-y)*1.1
        val-=.06*abs(y-13)
        for e in enemies:
            dd=math.hypot(x-e['x'],y-e['y'])
            val-=(2.0*max(0,.9-dd)**2 if len(friends)==1 else 3.5*max(0,2.0-dd)**2)
            # discourage running straight into an opponent over the next second
            dd2=math.hypot(u['x']+dx*2-e['x'],u['y']+dy*2-e['y'])
            val-=1.5*max(0,1.3-dd2)**2
        for f in friends:
            if f is not u:val-=.4*max(0,.9-math.hypot(x-f['x'],y-f['y']))
        if y<2 or y>24:val-=3
        if val>best[0]:best=(val,j,dx,dy)
    j=best[1];px=u['x']+DIRS[j][1]*STEP;py=u['y']+DIRS[j][2]*STEP
    # Keep the ball away from nearby opponents, independent of movement.
    default=angle(gx-px,clamp(py,11,15)-py)
    aim=default;av=-1e9
    for a in [default]+list(range(0,360,30)):
        rad=math.radians(a);bx=px+.62*math.cos(rad);by=py+.62*math.sin(rad)
        safety=min((math.hypot(bx-e['x'],by-e['y']) for e in enemies),default=9)
        value=min(safety,2.2)-(.12 if a!=default else 0)
        if wall(bx,by,.22):value-=.5
        if value>av:av=value;aim=a
    # Under pressure, release a pass into an open teammate's path.
    if nearest<1.7 and sh[0]<.05 and u['cd']<=1 and u['lock']<=1:
        bestpass=None
        for f in friends:
            if f is u:continue
            dx,dy=f['x']-px,f['y']-py;d=math.hypot(dx,dy)
            if not 3<d<16:continue
            if dx*sgn < -3:continue
            safe=True
            for e in enemies:
                t=clamp(((e['x']-px)*dx+(e['y']-py)*dy)/(d*d),0,1)
                perp=math.hypot(e['x']-px-t*dx,e['y']-py-t*dy)
                if perp<.95+1.0*t:safe=False;break
            value=dx*sgn+.6*min(dist(f,e) for e in enemies)
            if safe and (bestpass is None or value>bestpass[0]):bestpass=(value,angle(dx,dy))
        if bestpass and bestpass[0]>1:return j,bestpass[1],True
    if nearest<1.2 and sh[0]>-.8 and u['cd']<=1 and u['lock']<=1:return j,sh[1],True
    return j,aim,False

def policy(w,team,simple=False):
    friends=[u for u in w.units if u['team']==team];enemies=[u for u in w.units if u['team']!=team]
    sgn=1 if team==0 else -1;b=w.ball;n=len(friends)
    owner=w.lookup.get(b['owner']);ours=owner is not None and owner['team']==team
    actions={}
    if ours:actions[owner['id']]=carry(owner,friends,enemies,sgn)
    if owner:
        # A thief must approach the ball rather than the carrier's centre.
        tx,ty=b['x'],b['y']
        if not ours:
            tx=owner['x']+owner['fx']*.62;ty=owner['y']+owner['fy']*.62
        targets={u['id']:(tx,ty,math.hypot(tx-u['x'],ty-u['y'])/STEP) for u in friends}
    else:targets={u['id']:intercept(u,b) for u in friends}
    ordered=sorted([u for u in friends if u['id'] not in actions],key=lambda u:targets[u['id']][2])
    # The closest player always attacks the ball; a second player forms a pincer.
    chase=[]
    if not ours:
        chase=ordered[:1]
        if n>=3 and owner is not None and targets[ordered[1]['id']][2]<38:chase=ordered[:2]
    for u in chase:
        x,y,_=targets[u['id']]
        actions[u['id']]=(toward(u,x,y),angle(sgn,0),False)
    remaining=[u for u in ordered if u['id'] not in actions]
    ownx=1 if team==0 else 43
    threat=not ours and (b['x']-ownx)*sgn<23
    keeper=None
    if remaining and (n>=3 or (n==2 and threat)):
        keeper=min(remaining,key=lambda u:abs(u['x']-ownx)+.4*abs(u['y']-13))
        remaining.remove(keeper)
        kx=ownx+sgn*1.0
        if b['owner'] is None and b['vx']*sgn<-.3:
            tt=(kx-b['x'])/b['vx']
            ky=clamp(b['y']+b['vy']*max(0,tt),10.6,15.4)
        else:
            bx=b['x'];by=b['y']
            ky=clamp(13+(by-13)*min(1,3/max(3,abs(bx-ownx))),10.6,15.4)
        if abs(b['x']-ownx)<5 and abs(b['y']-13)<6:
            kx=ownx+sgn*clamp(abs(b['x']-ownx)-1,1,3)
            ky=clamp(b['y'],10.6,15.4)
        actions[keeper['id']]=(toward(keeper,kx,ky),angle(sgn,0),False)
    for k,u in enumerate(remaining):
        if ours:
            x=clamp(owner['x']+sgn*(5+2*(k%2)),3,41)
            y=clamp(owner['y']+(-1 if k%2==0 else 1)*(4+2*(k//2)),3,23)
            # Spread into passing lanes instead of clustering on the carrier.
        elif owner is not None:
            unmarked=sorted(enemies,key=lambda e:(e['x']-ownx)*sgn)
            e=unmarked[k%len(unmarked)]
            x=e['x']-sgn*1.6;y=e['y']
            if e is owner:x=e['x']-sgn*(2.5+k);y=clamp(e['y']+(-2 if k%2 else 2),3,23)
        else:
            x=clamp(b['x']-sgn*(3+2*(k//2)),3,41)
            y=clamp(b['y']+(-1 if k%2==0 else 1)*4,3,23)
        actions[u['id']]=(toward(u,x,y),angle(sgn,0),False)
    return [actions[u['id']] for u in friends]

def decide(o):
    w=World(o);team=o['yourTeam'];out=[]
    for frame in range(20):
        ours=policy(w,team);other=policy(w,1-team)
        out.append([{'dir':DIRS[a[0]][0],'aim':round(a[1],4) if a[1] is not None else None,'kick':a[2]} for a in ours])
        acts=ours+other if team==0 else other+ours
        w.step(acts)
        if w.reset or w.frame==1200:
            # Reset positions after a goal or the half-time kickoff.
            ys={1:[13],2:[9,17],3:[7,13,19],4:[6,10,16,20],5:[5,9,13,17,21],6:[3,7,11,15,19,23]}[w.n]
            for u in w.units:
                u['x']=7.5 if u['team']==0 else 36.5;u['y']=ys[u['index']]+.5
                u['cd']=u['lock']=u['steal']=0
                u['fx']=1 if u['team']==0 else -1;u['fy']=0
            w.ball={'x':22.,'y':13.,'vx':0.,'vy':0.,'owner':None};w.freeze=12;w.reset=False
    return {'inputs':out}

if __name__=='__main__':
    for line in sys.stdin:
        o={}
        try:
            o=json.loads(line);result=decide(o)
            print(json.dumps(result,separators=(',',':')),flush=True)
        except Exception as exc:
            print(str(exc),file=sys.stderr,flush=True)
            n=o.get('teamSize',1) if isinstance(o,dict) else 1
            print(json.dumps({'inputs':[[{'dir':'N','aim':0,'kick':False} for _ in range(n)] for _ in range(20)]}),flush=True)
