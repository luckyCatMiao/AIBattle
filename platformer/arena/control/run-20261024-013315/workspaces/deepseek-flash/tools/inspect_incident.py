#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Inspect an incident window from a replay.
Usage: python -I inspect_incident.py <run_dir> <gid> <start_frame> <end_frame> [xlo xhi]
"""
import gzip
import json
import sys

RUN, GID = sys.argv[1], sys.argv[2]
F0, F1 = int(sys.argv[3]), int(sys.argv[4])
XLO = float(sys.argv[5]) if len(sys.argv) > 5 else None
XHI = float(sys.argv[6]) if len(sys.argv) > 6 else None
ME = "deepseek-flash"

with gzip.open(f"{RUN}/{GID}.json.gz", "rt", encoding="utf-8") as fp:
    d = json.load(fp)
seats = d["seats"]
my = seats.index(ME)
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

frames = d["frames"]
rn = round_of(F0)
lv = d["levels"][str(rn)]
w, h, tiles = lv["width"], lv["height"], lv["tiles"]

# window lookup: window covering frame f is (f-1)//5*5? windows frame field is end frame
wins = {w0["frame"]: w0 for w0 in d["windows"]}

out = []
def p(s=""):
    out.append(s)

p(f"{GID} round {rn} frames {F0}-{F1} (t {F0/20:.2f}-{F1/20:.2f}) level width {w} goal {lv['goalX']}")

# Level structure around x range
if XLO is not None:
    xlo, xhi = int(XLO), int(XHI)
    p(f"level columns x={xlo}..{xhi}:")
    for x in range(xlo, xhi + 1):
        col = [tiles[y * w + x] for y in range(h)]
        top = next((h - y for y, t in enumerate(col) if t in (1, 2, 4)), None)
        marks = []
        for y, t in enumerate(col):
            if t == 3:
                marks.append(f"spike@y{h-1-y}")
            elif t == 4:
                marks.append(f"crumble@y{h-1-y}")
            elif t == 2:
                marks.append(f"brick@y{h-1-y}")
        p(f"  x={x:3d} top={top} " + " ".join(marks))

p("agents' windows/inputs (DSF seat %d):" % my)
for wf in sorted(wins):
    if F0 - 5 <= wf <= F1:
        w0 = wins[wf]
        inp = w0["inputs"][my]
        opp = w0["inputs"][1 - my]
        p(f"  win end f{wf}: DSF=" + ",".join(f"{int(fr[0].get('move',0))}{'J' if fr[0].get('jump') else ''}" for fr in inp)
          + " | opp=" + ",".join(f"{int(fr[0].get('move',0))}{'J' if fr[0].get('jump') else ''}" for fr in opp))

p("frames:")
for k in range(F0, min(F1 + 1, len(frames))):
    f = frames[k]
    parts = [f"f{k} t={f['time']:6.2f}"]
    for run in f["runners"]:
        parts.append(f"{seats[run['team']][:4]}:x={run['x']:6.2f} y={run['y']:5.2f} "
                     f"vx={run['vx']:5.2f} vy={run['vy']:6.2f} g={int(run['onGround'])} "
                     f"d={run['deaths']} inv={run['invuln']:.1f} mx={run['maxX']:.1f}")
    # hazards near x range
    if XLO is not None:
        near = []
        for pl in f["plants"]:
            if XLO - 2 <= pl["x"] <= XHI + 2:
                near.append(f"plant@{pl['x']:.1f} h={pl['height']:.2f}")
        for s in f["saws"]:
            if XLO - 2 <= s["x"] <= XHI + 2:
                near.append(f"saw@({s['x']:.2f},{s['y']:.2f})")
        for pf in f["platforms"]:
            if XLO - 3 <= pf["x"] <= XHI + 3:
                near.append(f"plat@({pf['x']:.2f},{pf['y']:.2f}) dx={pf['dx']:.2f}")
        for m in f["monsters"]:
            if XLO - 3 <= m["x"] <= XHI + 3:
                near.append(f"mon@{m['x']:.2f}")
        for g in f.get("crumbling") or []:
            if XLO - 2 <= g["x"] <= XHI + 2:
                near.append(f"crmb@{g['x']:.1f} left={g['left']:.2f}")
        if near:
            parts.append("[" + " ".join(near) + "]")
    p("  " + " | ".join(parts))

import os
out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"incident_{GID}_{F0}_{F1}.txt")
with open(out_path, "w", encoding="utf-8") as fp:
    fp.write("\n".join(out) + "\n")
print(out_path)
