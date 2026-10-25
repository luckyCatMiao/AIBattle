#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""复盘第 2 轮两局回放：圈速、事件、漂移/喷火/越野、关键操作。"""
import gzip
import json
import math
import sys
from collections import Counter, defaultdict

RUN = r"D:/extraProj/AIBattle/racing/arena/control/run-20261023-101232"


def load(name):
    with gzip.open(f"{RUN}/{name}", "rt", encoding="utf-8") as f:
        return json.load(f)


def car(fr, i):
    return fr["cars"][i]


def unwrap(frames, i, L):
    """把 progress 按 [-L/2, L/2] 的帧间增量解回绕，避免过线跳变。"""
    out, acc = [0.0], 0.0
    prev = frames[0]["cars"][i]["progress"]
    for f in frames[1:]:
        p = f["cars"][i]["progress"]
        dp = p - prev
        while dp > L / 2:
            dp -= L
        while dp < -L / 2:
            dp += L
        acc += dp
        out.append(acc)
        prev = p
    return out


def main():
    for gname in ["r2-g1.json.gz", "r2-g2.json.gz"]:
        d = load(gname)
        print("=" * 72)
        print(gname, "seed", d["seed"], "seats", d["seats"], "names", d["names"])
        print("frames", len(d["frames"]), "winner", d["winner"], "reason", d["reason"],
              "duration", d["duration"])
        print("track len", d["track"]["length"], "halfWidth", d["track"]["halfWidth"],
              "audit", d["track"]["audit"])
        print("--- events ---")
        for e in d["events"]:
            if e["type"] in ("lap", "finish", "collision", "offroad", "penalty", "timeout"):
                print("  ", e)
        print("--- final cars ---")
        for i in [0, 1]:
            c = d["final"]["cars"][i]
            print(f"  seat[{i}]={d['seats'][i]} {c['name']}: lap={c['lap']} nextCp={c['nextCp']} "
                  f"progress={c['progress']} finish={c['finishTime']} best={c['bestLap']} "
                  f"boosts={c['boosts']} drift={c['driftTime']} coll={c['collisions']} "
                  f"x={c['x']} y={c['y']} speed={c['speed']}")

        frames = d["frames"]
        n = len(frames)
        print("--- per-frame derived (per seat) ---")
        for i in [0, 1]:
            # counters over racing frames (skip countdown)
            off = sum(1 for f in frames if car(f, i)["offRoad"])
            dr = sum(1 for f in frames if car(f, i)["drifting"])
            bo = sum(1 for f in frames if car(f, i)["boosting"])
            sp = [car(f, i)["speed"] for f in frames if f["phase"] == "live"]
            print(f"  seat[{i}] {d['seats'][i]}: offRoadFrames={off} driftFrames={dr} "
                  f"boostFrames={bo} avgSpeed={sum(sp)/max(1,len(sp)):.2f} "
                  f"maxSpeed={max(sp) if sp else 0:.2f}")

            # drift segments and boost segments from flags
            def segs(key):
                out = []
                st = None
                for k, f in enumerate(frames):
                    v = car(f, i)[key]
                    if v and st is None:
                        st = k
                    elif not v and st is not None:
                        out.append((st, k - 1))
                        st = None
                if st is not None:
                    out.append((st, len(frames) - 1))
                return out
            ds = segs("drifting")
            bs = segs("boosting")
            print(f"    drift segments={len(ds)} frames={[b-a+1 for a,b in ds][:40]}")
            print(f"    boost segments={len(bs)} frames={[b-a+1 for a,b in bs]}")
            # durations in seconds, live only
            print(f"    drift seconds={dr/20:.2f} boost seconds={bo/20:.2f}")

        # per-window input duty cycles
        print("--- input duty (racing windows) ---")
        for i in [0, 1]:
            dr = bo = thr = nf = 0
            steers = []
            for w in d["windows"]:
                for fr_in in w["inputs"][i]:
                    obj = fr_in[0] if isinstance(fr_in, list) else fr_in
                    nf += 1
                    thr += 1 if obj.get("throttle", 0) > 0.05 else 0
                    dr += 1 if obj.get("drift") else 0
                    bo += 1 if obj.get("boost") else 0
                    steers.append(abs(obj.get("steer", 0)))
            print(f"  seat[{i}] {d['seats'][i]}: frames={nf} throttle={thr/nf:.2%} "
                  f"drift={dr/nf:.2%} boost={bo/nf:.2%} mean|steer|={sum(steers)/len(steers):.3f}")

        # gaps over time（解回绕后的累计进度，避免过线跳变）
        print("--- unwrapped progress gap (seat0 - seat1) every 20 frames ---")
        U0 = unwrap(frames, 0, d["track"]["length"])
        U1 = unwrap(frames, 1, d["track"]["length"])
        for k in range(0, n, 20):
            f = frames[k]
            c0, c1 = f["cars"]
            print("  f%3d t%5.2f U %7.2f/%7.2f gap %+7.2f laps %d/%d spd %5.2f/%5.2f off %d/%d"
                  % (k, k / 20, U0[k], U1[k], U0[k] - U1[k], c0["lap"], c1["lap"],
                     c0["speed"], c1["speed"], c0["offRoad"], c1["offRoad"]))

        # offroad segments per car
        for i in [0, 1]:
            seg = []
            st = None
            for k, f in enumerate(frames):
                v = car(f, i)["offRoad"]
                if v and st is None:
                    st = k
                elif not v and st is not None:
                    seg.append((st, k - 1))
                    st = None
            if st is not None:
                seg.append((st, len(frames) - 1))
            print(f"  offroad segs seat[{i}]: {seg}")


if __name__ == "__main__":
    main()
