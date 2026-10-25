"""Frame-level probe of serve points: new brain (team0) vs r1 brain (team1)."""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import engine_py as E
from brain_py import Brain as NewBrain


def load_backup(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod.Brain


OldBrain = load_backup(os.path.join(HERE, "brain_py.r1bak.py"), "brain_r1bak")

a0, a1 = NewBrain(), OldBrain()
g = E.Match(seed=1)
frames = []
w = 0
while g.status == "playing" and w < 4000:
    o0, o1 = g.view(0), g.view(1)
    w0 = [E.normalize_frame(f)[0] for f in a0.act(o0)]
    w1 = [E.normalize_frame(f)[0] for f in a1.act(o1)]
    frames.append({
        "frame": g.frame, "phase": g.phase, "rally": g.rally, "server": g.server,
        "score": list(g.score),
        "b": [(round(p["x"], 2), round(p["vx"], 2), round(p["stamina"], 1),
               p["swing"], p["swingElapsed"], p["swingType"]) for p in g.batsmen],
        "s": (round(g.shuttle["x"], 2), round(g.shuttle["y"], 2),
              round(g.shuttle["vx"], 2), round(g.shuttle["vy"], 2),
              g.shuttle["alive"], g.shuttle["lastTeam"]),
        "held": [(round(p["held"].get("move", 0), 2), p["held"].get("swing"),
                  p["held"].get("sprint")) for p in g.batsmen],
        "win0": w0, "win1": w1,
    })
    for fi in range(E.RULES["decisionFrames"]):
        if g.status != "playing":
            break
        g.batsmen[0]["held"] = w0[fi]
        g.batsmen[1]["held"] = w1[fi]
        g.step()
    w += 1

serves = [e for e in g.events if e["type"] == "serve"]
hits = [e for e in g.events if e["type"] == "hit"]
points = [e for e in g.events if e["type"] == "point"]
print("score", g.score, "points", len(points))
print("--- serve points (team0 serving) ---")
for si, se in enumerate(serves):
    if se["team"] != 0:
        continue
    nxt_points = [p for p in points if p["frame"] > se["frame"]]
    if not nxt_points:
        continue
    pe = nxt_points[0]
    hs = [h for h in hits if se["frame"] < h["frame"] <= pe["frame"]]
    print("serve@%d -> point@%d team%d rally%d | hits: %s" % (
        se["frame"], pe["frame"], pe["team"], pe["rally"],
        [(h["frame"], h["team"], h["kind"], h["x"], h["y"], h["speed"]) for h in hs]))
print("--- team0 serve window detail (first 4 serves) ---")
for se in [s for s in serves if s["team"] == 0][:4]:
    print("== serve", se["frame"])
    for rec in frames:
        if se["frame"] - 25 <= rec["frame"] <= se["frame"] + 25:
            print(rec["frame"], rec["phase"], "rally", rec["rally"],
                  "b0", rec["b"][0], "s", rec["s"], "held0", rec["held"][0])
