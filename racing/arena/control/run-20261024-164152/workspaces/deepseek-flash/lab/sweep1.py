import sys, itertools, statistics; sys.path.insert(0,'.')
from fast import get_tracks, FastTrack, run
import ctrl2
seeds=[6011,6012,6021]
data=get_tracks(seeds)
tracks={s:FastTrack(data[str(s)]) for s in seeds}
base = dict(vmax=48.0, vscale=1.0, decel=20.0, la_base=2.5, la_v=0.35,
         slip_max=0.8, slip_gain=2.0, steer_gain=4.0, drift_slip=0.5,
         prof_ahead=3.0, vt_scale=1.0, boost_min=0.05, centre=0.3,
         weave_on=0.2, weave_amp=0.2, weave_half=6, weave_pulse=10, weave_vmin=6.0,
         always_boost=True)
best=[]
for amp in (0.18,0.25,0.35,0.5):
  for pulse in (5,8,12,16):
    for half in (4,6,10):
      P=dict(base); P['weave_amp']=amp; P['weave_pulse']=pulse; P['weave_half']=half
      ts=[]; offs=[]; ok=True
      for s in seeds:
        r=run(tracks[s], ctrl2.Ctrl(tracks[s],P), max_seconds=75.0)
        if not r['finished']: ok=False; break
        ts.append(r['time']); offs.append(r['offroad_pct'])
      if ok:
        best.append((sum(ts)/len(ts), amp,pulse,half, sum(offs)/len(offs)))
best.sort()
for b in best[:12]: print('mean=%.2f amp=%.2f pulse=%d half=%d off=%.1f%%'%b)
