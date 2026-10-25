import sys, json, statistics
sys.path.insert(0,'.')
from fast import get_tracks, FastTrack, run
import ctrl2
P=json.load(open(sys.argv[1] if len(sys.argv)>1 else 'best2.json'))
seeds=[int(x) for x in (sys.argv[2:] or ['5011','5012','6011','6012','6021','6022','7011','7012','8011','8012','9011','9012','10011','10012','11011','11012'])]
data=get_tracks(seeds); ts=[]; offs=[]
for s in seeds:
    f=FastTrack(data[str(s)], margin=P['margin']); c=ctrl2.Ctrl(f,P)
    r=run(f,c,max_seconds=100.0)
    if r['finished']:
        ts.append(r['time']); offs.append(r['offroad_pct'])
        print('seed %6d L=%.0f t=%5.2f laps=%s off=%.1f%%'%(s,f.length,r['time'],['%.2f'%x for x in r['lap_times']],r['offroad_pct']))
    else:
        print('seed %6d FAILED lap=%d off=%.1f%%'%(s,r['lap'],r['offroad_pct']))
print('mean %.2f  median %.2f  worst %.2f  off %.2f%%'%(statistics.mean(ts),statistics.median(ts),max(ts),statistics.mean(offs)))
