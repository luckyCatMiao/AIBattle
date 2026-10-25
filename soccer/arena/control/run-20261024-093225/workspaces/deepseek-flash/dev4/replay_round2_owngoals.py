#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""复现第 2 轮 6 个乌龙球的起脚方向。

做法：按模块导入第 2 轮提交产物（round-2/deepseek-flash/agent.py），
把回放观察帧的 yourTeam 设为我方，调用 decide()，读取持球单位的动作。
只读回放；不读取 Sol 的代码。
"""
import gzip
import importlib.util
import json
import os
import sys

RUN = r"D:\extraProj\AIBattle\soccer\arena\control\run-20261024-093225"
R2 = os.path.join(RUN, "round-2", "deepseek-flash")
CASES = [
    ("r2-g1", 240, "t0u2"),
    ("r2-g1", 720, "t0u2"),
    ("r2-g1", 2200, "t0u1"),
    ("r2-g2", 1020, "t1u4"),
    ("r2-g2", 1640, "t1u3"),
    ("r2-g2", 2200, "t1u1"),
]


def load_agent():
    sys.path.insert(0, R2)
    spec = importlib.util.spec_from_file_location("round2_agent", os.path.join(R2, "agent.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    agent = load_agent()
    for gid, fnum, owner in CASES:
        path = os.path.join(RUN, gid + ".json.gz")
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            d = json.load(fh)
        obs = dict(d["frames"][fnum])
        me = d["seats"].index("deepseek-flash")
        obs["yourTeam"] = me
        out = agent.decide(obs)
        units = obs["units"]
        my_units = sorted([u for u in units if u["team"] == me], key=lambda u: u["index"])
        idx = next(u["index"] for u in my_units if u["id"] == owner)
        action = out["inputs"][0][idx]
        # 找到下一帧实际起脚事件
        kicks = [e for e in d["final"]["events"]
                 if e["type"] == "kick" and e["frame"] == fnum + 1 and e["unit"] == owner]
        actual = None
        if kicks:
            actual = round((kicks[0]["angle"] * 180.0 / 3.141592653589793) % 360.0, 1)
        print("%s obs=%4d owner=%s -> dir=%s aim=%s kick=%s | actual angle=%s"
              % (gid, fnum, owner, action.get("dir"), action.get("aim"),
                 action.get("kick"), actual))


if __name__ == "__main__":
    main()
