#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""更细的第 3 轮回放追踪：起脚距离、射门结局、进攻三区/禁区触球。"""
import gzip
import json
import math
import os
from collections import Counter

RUN = r"D:\extraProj\AIBattle\soccer\arena\control\run-20261024-093225"
FILES = ["r3-g1.json.gz", "r3-g2.json.gz"]
GOAL = {0: (43.0, 13.0), 1: (0.0, 13.0)}  # team -> attacking goal center
GOAL_LINE = {0: 43.0, 1: 0.0}
ATT_THIRD = {0: (44 / 3 * 2, 44.0), 1: (0.0, 44 / 3)}  # x range of opponent third
OWN_BOX = {0: (1.0, 6.0, 10.0, 20.0), 1: (34.0, 6.0, 43.0, 20.0)}
OPP_BOX = {0: (34.0, 6.0, 43.0, 20.0), 1: (1.0, 6.0, 10.0, 20.0)}


def load(fn):
    with gzip.open(os.path.join(RUN, fn), "rt", encoding="utf-8") as fh:
        return json.load(fh)


def in_box(x, y, box):
    x1, y1, x2, y2 = box
    return x1 <= x <= x2 and y1 <= y <= y2


def dist_goal(x, y, team):
    gx, gy = GOAL[team]
    return math.hypot(x - gx, y - gy)


def speed(fr):
    b = fr["ball"]
    return math.hypot(b["vx"], b["vy"])


