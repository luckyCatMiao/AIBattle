"""Serve-return diagnostic vs a chosen opponent brain class."""
import os,sys
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,ROOT); sys.path.insert(0,HERE)
import engine_py as E
from brain_py import Brain
from opp_eval import diag

class ClearLover(Brain):
    def __init__(self):
        super().__init__(); self.move_pen=6.0
    def _eval_contact(self, cand, me, opp, team, ball_pred):
        s,shot,traj=super()._eval_contact(cand,me,opp,team,ball_pred)
        return s+(150.0 if shot["kind"]=="clear" else 0.0),shot,traj

def run(seed, my_team, opp):
    b=Brain(); a0,a1=(b,opp) if my_team==0 else (opp,b)
    g=E.Match(seed=seed); w=0; serve_ctx=None; log=[]
    while g.status=="playing" and w<800:
        o0,o1=g.view(0),g.view(1)
        w0=[E.normalize_frame(f)[0] for f in a0.act(o0)]
        w1=[E.normalize_frame(f)[0] for f in a1.act(o1)]
        for fi in range(10):
            if g.status!="playing": break
            g.batsmen[0]["held"]=w0[fi]; g.batsmen[1]["held"]=w1[fi]
            g.step()
            for e in g.events:
                if e.get("_s"): continue
                e["_s"]=True
                if e["type"]=="serve" and e["team"]==my_team:
                    serve_ctx={"srv":e["frame"],"ret":None}
                elif e["type"]=="hit" and serve_ctx is not None and e["team"]!=my_team and serve_ctx["ret"] is None:
                    serve_ctx["ret"]=dict(frame=e["frame"],x=e["x"],y=e["y"],kind=e["kind"],speed=e["speed"])
                elif e["type"]=="point":
                    if serve_ctx is not None:
                        serve_ctx["pt"]=dict(team=e["team"],rally=e.get("rally"),x=e.get("x"))
                        log.append(serve_ctx); serve_ctx=None
        w+=1
    return log,g

if __name__=="__main__":
    cls_name=sys.argv[1] if len(sys.argv)>1 else "clear"
    seed=int(sys.argv[2]) if len(sys.argv)>2 else 7121
    team=int(sys.argv[3]) if len(sys.argv)>3 else 1
    opp=ClearLover()
    log,g=run(seed,team,opp)
    print("net",g.netHeight,"score",g.score)
    for s in log:
        r=s.get("ret")
        print(s["srv"], "ret=",r, "->",s.get("pt"))
