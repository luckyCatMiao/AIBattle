import sys
sys.path.insert(0,'/workspace')
import engine
from tools.bench import make_obs, load_agent

def run(Apath,Bpath,seed,target_round,tail=16):
    A=load_agent(Apath); B=load_agent(Bpath)
    g=engine.Game(['A','B'],seed=seed); a=A(); b=B()
    hist=[]
    for wi in range(2000):
        if g.status!='playing': break
        if g.round>target_round: break
        ws=[]
        for o in range(2):
            bot=a if o==0 else b
            w=bot.decide(make_obs(g,o)); ins=w.get('inputs') or []
            norm=[{'dir':'N','btn':None}]*20
            for i in range(min(20,len(ins))): norm[i]=ins[i]
            ws.append(norm)
        f0,f1=g.fighters
        rec={'w':wi,'fr':g.roundFrames,'r':g.round,
             'A':(f0.x,f0.y,(f0.bombs,f0.blast,f0.speed),f0.alive),
             'B':(f1.x,f1.y,(f1.bombs,f1.blast,f1.speed),f1.alive),
             'bombs':[(x['owner'],x['x'],x['y'],x['fuse']) for x in g.bombs],
             'blastcells':sorted(set((c['x'],c['y']) for c in g.blasts)),
             'ia':a.info.get('note'),'ib':b.info.get('note'),
             'dirA':''.join('B' if u['btn'] else u['dir'] for u in ws[0]),
             'dirB':''.join('B' if u['btn'] else u['dir'] for u in ws[1])}
        if g.round==target_round: hist.append(rec)
        g.advance_window(ws)
        if g.roundLog and g.roundLog[-1]['round']==target_round: break
    print('seed',seed,'log',g.roundLog[-1] if g.roundLog else None)
    print('tiles:')
    tiles=g.tiles
    for y in range(17):
        row=''
        for x in range(19):
            t=tiles[y*19+x]
            ch='#' if t==1 else ('%' if t==2 else '.')
            if (x,y)==tuple(g.fighters[0].__dict__.get('spawn',(1,1))): ch='A'
            row+=ch
        print(row)
    for h in hist[-tail:]: print(h)

if __name__=='__main__':
    run(sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4]),int(sys.argv[5]) if len(sys.argv)>5 else 16)
