"""Probe a single serve point frame by frame: who hits, where, how fast, and
whether a sprinting server could have reached the return."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import engine_py as E
import planner as P
from brain_py import Brain

SEED = 1


def run_until_first_point(max_windows=400):
    a0, a1 = Brain(), Brain()
    g = E.Match(seed=SEED)
    log = []
    w = 0
    while g.status == "playing" and w < max_windows:
        o0, o1 = g.view(0), g.view(1)
        w0 = [E.normalize_frame(f)[0] for f in a0.act(o0)]
        w1 = [E.normalize_frame(f)[0] for f in a1.act(o1)]
        E.advance_window(g, [[[x] for x in w0], [[x] for x in w1]])
        b = g.batsmen
        log.append({
            "frame": g.frame, "phase": g.phase, "rally": g.rally,
            "b": [(round(p["x"], 2), round(p["y"], 2), round(p["vx"], 2),
                   round(p["stamina"], 1), p["swing"], p["swingType"]) for p in b],
            "s": (round(g.shuttle["x"], 2), round(g.shuttle["y"], 2),
                  round(g.shuttle["vx"], 2), round(g.shuttle["vy"], 2), g.shuttle["alive"]),
            "held": [(round(p["held"].get("move", 0), 2), p["held"].get("swing"),
                      p["held"].get("sprint")) for p in b],
        })
        w += 1
    return g, log


if __name__ == "__main__":
    g, log = run_until_first_point()
    print("score", g.score, "frames", g.frame)
    for ev in g.events:
        print(ev)
    # print only the serve point window
    for rec in log:
        print(rec)
