"""Self-play / evaluation harness (development only)."""
import io
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


class StatAgent:
    """Wraps an agent, recording whiffs and errors."""

    def __init__(self, inner, name):
        self.inner = inner
        self.name = name
        self.swings = 0
        self.hits = 0

    def act(self, obs):
        return self.inner.act(obs)


def track(g, prev, stats):
    for i, b in enumerate(g.batsmen):
        st = stats[i]
        if prev[i]["swing"] == 0 and b["swing"] > 0:
            st["swings"] += 1
            st["pending"] = g.frame
        if b["hits"] > st["hits"]:
            st["hits"] = b["hits"]
            st["last_hit"] = g.frame
        if st.get("pending") and g.frame - st["pending"] > 9:
            if b["hits"] == st["hits"]:
                st["whiffs"] += 1
            st["pending"] = None


def run(a0, a1, seed=1, verbose=False, max_windows=4000):
    g = E.Match(seed=seed)
    stats = [{"swings": 0, "hits": 0, "whiffs": 0, "pending": None, "last_hit": -99},
             {"swings": 0, "hits": 0, "whiffs": 0, "pending": None, "last_hit": -99}]
    prev = [dict(g.batsmen[0]), dict(g.batsmen[1])]
    w = 0
    t0 = time.time()
    while g.status == "playing" and w < max_windows:
        o0 = g.view(0)
        o1 = g.view(1)
        w0 = [E.normalize_frame(f)[0] for f in a0.act(o0)]
        w1 = [E.normalize_frame(f)[0] for f in a1.act(o1)]
        E.advance_window(g, [[[x] for x in w0], [[x] for x in w1]])
        track(g, prev, stats)
        prev = [dict(g.batsmen[0]), dict(g.batsmen[1])]
        w += 1
    return g, stats, time.time() - t0


def summary(g, stats, dt):
    return {
        "score": g.score, "winner": g.winner, "reason": g.reason,
        "frames": g.frame, "windows": g.frame // 10,
        "hits": [s["hits"] for s in stats],
        "swings": [s["swings"] for s in stats],
        "whiffs": [s["whiffs"] for s in stats],
        "stamina": [round(b["stamina"], 1) for b in g.batsmen],
        "longest": g.longestRally, "secs": round(dt, 2),
    }


if __name__ == "__main__":
    a0 = StatAgent(Brain(), "brain0")
    a1 = StatAgent(Brain(), "brain1")
    t0 = time.time()
    g, stats, dt = run(a0, a1, seed=7001)
    print(json.dumps(summary(g, stats, dt), ensure_ascii=False))
    pts = [e for e in g.events if e["type"] == "point"]
    print("points:", len(pts))
    for e in pts[:40]:
        print("  ", e)
