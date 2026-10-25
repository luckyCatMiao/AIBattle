import sys, time
sys.path.insert(0,'.')
from fast import get_tracks, FastTrack, run
from ctrl1 import Ctrl
import ctrl1

P = dict(vmax=48.0, vscale=1.0, decel=20.0, la_base=2.5, la_v=0.35,
         slip_max=0.8, slip_gain=2.0, steer_gain=4.0, drift_slip=0.5,
         prof_ahead=3.0, vt_scale=1.0, boost_min=0.05, boost_vcap=1.4)

seeds = [int(x) for x in (sys.argv[1:] or ['6011','6012','6021','6022','5011','5012'])]
data = get_tracks(seeds)
ts=[]
for s in seeds:
    fast = FastTrack(data[str(s)])
    c = Ctrl(fast, P)
    r = run(fast, c, max_seconds=60.0)
    print('seed %d L=%.0f fin=%s t=%s laps=%s off=%.1f%%' % (s, fast.length, r['finished'], r['time'],
          ['%.1f'%x for x in r['lap_times']], r['offroad_pct']))
    if r['finished']: ts.append(r['time'])
if ts: print('mean %.2f  best %.2f' % (sum(ts)/len(ts), min(ts)))
