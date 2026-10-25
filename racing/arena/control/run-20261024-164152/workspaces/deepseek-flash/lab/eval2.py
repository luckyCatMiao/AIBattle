import sys, statistics; sys.path.insert(0,'.')
from fast import get_tracks, FastTrack, run
import ctrl2
from cfg import BASE, MARGIN
seeds=[int(x) for x in (sys.argv[1:] or ['6011','6012','6021','6022','5011','5012','7011','7012'])]
data=get_tracks(seeds); ts=[]
for s in seeds:
    f=FastTrack(data[str(s)], margin=MARGIN); c=ctrl2.Ctrl(f,BASE)
    r=run(f,c,max_seconds=90.0)
    laps=['%.1f'%x for x in r['lap_times']]
    print('seed %d L=%.0f fin=%s t=%s laps=%s off=%.1f%%'%(s,f.length,r['finished'],
        ('%.1f'%r['time']) if r['time'] else '-', laps, r['offroad_pct']))
    if r['finished']: ts.append(r['time'])
if ts: print('mean 3-lap %.2f  (%.2f/lap)'%(sum(ts)/len(ts), sum(ts)/len(ts)/3))
