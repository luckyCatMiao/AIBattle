"""Broader deterministic suite: bot variants + peer-parameter variants."""
import sys
sys.path.insert(0,'/workspace')
import policy, soccer_test as T

def opponents():
    return [
        ('Simple',      T.SimpleBot()),
        ('SimpleC',     T.SimpleBot(corner_choice='center')),
        ('Motion8',     T.MotionBot(shoot_range=8.0)),
        ('Motion12',    T.MotionBot(shoot_range=12.0)),
        ('Motion16',    T.MotionBot(shoot_range=16.0)),
        ('Park',        T.ParkBot()),
        ('Kick12',      T.KickBot(long_kick_dist=12.0)),
        ('Kick24',      T.KickBot(long_kick_dist=24.0)),
    ]

def peers():
    return [
        ('peer_def',   dict(block_lead=5.0, keeper_depth=2.6)),
        ('peer_aggr',  dict(shot_bias=-0.8, through_margin=0.0, block_lead=0.0)),
        ('peer_kick',  dict(press_lead=2.0, press_near=9.0, lane_reaction=5.0)),
    ]

def run_set(params, label, verbose=False):
    rows=[]
    for name,opp in opponents():
        for seat in (0,1):
            a=policy.Agent(params)
            s,_,_ = T.run_match(a,opp) if seat==0 else T.run_match(opp,a)
            ours,theirs=(s[0],s[1]) if seat==0 else (s[1],s[0])
            rows.append(('%s/%d'%(name,seat),ours,theirs))
    for name,pp in peers():
        for seat in (0,1):
            a=policy.Agent(params); b=policy.Agent(pp)
            s,_,_ = T.run_match(a,b) if seat==0 else T.run_match(b,a)
            ours,theirs=(s[0],s[1]) if seat==0 else (s[1],s[0])
            rows.append(('%s/%d'%(name,seat),ours,theirs))
    a,b=policy.Agent(params),policy.Agent(params)
    s,_,_=T.run_match(a,b); rows.append(('self',s[0],s[1]))
    w=sum(1 for _,o,t in rows if o>t); d=sum(1 for _,o,t in rows if o==t)
    l=sum(1 for _,o,t in rows if o<t)
    gf=sum(r[1] for r in rows); ga=sum(r[2] for r in rows)
    print('%-22s %2dW%2dD%2dL  %3d:%3d  diff=%+d' % (label,w,d,l,gf,ga,gf-ga))
    if verbose:
        for r in rows: print('   %-11s %2d-%2d %s'%(r[0],r[1],r[2],'W' if r[1]>r[2] else ('L' if r[1]<r[2] else 'D')))
    return rows,w,d,l,gf,ga

if __name__=='__main__':
    for bl in (0.0, 2.5, 5.0, 7.0):
        run_set(dict(block_lead=bl), 'block=%s'%bl, verbose=(bl==2.5))
