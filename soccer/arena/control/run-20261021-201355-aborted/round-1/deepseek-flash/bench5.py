"""Focused suite: hard opponents + peers, for fast tuning."""
import sys
sys.path.insert(0,'/workspace')
import policy, soccer_test as T

def suite():
    hard=[('SimpleC',T.SimpleBot(corner_choice='center')),
          ('Motion',T.MotionBot()),('PeerDef',None),
          ('PeerAggr',None),('PeerKick',None)]
    return hard

PEERS={'PeerDef':dict(block_lead=5.0,keeper_depth=2.6),
       'PeerAggr':dict(shot_bias=-0.8,through_margin=0.0,block_lead=0.0),
       'PeerKick':dict(press_lead=2.0,press_near=9.0,lane_reaction=5.0)}

def run_set(params,label,verbose=True):
    rows=[]
    for name,opp in [('SimpleC',T.SimpleBot(corner_choice='center')),
                     ('Motion',T.MotionBot())]:
        for seat in (0,1):
            a=policy.Agent(params)
            s,_,_=T.run_match(a,opp) if seat==0 else T.run_match(opp,a)
            rows.append(('%s/%d'%(name,seat),)+((s[0],s[1]) if seat==0 else (s[1],s[0])))
    for name,pp in PEERS.items():
        for seat in (0,1):
            a=policy.Agent(params); b=policy.Agent(pp)
            s,_,_=T.run_match(a,b) if seat==0 else T.run_match(b,a)
            rows.append(('%s/%d'%(name,seat),)+((s[0],s[1]) if seat==0 else (s[1],s[0])))
    a,b=policy.Agent(params),policy.Agent(params)
    s,_,_=T.run_match(a,b); rows.append(('self',s[0],s[1]))
    w=sum(1 for _,o,t in rows if o>t); d=sum(1 for _,o,t in rows if o==t)
    l=sum(1 for _,o,t in rows if o<t)
    gf=sum(r[1] for r in rows); ga=sum(r[2] for r in rows)
    print('%-26s %dW%dD%dL %d:%d %+d'%(label,w,d,l,gf,ga,gf-ga))
    if verbose:
        print('   '+'  '.join('%s:%d-%d(%s)'%(r[0],r[1],r[2],'W' if r[1]>r[2] else ('L' if r[1]<r[2] else 'D')) for r in rows))
    return rows

if __name__=='__main__':
    run_set(dict(block_lead=7.0),'block7')
    for sb in (-0.4,-0.8):
        run_set(dict(block_lead=7.0,shot_bias=sb),'block7 shot=%s'%sb)
    for tm in (0.0,0.08):
        run_set(dict(block_lead=7.0,through_margin=tm),'block7 through=%s'%tm)
