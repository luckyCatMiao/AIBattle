import os,sys
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,ROOT); sys.path.insert(0,HERE)
import engine_py as E
from brain_py import Brain
from drop_eval import LiftLover
seed=int(sys.argv[1]) if len(sys.argv)>1 else 7121
me=Brain(); opp=LiftLover()
g=E.Match(seed=seed); w=0
while g.status=="playing" and w<900:
    o0,o1=g.view(0),g.view(1)
    w0=[E.normalize_frame(f)[0] for f in me.act(o0)]
    w1=[E.normalize_frame(f)[0] for f in opp.act(o1)]
    for fi in range(10):
        if g.status!="playing": break
        g.batsmen[0]["held"]=w0[fi]; g.batsmen[1]["held"]=w1[fi]
        g.step()
    w+=1
seq=[]
for e in g.events:
    if e["type"]=="hit":
        seq.append(("H",e["team"],round(e["x"],2),round(e["y"],2),e["kind"],round(e["speed"],1),e["frame"]))
    elif e["type"]=="point":
        seq.append(("P",e["team"],e.get("rally"),e.get("x")))
for s in seq[-40:]: print(s)
