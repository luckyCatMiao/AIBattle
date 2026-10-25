import math, itertools
DT=0.05
ACCEL=17.0; MAXS=14.0; BOOSTMAX=23.0; BOOSTACC=30.0
DRAG=0.6; GN=0.80; GD=0.985; TURN=3.2; DTB=1.6; DMIN=4.0

def step(s, throttle, steer, drift, boost):
    ang,vx,vy=s['ang'],s['vx'],s['vy']; de=s['de']; be=s['be']
    fx,fy=math.cos(ang),math.sin(ang); rx,ry=-fy,fx
    vF=vx*fx+vy*fy; vL=vx*rx+vy*ry
    was=s['drifting']
    drifting = drift and abs(vF)>DMIN and abs(steer)>0.15
    if throttle>0: vF += ACCEL*throttle*DT
    vF*=math.exp(-DRAG*DT)
    sa=abs(vF)
    if sa>0.25:
        g=min(1.0,sa/8.0); d=1.0 if vF>0 else -1.0
        ang += steer*TURN*g*(DTB if drifting else 1.0)*d*DT
    vL *= GD if drifting else GN
    if drifting: de=min(1.0, de+(abs(vL)*0.12+sa*0.02)*0.55*DT)
    elif was:
        be=min(1.0,be+de); de=0.0
    wb = boost and be>0.02
    if wb: vF += BOOSTACC*DT; be=max(0.0,be-0.6*DT)
    cap = BOOSTMAX if wb else MAXS
    if vF>cap: vF=max(cap,vF-0.9)
    vx=fx*vF+rx*vL; vy=fy*vF+ry*vL
    return dict(x=s['x']+vx*DT,y=s['y']+vy*DT,ang=ang,vx=vx,vy=vy,drifting=drifting,de=de,be=be,vF=vF,vL=vL)

def run(policy, secs=20.0, be0=0.0):
    s=dict(x=0.,y=0.,ang=0.,vx=0.,vy=0.,de=0.,be=be0,drifting=False); log=[]
    for i in range(int(secs/DT)):
        s=step(s,*policy(s,i))
        log.append((math.hypot(s['vx'],s['vy']), math.atan2(s['vy'],s['vx']), s['be'], s['de'], s['drifting']))
    return s,log

def score(policy, secs=20.0, be0=0.0):
    s,l=run(policy,secs,be0)
    n=len(l); tail=l[n//2:]
    sp=sum(x[0] for x in tail)/len(tail)
    # velocity direction rate over tail
    tot=0.0
    for a,b in zip(tail,tail[1:]):
        d=(b[1]-a[1]+math.pi)%(2*math.pi)-math.pi
        tot+=d
    rate=tot/(len(tail)*DT)
    return sp, rate, s['be'], sum(1 for x in tail if x[4])/len(tail)

# search: periodic (period P) with drift frames mask and steer alternating sign
best=[]
for P in (4,5,6,7,8,10,12,14,16):
  for ndrift in (P-1,P-2,2,3,P-3):
    if ndrift<=0 or ndrift>P: continue
    for amp in (0.2,0.35,0.5,0.7,0.9,1.0):
      for split in (0.5,0.25):
        def pol(s,i,P=P,ndrift=ndrift,amp=amp,split=split):
            ph=i%P
            se = amp if ph < P*split else -amp
            dr = ph < ndrift
            return (1.0, se, dr, True)
        sp,rate,be,dr = score(pol, 20.0, 1.0)
        if abs(rate) < 0.12:
            best.append((sp,rate,be,dr,P,ndrift,amp,split))
best.sort(reverse=True)
print('near-straight policies (straight-line speed):')
for b in best[:15]:
    print('speed=%.2f rate=%+.3f be=%.2f drift=%.2f P=%d ndrift=%d amp=%.2f split=%.2f'%b)
