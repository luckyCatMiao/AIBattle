#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Round-1 replay analysis. Usage: python -I analyze_round1.py <run_dir> <out.txt>"""
import gzip
import json
import sys
from collections import defaultdict

RUN = sys.argv[1]
OUT = sys.argv[2]
ME = "deepseek-flash"


def load(name):
    with gzip.open(f"{RUN}/{name}.json.gz", "rt", encoding="utf-8") as fp:
        return json.load(fp)


def team_of(d, seat):
    return d["seats"].index(seat)


lines = []


def p(s=""):
    lines.append(s)


for gid in ("r1-g1", "r1-g2"):
    d = load(gid)
    seats = d["seats"]
    names = d["names"]
    my = team_of(d, ME)
    opp = 1 - my
    ev = d["final"]["events"]
    frames = d["frames"]
    levels = d["levels"]
    p("=" * 72)
    p(f"{gid}  seed={d['seed']}  seats={seats}  my_team={my}  winner={d['winner']} ({seats[d['winner']]})")
    p(f"duration_field={d['duration']}s frames={len(frames)} ({len(frames)/20:.2f}s) windows={len(d['windows'])}")
    p(f"reason={d['reason']}  errors={d['errors']}")
    p("level widths: " + ", ".join(f"R{k}={v['width']}(goal {v['goalX']})" for k, v in levels.items()))
    p(f"final maxX: " + ", ".join(f"{seats[r['team']]}={r['maxX']}" for r in d['final']['runners']))
    p(f"final deaths: " + ", ".join(f"{seats[r['team']]}={r['deaths']}" for r in d['final']['runners']))

    # round boundaries
    rounds = []
    cur = None
    for e in ev:
        if e["type"] == "go":
            cur = {"round": e["round"], "start_t": e["t"], "start_f": e["frame"],
                   "end_t": None, "end_f": None, "winner": None, "reason": None,
                   "wins": None}
            rounds.append(cur)
        elif e["type"] == "round" and cur is not None:
            cur["end_t"] = e["t"]
            cur["end_f"] = e["frame"]
            cur["winner"] = e.get("team")
            cur["reason"] = e.get("reason")
            cur["wins"] = e.get("wins")
    if rounds and rounds[-1]["end_f"] is None:
        rounds[-1]["end_f"] = len(frames) - 1
        rounds[-1]["end_t"] = frames[-1]["time"]

    p("")
    p("per-round:")
    for r in rounds:
        rn = r["round"]
        sf, ef = r["start_f"], r["end_f"]
        f0, f1 = frames[sf], frames[ef]
        lv = levels[str(rn)]
        p(f"  R{rn}: level {lv['width']} goal {lv['goalX']} | "
          f"t {r['start_t']:.2f}->{r['end_t']:.2f} ({r['end_t']-r['start_t']:.2f}s) | "
          f"winner={seats[r['winner']] if r['winner'] is not None else '?'} reason={r['reason']} wins={r['wins']}")
        for runner in f1["runners"]:
            t = runner["team"]
            start_d = f0["runners"][t]["deaths"]
            p(f"    {seats[t]}: x={runner['x']:.2f} maxX={runner['maxX']:.2f} "
              f"deaths={runner['deaths']} (+{runner['deaths']-start_d}) finished={runner['finished']} "
              f"invuln={runner['invuln']:.2f}")

    p("")
    p("events by round:")
    # assign event round by frame
    def round_at(frame):
        for r in rounds:
            if r["start_f"] <= frame <= (r["end_f"] if r["end_f"] is not None else 10**9):
                return r["round"]
        return "pre"

    groups = defaultdict(lambda: defaultdict(list))
    for e in ev:
        if e["type"] in ("ready", "finish"):
            continue
        rn = e.get("round", round_at(e.get("frame", 0)))
        groups[rn][e["type"]].append(e)

    for rn in sorted(groups, key=str):
        p(f"  -- R{rn}")
        pushes = groups[rn]["push"]
        if pushes:
            by = defaultdict(int)
            for e in pushes:
                by[(seats[e['from']], seats[e['to']])] += 1
            xs = [e["x"] for e in pushes]
            ts = [e["t"] for e in pushes]
            p(f"     push: {len(pushes)} events, t {min(ts):.2f}-{max(ts):.2f}, x {min(xs):.1f}-{max(xs):.1f}")
            for (a, b), n in by.items():
                p(f"       {a} -> {b}: {n}")
            if len(pushes) <= 40:
                p("       detail: " + "; ".join(f"{e['t']:.2f}s {seats[e['from']]}->{seats[e['to']]}@{e['x']:.1f}" for e in pushes))
        for e in groups[rn]["monster"]:
            p(f"     monster spawn: t={e['t']:.2f} x={e['x']:.2f} y={e['y']}")
        for e in groups[rn]["respawn"]:
            p(f"     respawn: t={e['t']:.2f} team={seats[e['team']]} reason={e['reason']} x={e['x']:.2f}")
        other = {k: v for k, v in groups[rn].items() if k not in ("push", "monster", "respawn")}
        for k, v in other.items():
            for e in v:
                p(f"     {k}: {json.dumps(e, ensure_ascii=False)}")

    # death context: position/velocity a few frames before each respawn
    p("")
    p("respawn context (5 frames before):")
    for e in ev:
        if e["type"] != "respawn":
            continue
        fr = e["frame"]
        p(f"  t={e['t']:.2f} team={seats[e['team']]} reason={e['reason']}")
        for k in range(max(0, fr - 5), min(len(frames), fr + 1)):
            f = frames[k]
            rs = f["runners"]
            p(f"    f{k} t={f['time']:.2f} " + " | ".join(
                f"{seats[r['team']]}: x={r['x']:.2f} y={r['y']:.2f} vx={r['vx']:.2f} vy={r['vy']:.2f} g={r['onGround']}"
                for r in rs))
    p()

# me-specific summary
p("=" * 72)
p("MY SUMMARY")
for gid in ("r1-g1", "r1-g2"):
    d = load(gid)
    my = d["seats"].index(ME)
    fin = d["final"]
    wins = [pl["wins"] for pl in fin["players"]]
    deaths = [r["deaths"] for r in fin["runners"]]
    maxx = [r["maxX"] for r in fin["runners"]]
    p(f"{gid}: my seat={my} winner={d['seats'][d['winner']]} score={wins[my]}:{wins[1-my]} "
      f"deaths={deaths[my]} maxX={maxx[my]} level={d['level']['width']}")

with open(OUT, "w", encoding="utf-8") as fp:
    fp.write("\n".join(lines) + "\n")
print(f"wrote {OUT} ({len(lines)} lines)")
