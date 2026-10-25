"""In-process A/B of brain variants, with per-point attribution (dev only).

Two Brain instances are used; variant knobs are set on the instance so both can
differ inside one match.  Reports score, stamina at the end, jumps, and how
points went when the variant jumped vs not.
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


def make(**kw):
    b = Brain()
    for k, v in kw.items():
        setattr(b, k, v)
    return b


def run(seed, a, b, maxw=4000):
    g = E.Match(seed=seed)
    agents = [a, b]
    jumps = [[], []]        # frames of jump take-off per team
    hits = [[], []]
    prev = [dict(g.batsmen[0]), dict(g.batsmen[1])]
    w = 0
    while g.status == "playing" and w < maxw:
        o0, o1 = g.view(0), g.view(1)
        w0 = [E.normalize_frame(f)[0] for f in agents[0].act(o0)]
        w1 = [E.normalize_frame(f)[0] for f in agents[1].act(o1)]
        for fi in range(10):
            if g.status != "playing":
                break
            for i, win in ((0, w0), (1, w1)):
                p = g.batsmen[i]
                p["held"] = win[fi]
            g.step()
            for i in range(2):
                bs = g.batsmen[i]
                if prev[i]["onGround"] and not bs["onGround"]:
                    jumps[i].append(g.frame)
                prev[i] = dict(bs)
        w += 1
    # attribute each point to whether that team jumped during it
    pts = []
    cur = []
    per = [dict(jump_pts=0, jump_win=0, nojump_pts=0, nojump_win=0,
                jumps=len(jumps[0]), hits=0, stam=0.0),
           dict(jump_pts=0, jump_win=0, nojump_pts=0, nojump_win=0,
                jumps=len(jumps[1]), hits=0, stam=0.0)]
    start = 0
    for e in g.events:
        if e["type"] == "point":
            for i in range(2):
                d = per[i]
                j = any(start <= f < e["frame"] for f in jumps[i])
                if j:
                    d["jump_pts"] += 1
                    d["jump_win"] += 1 if e["team"] == i else 0
                else:
                    d["nojump_pts"] += 1
                    d["nojump_win"] += 1 if e["team"] == i else 0
            start = e["frame"]
    for i in range(2):
        per[i]["hits"] = g.batsmen[i]["hits"]
        per[i]["stam"] = round(g.batsmen[i]["stamina"], 1)
        per[i]["smashes"] = g.batsmen[i]["smashes"]
    return g, per


if __name__ == "__main__":
    seeds = [int(x) for x in sys.argv[1:]] or [7001, 7002, 7003]
    A = dict(jump_min=45.0, jump_pen=35.0, opp_jump_model=False)
    for s in seeds:
        for seat in (0, 1):
            a = make(**A)
            b = make(jump_min=999.0)
            agents = (a, b) if seat == 0 else (b, a)
            g, per = run(s, *agents)
            pa, pb = per[seat], per[1 - seat]
            print("seed=%d seat=%d net=%.2f score A=%d B=%d | A jumps=%d pts j:%d/%d nj:%d/%d hits=%d sm=%d stam=%.0f | "
                  "B jumps=%d pts j:%d/%d nj:%d/%d stam=%.0f" % (
                      s, seat, g.netHeight, g.score[seat], g.score[1 - seat],
                      pa["jumps"], pa["jump_win"], pa["jump_pts"],
                      pa["nojump_win"], pa["nojump_pts"], pa["hits"], pa["smashes"], pa["stam"],
                      pb["jumps"], pb["jump_win"], pb["jump_pts"],
                      pb["nojump_win"], pb["nojump_pts"], pb["stam"]))
