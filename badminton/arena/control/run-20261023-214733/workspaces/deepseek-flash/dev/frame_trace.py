"""Per-frame trace of our player vs the opponent's serve return."""
import importlib.util, os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT); sys.path.insert(0, HERE)
import engine_py as E
from brain_py import Brain
spec = importlib.util.spec_from_file_location("brain_r1bak", os.path.join(HERE, "brain_py.r1bak.py"))
m = importlib.util.module_from_spec(spec); sys.modules["brain_r1bak"]=m; spec.loader.exec_module(m)
OldBrain = m.Brain

def run(seed, my_team, f0, f1, maxw=700):
    b=Brain(); old=OldBrain(); a0,a1=(b,old) if my_team==0 else (old,b)
    g=E.Match(seed=seed); w=0; rows=[]
    while g.status=="playing" and w<maxw and g.frame < f1:
        o0,o1=g.view(0),g.view(1)
        w0=[E.normalize_frame(f)[0] for f in a0.act(o0)]
        w1=[E.normalize_frame(f)[0] for f in a1.act(o1)]
        for fi in range(10):
            if g.status!="playing": break
            g.batsmen[0]["held"]=w0[fi]; g.batsmen[1]["held"]=w1[fi]
            g.step()
            if f0 <= g.frame <= f1:
                p=g.batsmen[my_team]; s=g.shuttle
                rows.append((g.frame, round(p["x"],2), round(p["y"],2), p["swing"], p["swingElapsed"], p["swingType"], p["stamina"], round(s["x"],3), round(s["y"],3), s["alive"], round(s.get("vx",0),3), round(s.get("vy",0),3), p["hits"], g.phase, g.score[:], g.lastPoint and g.lastPoint.get("reason")))
        w+=1
    return rows

if __name__=="__main__":
    seed=int(sys.argv[1]); team=int(sys.argv[2]); f0=int(sys.argv[3]); f1=int(sys.argv[4])
    for r in run(seed,team,f0,f1): print(r)
