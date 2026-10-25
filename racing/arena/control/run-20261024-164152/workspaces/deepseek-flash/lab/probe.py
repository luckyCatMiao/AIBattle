"""Open-field physics probe: what top speed / turn capability is reachable?"""
import math, itertools

DT=0.05
ACCEL=17.0; BRAKE=26.0; MAXS=14.0; BOOSTMAX=23.0; BOOSTACC=30.0
DRAG=0.6; GN=0.80; GD=0.985; TURN=3.2; DTB=1.6; DMIN=4.0
DRAIN=0.6; CHRATE=0.55

def step(st, throttle, steer, drift, boost):
    x,y,ang,vx,vy=st['x'],st['y'],st['ang'],st['vx'],st['vy']
    de=st.get('driftEnergy',0.0); be=st.get('boostEnergy',0.0)
    fx,fy=math.cos(ang),math.sin(ang); rx,ry=-fy,fx
    vF=vx*fx+vy*fy; vL=vx*rx+vy*ry
    wasDrift=st.get('drifting',False)
    drifting = drift and abs(vF)>DMIN and abs(steer)>0.15
    if throttle>0: vF += ACCEL*throttle*DT
    elif throttle<0:
        if vF>0.5: vF-=BRAKE*DT
        else: vF=max(-5.0,vF-8.0*DT)
    vF*=math.exp(-DRAG*DT)
    sa=abs(vF)
    if sa>0.25:
        g=min(1.0,sa/8.0); d=1.0 if vF>0 else -1.0
        ang += steer*TURN*g*(DTB if drifting else 1.0)*d*DT
    vL *= GD if drifting else GN
    if drifting:
        de = min(1.0, de + (abs(vL)*0.12+sa*0.02)*CHRATE*DT)
    elif wasDrift:
        be = min(1.0, be+de); de=0.0
    wantBoost = boost and be>0.02
    if wantBoost:
        vF += BOOSTACC*DT; be=max(0.0,be-DRAIN*DT)
    cap = BOOSTMAX if wantBoost else MAXS
    if vF>cap: vF=max(cap,vF-18*DT)
    if vF<-5: vF=-5
    fx,fy=math.cos(ang),math.sin(ang); rx,ry=-fy,fx
    vx=fx*vF+rx*vL; vy=fy*vF+ry*vL
    return dict(x=x+vx*DT, y=y+vy*DT, ang=ang, vx=vx, vy=vy,
                drifting=drifting, driftEnergy=de, boostEnergy=be, vF=vF, vL=vL)

def run(policy, secs=12.0, init=None):
    st = init or dict(x=64.,y=44.,ang=0.,vx=0.,vy=0.,driftEnergy=0.,boostEnergy=1.0)
    n=int(secs/DT)
    for i in range(n):
        th,se,dr,bo = policy(st, i)
        st = step(st, th,se,dr,bo)
    return st

# A) pure straight-line boost, no steering
st=run(lambda s,i:(1.0,0.0,False,True))
print('A straight boost      speed=%.2f vF=%.2f vL=%.2f'%(math.hypot(st['vx'],st['vy']),st['vF'],st['vL']))
st=run(lambda s,i:(1.0,0.0,False,False))
print('A straight no boost   speed=%.2f'%math.hypot(st['vx'],st['vy']))

# B) constant steer + drift + boost (circle) -- report steady speed & turn radius
for se in (0.2,0.4,0.6,0.8,1.0):
    for dr in (True,False):
        for bo in (True,False):
            st=run(lambda s,i,se=se,dr=dr,bo=bo:(1.0,se,dr,bo), secs=14.0)
            sp=math.hypot(st['vx'],st['vy'])
            omega = se*TURN*(DTB if st['drifting'] else 1.0)
            print('B steer=%.1f drift=%d boost=%d -> speed=%.2f vF=%.2f vL=%.2f omega~%.2f R~%.1f energy=%.2f'%(
                se,dr,bo,sp,st['vF'],st['vL'],omega, sp/max(omega,1e-6), st['boostEnergy']))
