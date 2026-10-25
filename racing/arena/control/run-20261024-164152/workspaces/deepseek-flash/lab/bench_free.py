import sys; sys.path.insert(0,'.')
from fast import get_tracks, FastTrack, run
import ctrl2
from bench2 import P
seeds=[6011,6012,6021,6022,5011,5012]
data=get_tracks(seeds)
for s in seeds:
    fast=FastTrack(data[str(s)]); c=ctrl2.Ctrl(fast,P)
    r=run(fast,c,max_seconds=60.0,energy_free=True)
    print('seed %d fin=%s t=%.2f laps=%s off=%.1f%%'%(s,r['finished'],r['time'],
        ['%.1f'%x for x in r['lap_times']], r['offroad_pct']))
