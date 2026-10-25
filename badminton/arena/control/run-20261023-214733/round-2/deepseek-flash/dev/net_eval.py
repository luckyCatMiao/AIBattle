"""Evaluate brains across seeds/net heights, with per-point diagnostics.

Usage: python dev/net_eval.py [seed ...]
Environment variables select brain variants (BAD_BAIT, BAD_RUNUP, ...), which
are read by Brain.__init__.
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import engine_py as E
from brain_py import Brain


def point_diag(g):
    """Split points into serve-winner vs receiver-winner and self-losses."""
    hits = [e for e in g.events if e["type"] == "hit"]
    pts = [e for e in g.events if e["type"] == "point"]
    server = 0
    out = []
    for e in pts:
        last_team = None
        for h in hits:
            if h["frame"] <= e["frame"]:
                last_team = h["team"]
            else:
                break
        out.append({"winner": e["team"], "server": server,
                    "serve_won": e["team"] == server,
                    "rally": e.get("rally", 0), "x": e.get("x"),
                    "self_loss": (last_team == 1 - e["team"]),
                    "reason": e.get("reason")})
        server = e["team"]
    return out


def run(a0, a1, seed, max_windows=600, trace=False):
    g = E.Match(seed=seed)
    w = 0
    t0 = time.time()
    while g.status == "playing" and w < max_windows:
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
    diag = point_diag(g)
    return {
        "seed": seed, "net": g.netHeight, "score": g.score, "winner": g.winner,
        "frames": g.frame, "points": len(diag),
        "serve_wins": sum(1 for d in diag if d["serve_won"]),
        "recv_wins": sum(1 for d in diag if not d["serve_won"]),
        "self_losses": [sum(1 for d in diag if d["self_loss"] and d["winner"] == t)
                        for t in (0, 1)],
        "rally_max": max([d["rally"] for d in diag], default=0),
        "stamina_end": [round(b["stamina"], 1) for b in g.batsmen],
        "stamina_min": [round(m, 1) for m in g.stats_min] if hasattr(g, "stats_min") else None,
        "hits": [b["hits"] for b in g.batsmen],
        "secs": round(time.time() - t0, 2),
        "diag": diag if trace else None,
    }


def pair(seed, make_a=Brain, make_b=Brain, **kw):
    a = run(make_a(), make_b(), seed, **kw)
    b = run(make_b(), make_a(), seed, **kw)
    return a, b


if __name__ == "__main__":
    seeds = [int(x) for x in sys.argv[1:]] or [8001, 8002, 8003, 8004, 8005]
    for s in seeds:
        r = run(Brain(), Brain(), s)
        print(json.dumps(r, ensure_ascii=False))
