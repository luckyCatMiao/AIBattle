import sys, math, argparse, time
sys.path.insert(0,'/workspace'); sys.path.insert(0,'/workspace/work'); sys.path.insert(0,'/workspace/tools')
import soccer
import brain as brainmod
from match2 import new_match
from planner import Brain2

LOG=[]
_orig_plan_kick=Brain2.plan_kick
_orig_pick_shot=Brain2.pick_shot
def plan_kick(self,w,u,ct):
    gate=max(int(u.get('kickCd') or 0),int(u.get('controlLock') or 0))
    gx=self.gx_att
    dist=math.hypot(gx-u['x'],13.0-u['y'])
    near,nd=self.nearest_opp(w,u['x'],u['y'])
    ty,m=_orig_pick_shot(self,w,u['x'],u['y'])
    r=_orig_plan_kick(self,w,u,ct)
    if self.debug:
        LOG.append(dict(f=w.frame,team=self.team,idx=u['index'],x=round(u['x'],1),y=round(u['y'],1),
                        d=round(dist,1),press=round(nd,1),pick=(round(ty,1) if ty else None, round(m,2) if m else None),
                        kind=(r[3] if r else None), k=(r[1] if r else None), gate=gate))
    return r
Brain2.plan_kick=plan_kick

def run(me,opp,seed,n,debug=True):
    me.debug=debug; opp.debug=False
    w=new_match(seed,n)
    poss=[0,0]; att=[0,0]
    while w.status=='playing' and w.frame<3000:
        fr={me.team:me.plan(w),opp.team:opp.plan(w)}
        for i in range(20):
            if w.status!='playing': break
            inp={}
            for t,frames in fr.items():
                for idx in range(n): inp['t%du%d'%(t,idx)]=frames[i][idx]
            w.step(inp)
            if w.ball['owner']:
                t=int(w.ball['owner'][1]); poss[t]+=1
                s=1 if t==0 else -1
                if (w.ball['x']-22)*s>0: att[t]+=1
    return w,poss,att

if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--opp',default='self'); ap.add_argument('--n',type=int,default=3)
    ap.add_argument('--seeds',type=int,default=1); ap.add_argument('--seat',type=int,default=0)
    a=ap.parse_args()
    from diag import make
    for seed in range(1,a.seeds+1):
        me=make('v2',a.seat); opp=make('v2' if a.opp=='self' else a.opp,1-a.seat)
        w,poss,att=run(me,opp,seed,a.n)
        print('seed',seed,'n',a.n,'seat',a.seat,'score',w.score,'poss',poss,'att',att,'frames',w.frame)
    # summarize our plan_kick decisions
    mine=[e for e in LOG if e['team']==a.seat]
    from collections import Counter
    print('decisions',Counter(e['kind'] for e in mine))
    print('carrier decisions',len(mine))
    for e in mine[:80]:
        print(e)
