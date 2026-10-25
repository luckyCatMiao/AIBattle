import os, sys
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,ROOT); sys.path.insert(0,HERE)
import engine_py as E
from brain_py import Brain

def diag(g, my):
    pts=[e for e in g.events if e["type"]=="point"]
    srv=0; out={"serve_pts":0,"serve_won":0,"recv_pts":0,"recv_won":0,"selfloss":0}
    hits=[e for e in g.events if e["type"]=="hit"]
    for e in pts:
        last=None
        for h in hits:
            if h["frame"]<=e["frame"]: last=h["team"]
        if srv==my:
            out["serve_pts"]+=1; out["serve_won"]+= (e["team"]==my)
        else:
            out["recv_pts"]+=1; out["recv_won"]+= (e["team"]==my)
        if last==my and e["team"]!=my: out["selfloss"]+=1
        srv=e["team"]
    out["score"]=g.score; out["frames"]=g.frame
    return out

def run(seed, wmax=1000):
    b0,b1=Brain(),Brain()
    g=E.Match(seed=seed); w=0
    while g.status=="playing" and w<wmax:
        o0,o1=g.view(0),g.view(1)
        w0=[E.normalize_frame(f)[0] for f in b0.act(o0)]
        w1=[E.normalize_frame(f)[0] for f in b1.act(o1)]
        for fi in range(10):
            if g.status!="playing": break
            g.batsmen[0]["held"]=w0[fi]; g.batsmen[1]["held"]=w1[fi]
            g.step()
        w+=1
    return diag(g,0),diag(g,1),g

if __name__=="__main__":
    for seed in [int(x) for x in sys.argv[1:]] or [7121]:
        a,b,g=run(seed)
        print("seed",seed,"net",g.netHeight,"score",g.score,"frames",g.frame)
        print("  seat0 serve %d/%d recv %d/%d selfloss %d"%(a["serve_won"],a["serve_pts"],a["recv_won"],a["recv_pts"],a["selfloss"]))
        print("  seat1 serve %d/%d recv %d/%d selfloss %d"%(b["serve_won"],b["serve_pts"],b["recv_won"],b["recv_pts"],b["selfloss"]))
