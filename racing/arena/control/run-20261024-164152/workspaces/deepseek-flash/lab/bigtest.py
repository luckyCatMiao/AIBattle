import sys, statistics; sys.path.insert(0,'.'); sys.path.insert(0,'..')
from fast import get_tracks, FastTrack
from cpdiag import run
import agent as A
P=dict(A.PARAMS)
for kv in sys.argv[1:]:
    if '=' in kv: k,v=kv.split('='); P[k]=float(v)
seeds=list(range(100,100+int(P.pop('_n',60) if '_n' in P else 60)))
data=get_tracks(seeds)
bad=[]; rates=[]; tm_all=[]
for s in seeds:
    f=FastTrack(data[str(s)], margin=P['margin'])
    fin,tm,laps,mar,det=run(f,P)
    L=f.length
    ok = fin and len(laps)==3 and max(laps) < 1.6*min(laps)
    tm_all.append(tm if fin else 999)
    rates.append(3*L/tm if fin else 0)
    if not ok: bad.append((s,fin,laps,tm,L))
print('seeds=%d  bad=%d'%(len(seeds),len(bad)))
for b in bad[:12]: print('  BAD', b)
print('mean 3lap=%.2f  mean progress rate=%.2f /s  worst=%.1f'%(
    statistics.mean(tm_all), statistics.mean([r for r in rates if r]), max(tm_all)))
print('slowest 5:', sorted([(round(t,1),s) for t,s in zip(tm_all,seeds)])[-5:])
