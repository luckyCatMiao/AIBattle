import sys; sys.path.insert(0,'.')
from fast import get_tracks, FastTrack, run
import ctrl2
base = dict(vmax=48.0, vscale=1.0, decel=30.0, la_base=1.5, la_v=0.25,
         slip_max=1.1, slip_gain=2.0, steer_gain=4.0, drift_slip=0.5,
         prof_ahead=3.0, vt_scale=1.15, boost_min=0.05, centre=0.3,
         weave_on=0.2, weave_amp=0.2, weave_half=6, weave_pulse=10, weave_vmin=6.0,
         always_boost=True)
seeds=[int(x) for x in (sys.argv[1:] or ['6011','6012','6021','6022','5011','5012'])]
data=get_tracks(seeds)
tot=[]
for s in seeds:
    f=FastTrack(data[str(s)]); c=ctrl2.Ctrl(f,base)
    r=run(f,c,max_seconds=90.0)
    print('seed %d fin=%s t=%.2f laps=%s off=%.1f%%'%(s,r['finished'],r['time'],['%.1f'%x for x in r['lap_times']],r['offroad_pct']))
