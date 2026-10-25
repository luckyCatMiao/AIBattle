import sys; sys.path.insert(0,'.')
from fast import get_tracks, FastTrack, run
import ctrl2
seeds=[6011,6012,6021,6022]
data=get_tracks(seeds); tracks={s:FastTrack(data[str(s)]) for s in seeds}
base = dict(vmax=48.0, vscale=1.0, decel=30.0, la_base=1.5, la_v=0.25,
         slip_max=1.1, slip_gain=2.0, steer_gain=4.0, drift_slip=0.5,
         prof_ahead=3.0, vt_scale=1.15, boost_min=0.05, centre=0.3,
         weave_on=0.2, weave_amp=0.2, weave_half=6, weave_pulse=10, weave_vmin=6.0,
         always_boost=True)
res=[]
for amp in (0.18,0.25,0.35,0.5):
  for half in (3,4,6,8):
    for pulse in (4,6,8,12,20):
      for wo in (0.15,0.25,0.4):
        P=dict(base); P.update(weave_amp=amp, weave_half=half, weave_pulse=pulse, weave_on=wo)
        ts=[]; offs=[]; ok=True
        for s in seeds:
          r=run(tracks[s], ctrl2.Ctrl(tracks[s],P), max_seconds=80.0)
          if not r['finished']: ok=False; break
          ts.append(r['time']); offs.append(r['offroad_pct'])
        if ok: res.append((sum(ts)/len(ts),amp,half,pulse,wo,sum(offs)/len(offs)))
res.sort()
for r in res[:12]: print('mean=%.2f amp=%.2f half=%d pulse=%d wo=%.2f off=%.1f%%'%r)
