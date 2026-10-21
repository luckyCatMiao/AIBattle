#!/usr/bin/env python3
import sys, importlib.util, json, argparse
sys.path.insert(0,'/workspace')
import engine
from tools.bench import make_obs, load_agent, IdleBot

def run(Apath, seed, opp='idle', maxw=160):
    A=load_agent(Apath)
    a=A(); b=IdleBot() if opp=='idle' else None
    g=engine.Game(['A','B'],seed=seed)
    marks=[]
    pickups=0
    ev_i=0
    for wi in range(maxw):
        if g.status!='playing': break
        ws=[]
        for o in range(2):
            if o==0:
                w=a.decide(make_obs(g,0))
            else:
                w=b.decide(make_obs(g,1))
            ins=w.get('inputs') or []
            norm=[{'dir':'N','btn':None}]*20
            for i in range(min(20,len(ins))): norm[i]=ins[i]
            ws.append(norm)
        g.advance_window(ws)
        for ev in g.events[ev_i:]:
            # pickup events have type overridden by powerup name
            if ev['type'] in ('bomb','blast','speed') and 't' in ev and ev.get('x') is not None and ev.get('owner')==0:
                # bomb-placement events also look like this; distinguish by presence of key 'text'? neither.
                pass
        ev_i=len(g.events)
        f=g.fighters[0]
        if wi%10==9:
            marks.append((g.roundFrames//20, f.bombs,f.blast,f.speed,len(g.drops),g.roundFrames))
    f=g.fighters[0]
    return {'log':[(r['round'],r['frames'],r['winner'],r['reason']) for r in g.roundLog],
            'marks':marks,'final':(f.bombs,f.blast,f.speed),'frames':g.roundFrames,'status':g.status}

if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--a',default='/workspace/agent.py'); ap.add_argument('--seeds',type=int,default=4)
    ap.add_argument('--opp',default='idle')
    args=ap.parse_args()
    for i in range(args.seeds):
        r=run(args.a,1+i,args.opp)
        print(json.dumps(r,ensure_ascii=False))
