import sys; sys.path.insert(0,'.')
from fast import get_tracks, FastTrack, run
import ctrl2
seeds=[6011,6012,6021,6022]
data=get_tracks(seeds)
base = dict(vmax=48.0, vscale=1.0, decel=30.0, la_base=1.5, la_v=0.25,
         slip_max=1.1, slip_gain=2.0, steer_gain=4.0, drift_slip=0.5,
         prof_ahead=3.0, vt_scale=1.15, boost_min=0.05, centre=0.3,
         weave_on=0.4, weave_amp=0.25, weave_half=8, weave_pulse=20, weave_vmin=6.0,
         always_boost=True)
res=[]
for margin in (0.6,0.8,1.0,1.4):
  tracks={s:FastTrack(data[str(s)],margin=margin) for s in seeds}
  for prof_ahead in (0.0,3.0,8.0):
    for sg in (3.0,4.0,6.0):
      for cen in (0.15,0.3,0.6):
        P=dict(base); P.update(prof_ahead=prof_ahead, steer_gain=sg, centre=cen)
        ts=[]; offs=[]; ok=True
        for s in seeds:
          r=run(tracks[s], ctrl2.Ctrl(tracks[s],P), max_seconds=80.0)
          if not r['finished']: ok=False; break
          ts.append(r['time']); offs.append(r['offroad_pct'])
        if ok: res.append((sum(ts)/len(ts),margin,prof_ahead,sg,cen,sum(offs)/len(offs)))
res.sort()
for r in res[:12]: print('mean=%.2f margin=%.1f pa=%.0f sg=%.1f cen=%.2f off=%.1f%%'%r)
