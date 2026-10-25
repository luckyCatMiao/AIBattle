import sys, json, statistics, importlib
sys.path.insert(0,'.'); sys.path.insert(0,'..')
from fast import get_tracks, FastTrack, run
import driver as D
import agent as A

class Adapter:
    def __init__(self, fast, P):
        self.d = D.Driver(fast.line, P, checkpoints=fast.t.checkpoints)
    def act(self, car, frame, fast):
        return self.d.act(car, frame)

def make(P):
    def f(fast):
        return Adapter(fast, P)
    return f

if __name__=='__main__':
    P=dict(A.PARAMS)
    for kv in sys.argv[1:]:
        if '=' in kv:
            k,v=kv.split('=',1); P[k]=float(v)
    seeds=[int(x) for x in (P.pop('_seeds',None) or '5011 5012 6011 6012 6021 6022 7011 7012 8011 9011 10011 11011 3 5 7 10'.split())] if isinstance(P.get('_seeds'),str) else [5011,5012,6011,6012,6021,6022,7011,7012,8011,9011,10011,11011,3,5,7,10]
    data=get_tracks(seeds); ts=[]; offs=[]
    for s in seeds:
        f=FastTrack(data[str(s)], margin=P['margin']); c=Adapter(f,P)
        r=run(f,c,max_seconds=100.0)
        if r['finished']:
            ts.append(r['time']); offs.append(r['offroad_pct'])
            print('seed %6d L=%.0f t=%5.2f laps=%s off=%.1f%%'%(s,f.length,r['time'],['%.2f'%x for x in r['lap_times']],r['offroad_pct']))
        else:
            print('seed %6d FAILED off=%.1f%%'%(s,r['offroad_pct']))
    if ts: print('mean %.2f worst %.2f off %.2f%%'%(statistics.mean(ts),max(ts),statistics.mean(offs)))
