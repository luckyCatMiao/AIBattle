import sys, statistics; sys.path.insert(0,'.'); sys.path.insert(0,'..')
from fast import get_tracks, FastTrack
from cpscan import run1
import agent as A
seeds=[5011,6011,6021,8011,11011,3,7,10,16,8,15,4,6,9]
data=get_tracks(seeds)
res=[]
for gd in (0.0,6.0,10.0,16.0,24.0):
  for gw in (0.35,0.7,1.0):
    if gd==0.0 and gw>0.35: continue
    P=dict(A.PARAMS); P['cp_guard_dist']=gd; P['cp_guard_w']=gw
    ts=[]; wm=9e9; ok=True
    for s in seeds:
        f=FastTrack(data[str(s)], margin=P['margin'])
        fin,tm,laps,off,worst=run1(f,P)
        if not fin: ok=False; break
        ts.append(tm)
        wm=min(wm, min(cp[2]-d for cp,d in zip(f.t.checkpoints,worst)))
    if ok: res.append((statistics.mean(ts), max(ts), gd, gw, wm))
for r in sorted(res): print('mean=%.2f worst=%.2f gd=%.0f gw=%.2f minCPmargin=%+.2f'%r)
