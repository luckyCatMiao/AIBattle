import sys, os, json, random, time
sys.path.insert(0,'.')
import multiprocessing as mp
from opt import BOUNDS, INT, BASE, init, evaluate

def perturb(rng, base, scale):
    P=dict(base)
    keys=list(BOUNDS.keys())
    k=rng.choice(keys)
    lo,hi=BOUNDS[k]
    v=P[k]+rng.gauss(0,(hi-lo)*scale)
    v=max(lo,min(hi,v))
    P[k]=int(round(v)) if k in INT else v
    return P

if __name__=='__main__':
    budget=int(sys.argv[1]); seed=int(sys.argv[2]) if len(sys.argv)>2 else 1
    scale=float(sys.argv[3]) if len(sys.argv)>3 else 0.03
    seeds=[int(x) for x in (sys.argv[4:] or ['5011','5012','6011','6012','6021','6022','7011','7012','8011','8012','9011','9012','10011','10012','11011','12011'])]
    rng=random.Random(seed)
    best=dict(BASE)
    if os.path.exists('best2.json'): best.update(json.load(open('best2.json')))
    with mp.Pool(24, initializer=init, initargs=(seeds,)) as pool:
        bs=evaluate(best,pool)
        print('start %.3f'%bs, flush=True)
        for it in range(budget):
            cands=[perturb(rng,best,scale) for _ in range(6)]
            vals=[evaluate(c,pool) for c in cands]
            j=min(range(len(vals)), key=lambda i: vals[i])
            if vals[j]<bs-1e-6:
                bs=vals[j]; best=cands[j]
                print('%4d %.3f scale=%.3f %s'%(it,bs,scale,json.dumps({k:(round(v,3) if isinstance(v,float) else v) for k,v in best.items()})), flush=True)
                json.dump(best, open('best3.json','w'), indent=1)
        print('DONE %.3f'%bs)
