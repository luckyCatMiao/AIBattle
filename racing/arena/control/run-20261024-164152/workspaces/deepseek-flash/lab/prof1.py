import sys, math; sys.path.insert(0,'.')
from fast import get_tracks, FastTrack
import ctrl2, sim
from planner import wrap
P = dict(vmax=48.0, vscale=1.0, decel=30.0, la_base=1.5, la_v=0.25,
         slip_max=1.1, slip_gain=2.0, steer_gain=4.0, drift_slip=0.5,
         prof_ahead=3.0, vt_scale=1.15, boost_min=0.05, centre=0.3,
         weave_on=0.4, weave_amp=0.25, weave_half=8, weave_pulse=20, weave_vmin=6.0,
         always_boost=True)
data=get_tracks([6011]); f=FastTrack(data['6011'], margin=0.8); c=ctrl2.Ctrl(f,P)
t=f.t; car=sim.Car(*t.grid[0]); frames=0; hint=0
rec=[]; lap=0; lapstart=30
while frames<1200 and lap<2:
    frames+=1
    if frames<=30: car.throttle=car.steer=0.; car.drift=car.boost=False
    else:
        th,st,dr,bo=c.act(car,frames,f); car.throttle,car.steer,car.drift,car.boost=th,st,dr,bo
    sim.update_car(t,car)
    hint,d,s=f.nearest_hint(car.x,car.y,hint)
    if not car.finished:
        cp=t.checkpoints[car.nextCp]
        if math.hypot(car.x-cp[0],car.y-cp[1])<=cp[2]:
            if car.nextCp==0:
                lap+=1; car.nextCp=1
                if lap==1: lapstart=frames
                if lap>=2: break
            else: car.nextCp=(car.nextCp+1)%16
    if lap==1:
        v=math.hypot(car.vx,car.vy)
        i=f.line.index_at_s(s)
        rec.append((s,v,min(48.0,c.prof[i])*P['vt_scale'],car.offRoad,car.drifting,car.boosting,car.boostEnergy))
print('lap time', (frames-lapstart)/20)
# aggregate in 24 bins
B=24; bins={}
for r in rec:
    b=int(r[0]/(f.length/B)); bins.setdefault(b,[]).append(r)
print('bin    s-range      t_bin  v     vt    off% drift% boost% E')
tot=0
for b in sorted(bins):
    a=bins[b]
    dt=len(a)/20.0; tot+=dt
    print('%2d %4.0f-%4.0f  %5.2fs %5.1f %5.1f %4.0f %4.0f %4.0f %.2f'%(
      b, b*f.length/B,(b+1)*f.length/B, dt, sum(x[1] for x in a)/len(a), sum(x[2] for x in a)/len(a),
      100*sum(1 for x in a if x[3])/len(a),100*sum(1 for x in a if x[4])/len(a),
      100*sum(1 for x in a if x[5])/len(a), sum(x[6] for x in a)/len(a)))
print('total %.2f'%tot)
