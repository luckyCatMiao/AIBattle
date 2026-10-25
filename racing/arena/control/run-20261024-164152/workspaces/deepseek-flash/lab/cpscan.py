"""Run many seeds, record the worst checkpoint pass margin (radius - distance)."""
import sys, math, statistics; sys.path.insert(0,'.'); sys.path.insert(0,'..')
from fast import get_tracks, FastTrack
import driver as D, agent as A, sim

class Ad:
    def __init__(self, fast, P): self.d=D.Driver(fast.line,P,checkpoints=fast.t.checkpoints)
    def act(self, car, frame): return self.d.act(car, frame)

def run1(fast, P, max_seconds=110.0):
    t=fast.t; car=sim.Car(*t.grid[0]); frames=0; hint=0
    Adapter=Ad(fast,P)
    worst=[9e9]*len(t.checkpoints)
    laps=[]; last=30; off=0
    while frames<max_seconds*20:
        frames+=1
        if frames<=30: car.throttle=car.steer=0.; car.drift=car.boost=False
        else:
            th,st,dr,bo=Adapter.act(car,frames); car.throttle,car.steer,car.drift,car.boost=th,st,dr,bo
        sim.update_car(t,car)
        if car.offRoad: off+=1
        hint,d,s=fast.nearest_hint(car.x,car.y,hint)
        car.progress=car.lap*t.length+s
        if not car.finished:
            cp=t.checkpoints[car.nextCp]
            dist=math.hypot(car.x-cp[0],car.y-cp[1])
            worst[car.nextCp]=min(worst[car.nextCp], dist)
            if dist<=cp[2]:
                if car.nextCp==0:
                    laps.append((frames-last)/20.0); last=frames
                    car.lap+=1; car.nextCp=1
                    if car.lap>=3: car.finished=True
                else: car.nextCp=(car.nextCp+1)%16
        if car.finished: break
    return car.finished,(frames-30)/20.0,laps,off/max(1,frames-30)*100,worst

if __name__=='__main__':
    P=dict(A.PARAMS)
    for kv in sys.argv[1:]:
        k,v=kv.split('='); P[k]=float(v)
    seeds=[5011,5012,6011,6012,6021,6022,7011,7012,8011,9011,10011,11011,3,5,7,10,4,6,9,11,12,1,2,8,13,14,15,16,17,18]
    data=get_tracks(seeds); bad=0
    for s in seeds:
        f=FastTrack(data[str(s)], margin=P['margin'])
        fin,tm,laps,off,worst=run1(f,P)
        r=f.t.checkpoints[0][2]
        wm=min(cp[2]-d for cp,d in zip(f.t.checkpoints,worst))
        flag='' if wm>0.8 else '  <-- TIGHT'
        if not fin or wm<=0: bad+=1
        print('seed %6d fin=%s t=%5.1f laps=%s off=%4.1f worstMargin=%+.2f (rad %.2f)%s'%(
            s,fin,tm,['%.1f'%x for x in laps],off,wm,r,flag))
    print('bad=%d/%d'%(bad,len(seeds)))
