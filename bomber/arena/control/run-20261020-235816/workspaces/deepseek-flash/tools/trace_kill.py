#!/usr/bin/env python3
import sys
sys.path.insert(0,'/workspace')
import engine
from tools.bench import make_obs, load_agent

def run(seed, maxw=400, tail=30):
    A=load_agent('/workspace/agent.py')
    g=engine.Game(['A','B'],seed=seed); a=A(); b=A()
    hist=[]
    for wi in range(maxw):
        if g.status!='playing': break
        ws=[]
        for o in range(2):
            bot=a if o==0 else b
            w=bot.decide(make_obs(g,o)); ins=w.get('inputs') or []
            norm=[{'dir':'N','btn':None}]*20
            for i in range(min(20,len(ins))): norm[i]=ins[i]
            ws.append(norm)
        f0,f1=g.fighters
        hist.append({'w':wi,'fr':g.roundFrames,
                     'A':(f0.x,f0.y,(f0.bombs,f0.blast,f0.speed),f0.alive),
                     'B':(f1.x,f1.y,(f1.bombs,f1.blast,f1.speed),f1.alive),
                     'bombs':[(x['owner'],x['x'],x['y'],x['fuse']) for x in g.bombs],
                     'blasts':sorted(set((c['x'],c['y']) for c in g.blasts)),
                     'ia':a.info.get('note'),'dirA':''.join('B' if u['btn'] else u['dir'] for u in ws[0]),
                     'dirB':''.join('B' if u['btn'] else u['dir'] for u in ws[1])})
        g.advance_window(ws)
        if g.roundLog: break
    print('seed',seed,'log',g.roundLog)
    for h in hist[-tail:]: print(h)
    return hist

if __name__=='__main__':
    run(int(sys.argv[1]) if len(sys.argv)>1 else 3, int(sys.argv[2]) if len(sys.argv)>2 else 400)
