#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用回放观察重放我们的 agent，输出每个窗口的搜索候选与选择（只读复盘）。"""
import gzip
import json
import os
import sys

RUN = r"D:\extraProj\AIBattle\soccer\arena\control\run-20261024-093225"
WS = os.path.join(RUN, "workspaces", "deepseek-flash")
sys.path.insert(0, WS)
os.environ["SOCCER_DEBUG"] = "1"
os.environ["SOCCER_DEBUGFILE"] = os.path.join(WS, "dev4", "replay_dbg.log")

import agent_core as ac  # noqa: E402

for fn, me in (("r3-g1.json.gz", 0), ("r3-g2.json.gz", 1)):
    with gzip.open(os.path.join(RUN, fn), "rt", encoding="utf-8") as fh:
        d = json.load(fh)
    frames = d["frames"]
    ws = {w["frame"]: w for w in d["windows"]}
    ac._prev_pos.clear()
    ac._prev2_pos.clear()
    mismatches = 0
    for wend, w in sorted(ws.items()):
        obs = dict(frames[wend - 20])
        obs["yourTeam"] = me
        out = ac.decide(obs)["inputs"]
        rec = w["inputs"][me]
        if out != rec:
            mismatches += 1
    print(fn, "windows", len(ws), "mismatches", mismatches)
print("debug written to", os.environ["SOCCER_DEBUGFILE"])
