import sys
sys.path.insert(0,'/workspace')
import engine
from tools.bench import make_obs, load_agent

def run(Apath,Bpath,seed,target_round,target_fr):
    A=load_agent(Apath); B=load_agent(Bpath)
    g=engine.Game(['A','B'],seed=seed); a=A(); b=B()
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
        special = (g.round==target_round and g.roundFrames==target_fr)
        for i in range(20):
            if g.status!='playing': break
            for o,f in enumerate(g.fighters):
                if not f.alive: continue
                g.push_input(f, ws[o][i])
            g.step()
            if special:
                f0,f1=g.fighters
                print(' i%2d fr%4d | B(%2d,%2d p%.2f) A(%2d,%2d p%.2f) | blastB=%s | bombs=%s' % (
                    i, g.roundFrames, f1.x,f1.y,f1.progress, f0.x,f0.y,f0.progress,
                    (f1.x,f1.y) in set((c['x'],c['y']) for c in g.blasts),
                    [(x['owner'],x['x'],x['y'],x['fuse']) for x in g.bombs]))
                if not f1.alive:
                    print('  B died; cause', f1.deathCause); break
        if g.roundLog: break

if __name__=='__main__':
    run(sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4]),int(sys.argv[5]))
