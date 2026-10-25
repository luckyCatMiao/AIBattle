#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""计算每次射门起脚瞬间，防守方是否有人在球-球门连线（射门通道）上。"""
import gzip
import json
import math
import os

RUN = r"D:\extraProj\AIBattle\soccer\arena\control\run-20261024-093225"
GOAL_LINE = {0: 43.0, 1: 0.0}
GOAL_Y = 13.0


def load(fn):
    with gzip.open(os.path.join(RUN, fn), "rt", encoding="utf-8") as fh:
        return json.load(fh)


for fn in ("r3-g1.json.gz", "r3-g2.json.gz"):
    d = load(fn)
    frames = d["frames"]
    seats = d["seats"]
    ev = d["final"]["events"]
    print("=" * 90)
    print(fn, seats)
    for e in ev:
        if e["type"] != "kick":
            continue
        team = e["team"]
        f0 = e["frame"]
        bx, by = e["x"], e["y"]
        # 只分析起脚点距门 <=20 且朝门框范围的球
        gx, gy = GOAL_LINE[team], GOAL_Y
        dist = math.hypot(gx - bx, gy - by)
        if dist > 20.0:
            continue
        # 起脚后球的真实速度方向（从回放下一帧球位置差）
        if f0 + 1 >= len(frames):
            continue
        b1 = frames[f0 + 1]["ball"]
        dx, dy = b1["x"] - bx, b1["y"] - by
        L = math.hypot(dx, dy)
        if L < 1e-6:
            continue
        ux, uy = dx / L, dy / L
        # 是否朝门（预测门线交点）
        t_line = (gx - bx) / ux if abs(ux) > 1e-9 else None
        if t_line is None or t_line <= 0:
            continue
        y_line = by + uy * t_line
        if not (9.0 <= y_line <= 17.0):
            continue
        best = None
        goal_side = 0
        for o in frames[f0]["units"]:
            if o["team"] == team:
                continue
            vx_, vy_ = o["x"] - bx, o["y"] - by
            t = vx_ * ux + vy_ * uy
            perp = abs(vx_ * uy - vy_ * ux)
            if 0.0 < t < t_line:
                goal_side += 1
                if best is None or perp < best[0]:
                    best = (perp, o["id"], round(t, 2), round(o["x"], 2), round(o["y"], 2))
        print(f"  f{f0:4d} t={f0/20:6.2f}s {seats[team]:15s} {e['unit']} "
              f"from=({bx:6.2f},{by:6.2f}) d={dist:5.2f} y@goal={y_line:5.2f} "
              f"defenders_goal_side={goal_side} nearest_perp="
              + ("none" if best is None else f"{best[0]:.2f} by {best[1]} at along={best[2]:.2f} pos=({best[3]},{best[4]})"))
