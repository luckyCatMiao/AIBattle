import sys, math, statistics; sys.path.insert(0,'.')
from fast import get_tracks, FastTrack, run
import ctrl2
from bench2 import P
from planner import wrap
data=get_tracks([int(sys.argv[1]) if len(sys.argv)>1 else 6022])
seed=list(data)[0]; fast=FastTrack(data[seed]); c=ctrl2.Ctrl(fast,P)
r=run(fast,c,max_seconds=40.0,record=True)
print('first lap', r['lap_times'], 'off %.1f%%'%r['offroad_pct'])
log=r['log']
for i in range(0,len(log),10):
    t,x,y,sp,off,be,dr=log[i]
    s,idx,od,tg=fast.line.project(x,y)
    vt=min(P['vmax'], c.prof[fast.line.index_at_s(s)])
    if i<300 or off:
        print('t=%5.2f s=%6.1f off=%+5.2f sp=%5.1f vt=%5.1f offr=%d be=%.2f drift=%d'%(t,s,od,sp,vt,off,be,dr))
