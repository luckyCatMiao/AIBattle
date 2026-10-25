import math, sim
def circle_track(R, hw=3.5, cx=64, cy=44):
    tiles=[1]*(128*88)
    for y in range(88):
        for x in range(128):
            d=math.hypot(x+0.5-cx, y+0.5-cy)
            if abs(d-R)<=hw: tiles[y*128+x]=0
    return dict(width=128,height=88,tiles=tiles,points=[],halfWidth=hw,length=2*math.pi*R,
                checkpoints=[],start={'x':cx+R,'y':cy,'angle':0},grid=[])
def wrap(a):
    while a>math.pi: a-=2*math.pi
    while a<-math.pi: a+=2*math.pi
    return a
def trial(R, lt, kh, ke, ff_scale, vtarget, drift=True, boost=True, seconds=10, v0=8, E0=1.0):
    tr=sim.Track(circle_track(R)); cx,cy=64.0,44.0
    car=sim.Car(cx+R,cy,math.pi/2); car.vy=v0; car.boostEnergy=E0
    off=0; n=int(seconds*20); vs=[]; dr=0
    for i in range(n):
        v=sim.speed(car)
        fwd=car.vx*math.cos(car.angle)+car.vy*math.sin(car.angle)
        vang=math.atan2(car.vy,car.vx) if v>0.3 else car.angle
        ang=math.atan2(car.y-cy,car.x-cx)
        L=max(3.0, v*lt)
        lead=ang+L/R
        tx,ty=cx+R*math.cos(lead), cy+R*math.sin(lead)
        # desired velocity direction toward target
        des=math.atan2(ty-car.y,tx-car.x)
        alpha=wrap(des-vang)
        # feedforward curvature from geometry
        kappa_cmd=2*math.sin(alpha)/L
        om = 3.2*min(1.0,abs(fwd)/8.0)*(1.6 if drift else 1.0)
        ff = kappa_cmd*v/max(om,0.05)*ff_scale
        er=math.hypot(car.x-cx,car.y-cy)-R
        steer=ff + kh*alpha + ke*er
        steer=max(-1,min(1,steer))
        car.throttle=1.0 if v<vtarget else -0.5
        car.steer=steer; car.drift=drift
        car.boost=boost and car.boostEnergy>0.02
        sim.update_car(tr,car)
        if car.offRoad: off+=1
        if car.drifting: dr+=1
        vs.append(v)
    return sum(vs)/len(vs), vs[-1], off/n, car.boostEnergy, dr/n
if __name__=='__main__':
    import itertools
    for R in (8,12,20):
        best=[]
        for lt in (0.3,0.5,0.8,1.2):
            for kh in (0.0,0.3,0.8,1.5):
                for ke in (0.0,0.15,0.4,1.0):
                    for fs in (0.7,1.0,1.3):
                        for vt in (14,18,24,30):
                            avg,v,offr,E,dr=trial(R,lt,kh,ke,fs,vt)
                            if offr==0:
                                best.append((avg,v,lt,kh,ke,fs,vt,E))
        best.sort(reverse=True)
        print('R=',R)
        for b in best[:10]:
            print('   avg%.1f v%.1f lt%.1f kh%.1f ke%.2f fs%.1f vt%d E%.2f'%b)
