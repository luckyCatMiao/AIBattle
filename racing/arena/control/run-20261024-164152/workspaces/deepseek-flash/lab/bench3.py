import sys; sys.path.insert(0,'.')
from fast import get_tracks, FastTrack, run
import ctrl3
P = dict(vmax=48.0, vscale=1.0, decel=30.0, la_base=1.5, la_v=0.25,
         omax=2.2, kw=1.2, grip=4.46, steer_gain=4.0, drift_hyst=1.0,
         prof_ahead=3.0, vt_scale=1.15, boost_min=0.05, boost_slack=3.0,
         weave_w=0.35, weave_beta=0.45, weave_half=6, weave_vmin=6.0)
seeds=[int(x) for x in (sys.argv[1:] or ['6011','6012','6021','6022','5011','5012'])]
data=get_tracks(seeds)
for s in seeds:
    f=FastTrack(data[str(s)], margin=0.8); c=ctrl3.Ctrl(f,P)
    r=run(f,c,max_seconds=90.0)
    print('seed %d fin=%s t=%.2f laps=%s off=%.1f%%'%(s,r['finished'],r['time'],['%.1f'%x for x in r['lap_times']],r['offroad_pct']))
