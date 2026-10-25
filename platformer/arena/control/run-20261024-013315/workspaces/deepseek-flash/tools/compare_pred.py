#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compare agent-predicted hazards/physics with replay ground truth at a chosen frame."""
import gzip
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent

RUN, GID, K = sys.argv[1], sys.argv[2], int(sys.argv[3])
ME = "deepseek-flash"
with gzip.open(f"{RUN}/{GID}.json.gz", "rt", encoding="utf-8") as fp:
    d = json.load(fp)
my = d["seats"].index(ME)
rounds, cur = [], None
for e in d["final"]["events"]:
    if e["type"] == "go":
        cur = {"round": e["round"], "sf": e["frame"]}
        rounds.append(cur)
    elif e["type"] == "round" and cur:
        cur["ef"] = e["frame"]

def rof(f):
    for r in rounds:
        if r["sf"] <= f <= r.get("ef", 10**9):
            return r["round"]
    return 1

rn = rof(K)
f = d["frames"][K]
obs = dict(f)
obs["level"] = dict(d["levels"][str(rn)])
obs["yourPlayer"] = my
obs["status"] = "playing"
obs["phase"] = "race"
ctx = agent.reset_ctx(obs)
fds, mask = agent.build_frame_data(ctx, obs, float(obs["time"]), 30)
print("gen_valid", ctx["gen_valid"], "round", rn, "obs t", obs["time"], "x", obs["runners"][my]["x"])
print("pred vs actual (saw):")
for i in range(30):
    k = K + 1 + i
    if k >= len(d["frames"]):
        break
    af = d["frames"][k]
    # nearest actual saw to predicted positions
    preds = fds[i]["saws"]
    acts = [(s["x"], s["y"]) for s in af["saws"]]
    best = []
    for (px, py) in preds:
        # match nearest actual
        if acts:
            ax, ay = min(acts, key=lambda a: abs(a[0] - px))
            best.append(f"pred=({px:.3f},{py:.2f}) act=({ax:.3f},{ay:.2f}) err={ax-px:+.3f}")
    pf = [(pl[0], pl[2]) for pl in fds[i]["plants"]]
    afp = [(p["x"], p["height"]) for p in af["plants"]]
    bp = []
    for (px, ph) in pf:
        if afp:
            ax, ah = min(afp, key=lambda a: abs(a[0] - px))
            if abs(ax - px) < 0.01 and abs(ah - ph) > 0.01:
                bp.append(f"plant@{px} pred_h={ph:.2f} act_h={ah:.2f}")
    line = f"  f{k} t={af['time']:.2f} " + " | ".join(best) + ("  PLANTERR " + ";".join(bp) if bp else "")
    print(line)
