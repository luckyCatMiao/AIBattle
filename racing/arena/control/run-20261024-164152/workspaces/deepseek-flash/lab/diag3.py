import sys, math; sys.path.insert(0,'.')
from fast import get_tracks, FastTrack, run
import ctrl2
from bench2 import P
import sim
data=get_tracks([6011]); f=FastTrack(data['6011']); c=ctrl2.Ctrl(f,P)
# instrument manually
t=f.t; car=sim.Car(*t.grid[0]); hint=0; frames=0; rec=[]
while frames<30*20:
    frames+=1
    if frames<=30: car.throttle=car.steer=0.; car.drift=car.boost=False; car.boostEnergy=1.0
    else:
        th,st,dr,bo=c.act(car,frames,f); car.throttle,car.steer,car.drift,car.boost=th,st,dr,bo
        car.boostEnergy=1.0
    sim.update_car(t,car)
    hint,d,s=f.nearest_hint(car.x,car.y,hint)
    if frames>30:
        v=math.hypot(car.vx,car.vy)
        i=f.line.index_at_s(s)
        rec.append((s,v,min(48.0,c.prof[i]),car.offRoad,car.drifting,car.steer))
    if car.lap>=1: break
print('lap frame', frames, 'time %.2f'%((frames-30)/20))
# bin by s
B=20
bins={}
for s,v,vt,off,dr,st in rec:
    b=int(s/(f.length/B))
    bins.setdefault(b,[]).append((v,vt,off,dr))
for b in sorted(bins):
    a=bins[b]
    print('s %3d-%3d  n=%3d  v=%5.1f  vt=%5.1f  off=%4.1f%%  drift=%3.0f%%'%(
        b*f.length/B,(b+1)*f.length/B,len(a), sum(x[0] for x in a)/len(a), sum(x[1] for x in a)/len(a),
        100*sum(1 for x in a if x[2])/len(a), 100*sum(1 for x in a if x[3])/len(a)))
