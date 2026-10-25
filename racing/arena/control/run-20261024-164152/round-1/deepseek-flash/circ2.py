import math, sim

def circle_track(R, hw=3.5, cx=64, cy=44):
    tiles=[1]*(128*88)
    for y in range(88):
        for x in range(128):
            d=math.hypot(x+0.5-cx, y+0.5-cy)
            if abs(d-R)<=hw: tiles[y*128+x]=0
    return dict(width=128,height=88,tiles=tiles,points=[],
                halfWidth=hw,length=2*math.pi*R,checkpoints=[],
                start={'x':cx+R,'y':cy,'angle':0},grid=[])

def drive(R, drift=True, boost=False, vtarget=99, mode='heading', gain=2.0, seconds=10, amp=0.0, per=8):
    tr=sim.Track(circle_track(R,3.5)); cx,cy=64.0,44.0
    car=sim.Car(cx+R, cy, math.pi/2); car.boostEnergy=1.0 if boost else 0.0
    off=0; n=int(seconds*20); vels=[]
    x0,y0=None,None
    for i in range(n):
        ang=math.atan2(car.y-cy, car.x-cx)
        lead=ang+0.45
        tx,ty=cx+R*math.cos(lead), cy+R*math.sin(lead)
        desired=math.atan2(ty-car.y,tx-car.x)
        ref = car.angle if mode=='heading' else math.atan2(car.vy,car.vx)
        err=(desired-ref+math.pi)%(2*math.pi)-math.pi
        steer=max(-1,min(1,err*gain))
        if amp:
            steer=max(-1,min(1,steer+(amp if (i//per)%2==0 else -amp)))
        v=sim.speed(car)
        throttle=1.0 if v<vtarget else -1.0
        car.throttle=throttle; car.steer=steer
        car.drift=drift; car.boost=boost and car.boostEnergy>0.02
        sim.update_car(tr,car)
        if car.offRoad: off+=1
        vels.append(v)
    return sim.speed(car), off/n, sum(vels)/len(vels), car.boostEnergy

for R in (4,6,8,12,20):
    print('R=',R)
    for mode in ('heading','velocity'):
        for drift in (False,True):
            for vt in (12,16,20,26,34):
                v,off,avg,E=drive(R,drift=drift,boost=False,vtarget=vt,mode=mode)
                print('   %s %s vt%2d -> v=%4.1f avg=%4.1f off=%3.0f%% E=%.2f'%(mode[:4],'D' if drift else 'G',vt,v,avg,off*100,E))
