#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import collections

d = json.load(open(r"D:\extraProj\AIBattle\soccer\arena\control\run-20261024-093225\workspaces\deepseek-flash\dev4\r3_trace.json",
                   encoding="utf-8"))
for g in d:
    print("=" * 70)
    print(g["id"])
    for model in ("deepseek-flash", "sol"):
        rows = [r for r in g["rows"] if r["model"] == model]
        # 判断己方半场：deepseek 在 g1 是 team0，g2 是 team1
        team = 0 if model == "deepseek-flash" and g["id"] == "r3-g1" else (
            1 if model == "deepseek-flash" else (1 if g["id"] == "r3-g1" else 0))
        ownhalf = sum(1 for r in rows if (r["x"] < 22 if team == 0 else r["x"] > 22))
        oc = collections.Counter(r["outcome"]["type"] for r in rows)
        print(f"  {model} (team{team}): kicks={len(rows)} own-half-kicks={ownhalf}")
        print("    outcomes:", dict(oc))
        buckets = collections.Counter()
        for r in rows:
            dd = r["dist_goal"]
            if dd <= 15:
                buckets["<=15"] += 1
            elif dd <= 20:
                buckets["15-20"] += 1
            elif dd <= 25:
                buckets["20-25"] += 1
            elif dd <= 30:
                buckets["25-30"] += 1
            else:
                buckets[">30"] += 1
        print("    distance buckets:", dict(buckets))
        for label, cond in [
            ("aimed<=20", lambda r: r["aimed_goal"] and r["dist_goal"] <= 20),
            ("aimed>20", lambda r: r["aimed_goal"] and r["dist_goal"] > 20),
            ("not-aimed", lambda r: not r["aimed_goal"]),
        ]:
            sub = [r for r in rows if cond(r)]
            print(f"    {label}: n={len(sub)} outcomes={dict(collections.Counter(r['outcome']['type'] for r in sub))}")
        # 按结果统计到下一次触球耗时
        lost = [r for r in rows if r["outcome"]["type"] == "lost"]
        if lost:
            dts = [(r["outcome"]["frame"] - r["frame"]) / 20.0 for r in lost]
            print(f"    lost: n={len(lost)}  median_time_to_loss={sorted(dts)[len(dts)//2]:.2f}s")
