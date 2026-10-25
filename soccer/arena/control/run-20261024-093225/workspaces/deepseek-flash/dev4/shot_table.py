#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""输出 review.md 附录用的 Markdown 表格行。"""
import gzip
import json
import math
import os

RUN = r"D:\extraProj\AIBattle\soccer\arena\control\run-20261024-093225"
GOAL = {0: (43.0, 13.0), 1: (0.0, 13.0)}
GOAL_LINE = {0: 43.0, 1: 0.0}
TY = (10.7, 11.4, 12.1, 12.8, 13.4, 14.1, 14.8, 15.3)


def load(fn):
    with gzip.open(os.path.join(RUN, fn), "rt", encoding="utf-8") as fh:
        return json.load(fh)


for fn in ("r3-g1.json.gz", "r3-g2.json.gz"):
    d = load(fn)
    frames = d["frames"]
    fin = d["final"]
    ev = fin["events"]
    seats = d["seats"]
    nm = {0: seats[0], 1: seats[1]}
    save_frames = {e["frame"] for e in ev if e["type"] == "save"}
    goal_frames = {e["frame"] for e in ev if e["type"] == "goal"}
    print("\n###", d["id"])
    print("| 帧 | 时间 | 队伍 | 单位 | 起脚点 | 距门 | 门线交点 y | 结局 | 飞行 | 防守方在通道内 | 最近垂直距离 |")
    print("|---:|---:|---|---|---|---:|---:|---|---:|---:|---:|")
    for e in ev:
        if e["type"] != "kick":
            continue
        team = e["team"]
        gx, gy = GOAL[team]
        dist = math.hypot(gx - e["x"], gy - e["y"])
        if dist > 20.0:
            continue
        # 用事件角度判断是否朝门框
        yg = e["y"] + math.tan(e["angle"]) * (gx - e["x"])
        if not (9.0 <= yg <= 17.0):
            continue
        # 结局
        out = ("—", None)
        for f in range(e["frame"] + 1, min(e["frame"] + 90, len(frames))):
            if f in goal_frames:
                out = ("进球", f)
                break
            if f in save_frames:
                out = ("扑救", f)
                break
            o = frames[f]["ball"].get("owner")
            if o:
                out = (("对方解围/拦截" if int(o[1]) != team else "己方得到"), f)
                break
        if out[0] == "—":
            out = ("未形成结果", None)
        flight = "—" if out[1] is None else f"{(out[1]-e['frame'])/20:.2f}s（{out[1]-e['frame']} 帧）"
        # 通道
        b1 = frames[e["frame"] + 1]["ball"]
        dx, dy = b1["x"] - e["x"], b1["y"] - e["y"]
        L = math.hypot(dx, dy)
        ux, uy = (dx / L, dy / L) if L > 1e-6 else (1.0, 0.0)
        tline = (gx - e["x"]) / ux if abs(ux) > 1e-9 else 1e9
        best = None
        ngs = 0
        for o in frames[e["frame"]]["units"]:
            if o["team"] == team:
                continue
            vx_, vy_ = o["x"] - e["x"], o["y"] - e["y"]
            t = vx_ * ux + vy_ * uy
            perp = abs(vx_ * uy - vy_ * ux)
            if 0 < t < tline:
                ngs += 1
                if best is None or perp < best[0]:
                    best = (perp, o["id"])
        print(f"| {e['frame']} | {e['frame']/20:.2f}s | {nm[team]} | {e['unit']} | "
              f"({e['x']:.2f},{e['y']:.2f}) | {dist:.2f} | {yg:.2f} | {out[0]} | {flight} | "
              f"{ngs} | {'—' if best is None else f'{best[0]:.2f}（{best[1]}）'} |")
