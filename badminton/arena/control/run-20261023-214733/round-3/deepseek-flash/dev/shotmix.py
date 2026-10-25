import os,sys,collections
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,ROOT); sys.path.insert(0,HERE)
import engine_py as E
from brain_py import Brain
from drop_eval import LiftLover, DropLover

def run(seed,my,cls,maxw=900):
    me=Brain(); opp=cls(); a0,a1=(me,opp) if my==0 else (opp,me)
    g=E.Match(seed=seed); w=0
    while g.status=="playing" and w<maxw:
        o0,o1=g.view(0),g.view(1)
        w0=[E.normalize_frame(f)[0] for f in a0.act(o0)]
        w1=[E.normalize_frame(f)[0] for f in a1.act(o1)]
        for fi in range(10):
            if g.status!="playing": break
            g.batsmen[0]["held"]=w0[fi]; g.batsmen[1]["held"]=w1[fi]
            g.step()
        w+=1
    return g

g=run(7121,1,LiftLover)
kinds={0:collections.Counter(),1:collections.Counter()}
for e in g.events:
    if e["type"]=="hit": kinds[e["team"]][e["kind"]]+=1
print("net",g.netHeight,"score",g.score,"frames",g.frame)
print("team0 (opp) shots",dict(kinds[0]))
print("team1 (us) shots",dict(kinds[1]))
for e in g.events:
    if e["type"]=="point":
        print("point",e["team"],e.get("reason"),"rally",e.get("rally"),"x",e.get("x"),"score",e.get("score"))
