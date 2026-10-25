"""Summarise each point: server, winner, and the hit chain (team/kind/xy)."""
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
my_team = int(sys.argv[2]) if len(sys.argv) > 2 else 0
g = E.Match(seed=seed)
b = Brain()
old = OldBrain()
a0, a1 = (b, old) if my_team == 0 else (old, b)
w = 0
while g.status == "playing" and w < 600:
    o0, o1 = g.view(0), g.view(1)
    w0 = [E.normalize_frame(f)[0] for f in a0.act(o0)]
    w1 = [E.normalize_frame(f)[0] for f in a1.act(o1)]
    for fi in range(E.RULES["decisionFrames"]):
        if g.status != "playing":
            break
        g.batsmen[0]["held"] = w0[fi]
        g.batsmen[1]["held"] = w1[fi]
        g.step()
    w += 1

print("FINAL", g.score, "net", g.netHeight, "frames", g.frame)
evs = g.events
server = 0
hit_chain = []
start = 0
for i, e in enumerate(evs):
    if e["type"] == "hit":
        hit_chain.append(e)
    if e["type"] == "point":
        serves = [h for h in evs[:i + 1] if h["type"] == "serve"]
        srv = serves[-1]["team"] if serves else None
        chain = [(h["team"], h["kind"], h["x"], h["y"], h["speed"]) for h in hit_chain]
        print("pt f%d srv=%d win=%d rally=%d x=%s reason=%s chain=%s" % (
            e["frame"], srv if srv is not None else -1, e["team"], e.get("rally"),
            e.get("x"), e.get("reason"), chain))
        hit_chain = []
        server = e["team"]
