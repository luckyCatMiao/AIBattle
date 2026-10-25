"""Count in-window combination opportunities: owner has no shot, but a mate does."""
import sys, math, argparse
sys.path.insert(0,'/workspace'); sys.path.insert(0,'/workspace/work'); sys.path.insert(0,'/workspace/tools')
from match2 import new_match
from planner import Brain2

def opportunities(brain,w):
    """Return list of (owner, mate, mate_pos_after_n, margin) for mates with good shots."""
    b=w.ball
    own=b['owner']
    if not own or not own.startswith('t%d'%brain.team): return []
    owner=w.unit_by_id(own)
    ty,m0=brain.pick_shot(w,owner['x'],owner['y'])
    if m0 is not None: return []  # owner can shoot already
    out=[]
    for mate in brain.own(w):
        if mate['id']==own: continue
        if int(mate.get('kickCd') or 0)>0 or int(mate.get('controlLock') or 0)>0: continue
        tgt=mate.get('_support',(mate['x'],mate['y']))
        for nf in (0,2,4,6,8,10):
            pos,_=brain.project(w,mate,tgt,False,k=nf,box=brain.box_opp)
            ty,m=brain.pick_shot(w,pos['x'],pos['y'])
            if m is not None and m>0.10:
                d=math.hypot(pos['x']-owner['x'],pos['y']-owner['y'])
                if 2.5<=d<=16:
                    out.append((owner['index'],mate['index'],nf,round(d,1),round(m,2)))
                    break
    return out

def run(me,opp,seed,n):
    w=new_match(seed,n); opps=[]
    while w.status=='playing' and w.frame<3000:
        # need supports set: plan() sets _support on own units
        fr={me.team:me.plan(w),opp.team:opp.plan(w)}
        o=opportunities(me,w)
        if o: opps.append((w.frame,o))
        for i in range(20):
            if w.status!='playing': break
            inp={}
            for t,frames in fr.items():
                for idx in range(n): inp['t%du%d'%(t,idx)]=frames[i][idx]
            w.step(inp)
    return w,opps

if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--opp',default='self'); ap.add_argument('--n',type=int,default=3)
    ap.add_argument('--seeds',type=int,default=1)
    a=ap.parse_args()
    from diag import make
    for seed in range(1,a.seeds+1):
        for seat in (0,1):
            me=make('v2',seat); opp=make('v2' if a.opp=='self' else a.opp,1-seat)
            w,opps=run(me,opp,seed,a.n)
            print(f'seed{seed} n={a.n} seat{seat} score {w.score} windows-with-combo-opp {len(opps)}')
            for f,o in opps[:12]: print('  ',f,o)
