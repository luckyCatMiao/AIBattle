"""Trace serve points: events + which returns our brain predicted."""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import engine_py as E
from brain_py import Brain


def load_backup(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod.Brain


OldBrain = load_backup(os.path.join(HERE, "brain_py.r1bak.py"), "brain_r1bak")

seed = int(sys.argv[1]) if len(sys.argv) > 1 else 8005
watch = int(sys.argv[2]) if len(sys.argv) > 2 else 0
g = E.Match(seed=seed)
a0, a1 = Brain(), OldBrain()
w = 0
while g.status == "playing" and w < 600:
    o0, o1 = g.view(0), g.view(1)
    if watch == 0:
        print("W%02d f%d phase=%s rally=%d server=%d score=%s b0=(%.2f,%.2f st%.1f) sh=(%.2f,%.2f,%.1f,%.1f)" % (
            w, g.frame, g.phase, g.rally, g.server, g.score,
            g.batsmen[0]["x"], g.batsmen[0]["y"], g.batsmen[0]["stamina"],
            g.shuttle["x"], g.shuttle["y"], g.shuttle["vx"], g.shuttle["vy"]),
            file=sys.stderr)
    w0 = [E.normalize_frame(f)[0] for f in a0.act(o0)]
    w1 = [E.normalize_frame(f)[0] for f in a1.act(o1)]
    for fi in range(E.RULES["decisionFrames"]):
        if g.status != "playing":
            break
        g.batsmen[0]["held"] = w0[fi]
        g.batsmen[1]["held"] = w1[fi]
        g.step()
    w += 1
print("FINAL", g.score, "net", g.netHeight)
for e in g.events:
    if e["type"] in ("serve", "hit", "point", "net"):
        print(e)
