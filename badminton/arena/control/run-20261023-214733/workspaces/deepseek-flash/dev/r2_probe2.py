"""Probe asymmetric game events + frames around serve points."""
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
    frames.append({"frame": g.frame, "phase": g.phase, "rally": g.rally,
                   "b": [(round(p["x"], 2), round(p["vx"], 2), round(p["stamina"], 1),
                          p["swing"], p["swingElapsed"]) for p in g.batsmen],
                   "s": (round(g.shuttle["x"], 2), round(g.shuttle["y"], 2),
                         round(g.shuttle["vx"], 2), round(g.shuttle["vy"], 2),
                         g.shuttle["alive"], g.shuttle["lastTeam"])})
    for fi in range(E.RULES["decisionFrames"]):
        if g.status != "playing":
            break
        g.batsmen[0]["held"] = w0[fi]
        g.batsmen[1]["held"] = w1[fi]
        g.step()
    w += 1

print("score", g.score)
evs = g.events
for e in evs[:20]:
    print(e)
serves = [e for e in evs if e["type"] == "serve"][:3]
for se in serves:
    print("==== around serve", se["frame"])
    for rec in frames:
        if se["frame"] - 5 <= rec["frame"] <= se["frame"] + 40:
            print(rec)
