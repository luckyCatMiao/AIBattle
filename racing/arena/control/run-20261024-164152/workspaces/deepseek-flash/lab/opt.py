import sys, os, math, json, random, time
sys.path.insert(0,'.')
import multiprocessing as mp
from fast import get_tracks, FastTrack, run
import ctrl2

SEEDS=[5011,5012,6011,6012,6021,6022,7011,7012,8011,8012,9011,9012]
_data=None
_cache={}
def init(seeds):
    global _data, SEEDS
    _data=get_tracks(seeds); SEEDS=seeds

def eval_one(args):
    P, seed = args
    margin = P['margin']
    key=(seed,margin)
    ft=_cache.get(key)
    if ft is None:
        ft=FastTrack(_data[str(seed)], margin=margin); _cache[key]=ft
    r=run(ft, ctrl2.Ctrl(ft,P.copy()), max_seconds=100.0)
    return seed, r['finished'], r['time'], r['offroad_pct'], r['lap_times']

def evaluate(P, pool):
    res = pool.map(eval_one, [(P,s) for s in SEEDS], chunksize=1)
    times=[]; off=0.0; bad=0
    for seed,fin,t,o,laps in res:
        off+=o
        if fin: times.append(t)
        else: bad+=1
    if bad: return 1e6 + bad*100 + sum(times)/max(1,len(times))
    times.sort()
    return sum(times)/len(times) + 0.25*(max(times)-min(times)) + 0.5*off/len(SEEDS)

BOUNDS = dict(
    vmax=(30.0,60.0), vscale=(0.8,1.35), decel=(10.0,60.0), la_base=(0.5,5.0),
    la_v=(0.05,0.7), slip_max=(0.35,1.5), slip_gain=(0.8,5.0), steer_gain=(2.0,10.0),
    drift_slip=(0.15,1.2), prof_ahead=(-6.0,16.0), vt_scale=(0.85,1.45),
    centre=(0.0,1.0), weave_on=(0.12,0.9), weave_amp=(0.16,0.7), weave_half=(2,18),
    weave_pulse=(4,40), weave_vmin=(2.0,16.0), boost_min=(0.02,0.5),
    boost_slack=(-10.0,20.0), margin=(0.6,1.3))
INT=('weave_half','weave_pulse')
BASE = dict(vmax=48.0, vscale=1.0, decel=30.0, la_base=1.5, la_v=0.25,
         slip_max=1.1, slip_gain=2.0, steer_gain=6.0, drift_slip=0.5,
         prof_ahead=0.0, vt_scale=1.15, boost_min=0.05, centre=0.15,
         weave_on=0.4, weave_amp=0.25, weave_half=8, weave_pulse=20, weave_vmin=6.0,
         boost_slack=3.0, margin=0.8, always_boost=True)

def randP(rng, base, scale):
    P=dict(base)
    for k,(lo,hi) in BOUNDS.items():
        if rng.random()<scale:
            v=P[k]+rng.gauss(0,(hi-lo)*0.12)
            v=max(lo,min(hi,v))
            P[k]=int(round(v)) if k in INT else v
    return P

if __name__=='__main__':
    seeds=[int(x) for x in (sys.argv[2:] or SEEDS)]
    budget=int(sys.argv[1]) if len(sys.argv)>1 else 300
    rng=random.Random(int(sys.argv[3]) if len(sys.argv)>3 else 7)
    start = dict(BASE)
    if os.path.exists('best2.json'):
        try: start.update(json.load(open('best2.json')))
        except Exception: pass
    with mp.Pool(24, initializer=init, initargs=(seeds,)) as pool:
        best=start; bs=evaluate(best,pool)
        print('start %.3f'%bs, flush=True)
        t0=time.time()
        for it in range(budget):
            P=randP(rng,best,0.5)
            s=evaluate(P,pool)
            if s<bs:
                bs=s; best=P
                print('%3d  %.3f  mean3lap=%.2f  %s'%(it,s,s*1.0,json.dumps({k:round(v,3) if isinstance(v,float) else v for k,v in P.items()})), flush=True)
        print('DONE %.3f in %.0fs'%(bs,time.time()-t0))
        json.dump(best, open('best2.json','w'), indent=1)
