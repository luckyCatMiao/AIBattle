import os, sys
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,ROOT); sys.path.insert(0,HERE)
import engine_py as E
from brain_py import Brain
seed=int(sys.argv[1]) if len(sys.argv)>1 else 7122
b0,b1=Brain(),Brain(); g=E.Match(seed=seed); w=0
stats=[{"sprint":0,"run":0,"stand":0,"swing":0,"jump":0,"frames":0} for _ in range(2)]
mins=[100.0,100.0]
while g.status=="playing" and w<600:
    o0,o1=g.view(0),g.view(1)
    w0=[E.normalize_frame(f)[0] for f in b0.act(o0)]
    w1=[E.normalize_frame(f)[0] for f in b1.act(o1)]
    for fi in range(10):
        if g.status!="playing": break
        g.batsmen[0]["held"]=w0[fi]; g.batsmen[1]["held"]=w1[fi]
        g.step()
        for t in (0,1):
            p=g.batsmen[t]; st=stats[t]; st["frames"]+=1
            if p.get("sprinting"): st["sprint"]+=1
            elif abs(p["vx"])>0.8: st["run"]+=1
            else: st["stand"]+=1
            if p["swing"]>0: st["swing"]+=1
            mins[t]=min(mins[t],p["stamina"])
    w+=1
print("seed",seed,"net",g.netHeight,"score",g.score,"frames",g.frame)
for t in (0,1):
    st=stats[t]; f=max(1,st["frames"])
    print(" team%d sprint %.1f%% run %.1f%% stand %.1f%% minStam %.1f endStam %.1f"%(t,100*st["sprint"]/f,100*st["run"]/f,100*st["stand"]/f,mins[t],g.batsmen[t]["stamina"]))
