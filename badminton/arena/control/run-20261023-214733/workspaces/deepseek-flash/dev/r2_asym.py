"""Asymmetric evaluation: new brain vs the round-1 brain (as the opponent).

Runs the same match twice with seats swapped, so we can see whether the new
serve-return logic retains serves against an unchanged opponent.
"""
import importlib.util
import json
import os
import sys
import time

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


def run(agent0, agent1, seed=1, max_windows=4000):
    g = E.Match(seed=seed)
    w = 0
    t0 = time.time()
    while g.status == "playing" and w < max_windows:
        o0, o1 = g.view(0), g.view(1)
        w0 = [E.normalize_frame(f)[0] for f in agent0.act(o0)]
        w1 = [E.normalize_frame(f)[0] for f in agent1.act(o1)]
        for fi in range(E.RULES["decisionFrames"]):
            if g.status != "playing":
                break
            g.batsmen[0]["held"] = w0[fi]
            g.batsmen[1]["held"] = w1[fi]
            g.step()
        w += 1
    pts = [e for e in g.events if e["type"] == "point"]
    server = 0
    sw = rw = 0
    staminas = []
    for e in pts:
        if e["team"] == server:
            sw += 1
        else:
            rw += 1
        server = e["team"]
    return {"score": g.score, "winner": g.winner, "frames": g.frame,
            "points": len(pts), "serve_wins": sw, "recv_wins": rw,
            "rallies": [e["rally"] for e in pts],
            "stamina_end": [round(b["stamina"], 1) for b in g.batsmen],
            "hits": [b["hits"] for b in g.batsmen],
            "secs": round(time.time() - t0, 2)}


if __name__ == "__main__":
    # game A: new = team0 (server first), old = team1
    a = run(NewBrain(), OldBrain())
    print("new@team0", json.dumps(a, ensure_ascii=True))
    # game B: new = team1 (receiver first), old = team0
    b = run(OldBrain(), NewBrain())
    print("new@team1", json.dumps(b, ensure_ascii=True))
