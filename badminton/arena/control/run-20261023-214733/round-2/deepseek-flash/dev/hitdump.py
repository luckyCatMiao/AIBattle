import os,sys
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,ROOT); sys.path.insert(0,HERE)
import engine_py as E
from brain_py import Brain
from drop_eval import LiftLover
seed=int(sys.argv[1]) if len(sys.argv)>1 else 7121
me=Brain(); opp=LiftLover()
g=E.Match(seed=seed); w=0
hits=[]
while g.status=="playing" and w<900:
    o0,o1=g.view(0),g.view(1)
    w0=[E.normalize_frame(f)[0] for f in me.act(o0)]
    w1=[E.normalize_frame(f)[0] for f in opp.act(o1)]
    for fi in range(10):
        if g.status!="playing": break
        g.batsmen[0]["held"]=w0[fi]; g.batsmen[1]["held"]=w1[fi]
        g.step()
    w+=1
for e in g.events:
    if e["type"]=="hit":
        hits.append(e)
# group by rally (points delimit)
idx=0
for e in g.events:
    if e["type"]=="hit":
        if e["team"]==1:
            print("US   x=%.2f y=%.2f kind=%s spd=%.1f"%(e["x"],e["y"],e["kind"],e["speed"]))
        idx+=1
    elif e["type"]=="point":
        print("--- point to",e["team"],"rally",e.get("rally"),"x",e.get("x"))
print("score",g.score,"frame",g.frame)
