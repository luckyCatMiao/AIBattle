#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统计 260 个决策窗口里搜索最终选了哪类候选。"""
import gzip
import json
import os
import sys

RUN = r"D:\extraProj\AIBattle\soccer\arena\control\run-20261024-093225"
WS = os.path.join(RUN, "workspaces", "deepseek-flash")
sys.path.insert(0, WS)
import agent_core as ac  # noqa: E402
import pysim  # noqa: E402

TY = (10.7, 11.4, 12.1, 12.8, 13.4, 14.1, 14.8, 15.3)


def choose_logged(obs, base_out):
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
        for ty in TY:
            deg = ac.ang_deg(bx, by, GL, ty)
            c = ac._blank_like(base)
            c[0][ci] = {"dir": "N", "aim": deg, "kick": True}
            cands.append((c, f"shot ty={ty}"))
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
            cands.append((c, o["kind"]))
    atk, dfn = ac.game_weights(obs, me)
    best = None
    for c, tag in cands:
        C = ac.conv_frames(c)
        mg, og, s1 = ac._os_rollout(s0, C, oppF, me, ac.OSHY)
        v = 100.0 * (mg - og) + ac._os_shap(s1, me, atk, dfn)
        if best is None or v > best[0]:
            best = (v, tag, c, obs)
    return best


for fn, me in (("r3-g1.json.gz", 0), ("r3-g2.json.gz", 1)):
    with gzip.open(os.path.join(RUN, fn), "rt", encoding="utf-8") as fh:
        d = json.load(fh)
    ac._prev_pos.clear()
    ac._prev2_pos.clear()
    counts = {}
    kick_rows = []
    GL = 43.0 if me == 0 else 1.0
    for w in sorted(d["windows"], key=lambda w: w["frame"]):
        o = w["frame"] - 20
        obs = dict(d["frames"][o])
        obs["yourTeam"] = me
        base_out = ac.decide_base(obs, upd=True)
        v, tag, c, _ = choose_logged(obs, base_out)
        cat = tag.split(" ")[0]
        counts[cat] = counts.get(cat, 0) + 1
        # 该候选在窗口内是否有起脚
        for f in range(20):
            for ui, inp in enumerate(c[f]):
                if inp["kick"]:
                    bx = float(obs["units"][ui]["x"])
                    by = float(obs["units"][ui]["y"])
                    # 用 aim 角度（度）算门线交点
                    aim = inp["aim"]
                    if aim is not None:
                        rad = aim if isinstance(aim, (int, float)) else None
                        # agent 的 aim 是度
                        if rad is not None:
                            import math
                            a = math.radians(rad)
                            dx = GL - bx
                            yg = by + math.tan(a) * dx if abs(math.cos(a)) > 1e-6 else None
                            dist = math.hypot(GL - bx, 13.0 - by)
                            hit = None if yg is None else min(TY, key=lambda t: abs(t - yg))
                            is_shot = hit is not None and abs(hit - yg) < 0.06
                            kick_rows.append((o, tag, ui, round(dist, 1), is_shot, round(yg, 2) if yg else None))
                    break
            else:
                continue
            break
    print("=" * 70)
    print(fn, "windows", sum(counts.values()), "pick categories", counts)
    shots = [r for r in kick_rows if r[4]]
    print("  kicks from picked candidates:", len(kick_rows), " shot-grid kicks:", len(shots))
    for label, cond in [("<=15", lambda x: x <= 15), ("15-20", lambda x: 15 < x <= 20),
                        ("20-25", lambda x: 20 < x <= 25), (">25", lambda x: x > 25)]:
        sub = [r for r in shots if cond(r[3])]
        print(f"    shot-grid {label}: {len(sub)}", [(r[0], r[1], r[3]) for r in sub])
