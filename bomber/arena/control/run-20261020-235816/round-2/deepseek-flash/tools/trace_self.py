#!/usr/bin/env python3
import sys, json, importlib.util
sys.path.insert(0,'/workspace')
import engine
from tools.bench import make_obs, load_agent

def run(Apath,Bpath,seed,round_no=1,maxw=200):
    A=load_agent(Apath); B=load_agent(Bpath) if Bpath!='same' else A
    g=engine.Game(['A','B'],seed=seed)
    a=A(); b=B()
    rows=[]
    for wi in range(maxw):
        if g.status!='playing': break
        ws=[]
        for o in range(2):
            f=g.fighters[o]
            obs=make_obs(g,o)
            w=(a if o==0 else b).decide(obs)
            norm=[{'dir':'N','btn':None}]*20
            ins=w.get('inputs') or []
            for i in range(min(20,len(ins))): norm[i]=ins[i]
            ws.append(norm)
        info_a = dict(getattr(a,'info',{}) or {})
        info_b = dict(getattr(b,'info',{}) or {})
        f0,f1=g.fighters
        rows.append({'w':wi,'fr':g.roundFrames,'r':g.round,
                     'a':(f0.x,f0.y,f0.bombs,f0.blast,f0.speed,f0.alive),
                     'b':(f1.x,f1.y,f1.bombs,f1.blast,f1.speed,f1.alive),
                     'ia':(info_a.get('note'),info_a.get('hunt'),info_a.get('aggro')),
                     'ib':(info_b.get('note'),info_b.get('hunt'),info_b.get('aggro')),
                     'drop':len(g.drops),'bombs':len(g.bombs)})
        g.advance_window(ws)
        if g.round>round_no: break
    return g,rows

if __name__=='__main__':
    seed=int(sys.argv[1]) if len(sys.argv)>1 else 3
    maxw=int(sys.argv[2]) if len(sys.argv)>2 else 200
    g,rows=run('/workspace/agent.py','same',seed,maxw=maxw)
    print('log',g.roundLog)
    for r in rows[::5]:
        print(r)
