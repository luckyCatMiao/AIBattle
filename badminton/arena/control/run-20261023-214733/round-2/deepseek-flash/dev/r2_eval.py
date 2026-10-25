"""Round-2 evaluation harness: run Brain-vs-Brain across seeds and summarise
who wins each point (server or receiver), stamina, sprint usage and rallies."""
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


def run(seed, make_brain_a=None, make_brain_b=None, max_windows=4000):
    a0 = (make_brain_a or Brain)()
    a1 = (make_brain_b or Brain)()
    g = E.Match(seed=seed)
    sprint_frames = [0, 0]
    stamina_min = [100.0, 100.0]
    w = 0
    t0 = time.time()
    while g.status == "playing" and w < max_windows:
        o0 = g.view(0)
        o1 = g.view(1)
        w0 = [E.normalize_frame(f)[0] for f in a0.act(o0)]
        w1 = [E.normalize_frame(f)[0] for f in a1.act(o1)]
        for fi in range(E.RULES["decisionFrames"]):
            if g.status != "playing":
                break
            g.batsmen[0]["held"] = w0[fi]
            g.batsmen[1]["held"] = w1[fi]
            g.step()
            for i in range(2):
                if g.batsmen[i]["sprinting"]:
                    sprint_frames[i] += 1
                stamina_min[i] = min(stamina_min[i], g.batsmen[i]["stamina"])
        w += 1
    pts = [e for e in g.events if e["type"] == "point"]
    # server of each point: a point's server is the previous winner, starting 0
    server = 0
    serve_wins = 0
    recv_wins = 0
    rallies = []
    for e in pts:
        rallies.append(e.get("rally", 0))
        if e["team"] == server:
            serve_wins += 1
        else:
            recv_wins += 1
        server = e["team"]
    return {
        "seed": seed, "score": g.score, "winner": g.winner,
        "frames": g.frame, "secs": round(time.time() - t0, 2),
        "points": len(pts), "serve_wins": serve_wins, "recv_wins": recv_wins,
        "rallies": rallies, "longest": g.longestRally,
        "stamina_min": [round(x, 1) for x in stamina_min],
        "stamina_end": [round(b["stamina"], 1) for b in g.batsmen],
        "sprint_frames": sprint_frames,
        "hits": [b["hits"] for b in g.batsmen],
        "smashes": [b["smashes"] for b in g.batsmen],
    }


if __name__ == "__main__":
    seeds = [int(x) for x in sys.argv[1:]] or [7001, 7002, 7003, 7004, 7005]
    for s in seeds:
        r = run(s)
        print(json.dumps(r, ensure_ascii=True))
