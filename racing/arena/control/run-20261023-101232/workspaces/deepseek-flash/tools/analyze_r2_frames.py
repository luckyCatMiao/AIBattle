#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打印第 2 轮回放关键帧：碰撞、越野、喷火/漂移切换。"""
import gzip
import json

RUN = r"D:/extraProj/AIBattle/racing/arena/control/run-20261023-101232"

FRAME_INPUT = {}


def build_inputs(d):
    m = {}
    for w in d["windows"]:
        start = w["frame"] - 19  # window 记录的是本批输入的最后一帧
        for i, arr in enumerate(w["inputs"]):
            for j, o in enumerate(arr):
                obj = o[0] if isinstance(o, list) else o
                m[(start + j, i)] = obj
    return m


def show(d, frames, title):
    print("---", title)
    for k in frames:
        f = d["frames"][k]
        parts = []
        for i in [0, 1]:
            c = f["cars"][i]
            inp = FRAME_INPUT.get((k, i), {})
            parts.append(
                "%s x=%5.1f y=%5.1f spd=%5.1f lap=%d cp=%d pro=%6.1f off=%d dr=%d bo=%d E=%4.2f C=%4.2f | in(t=%+.1f s=%+.2f d=%d b=%d)"
                % (d["seats"][i][:9], c["x"], c["y"], c["speed"], c["lap"], c["nextCp"],
                   c["progress"], c["offRoad"], c["drifting"], c["boosting"],
                   c["boostEnergy"], c["driftCharge"],
                   inp.get("throttle", 0), inp.get("steer", 0),
                   bool(inp.get("drift")), bool(inp.get("boost"))))
        print("f%3d t=%5.2f " % (k, k / 20) + " || ".join(parts))


def main():
    for gname in ["r2-g1.json.gz", "r2-g2.json.gz"]:
        d = json.load(gzip.open(f"{RUN}/{gname}", "rt", encoding="utf-8"))
        global FRAME_INPUT
        FRAME_INPUT = build_inputs(d)
        print("=" * 80)
        print(gname, "seed", d["seed"], "seats", d["seats"])
        if gname == "r2-g1.json.gz":
            show(d, list(range(54, 76)), "碰撞前后（t=2.70-3.75）")
            show(d, list(range(88, 112, 2)), "Sol 冲入草地（t=4.40-5.55）")
            show(d, list(range(112, 146, 4)), "Sol 草地中挣扎（t=5.60-7.25）")
            show(d, list(range(146, 170, 4)), "Sol 回到路面（t=7.30-8.45）")
            show(d, list(range(185, 225, 4)), "Sol 首次长喷火/追回（t=9.25-11.20）")
            show(d, list(range(300, 330, 3)), "DS 第二次长喷火（t=15.00-16.45）")
            show(d, list(range(370, 408, 4)), "终局（t=18.50-20.35）")
        else:
            show(d, list(range(40, 80, 4)), "开局（t=2.00-3.95）")
            show(d, list(range(140, 170, 3)), "Sol 进入持续喷火（t=7.00-8.45）")
            show(d, list(range(210, 245, 3)), "中盘差距扩大（t=10.50-12.20）")
            show(d, list(range(255, 288, 3)), "终局（t=12.75-14.35）")


if __name__ == "__main__":
    main()
