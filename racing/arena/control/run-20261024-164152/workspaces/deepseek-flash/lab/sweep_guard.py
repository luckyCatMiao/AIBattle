import sys, statistics; sys.path.insert(0,'.'); sys.path.insert(0,'..')
from fast import get_tracks, FastTrack, run
import driver as D, agent as A
seeds=[5011,6011,6021,7011,9011,10011,3,7,10,5]
data=get_tracks(seeds)
class Ad:
    def __init__(self, fast, P): self.d=D.Driver(fast.line,P,checkpoints=fast.t.checkpoints)
    def act(self, car, frame, fast): return self.d.act(car, frame)
res=[]
for margin in (0.6,0.8,1.0,1.2):
  for gd in (0.0,5.0,8.0,12.0):
    for gw in (0.35,0.6,0.9):
      if gd==0.0 and gw!=0.35: continue
      P=dict(A.PARAMS); P['margin']=margin; P['cp_guard_dist']=gd; P['cp_guard_w']=gw
      ts=[]; off=0.0; ok=True
      for s in seeds:
        f=FastTrack(data[str(s)], margin=margin); c=Ad(f,P)
        r=run(f,c,max_seconds=110.0)
        if not r['finished']: ok=False; break
        ts.append(r['time']); off+=r['offroad_pct']
      if ok: res.append((statistics.mean(ts),max(ts),margin,gd,gw,off/len(seeds)))
res.sort()
for r in res[:14]: print('mean=%.2f worst=%.2f margin=%.1f gd=%.0f gw=%.2f off=%.2f%%'%r)
