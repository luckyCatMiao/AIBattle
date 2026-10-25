import sys, itertools; sys.path.insert(0,'.')
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
FREE = len(sys.argv)>1 and sys.argv[1]=='free'
res=[]
for decel in (10.0,20.0,30.0):
 for vts in (0.85,1.0,1.15):
  for lav in (0.25,0.4,0.55):
   for la in (1.5,3.0):
    for slipm in (0.5,0.8,1.1):
      P=dict(base); P.update(decel=decel, vt_scale=vts, la_v=lav, la_base=la, slip_max=slipm)
      ts=[]; offs=[]; ok=True
      for s in seeds:
        r=run(tracks[s], ctrl2.Ctrl(tracks[s],P), max_seconds=80.0, energy_free=FREE)
        if not r['finished']: ok=False; break
        ts.append(r['time']); offs.append(r['offroad_pct'])
      if ok: res.append((sum(ts)/len(ts), decel,vts,lav,la,slipm, sum(offs)/len(offs)))
res.sort()
for r in res[:15]: print('mean=%.2f decel=%.0f vts=%.2f lav=%.2f la=%.1f slip=%.1f off=%.1f%%'%r)
