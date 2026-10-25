#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Closed-loop replay test: drive the current agent from a replay frame using
recorded hazard/opponent data, simulating only our own 5-frame steps.
Usage: python -I simulate_closed_loop.py <run_dir> <gid> <start_frame> <end_frame>
"""
import gzip
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent

RUN, GID = sys.argv[1], sys.argv[2]
F0, F1 = int(sys.argv[3]), int(sys.argv[4])
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

rn = rof(F0)
base = d["frames"][F0]
me0 = base["runners"][my]
state = (me0["x"], me0["y"], me0["vx"], me0["vy"], me0["onGround"])
ctx = {}
dead_at = None
alive = True
for k in range(F0, F1, 5):
    f = dict(d["frames"][k])
    f["runners"] = [dict(r) for r in f["runners"]]
    f["runners"][my].update({"x": state[0], "y": state[1], "vx": state[2], "vy": state[3],
                             "onGround": state[4]})
    f["level"] = dict(d["levels"][str(rn)])
    f["yourPlayer"] = my
    f["status"] = "playing"
    f["phase"] = "race"
    if not ctx:
        ctx = agent.reset_ctx(f)
    plan = agent.choose_actions(ctx, f, f["runners"][my])
    fds, _ = agent.build_frame_data(ctx, f, float(f["time"]), 6)
    print(f"f{k} t={f['time']:.2f} x={state[0]:.2f} y={state[1]:.2f} plan={[(round(m,1),j) for m,j in plan]}")
    for i in range(5):
        kv = k + 1 + i
        if kv >= len(d["frames"]):
            break
        mv, jmp = plan[i]
        r = agent.step_player(state[0], state[1], state[2], state[3], state[4],
                              float(mv), bool(jmp), ctx["geom"], fds[i]["prects"], fds[i]["gone"])
        if r is None:
            print(f"  DIED (pit) at f{kv}")
            alive = False
            dead_at = kv
            break
        if agent.hazard_hit(r[0], r[1], ctx["geom"], fds[i], None):
            print(f"  DIED (hazard) at f{kv} x={r[0]:.2f} y={r[1]:.2f}")
            alive = False
            dead_at = kv
            break
        state = r
    if not alive:
        break
print("RESULT", "alive" if alive else f"dead at f{dead_at}", "end x=%.2f" % state[0])
