#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Round-1 detailed per-round stats. Usage: python -I analyze_round1_detail.py <run_dir> <out.txt>"""
import gzip
import json
import sys

RUN = sys.argv[1]
OUT = sys.argv[2]
ME = "deepseek-flash"
lines = []
def p(s=""):
    lines.append(s)

def load(name):
    with gzip.open(f"{RUN}/{name}.json.gz", "rt", encoding="utf-8") as fp:
        return json.load(fp)

for gid in ("r1-g1", "r1-g2"):
    d = load(gid)
    seats = d["seats"]
    frames = d["frames"]
    ev = d["final"]["events"]
    levels = d["levels"]
    my = seats.index(ME)

    rounds = []
    cur = None
    for e in ev:
        if e["type"] == "go":
            cur = {"round": e["round"], "sf": e["frame"], "st": e["t"], "ef": None, "et": None,
                   "winner": None, "reason": None, "wins": None}
            rounds.append(cur)
        elif e["type"] == "round" and cur:
            cur["ef"], cur["et"], cur["winner"], cur["reason"], cur["wins"] = (
                e["frame"], e["t"], e.get("team"), e.get("reason"), e.get("wins"))

    p("=" * 78)
    p(f"{gid} seed={d['seed']} seats={seats}")
    for r in rounds:
        rn, sf, ef = r["round"], r["sf"], r["ef"]
        lv = levels[str(rn)]
        # last frame before reset: round event frame resets players, so use ef-2
        last = frames[max(sf, ef - 2)]
        mx = [0.0, 0.0]
        dth = [0, 0]
        fin = [False, False]
        for k in range(sf, ef + 1):
            for run in frames[k]["runners"]:
                t = run["team"]
                mx[t] = max(mx[t], run["maxX"])
                dth[t] = max(dth[t], run["deaths"])
                fin[t] = fin[t] or run["finished"]
        w = r["winner"]
        p(f"  R{rn}: width={lv['width']} goal={lv['goalX']} span={r['et']-r['st']:.2f}s "
          f"winner={seats[w] if w is not None else '?'} reason={r['reason']}")
        for t in range(2):
            run = last["runners"][t]
            p(f"    {seats[t]:<15} end_x={run['x']:6.2f} end_maxX={run['maxX']:6.2f} "
              f"round_maxX={mx[t]:6.2f} deaths={dth[t]} finished={fin[t]}")
        win_mx = mx[w] if w is not None else None
        if win_mx is not None:
            p(f"    margin(maxX)={abs(mx[0]-mx[1]):.2f}")
        p(f"    last-frame t={last['time']:.2f} roundLeft={last['roundLeft']:.2f}")

    # stuck intervals per team per round (only while alive/racing)
    p("  stuck intervals (>=0.6s without maxX advancing):")
    for r in rounds:
        rn, sf, ef = r["round"], r["sf"], r["ef"]
        p(f"    R{rn}:")
        for t in range(2):
            best = None
            start = None
            lastmx = None
            entries = []
            for k in range(sf, ef + 1):
                run = frames[k]["runners"][t]
                if run["deaths"] > (lastmx[1] if lastmx else -1):
                    pass
                if lastmx is None or run["maxX"] > lastmx[0] + 0.15:
                    if start is not None and (k - start) >= 12:
                        entries.append((start, k, lastmx[0]))
                    start = k
                    lastmx = (run["maxX"], run["deaths"])
                else:
                    lastmx = (max(lastmx[0], run["maxX"]), run["deaths"])
            if start is not None and (ef - start) >= 12:
                entries.append((start, ef, lastmx[0]))
            # filter: only report if duration>=0.6s and not just after finish
            shown = []
            for a, b, x in entries:
                if b - a >= 12:
                    shown.append(f"t={frames[a]['time']:.2f}-{frames[b]['time']:.2f} "
                                 f"({(b-a)*0.05:.1f}s) at maxX~{x:.1f}")
            p(f"      {seats[t]}: " + ("; ".join(shown[:12]) if shown else "none"))

    # DSF trajectory milestones: first time reaching x thresholds in each round
    p("  milestone times (first t where x>= threshold):")
    for r in rounds:
        rn, sf, ef = r["round"], r["sf"], r["ef"]
        p(f"    R{rn}:")
        for t in range(2):
            row = []
            for th in (10, 20, 30, 40, 60, 80, 100, 120, 140, 160):
                ft = None
                for k in range(sf, ef + 1):
                    if frames[k]["runners"][t]["x"] >= th:
                        ft = frames[k]["time"]
                        break
                row.append(f"{th}:{ft:.1f}" if ft is not None else f"{th}:-")
            p(f"      {seats[t]:<15} " + " ".join(row))

with open(OUT, "w", encoding="utf-8") as fp:
    fp.write("\n".join(lines) + "\n")
print(f"wrote {OUT}")
