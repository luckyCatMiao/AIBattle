import sys, statistics; sys.path.insert(0,'.'); sys.path.insert(0,'..')
from fast import get_tracks, FastTrack
from cpscan import run1
import agent as A
seeds=[5011,6011,6021,8011,11011,3,7,10,16,8,15,4,6,9]
data=get_tracks(seeds)
res=[]
for gd in (4.0,8.0,16.0):
  for gw in (0.2,0.35,0.6):
    for sl in (0.5,0.9,1.4):
      P=dict(A.PARAMS); P['cp_guard_dist']=gd; P['cp_guard_w']=gw; P['cp_guard_slack']=sl
      ts=[]; wm=9e9; ok=True
      for s in seeds:
        f=FastTrack(data[str(s)], margin=P['margin'])
        fin,tm,laps,off,worst=run1(f,P)
        if not fin: ok=False; break
        ts.append(tm); wm=min(wm, min(cp[2]-d for cp,d in zip(f.t.checkpoints,worst)))
      if ok: res.append((statistics.mean(ts), max(ts), gd, gw, sl, wm))
for r in sorted(res)[:12]: print('mean=%.2f worst=%.2f gd=%.0f gw=%.2f slack=%.1f minCPmargin=%+.2f'%r)
