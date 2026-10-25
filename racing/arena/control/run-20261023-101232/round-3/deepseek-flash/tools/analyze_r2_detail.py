#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""第 2 轮复盘细节：解开 progress 回绕、喷火/漂移区间、关键帧。"""
import gzip
import json

RUN = r"D:/extraProj/AIBattle/racing/arena/control/run-20261023-101232"


def load(name):
    with gzip.open(f"{RUN}/{name}", "rt", encoding="utf-8") as f:
        return json.load(f)


def unwrap(d, i):
    L = d["track"]["length"]
    frames = d["frames"]
    out = []
    acc = 0.0
    prev = frames[0]["cars"][i]["progress"]
    out.append(acc)
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


def segs(frames, i, key, minlen=1):
    out, st = [], None
    for k, f in enumerate(frames):
        v = f["cars"][i][key]
        if v and st is None:
            st = k
        elif not v and st is not None:
            if k - st >= minlen:
                out.append((st, k - 1))
            st = None
    if st is not None:
        out.append((st, len(frames) - 1))
    return out


def main():
    for gname in ["r2-g1.json.gz", "r2-g2.json.gz"]:
        d = load(gname)
        F = d["frames"]
        L = d["track"]["length"]
        print("=" * 78)
        print(gname, "seed", d["seed"], "seats", d["seats"], "track L", L,
              "halfW", d["track"]["halfWidth"])
        U = [unwrap(d, 0), unwrap(d, 1)]
        for i in [0, 1]:
            name = d["seats"][i]
            print(f"-- seat[{i}] {name} --")
            print("  total unwrapped distance %.2f cells (%.2f laps)" % (U[i][-1], U[i][-1] / L))
            # split by lap event
            evs = [e for e in d["events"] if e["type"] == "lap" and e["team"] == i]
            prevf, prevu = 29, U[i][29]  # go at frame 30
            for e in evs:
                k = e["frame"]
                dist = U[i][k] - prevu
                print("   lap %d at t=%.2f raceTime=%.2f  split=%.3fs  dist=%.2f  avg=%.2f"
                      % (e["lap"], e["t"], e["t"] - 1.5, e["time"], dist, dist / e["time"]))
                prevf, prevu = k, U[i][k]
            if d["final"]["cars"][i]["finishTime"]:
                print("   finish raceTime=%.2f" % (d["final"]["cars"][i]["finishTime"] - 1.5))
            # boost segments
            print("  boost segments:")
            for a, b in segs(F, i, "boosting"):
                c0, c1 = F[a]["cars"][i], F[b]["cars"][i]
                mid = F[(a + b) // 2]["cars"][i]
                print("    f%3d-%3d  t=%5.2f-%5.2f (%4.2fs) energy %4.2f->%4.2f speed %5.1f->%5.1f maxmid %5.1f"
                      % (a, b, a / 20, b / 20, (b - a + 1) / 20,
                         c0["boostEnergy"], c1["boostEnergy"], c0["speed"], c1["speed"], mid["speed"]))
            # drift segments longer than 3 frames
            print("  drift segments >=4 frames:")
            for a, b in segs(F, i, "drifting"):
                if b - a + 1 < 4:
                    continue
                c0, c1 = F[a]["cars"][i], F[b]["cars"][i]
                print("    f%3d-%3d  t=%5.2f-%5.2f (%4.2fs) charge %4.2f->%4.2f speed %5.1f->%5.1f"
                      % (a, b, a / 20, b / 20, (b - a + 1) / 20,
                         c0["driftCharge"], c1["driftCharge"], c0["speed"], c1["speed"]))
            # overlap drift+boost
            ov = [k for k, f in enumerate(F) if f["cars"][i]["drifting"] and f["cars"][i]["boosting"]]
            print("  drift+boost overlap frames=%d (%.2fs)" % (len(ov), len(ov) / 20))
            ovs = []
            st = None
            for k, f in enumerate(F):
                v = f["cars"][i]["drifting"] and f["cars"][i]["boosting"]
                if v and st is None:
                    st = k
                elif not v and st is not None:
                    ovs.append((st, k - 1))
                    st = None
            if st is not None:
                ovs.append((st, len(F) - 1))
            print("  overlap segs:", [(a, b) for a, b in ovs if b - a >= 1])
            # top speed frames
            top = sorted(range(len(F)), key=lambda k: -F[k]["cars"][i]["speed"])[:8]
            print("  top speed frames:")
            for k in top:
                c = F[k]["cars"][i]
                print("    f%3d t=%5.2f speed=%5.2f vx=%6.1f vy=%6.1f drift=%d boost=%d off=%d steer? "
                      % (k, k / 20, c["speed"], c["vx"], c["vy"], c["drifting"], c["boosting"], c["offRoad"]))
            # offroad
            for a, b in segs(F, i, "offRoad"):
                c = F[(a + b) // 2]["cars"][i]
                print("  OFFROAD f%d-%d t=%.2f-%.2f (%.2fs) at (%.1f,%.1f) speed %.1f"
                      % (a, b, a / 20, b / 20, (b - a + 1) / 20, c["x"], c["y"], c["speed"]))

        # gap timeline unwrapped
        print("-- unwrapped gap (seat0 - seat1) --")
        for k in range(0, len(F), 20):
            print("  f%3d t=%5.2f U0=%7.2f U1=%7.2f gap=%+7.2f speed=%5.1f/%5.1f"
                  % (k, k / 20, U[0][k], U[1][k], U[0][k] - U[1][k],
                     F[k]["cars"][0]["speed"], F[k]["cars"][1]["speed"]))


if __name__ == "__main__":
    main()
