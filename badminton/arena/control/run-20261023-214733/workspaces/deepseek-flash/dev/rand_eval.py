"""Our serve defence vs a randomised receiver (stress test)."""
import os, random, sys
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,ROOT); sys.path.insert(0,HERE)
import engine_py as E
from brain_py import Brain

class RandBrain(Brain):
    def __init__(self, seed=1, noise=50.0, **kw):
        super().__init__(**kw)
        self.rng=random.Random(seed); self.noise=noise
        self.move_pen=0.0
    def _eval_contact(self, cand, me, opp, team, ball_pred):
        s, shot, traj=super()._eval_contact(cand, me, opp, team, ball_pred)
        return s+self.rng.uniform(-self.noise,self.noise), shot, traj

def diag(g, my):
    pts=[e for e in g.events if e["type"]=="point"]; hits=[e for e in g.events if e["type"]=="hit"]
    srv=0; out={"serve_pts":0,"serve_won":0,"recv_pts":0,"recv_won":0,"selfloss":0}
    for e in pts:
        last=None
        for h in hits:
            if h["frame"]<=e["frame"]: last=h["team"]
        if srv==my: out["serve_pts"]+=1; out["serve_won"]+=(e["team"]==my)
        else: out["recv_pts"]+=1; out["recv_won"]+=(e["team"]==my)
        if last==my and e["team"]!=my: out["selfloss"]+=1
        srv=e["team"]
    return out

def run(seed, my_team, rseed, noise, maxw=800):
    me=Brain(); opp=RandBrain(seed=rseed, noise=noise)
    a0,a1=(me,opp) if my_team==0 else (opp,me)
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
    return diag(g,my_team),g

if __name__=="__main__":
    for noise in (0.0, 30.0, 120.0):
        agg={"serve_pts":0,"serve_won":0,"recv_pts":0,"recv_won":0,"me":0,"opp":0}
        for s in (7121,7122):
            for seat in (0,1):
                d,g=run(s,seat,1000+seat*7+s,noise)
                for k in agg: agg[k]+=d.get(k,0)
                agg["me"]+=g.score[seat]; agg["opp"]+=g.score[1-seat]
                print("noise=%5.0f seed=%d seat=%d net=%.2f score=%s serve %d/%d recv %d/%d frames=%d" % (
                    noise,s,seat,g.netHeight,g.score,d["serve_won"],d["serve_pts"],d["recv_won"],d["recv_pts"],g.frame))
        print("== noise %.0f pts %d:%d serve %d/%d (%.0f%%) recv %d/%d"%(noise,agg["me"],agg["opp"],agg["serve_won"],agg["serve_pts"],100.0*agg["serve_won"]/max(1,agg["serve_pts"]),agg["recv_won"],agg["recv_pts"]))
