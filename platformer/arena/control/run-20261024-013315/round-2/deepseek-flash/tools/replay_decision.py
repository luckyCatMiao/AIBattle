#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Replay the agent's decision at chosen frames. Usage: python -I replay_decision.py <run_dir> <gid> <frames...>"""
import gzip
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent

RUN, GID = sys.argv[1], sys.argv[2]
FRAMES = [int(x) for x in sys.argv[3:]]
ME = "deepseek-flash"
with gzip.open(f"{RUN}/{GID}.json.gz", "rt", encoding="utf-8") as fp:
    d = json.load(fp)
my = d["seats"].index(ME)
levels = d["levels"]
# round of frame
rounds = []
cur = None
for e in d["final"]["events"]:
    if e["type"] == "go":
        cur = {"round": e["round"], "sf": e["frame"]}
        rounds.append(cur)
    elif e["type"] == "round" and cur:
        cur["ef"] = e["frame"]

def round_of(f):
    for r in rounds:
        if r["sf"] <= f <= r.get("ef", 10**9):
            return r["round"]
    return 1

for k in FRAMES:
    f = d["frames"][k]
    rn = round_of(k)
    lv = dict(levels[str(rn)])
    obs = {key: val for key, val in f.items()}
    obs["level"] = lv
    obs["yourPlayer"] = my
    obs["status"] = "playing"
    obs["phase"] = "race"
    ctx = agent.reset_ctx(obs)
    plan = agent.choose_actions(ctx, obs, obs["runners"][my])
    opp = obs["runners"][1 - my]
    print(f"f{k} round{rn} t={obs['time']:.2f} me=({obs['runners'][my]['x']:.2f},{obs['runners'][my]['y']:.2f},"
          f"vx={obs['runners'][my]['vx']:.2f},vy={obs['runners'][my]['vy']:.2f},g={obs['runners'][my]['onGround']}) "
          f"opp_x={opp['x']:.2f}")
    print("  plan:", [(float(m), bool(j)) for (m, j) in plan])
    print("  stuck:", ctx.get("stuck"), "mask?", ctx.get("stuck"))
