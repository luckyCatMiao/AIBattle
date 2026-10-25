import sys, math; sys.path.insert(0,'.'); sys.path.insert(0,'..')
from fast import get_tracks, FastTrack
import driver as D, agent as A, sim

def cp_arcs(t):
    out=[]
    for cp in t.checkpoints:
        best=min(range(len(t.points)), key=lambda j:(t.points[j][0]-cp[0])**2+(t.points[j][1]-cp[1])**2)
        out.append(t.cum[best])
    return out

def run(fast, P, seconds=110.0, verbose=False):
    t=fast.t; car=sim.Car(*t.grid[0]); drv=D.Driver(fast.line,P,checkpoints=t.checkpoints)
    arcs=cp_arcs(t); L=t.length
    frames=0; hint=0; mind=[9e9]*16; details=[None]*16
    laps=[]; last=30
    while frames<seconds*20:
        frames+=1
        if frames<=30: car.throttle=car.steer=0.; car.drift=car.boost=False
        else:
            th,st,dr,bo=drv.act(car,frames); car.throttle,car.steer,car.drift,car.boost=th,st,dr,bo
        sim.update_car(t,car)
        hint,d,s=fast.nearest_hint(car.x,car.y,hint)
        k=car.nextCp
        if abs((arcs[k]-s+L/2)%L - L/2) < 6.0:
            cp=t.checkpoints[k]; dist=math.hypot(car.x-cp[0],car.y-cp[1])
            if dist<mind[k]:
                mind[k]=dist; details[k]=(round(s,1),round(d,2),round(math.hypot(car.vx,car.vy),1),car.offRoad)
        if not car.finished:
            cp=t.checkpoints[car.nextCp]
            if math.hypot(car.x-cp[0],car.y-cp[1])<=cp[2]:
                if car.nextCp==0:
                    laps.append((frames-last)/20.0); last=frames
                    car.lap+=1; car.nextCp=1
                    if car.lap>=3: car.finished=True
                else: car.nextCp=(car.nextCp+1)%16
        if car.finished: break
    margins=[t.checkpoints[i][2]-mind[i] for i in range(16)]
    return car.finished,(frames-30)/20.0,laps,margins,details
