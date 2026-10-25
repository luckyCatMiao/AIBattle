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

def drive_circle(R, hw=3.5, drift=True, boost=False, vtarget=99, seconds=12):
    tr=sim.Track(circle_track(R,hw))
    cx,cy=64.0,44.0
    # start on the right side moving +y (counter-clockwise)
    car=sim.Car(cx+R, cy, math.pi/2)
    car.boostEnergy=1.0 if boost else 0.0
    t=0.0; off=0; n=int(seconds*20); vin=0.0
    for i in range(n):
        # control: pure pursuit around circle
        ang=math.atan2(car.y-cy, car.x-cx)
        # target point ahead on circle
        lead=ang+0.5
        tx,ty=cx+R*math.cos(lead), cy+R*math.sin(lead)
        desired=math.atan2(ty-car.y,tx-car.x)
        err=(desired-car.angle+math.pi)%(2*math.pi)-math.pi
        steer=max(-1,min(1,err*2.0))
        v=sim.speed(car)
        throttle=1.0 if v<vtarget else -1.0
        car.throttle=throttle; car.steer=steer; car.drift=drift; car.boost=boost and car.boostEnergy>0.02
        sim.update_car(tr,car)
        if car.offRoad: off+=1
    # measured path curvature over last 2s
    return sim.speed(car), off/n

for R in (4,6,8,12,20,40):
    row=[]
    for drift in (False,True):
        for vtarget in (8,12,16,20,26,34):
            v,off=drive_circle(R,drift=drift,vtarget=vtarget)
            row.append(f"{'D' if drift else 'G'}{vtarget}:{'%.0f'%v}{'>OFF' if off>0.05 else ''}")
    print('R=%2d hw3.5'%R, ' '.join(row))
