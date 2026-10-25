#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""汇总 review.md 需要的全部数字，避免手算出错。"""
import gzip
import json
import math
import os
import statistics

RUN = r"D:\extraProj\AIBattle\soccer\arena\control\run-20261024-093225"
GOAL = {0: (43.0, 13.0), 1: (0.0, 13.0)}
GOAL_LINE = {0: 43.0, 1: 0.0}
ATT = {0: (44 / 3 * 2, 44.0), 1: (0.0, 44 / 3)}
OWN = {0: (0.0, 44 / 3), 1: (44 / 3 * 2, 44.0)}
BOX_OPP = {0: (34.0, 6.0, 43.0, 20.0), 1: (1.0, 6.0, 10.0, 20.0)}


def load(fn):
    with gzip.open(os.path.join(RUN, fn), "rt", encoding="utf-8") as fh:
        return json.load(fh)


def in_box(x, y, b):
    return b[0] <= x <= b[2] and b[1] <= y <= b[3]


for fn in ("r3-g1.json.gz", "r3-g2.json.gz"):
    d = load(fn)
    frames = d["frames"]
    fin = d["final"]
    ev = fin["events"]
    seats = d["seats"]
    nm = {0: seats[0], 1: seats[1]}
    print("=" * 90)
    print(f"{d['id']} seed={d['seed']} n={d['teamSize']} seats={seats} "
          f"frames={len(frames)} sim={len(frames)/20:.2f}s windows={len(d['windows'])} "
          f"wall={d['duration']}s score={fin['score']} reason={fin['reason']}")
    print("  stats", fin["stats"])
    kicks = [e for e in ev if e["type"] == "kick"]
    for team in (0, 1):
        ks = [e for e in kicks if e["team"] == team]
        ds = sorted(math.hypot(GOAL[team][0] - e["x"], GOAL[team][1] - e["y"]) for e in ks)
        med = statistics.median(ds) if ds else None
        own_half = sum(1 for e in ks if (e["x"] < 22 if team == 0 else e["x"] > 22))
        bucket = {"<=15": 0, "15-20": 0, "20-25": 0, "25-30": 0, ">30": 0}
        for v in ds:
            if v <= 15:
                bucket["<=15"] += 1
            elif v <= 20:
                bucket["15-20"] += 1
            elif v <= 25:
                bucket["20-25"] += 1
            elif v <= 30:
                bucket["25-30"] += 1
            else:
                bucket[">30"] += 1
        print(f"  {nm[team]:15s} team{team}: kicks={len(ks)} median_dist={med:.2f} "
              f"own_half={own_half} buckets={bucket} >25={bucket['25-30']+bucket['>30']}")
    # possession segments
    for team in (0, 1):
        segs = []
        cur = None
        for fr in frames:
            o = fr["ball"].get("owner")
            if o is None:
                if cur:
                    segs.append(cur)
                    cur = None
                continue
            t = int(o[1])
            if cur is None or cur["team"] != t:
                if cur:
                    segs.append(cur)
                cur = {"team": t, "start": fr["frame"], "end": fr["frame"],
                       "sx": fr["ball"]["x"], "max_adv": fr["ball"]["x"] if t == 0 else 44 - fr["ball"]["x"],
                       "box": False, "third": False}
            cur["end"] = fr["frame"]
            x, y = fr["ball"]["x"], fr["ball"]["y"]
            cur["max_adv"] = max(cur["max_adv"], x if t == 0 else 44 - x)
            if in_box(x, y, BOX_OPP[t]):
                cur["box"] = True
            a1, a2 = ATT[t]
            if a1 <= x <= a2:
                cur["third"] = True
        if cur:
            segs.append(cur)
        ss = [s for s in segs if s["team"] == team]
        starts = [s["sx"] if team == 0 else 44 - s["sx"] for s in ss]
        lens = [(s["end"] - s["start"] + 1) / 20 for s in ss]
        print(f"  {nm[team]:15s} possession: frames={sum(s['end']-s['start']+1 for s in ss)} "
              f"segments={len(ss)} median_start_from_own_goal={statistics.median(starts):.2f} "
              f"median_len={statistics.median(lens):.2f}s max_len={max(lens):.2f}s "
              f"att_third_segments={sum(1 for s in ss if s['third'])} box_segments={sum(1 for s in ss if s['box'])} "
              f"max_adv={max(s['max_adv'] for s in ss):.2f}")
    # territory ball time
    for team in (0, 1):
        a1, a2 = ATT[team]
        t = sum(1 for fr in frames if a1 <= fr["ball"]["x"] <= a2)
        print(f"  ball in {nm[team]:15s} attacking third: {t} frames ({t/20:.2f}s)")
    print("  goals:")
    for e in ev:
        if e["type"] == "goal":
            print("   ", e)
    print("  saves:")
    for e in ev:
        if e["type"] == "save":
            print("   ", e)
