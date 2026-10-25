#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打印进球/被扑救/被阻挡时刻的场上细节。"""
import gzip
import json
import math
import os

RUN = r"D:\extraProj\AIBattle\soccer\arena\control\run-20261024-093225"
FILES = ["r3-g1.json.gz", "r3-g2.json.gz"]


def load(fn):
    with gzip.open(os.path.join(RUN, fn), "rt", encoding="utf-8") as fh:
        return json.load(fh)


def show(fn, frame, label):
    d = load(fn)
    frames = d["frames"]
    seats = d["seats"]
    fr = frames[frame]
    print(f"\n--- {d['id']} {label} @frame {frame} ({frame/20:.2f}s) score={fr['score']} "
          f"ball=({fr['ball']['x']:.2f},{fr['ball']['y']:.2f}) v=({fr['ball']['vx']:.2f},{fr['ball']['vy']:.2f}) "
          f"owner={fr['ball']['owner']} last={fr['ball']['lastTouch']} ---")
    for u in fr["units"]:
        nm = seats[u["team"]]
        if nm == "deepseek-flash":
            print(f"  {u['id']:5s} {nm:15s} ({u['x']:6.2f},{u['y']:6.2f}) keeper={u['keeper']} "
                  f"hasBall={u['hasBall']} inOwnBox={u['inOwnBox']} facing=({u['facing']['x']:.2f},{u['facing']['y']:.2f})")
    # ball trajectory frames after
    print("  ball path:", end="")
    for f in range(frame + 1, min(frame + 30, len(frames))):
        b = frames[f]["ball"]
        print(f" [{f}:{b['x']:.2f},{b['y']:.2f}]", end="")
    print()


def main():
    show("r3-g2.json.gz", 561, "Sol 第 1 球起脚")
    show("r3-g2.json.gz", 584, "Sol 第 1 球进球前 1 帧")
    show("r3-g2.json.gz", 1781, "Sol 第 2 球起脚")
    show("r3-g2.json.gz", 1804, "Sol 第 2 球进球前 1 帧")
    show("r3-g2.json.gz", 781, "Sol 射门被扑 f811")
    show("r3-g2.json.gz", 907, "Sol 射门被扑 f940")
    show("r3-g2.json.gz", 1695, "Sol 射门被扑 f1726")
    show("r3-g2.json.gz", 2381, "我方最后一次起脚")
    show("r3-g1.json.gz", 341, "我方 19.16 距离射门被挡 f342")
    show("r3-g1.json.gz", 1321, "我方 18.66 距离射门被挡 f1334")
    show("r3-g1.json.gz", 478, "Sol 射门被扑 f512")
    show("r3-g1.json.gz", 2648, "Sol 金球期射门被扑 f2677")


if __name__ == "__main__":
    main()
