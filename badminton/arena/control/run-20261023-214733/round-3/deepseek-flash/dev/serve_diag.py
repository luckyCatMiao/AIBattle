"""Diagnose serve points: where the opponent's serve-return goes and how we fare."""
import importlib.util, os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT); sys.path.insert(0, HERE)
import engine_py as E
from brain_py import Brain

spec = importlib.util.spec_from_file_location("brain_r1bak", os.path.join(HERE, "brain_py.r1bak.py"))
m = importlib.util.module_from_spec(spec); sys.modules["brain_r1bak"] = m; spec.loader.exec_module(m)
OldBrain = m.Brain

def run(seed, my_team, maxw=700):
    b = Brain(); old = OldBrain()
    a0, a1 = (b, old) if my_team == 0 else (old, b)
    g = E.Match(seed=seed)
    log = []
    prev_phase = g.phase
    prev_server = g.server
    # record shuttle velocity right after any hit
    prev_hits = 0
    w = 0
    serve_ctx = None
    while g.status == "playing" and w < maxw:
        o0, o1 = g.view(0), g.view(1)
        w0 = [E.normalize_frame(f)[0] for f in a0.act(o0)]
        w1 = [E.normalize_frame(f)[0] for f in a1.act(o1)]
        for fi in range(E.RULES["decisionFrames"]):
            if g.status != "playing": break
            g.batsmen[0]["held"] = w0[fi]; g.batsmen[1]["held"] = w1[fi]
            pre_phase = g.phase
            g.step()
            # detect a hit by opponent that follows our serve
            for e in g.events:
                if e["type"] == "hit" and e.get("_seen") is None:
                    e["_seen"] = True
                    if serve_ctx is not None and e["team"] == 1 - my_team and serve_ctx.get("ret") is None:
                        serve_ctx["ret"] = dict(frame=e["frame"], x=e["x"], y=e["y"],
                                                kind=e["kind"], speed=e["speed"],
                                                our_x=round(g.batsmen[my_team]["x"],2),
                                                our_y=round(g.batsmen[my_team]["y"],2))
                        s = g.shuttle;
                        pass
                        serve_ctx["vel"] = (round(s["vx"],2), round(s["vy"],2))
                if e["type"] == "point" and e.get("_seen") is None:
                    e["_seen"] = True
                    if serve_ctx is not None:
                        serve_ctx["point"] = dict(team=e["team"], reason=e.get("reason"),
                                                  rally=e.get("rally"), x=e.get("x"),
                                                  winner_me=(e["team"]==my_team))
                        log.append(serve_ctx); serve_ctx = None
                if e["type"] == "serve" and e.get("_seen") is None:
                    e["_seen"] = True
                    if e["team"] == my_team:
                        serve_ctx = dict(serve_frame=e["frame"], ret=None, point=None)
        w += 1
    return log, g

if __name__ == "__main__":
    seed = int(sys.argv[1]) if len(sys.argv)>1 else 7121
    team = int(sys.argv[2]) if len(sys.argv)>2 else 1
    log, g = run(seed, team)
    print("net", g.netHeight, "score", g.score)
    for i, s in enumerate(log):
        r = s.get("ret"); p = s.get("point")
        print(i+1, "serve@%d" % s["serve_frame"], "ret=", r, "vel=", s.get("vel"),
              "->", p)
