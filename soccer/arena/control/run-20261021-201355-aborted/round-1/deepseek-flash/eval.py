"""Stable evaluation: explicit FINAL base, fixed peers, adversarial styles."""
import sys
sys.path.insert(0,'/workspace')
import policy, soccer_test as T
from stress import ManMarkBot, ChaosBot

FINAL = dict(shot_bias=-0.6, block_lead=7.0)

BOTS = [
    ('Simple', T.SimpleBot), ('SimpleC', lambda: T.SimpleBot(corner_choice='center')),
    ('M8', lambda: T.MotionBot(shoot_range=8.0)),
    ('M12', lambda: T.MotionBot(shoot_range=12.0)),
    ('M16', lambda: T.MotionBot(shoot_range=16.0)),
    ('Park', T.ParkBot),
    ('K12', lambda: T.KickBot(long_kick_dist=12.0)),
    ('K24', lambda: T.KickBot(long_kick_dist=24.0)),
]
PEERS = [
    ('pDef',  dict(block_lead=5.0)),
    ('pAggr', dict(shot_bias=-1.0, through_margin=0.0)),
    ('pKick', dict(press_lead=2.0, press_near=9.0, lane_reaction=5.0)),
]
STRESS = [('ManMark', ManMarkBot), ('ManMark2', lambda: ManMarkBot(mark_gap=2.0)),
          ('Chaos1', lambda: ChaosBot(1)), ('Chaos2', lambda: ChaosBot(2))]

def match(a_params, b_params, seat):
    a = policy.Agent(a_params); b = policy.Agent(b_params)
    s,_,_ = T.run_match(a,b) if seat == 0 else T.run_match(b,a)
    return (s[0],s[1]) if seat == 0 else (s[1],s[0])

def eval_cfg(params, label, verbose=False):
    rows = []
    for name, mk in BOTS:
        for seat in (0,1):
            opp = mk()
            a = policy.Agent(params)
            s,_,_ = T.run_match(a,opp) if seat==0 else T.run_match(opp,a)
            rows.append(('%s/%d'%(name,seat),) + ((s[0],s[1]) if seat==0 else (s[1],s[0])))
    for name, pp in PEERS:
        bparams = dict(FINAL); bparams.update(pp)
        for seat in (0,1):
            o,t = match(params, bparams, seat)
            rows.append(('%s/%d'%(name,seat), o, t))
    for name, mk in STRESS:
        for seat in (0,1):
            opp = mk()
            a = policy.Agent(params)
            s,_,_ = T.run_match(a,opp) if seat==0 else T.run_match(opp,a)
            rows.append(('%s/%d'%(name,seat),) + ((s[0],s[1]) if seat==0 else (s[1],s[0])))
    # mirror
    o,t = match(params, params, 0)
    rows.append(('self/0', o, t))
    w=sum(1 for _,o,t in rows if o>t); d=sum(1 for _,o,t in rows if o==t)
    l=sum(1 for _,o,t in rows if o<t)
    gf=sum(r[1] for r in rows); ga=sum(r[2] for r in rows)
    print('%-28s %2dW%2dD%2dL  %3d:%3d  %+d' % (label,w,d,l,gf,ga,gf-ga), flush=True)
    if verbose:
        for r in rows:
            print('   %-11s %2d-%2d %s'%(r[0],r[1],r[2],'W' if r[1]>r[2] else ('L' if r[1]<r[2] else 'D')), flush=True)
    return rows

if __name__=='__main__':
    configs = [
        ('A final',        dict(FINAL)),
        ('B press',        dict(FINAL, press_lead=2.0, press_near=9.0)),
        ('C lane5',        dict(FINAL, lane_reaction=5.0)),
        ('D press+lane5',  dict(FINAL, press_lead=2.0, press_near=9.0, lane_reaction=5.0)),
    ]
    for label, p in configs:
        eval_cfg(p, label, verbose=True)
