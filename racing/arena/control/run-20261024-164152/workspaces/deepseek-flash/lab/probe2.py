"""Time-series probe: sustain boost by drifting; measure speed and heading/velocity rates."""
import math
DT=0.05
ACCEL=17.0; MAXS=14.0; BOOSTMAX=23.0; BOOSTACC=30.0
DRAG=0.6; GN=0.80; GD=0.985; TURN=3.2; DTB=1.6; DMIN=4.0

def step(s, throttle, steer, drift, boost):
    x,y,ang,vx,vy=s['x'],s['y'],s['ang'],s['vx'],s['vy']
    de=s['de']; be=s['be']
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
    fx,fy=math.cos(ang),math.sin(ang); rx,ry=-fy,fx
    vx=fx*vF+rx*vL; vy=fy*vF+ry*vL
    return dict(x=x+vx*DT,y=y+vy*DT,ang=ang,vx=vx,vy=vy,drifting=drifting,de=de,be=be,vF=vF,vL=vL)

def simulate(policy, secs):
    s=dict(x=64.,y=44.,ang=0.,vx=0.,vy=0.,de=0.,be=0.,drifting=False)
    log=[]
    for i in range(int(secs/DT)):
        s=step(s,*policy(s,i))
        sp=math.hypot(s['vx'],s['vy'])
        log.append((i*DT, sp, math.atan2(s['vy'],s['vx']), s['ang'], s['vF'], s['vL'], s['be'], s['de'], s['drifting']))
    return s,log

def report(name, policy, secs=10.0):
    s,log=simulate(policy,secs)
    sp=[l[1] for l in log]
    # velocity direction rate over last 2s
    a=log[-40]; b=log[-1]
    da=(b[2]-a[2]+math.pi)%(2*math.pi)-math.pi
    print('%-30s maxspeed=%5.2f lastspeed=%5.2f meanlast2s=%5.2f headrate=%+.2f drift=%.0f%% be=%.2f de=%.2f' % (
        name, max(sp), sp[-1], sum(sp[-40:])/40, da/2.0,
        100.0*sum(1 for l in log[-200:] if l[8])/200, s['be'], s['de']))
    return s,log

# 1) gentle sin steering while drifting + boost
def p_scallop(s,i):
    st = 0.9*math.sin(i*2*math.pi/40)   # 2s period
    return (1.0, st, True, True)
report('scallop drift+boost', p_scallop, 12)

# 2) constant small steer, drift+boost
for se in (0.2,0.35,0.5):
    report('const %.2f drift+boost'%se, lambda s,i,se=se:(1.0,se,True,True), 12)

# 3) spin: full steer drift, alternate direction occasionally -- "pump"
def p_pump(s,i):
    se = 1.0 if (i//12)%2==0 else -1.0
    return (1.0, se, True, True)
report('flip full steer drift+boost', p_pump, 12)

# 4) constant steer grip+boost
for se in (0.2,0.4,0.6):
    report('const %.2f grip+boost'%se, lambda s,i,se=se:(1.0,se,False,True), 12)

# 5) drift with small steer, then 1 grip frame every N
def mk_pulse(N, se):
    def p(s,i):
        dr = (i % N) != 0
        return (1.0, se, dr, True)
    return p
for N in (3,4,6):
    for se in (0.4,0.6,0.8):
        report('pulse drift 1/%d steer %.1f'%(N,se), mk_pulse(N,se), 12)
