"""Per-point outcome analysis (dev only).

Runs one match in-process between two bundled agents loaded as modules is not
possible (both are self-contained), so this uses the workspace brain only and
reports the last few hits of every point.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import engine_py as E
from brain_py import Brain


def run(seed, verbose=True):
    g = E.Match(seed=seed)
    a0, a1 = Brain(), Brain()
    w = 0
    stalls = [0, 0]
    while g.status == "playing" and w < 4000:
        o0, o1 = g.view(0), g.view(1)
        w0 = [E.normalize_frame(f)[0] for f in a0.act(o0)]
        w1 = [E.normalize_frame(f)[0] for f in a1.act(o1)]
        for fi in range(10):
            if g.status != "playing":
                break
            g.batsmen[0]["held"] = w0[fi]
            g.batsmen[1]["held"] = w1[fi]
            g.step()
        w += 1
    pts = []
    hits = [e for e in g.events if e["type"] == "hit"]
    cur = []
    for e in g.events:
        if e["type"] == "hit":
            cur.append(e)
        elif e["type"] == "point":
            pts.append((list(cur), e))
            cur = []
    if verbose:
        print("seed=%d net=%.2f score=%s" % (seed, g.netHeight, g.score))
        for hs, p in pts:
            last = hs[-1] if hs else None
            desc = ""
            if last:
                desc = "%s by t%d from (%.2f,%.2f) spd %.1f" % (
                    last["kind"], last["team"], last["x"], last["y"], last["speed"])
            print("  rally=%2d -> t%d %-6s land=%5.2f | last: %s | n_hits=%d" % (
                p.get("rally", 0), p["team"], "out" if False else p["reason"][:6],
                p["x"], desc, len(hs)))
    return g, pts


if __name__ == "__main__":
    seeds = [int(x) for x in sys.argv[1:]] or [7001]
    for s in seeds:
        run(s)