def analyze(fn):
    d = load(fn)
    frames = d["frames"]
    fin = d["final"]
    events = fin.get("events", [])
    seats = d["seats"]
    team_name = {0: seats[0], 1: seats[1]}
    kicks = [e for e in events if e["type"] == "kick"]
    goals = [e for e in events if e["type"] == "goal"]
    saves = [e for e in events if e["type"] == "save"]
    save_frames = {e["frame"] for e in saves}
    goal_frames = {e["frame"] for e in goals}

    # --- 1) 每队每次控球的推进终点 ---
    # 连续 owner 段
    poss_segments = []
    cur = None
    for fr in frames:
        owner = fr["ball"].get("owner")
        if owner is None:
            if cur:
                poss_segments.append(cur)
                cur = None
            continue
        team = int(owner[1])
        if cur is None or cur["team"] != team:
            if cur:
                poss_segments.append(cur)
            cur = {"team": team, "start": fr["frame"], "end": fr["frame"],
                   "max_x": fr["ball"]["x"], "min_x": fr["ball"]["x"],
                   "max_adv": fr["ball"]["x"] if team == 0 else 44 - fr["ball"]["x"],
                   "box": False, "third": False, "unit": owner}
        cur["end"] = fr["frame"]
        x, y = fr["ball"]["x"], fr["ball"]["y"]
        cur["max_x"] = max(cur["max_x"], x)
        cur["min_x"] = min(cur["min_x"], x)
        adv = x if team == 0 else 44 - x
        cur["max_adv"] = max(cur["max_adv"], adv)
        if in_box(x, y, OPP_BOX[team]):
            cur["box"] = True
        a1, a2 = ATT_THIRD[team]
        if a1 <= x <= a2:
            cur["third"] = True
    if cur:
        poss_segments.append(cur)

    # --- 2) 每次踢球后的结局追踪 ---
    rows = []
    for k in kicks:
        team = k["team"]
        f0 = k["frame"]
        b0 = frames[f0]["ball"]
        tx, ty = GOAL[team]
        vx = math.cos(k["angle"]) * 11.0
        vy = math.sin(k["angle"]) * 11.0
        # 直线预测过门线位置
        t_line = (GOAL_LINE[team] - b0["x"]) / vx if abs(vx) > 1e-9 else None
        pred_y = None if t_line is None or t_line <= 0 else b0["y"] + vy * t_line
        aimed_goal = pred_y is not None and 9.4 <= pred_y <= 16.6
        d_goal = dist_goal(b0["x"], b0["y"], team)
        # 追踪到下一次控球/进球/80 帧
        outcome = {"type": "none", "frame": None, "unit": None, "team": None,
                   "ball_speed": None}
        for f in range(f0 + 1, min(f0 + 81, len(frames))):
            fr = frames[f]
            if f in goal_frames:
                outcome = {"type": "goal", "frame": f, "unit": None, "team": team,
                           "ball_speed": None}
                break
            if f in save_frames:
                outcome = {"type": "save", "frame": f, "unit": None, "team": team,
                           "ball_speed": round(speed(fr), 2)}
                break
            owner = fr["ball"].get("owner")
            if owner:
                ot = int(owner[1])
                outcome = {"type": "rebound_own" if ot == team else "lost",
                           "frame": f, "unit": owner, "team": ot,
                           "ball_speed": round(speed(fr), 2)}
                break
        rows.append({
            "frame": f0, "t": round(f0 / 20.0, 2), "team": team,
            "model": team_name[team], "unit": k["unit"],
            "x": k["x"], "y": k["y"], "dist_goal": round(d_goal, 2),
            "aimed_goal": aimed_goal, "pred_y": None if pred_y is None else round(pred_y, 2),
            "outcome": outcome,
        })

    # --- 3) 统计 ---
    def summarize(team):
        ks = [r for r in rows if r["team"] == team]
        shots = [r for r in ks if r["aimed_goal"] and r["dist_goal"] <= 20.0]
        long_aim = [r for r in ks if r["aimed_goal"] and r["dist_goal"] > 20.0]
        segs = [s for s in poss_segments if s["team"] == team]
        segs_box = [s for s in segs if s["box"]]
        segs_third = [s for s in segs if s["third"]]
        d = sorted(r["dist_goal"] for r in ks)
        n = len(d)
        med = d[n // 2] if n % 2 else (d[n // 2 - 1] + d[n // 2]) / 2
        return {
            "kicks": len(ks),
            "kicks_aimed_goal": sum(1 for r in ks if r["aimed_goal"]),
            "shots_dist_le20": len(shots),
            "shots_dist_le20_median_dist": round(sorted(r["dist_goal"] for r in shots)[len(shots)//2], 2) if shots else None,
            "long_aim_gt20": len(long_aim),
            "kick_dist_median": round(med, 2),
            "kick_dist_min": round(d[0], 2) if d else None,
            "kick_dist_q25": round(d[n // 4], 2) if d else None,
            "poss_segments": len(segs),
            "poss_segments_box_entry": len(segs_box),
            "poss_segments_third": len(segs_third),
            "poss_frames": sum(s["end"] - s["start"] + 1 for s in segs),
            "max_advance": round(max((s["max_adv"] for s in segs), default=0), 2),
        }

    print("=" * 80)
    print(f"{d['id']} seed={d['seed']} n={d['teamSize']} seats={seats} "
          f"frames={len(frames)} ({len(frames)/20:.1f}s) reason={fin['reason']} score={fin['score']}")
    for team in (0, 1):
        print(f"  [{team_name[team]}] {json.dumps(summarize(team), ensure_ascii=False)}")
    print("  --- 射门候选（朝门且距门 <=20）---")
    for r in rows:
        if r["aimed_goal"] and r["dist_goal"] <= 20.0:
            o = r["outcome"]
            print(f"    f{r['frame']:4d} {r['t']:7.2f}s {r['model']:16s} {r['unit']} "
                  f"({r['x']:6.2f},{r['y']:6.2f}) d={r['dist_goal']:5.2f} "
                  f"predY={r['pred_y']} -> {o['type']}@{o['frame']} {o['unit'] or ''}")
    print("  --- 远距离朝门踢球（>20，多为解围/大脚）---")
    c = Counter(r["model"] for r in rows if r["aimed_goal"] and r["dist_goal"] > 20.0)
    print("   ", dict(c))
    print("  --- 每次控球推进 ---")
    for team in (0, 1):
        segs = [s for s in poss_segments if s["team"] == team]
        if not segs:
            continue
        print(f"    {team_name[team]}: {len(segs)} 段, "
              f"禁区触球段 {sum(1 for s in segs if s['box'])}, "
              f"三区段 {sum(1 for s in segs if s['third'])}, "
              f"最长推进 {max(s['max_adv'] for s in segs):.2f}，"
              f"推进 >=30 的段 {sum(1 for s in segs if s['max_adv'] >= 30)}")
    return {"id": d["id"], "rows": rows, "summary": {team_name[t]: summarize(t) for t in (0, 1)}}


def main():
    out = [analyze(f) for f in FILES]
    with open(os.path.join(os.path.dirname(__file__), "r3_trace.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
