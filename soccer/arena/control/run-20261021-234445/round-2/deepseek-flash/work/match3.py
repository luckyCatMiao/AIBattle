import sys, math, argparse, time
sys.path.insert(0,'/workspace'); sys.path.insert(0,'/workspace/work'); sys.path.insert(0,'/workspace/tools')
import soccer
import brain as brainmod
from match2 import Sniper, Chase, Idle, new_match, run as run2, summarize
from v2 import Brain2

def make(kind,team):
    if kind=='v2': return Brain2(team)
    if kind=='brain': return brainmod.Brain(team)
    if kind=='sniper': return Sniper(team)
    if kind=='chase': return Chase(team)
    if kind=='idle': return Idle(team)
    if kind=='self': return Brain2(team)
    raise SystemExit(kind)

def team_size_for_seed(seed):
    x=((seed ^ 0x9e3779b9)&0xFFFFFFFF); x^=(x<<13)&0xFFFFFFFF; x&=0xFFFFFFFF
    x^=x>>17; x&=0xFFFFFFFF; x^=(x<<5)&0xFFFFFFFF; x&=0xFFFFFFFF
    return 1+(x%6)

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--me',default='v2'); ap.add_argument('--opp',default='brain')
    ap.add_argument('--n',type=int,default=0); ap.add_argument('--seeds',type=int,default=4)
    a=ap.parse_args()
    tot=[0,0,0]; games=0; t0=time.time()
    for seed in range(1,a.seeds+1):
        n=a.n or team_size_for_seed(seed)
        for seat in (0,1):
            me=make(a.me,seat); op=make(a.opp,1-seat)
            w=run2(me if seat==0 else op, op if seat==0 else me, seed, n)
            gf,ga,saves,fouls,kicks=summarize(w,seat)
            print(f'seed{seed} n={n} team={seat} {gf}:{ga} saves {saves} fouls {fouls} kicks {kicks} final {w.score} frames {w.frame}')
            tot[0]+=gf; tot[1]+=ga; tot[2]+= (1 if gf>ga else 0); games+=1
    print(f'GAMES {games} GF {tot[0]} GA {tot[1]} W {tot[2]} time {time.time()-t0:.1f}s')
