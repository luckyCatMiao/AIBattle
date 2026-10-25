import math
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
    elif throttle<0:
        if vF>0.5: vF-=26.0*DT
        else: vF=max(-5.0,vF-8.0*DT)
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

def score(policy, secs=14.0, be0=1.0):
    s=dict(x=0.,y=0.,ang=0.,vx=0.,vy=0.,de=0.,be=be0,drifting=False); log=[]
    for i in range(int(secs/DT)):
        s=step(s,*policy(s,i))
        log.append((math.hypot(s['vx'],s['vy']), math.atan2(s['vy'],s['vx']), s['be'], s['drifting'], s['vF'], s['vL']))
    tail=log[len(log)//2:]
    sp=sum(x[0] for x in tail)/len(tail)
    tot=sum((b[1]-a[1]+math.pi)%(2*math.pi)-math.pi for a,b in zip(tail,tail[1:]))
    rate=tot/(len(tail)*DT)
    return sp,rate,s['be'],sum(1 for x in tail if x[3])/len(tail)

res={}
for P in (2,3,4,5,6,8,10,12,16):
  for nd in range(max(1,P-3),P+1):
    for amp in (0.16,0.3,0.5,0.7,0.9,1.0):
      for gamp in (0.16,0.5,1.0):
        for sgn in (1,):
          def pol(s,i,P=P,nd=nd,amp=amp,gamp=gamp,sgn=sgn):
              ph=i%P
              if ph<nd: return (1.0, sgn*amp, True, True)
              return (1.0, sgn*gamp, False, True)
          sp,rate,be,dr=score(pol)
          key=round(rate*4)/4  # 0.25 buckets
          if sp>res.get(key,(0,))[0]:
              res[key]=(sp,rate,be,dr,P,nd,amp,gamp)
print('rate(rad/s)  speed  radius  energy drift  params')
for k in sorted(res, reverse=True):
    sp,rate,be,dr,P,nd,amp,gamp=res[k]
    R = sp/abs(rate) if abs(rate)>0.05 else 9999
    print('%+7.2f  %6.2f  %6.1f  %.2f %.2f  P=%d nd=%d amp=%.2f g=%.2f'%(rate,sp,R,be,dr,P,nd,amp,gamp))
