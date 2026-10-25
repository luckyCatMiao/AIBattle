#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""复刻 decide_os 的候选评估并打印每个候选的估值（只读复盘）。"""
import gzip
import json
import os
import sys

RUN = r"D:\extraProj\AIBattle\soccer\arena\control\run-20261024-093225"
WS = os.path.join(RUN, "workspaces", "deepseek-flash")
sys.path.insert(0, WS)
import agent_core as ac  # noqa: E402
import pysim  # noqa: E402


def decide_os_logged(obs, base_out):
    me = int(obs.get("yourTeam", 0))
    my = sorted([u for u in obs["units"] if int(u["team"]) == me], key=lambda u: u["index"])
    s0 = pysim.state_from_obs(obs)
    base = base_out["inputs"]
    GL = 43.0 if me == 0 else 1.0
    sg = 1.0 if me == 0 else -1.0
    try:
        oo = dict(obs)
        oo["yourTeam"] = 1 - me
        oppF = ac.conv_frames(ac.decide_base(oo, upd=False)["inputs"])
    except Exception:
        oppF = ac.conv_frames(base)
    cands = [(base, "base")]
    oid = (obs.get("ball") or {}).get("owner")
    car = next((u for u in my if u["id"] == oid), None)
    if car is not None:
        ci = int(car["index"])
        bx = float(obs["ball"]["x"])
        by = float(obs["ball"]["y"])
        for ty in (10.7, 11.4, 12.1, 12.8, 13.4, 14.1, 14.8, 15.3):
            deg = ac.ang_deg(bx, by, GL, ty)
            c = ac._blank_like(base)
            c[0][ci] = {"dir": "N", "aim": deg, "kick": True}
            dist = ((GL - bx) ** 2 + (13.0 - by) ** 2) ** 0.5
            cands.append((c, f"shot ty={ty} d={dist:.1f}"))
        opps = [(float(o["x"]), float(o["y"]), 0.0, 0.0) for o in obs["units"] if int(o["team"]) != me]
        mates = [(int(u["index"]), (float(u["x"]), float(u["y"]))) for u in my if int(u["index"]) != ci]
        try:
            opts = ac.pass_options((bx, by), mates, opps, GL, sg, da_step=10, da_max=40)
        except Exception:
            opts = []
        for o in opts[:5]:
            c = ac._blank_like(base)
            c[0][ci] = {"dir": "N", "aim": o["pass_deg"], "kick": True}
            if o.get("shot") is not None:
                c[o["recv_frame"]][o["mate"]] = {"dir": "N", "aim": o["shot"][3], "kick": True}
            cands.append((c, f"{o['kind']} mate={o['mate']} recv={o['recv_frame']} sc={o['sc']:.2f}"))
    atk, dfn = ac.game_weights(obs, me)
    rows = []
    for c, tag in cands:
        C = ac.conv_frames(c)
        mg, og, s1 = ac._os_rollout(s0, C, oppF, me, ac.OSHY)
        v = 100.0 * (mg - og) + ac._os_shap(s1, me, atk, dfn)
        rows.append((v, tag, c))
    rows.sort(key=lambda z: -z[0])
    return rows


CASES = [
    ("r3-g1.json.gz", 0, [80, 340, 1320, 1960, 2380]),
    ("r3-g2.json.gz", 1, [560, 1340, 1780, 1900, 2360]),
]
for fn, me, ofs in CASES:
    with gzip.open(os.path.join(RUN, fn), "rt", encoding="utf-8") as fh:
        d = json.load(fh)
    ac._prev_pos.clear()
    ac._prev2_pos.clear()
    # 先把状态推进到目标窗口（decide_base 的 upd 状态依赖上一窗口）
    target = set(ofs)
    for w in sorted(d["windows"], key=lambda w: w["frame"]):
        o = w["frame"] - 20
        obs = dict(d["frames"][o])
        obs["yourTeam"] = me
        if o in target:
            base_out = ac.decide_base(obs, upd=True)
            rows = decide_os_logged(obs, base_out)
            rec = w["inputs"][me]
            pick = rows[0]
            print(f"\n=== {fn} obs frame {o} (window ends {w['frame']}) team{me} "
                  f"ball=({obs['ball']['x']},{obs['ball']['y']}) owner={obs['ball']['owner']} ===")
            print(f"  base kicks at f0: {base_out['inputs'][0]}".replace("\n", " ")[:400])
            for v, tag, c in rows[:6]:
                print(f"  v={v:8.2f}  {tag}")
            print(f"  picked={pick[1]}  matches_recorded={pick[2] == rec}")
        else:
            ac.decide_base(obs, upd=True)
