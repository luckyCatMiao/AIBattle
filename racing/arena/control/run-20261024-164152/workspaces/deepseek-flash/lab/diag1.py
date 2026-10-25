import sys; sys.path.insert(0,'.')
from fast import get_tracks, FastTrack, run
from ctrl1 import Ctrl
P = dict(vmax=48.0, vscale=1.0, decel=20.0, la_base=2.5, la_v=0.35,
         slip_max=0.8, slip_gain=2.0, steer_gain=4.0, drift_slip=0.5,
         prof_ahead=3.0, vt_scale=1.0, boost_min=0.05, boost_vcap=1.4)
data=get_tracks([6011]); fast=FastTrack(data['6011']); c=Ctrl(fast,P)
r=run(fast,c,max_seconds=40.0,record=True)
print('off %.1f%% time %s'%(r['offroad_pct'], r['lap_times']))
log=r['log']
for i in range(0,min(len(log),400),8):
    t,x,y,sp,off,be,dr=log[i]
    print('t=%5.2f pos=(%6.1f,%6.1f) sp=%5.2f off=%d be=%.2f drift=%d'%(t,x,y,sp,off,be,dr))
import statistics
print('mean speed %.2f max %.2f'%(statistics.mean(l[3] for l in log), max(l[3] for l in log)))
