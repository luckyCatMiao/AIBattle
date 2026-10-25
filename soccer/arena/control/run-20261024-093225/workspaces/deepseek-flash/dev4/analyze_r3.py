#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""第 3 轮两场正式对局的离线复盘分析（只读回放）。"""
import gzip
import json
import math
import os
import sys
from collections import Counter, defaultdict

RUN = r"D:\extraProj\AIBattle\soccer\arena\control\run-20261024-093225"
FILES = ["r3-g1.json.gz", "r3-g2.json.gz"]
GOAL_TOP, GOAL_BOTTOM = 10.0, 16.0
W = 44.0
H = 26.0


def load(fn):
    with gzip.open(os.path.join(RUN, fn), "rt", encoding="utf-8") as fh:
        return json.load(fh)


def target_goal_x(team):
    # team 0 attacks x=43 (goal "1"), team 1 attacks x=0 (goal "0")
    return W - 1.0 if team == 0 else 1.0


def kick_is_shot(kick, team, bally_after=None):
    """判断一次踢球是否朝对方球门范围内（直线预测，不含反弹）。"""
    vx = math.cos(kick["angle"])
    vy = math.sin(kick["angle"])
    tx = target_goal_x(team)
    if abs(vx) < 1e-6:
        return False, None
    t = (tx - kick["x"]) / (vx * 11.0)  # kickPower=11
    if t <= 0:
        return False, None
    y = kick["y"] + vy * 11.0 * t
    return (GOAL_TOP - 0.6 <= y <= GOAL_BOTTOM + 0.6), y


def analyze(fn):
    d = load(fn)
    fin = d["final"]
    frames = d["frames"]
    events = fin.get("events", [])
    seats = d["seats"]
    names = d["names"]
    # team index -> model name
    team_name = {i: seats[i] for i in range(2)}
    # sanity: final player order == seats order
    assert [p["name"] for p in fin["players"]] == names, (fin["players"], names)

    stats = fin["stats"]
    # possession per frame: derive from ball owner
    poss_frames = [0, 0]
    poss_last = [None, None]
    for fr in frames:
        b = fr["ball"]
        if b.get("owner"):
            uid = b["owner"]
            t = int(uid[1])  # "t1u3"
            poss_frames[t] += 1

    # events
    kicks = [e for e in events if e["type"] == "kick"]
    goals = [e for e in events if e["type"] == "goal"]
    saves = [e for e in events if e["type"] == "save"]
    tackles = [e for e in events if e["type"] == "tackle"]

    # classify each kick
    kick_rows = []
    for e in kicks:
        team = e["team"]
        is_shot, y_at = kick_is_shot(e, team)
        kick_rows.append({
            "frame": e["frame"], "t": round(e["frame"] / 20.0, 2),
            "team": team, "model": team_name[team], "unit": e["unit"],
            "x": e["x"], "y": e["y"], "angle": e["angle"],
            "shot": is_shot, "y_at_goal": None if y_at is None else round(y_at, 2),
        })

    # attribute saves to the shooter: last kick before save within 60 frames
    save_rows = []
    for s in saves:
        prev = [k for k in kick_rows if k["frame"] <= s["frame"] and k["frame"] >= s["frame"] - 60]
        shooter = prev[-1] if prev else None
        save_rows.append({
            "frame": s["frame"], "t": round(s["frame"] / 20.0, 2),
            "keeper_team": s["team"], "keeper": s["unit"],
            "shooter_team": None if shooter is None else shooter["team"],
            "shooter_model": None if shooter is None else shooter["model"],
            "shooter_unit": None if shooter is None else shooter["unit"],
            "shot_from": None if shooter is None else (shooter["x"], shooter["y"]),
            "shot_frame": None if shooter is None else shooter["frame"],
            "shot_dist": None if shooter is None else round(
                math.hypot(shooter["x"] - target_goal_x(shooter["team"]),
                           shooter["y"] - 13.0), 2),
            "is_shot_ray": None if shooter is None else shooter["shot"],
        })

    goal_rows = []
    for g in goals:
        prev = [k for k in kick_rows if k["frame"] <= g["frame"] and k["frame"] >= g["frame"] - 90]
        shooter = prev[-1] if prev else None
        goal_rows.append({
            "frame": g["frame"], "t": round(g["frame"] / 20.0, 2),
            "team": g["team"], "model": team_name[g["team"]],
            "scorer": g.get("scorer"), "ownGoal": g.get("ownGoal"),
            "score": g.get("score"),
            "shot_frame": None if shooter is None else shooter["frame"],
            "shot_from": None if shooter is None else (shooter["x"], shooter["y"]),
            "shot_unit": None if shooter is None else shooter["unit"],
            "shot_dist": None if shooter is None else round(
                math.hypot(shooter["x"] - target_goal_x(shooter["team"]),
                           shooter["y"] - 13.0), 2),
        })

    # shots on target = goals + saves (engine only emits these)
    # shot attempts = kicks whose straight ray enters goal mouth
    for team in (0, 1):
        ks = [k for k in kick_rows if k["team"] == team]
        shots = [k for k in ks if k["shot"]]
        on_target = sum(1 for s in save_rows if s["shooter_team"] == team) + sum(
            1 for g in goal_rows if g["team"] == team and not g["ownGoal"])
        print(f"  {team_name[team]:18s} kicks={len(ks):3d} shot_ray={len(shots):2d} "
              f"on_target(goals+saves)={on_target:2d} goals={sum(1 for g in goal_rows if g['team']==team)}")

    return {
        "file": fn, "id": d["id"], "seed": d["seed"], "teamSize": d["teamSize"],
        "seats": seats, "frames": len(frames), "seconds": round(len(frames) / 20.0, 2),
        "duration": d["duration"], "reason": fin.get("reason"),
        "score": fin.get("score"), "stats": stats, "poss_frames": poss_frames,
        "kicks": kick_rows, "saves": save_rows, "goals": goal_rows,
        "tackles": [{"frame": e["frame"], "t": round(e["frame"] / 20.0, 2),
                     "team": e["team"], "model": team_name[e["team"]],
                     "unit": e["unit"], "from": e["from"]} for e in tackles],
        "team_name": team_name,
    }


def main():
    out = []
    for fn in FILES:
        print("=" * 78)
        r = analyze(fn)
        out.append(r)
        print(f"{r['id']} seed={r['seed']} teamSize={r['teamSize']} seats={r['seats']}")
        print(f"  frames={r['frames']} ({r['seconds']}s) engine_duration={r['duration']}s reason={r['reason']} score={r['score']}")
        print(f"  stats={r['stats']} owner_frames={r['poss_frames']}")
        print("  goals:")
        for g in r["goals"]:
            print("   ", g)
        print("  saves:")
        for s in r["saves"]:
            print("   ", s)
        print("  tackles:")
        for t in r["tackles"]:
            print("   ", t)
        print("  shot-ray kicks:")
        for k in r["kicks"]:
            if k["shot"]:
                print(f"    f{k['frame']:4d} t={k['t']:6.2f} {k['model']:16s} {k['unit']} "
                      f"from=({k['x']},{k['y']}) y@goal={k['y_at_goal']}")
    with open(r"D:\extraProj\AIBattle\soccer\arena\control\run-20261024-093225\workspaces\deepseek-flash\dev4\r3_analysis.json",
              "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print("\nsaved dev4/r3_analysis.json")


if __name__ == "__main__":
    main()
