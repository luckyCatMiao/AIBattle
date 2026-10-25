#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""六局正式对局的赛后统计重建（只读回放，20 Hz）。

输出：
- 每个进球：进球帧、进球方/射手/乌龙、最近一次起脚（帧、位置、角度、飞行帧数）、
  球过门线时的 y、门将位置与距离、起脚瞬间球-门通道内防守者
- 每队射门（几何口径：到对方门中心 <=20 格且直线射线落在门框内）
- 控球/领地指标
- 起脚距离分布
"""
import gzip
import json
import math
import os

RUN = r"D:\extraProj\AIBattle\soccer\arena\control\run-20261024-093225"
GAMES = ["r1-g1", "r1-g2", "r2-g1", "r2-g2", "r3-g1", "r3-g2"]
W, H = 44.0, 26.0
GOAL_TOP, GOAL_BOTTOM = 10.0, 16.0
KICKP = 11.0
CTRL = 0.82
ME = "deepseek-flash"


def load(gid):
    with gzip.open(os.path.join(RUN, gid + ".json.gz"), "rt", encoding="utf-8") as fh:
        return json.load(fh)


def own_goal_x(team):
    """team 0 防守 x=1；team 1 防守 x=43。"""
    return 1.0 if team == 0 else 43.0


def attack_goal_x(team):
    return 43.0 if team == 0 else 1.0


def ray_goal_y(kick, team):
    """直线射线与对方门线的交点 y；若方向背向球门返回 None。"""
    vx, vy = math.cos(kick["angle"]), math.sin(kick["angle"])
    tx = attack_goal_x(team)
    if abs(vx) < 1e-9:
        return None
    t = (tx - kick["x"]) / (vx * KICKP)
    if t <= 0:
        return None
    return kick["y"] + vy * KICKP * t


def perp_to_ray(px, py, kick, team, target_y=None):
    """点 (px,py) 到 起脚点->门线落点 直线的垂距与投影。"""
    gx, gy = attack_goal_x(team), (13.0 if target_y is None else target_y)
    dx, dy = gx - kick["x"], gy - kick["y"]
    L = math.hypot(dx, dy) or 1.0
    ux, uy = dx / L, dy / L
    rx, ry = px - kick["x"], py - kick["y"]
    proj = rx * ux + ry * uy
    perp = abs(rx * uy - ry * ux)
    return perp, proj, L


def dist_to_goal(kick, team):
    return math.hypot(kick["x"] - attack_goal_x(team), kick["y"] - 13.0)


def owner_team(uid):
    return int(uid[1]) if uid else None


def team_name(d, t):
    return d["seats"][t]


def analyze(gid):
    d = load(gid)
    frames = d["frames"]
    fin = d["final"]
    events = fin["events"]
    n = d["teamSize"]
    me_team = d["seats"].index(ME)
    kicks = [e for e in events if e["type"] == "kick"]
    goals = [e for e in events if e["type"] == "goal"]
    saves = [e for e in events if e["type"] == "save"]

    # 按单位索引取球员位置
    def positions(fr):
        return {u["id"]: (float(u["x"]), float(u["y"])) for u in fr["units"]}

    goal_rows = []
    for g in goals:
        gf = g["frame"]
        # 进球前一帧球的位置（用于估算过线 y）
        prev_ball = frames[max(0, gf - 1)]["ball"]
        prev2_ball = frames[max(0, gf - 2)]["ball"]
        vx, vy = float(prev_ball.get("vx") or 0), float(prev_ball.get("vy") or 0)
        gx_line = own_goal_x(g["team"]) if g.get("ownGoal") else attack_goal_x(g["team"])
        # 进球前一帧球心已在门线内侧，直接取该帧 y 作为过线点
        cross_y = float(prev_ball["y"])
        # 起脚：最近 90 帧内、lastTouch 对应的踢球
        lt = prev_ball.get("lastTouch")
        cand = [k for k in kicks if gf - 90 <= k["frame"] <= gf and
                (lt is None or k["unit"] == lt)]
        if not cand:
            cand = [k for k in kicks if gf - 90 <= k["frame"] <= gf]
        k = cand[-1] if cand else None
        row = {
            "frame": gf, "t": round(gf / 20.0, 2), "team": g["team"],
            "model": team_name(d, g["team"]), "scorer": g.get("scorer"),
            "ownGoal": bool(g.get("ownGoal")), "score": g.get("score"),
            "cross_y": round(cross_y, 2),
            "lastTouch": lt,
        }
        if k:
            conceding = 1 - g["team"] if not g.get("ownGoal") else g["team"]
            row.update({
                "kick_frame": k["frame"], "kick_t": round(k["frame"] / 20.0, 2),
                "kick_unit": k["unit"], "kick_team": k["team"],
                "kick_model": team_name(d, k["team"]),
                "kick_x": k["x"], "kick_y": k["y"],
                "angle_deg": round(math.degrees(k["angle"]) % 360, 1),
                "flight": gf - k["frame"],
                "dist_att_goal": round(dist_to_goal(k, k["team"]), 2),
                "dist_own_goal": round(math.hypot(k["x"] - own_goal_x(k["team"]),
                                                  k["y"] - 13.0), 2),
                "ray_y_att": None if ray_goal_y(k, k["team"]) is None else round(ray_goal_y(k, k["team"]), 2),
                "ray_y_own": None,
            })
            oy = ray_goal_y({"x": k["x"], "y": k["y"], "angle": k["angle"]}, 1 - k["team"])
            row["ray_y_own"] = None if oy is None else round(oy, 2)
            # 门将（失球方 index 0）在起脚帧与进球前一帧的位置
            kf = frames[k["frame"]]
            kpos = positions(kf)
            gk = "t%du0" % conceding
            if gk in kpos:
                kx, ky = kpos[gk]
                row["keeper_kick"] = [round(kx, 2), round(ky, 2)]
                row["keeper_kick_dist_cross"] = round(abs(ky - cross_y), 2)
            gprev = positions(frames[max(0, gf - 1)])
            if gk in gprev:
                px, py = gprev[gk]
                row["keeper_goal"] = [round(px, 2), round(py, 2)]
                row["keeper_goal_dist_ball"] = round(
                    math.hypot(px - float(prev_ball["x"]), py - float(prev_ball["y"])), 2)
            # 通道内防守者（起脚瞬间，到 起脚点->门中心 的垂距 <=0.82 且投影在球门前）
            lane = []
            for uid, (px, py) in kpos.items():
                if owner_team(uid) == k["team"]:
                    continue
                perp, proj, L = perp_to_ray(px, py, k, k["team"],
                                             None if g.get("ownGoal") else cross_y)
                if perp <= CTRL and 0 < proj < L:
                    lane.append((uid, round(perp, 2), round(proj, 2)))
            row["lane"] = sorted(lane, key=lambda z: z[1])
        goal_rows.append(row)

    # 每队射门：<=20 格且直线射线在门框内
    shot_rows = []
    for k in kicks:
        y = ray_goal_y(k, k["team"])
        dist = dist_to_goal(k, k["team"])
        if y is not None and GOAL_TOP <= y <= GOAL_BOTTOM and dist <= 20.0:
            shot_rows.append({
                "frame": k["frame"], "t": round(k["frame"] / 20.0, 2),
                "team": k["team"], "model": team_name(d, k["team"]), "unit": k["unit"],
                "x": k["x"], "y": k["y"], "dist": round(dist, 2),
                "ray_y": round(y, 2),
            })

    # 扑救：用扑救前一帧球 lastTouch 归属射手
    save_rows = []
    for s in saves:
        sf = s["frame"]
        pb = frames[max(0, sf - 1)]["ball"]
        lt = pb.get("lastTouch")
        cand = [k for k in kicks if sf - 60 <= k["frame"] <= sf and
                (lt is None or k["unit"] == lt)]
        if not cand:
            cand = [k for k in kicks if sf - 60 <= k["frame"] <= sf]
        k = cand[-1] if cand else None
        save_rows.append({
            "frame": sf, "t": round(sf / 20.0, 2), "keeper_team": s["team"],
            "keeper_model": team_name(d, s["team"]), "keeper": s["unit"],
            "shooter_team": None if k is None else k["team"],
            "shooter_model": None if k is None else team_name(d, k["team"]),
            "shooter": None if k is None else k["unit"],
            "shot_frame": None if k is None else k["frame"],
            "flight": None if k is None else sf - k["frame"],
            "dist": None if k is None else round(dist_to_goal(k, k["team"]), 2),
            "from": None if k is None else [round(k["x"], 2), round(k["y"], 2)],
            "ray_y": None if k is None else (None if ray_goal_y(k, k["team"]) is None
                                             else round(ray_goal_y(k, k["team"]), 2)),
        })

    # 控球与领地
    poss_frames = [0, 0]
    poss_segments = []  # dict(team,start,end,start_x,max_prog)
    cur = None
    for fr in frames:
        b = fr["ball"]
        t = owner_team(b.get("owner"))
        if t is not None:
            poss_frames[t] += 1
        if cur is not None and (t != cur["team"] or fr["frame"] != cur["end"] + 1):
            poss_segments.append(cur)
            cur = None
        if t is not None:
            if cur is None:
                cur = {"team": t, "start": fr["frame"], "end": fr["frame"],
                       "start_x": float(b["x"]), "xs": [float(b["x"])]}
            else:
                cur["end"] = fr["frame"]
                cur["xs"].append(float(b["x"]))
    if cur is not None:
        poss_segments.append(cur)

    third = W / 3.0  # 14.667
    terr = {"third_segments": [0, 0], "max_prog": [0.0, 0.0],
            "def_third_frames": [0, 0], "att_third_frames": [0, 0]}
    for seg in poss_segments:
        t = seg["team"]
        own_x = own_goal_x(t)
        prog = max(abs(x - own_x) for x in seg["xs"])
        terr["max_prog"][t] = max(terr["max_prog"][t], prog)
        att = attack_goal_x(t)
        if t == 0:
            if any(x >= W - third for x in seg["xs"]):
                terr["third_segments"][t] += 1
        else:
            if any(x <= third for x in seg["xs"]):
                terr["third_segments"][t] += 1
        seg["max_prog"] = prog
    for fr in frames:
        b = fr["ball"]
        x = float(b["x"])
        if x < third:
            terr["def_third_frames"][0] += 1
            terr["att_third_frames"][1] += 1
        if x > W - third:
            terr["def_third_frames"][1] += 1
            terr["att_third_frames"][0] += 1

    # 起脚距离分桶
    buckets = [(0, 15), (15, 20), (20, 25), (25, 30), (30, 999)]
    dist_hist = {}
    for t in (0, 1):
        ks = [k for k in kicks if k["team"] == t]
        dist_hist[t] = {
            "n": len(ks),
            "med": round(sorted(dist_to_goal(k, t) for k in ks)[len(ks) // 2], 2) if ks else None,
            "buckets": [sum(1 for k in ks if lo <= dist_to_goal(k, t) < hi) for lo, hi in buckets],
            "own_half": sum(1 for k in ks if (k["x"] < W / 2 if t == 0 else k["x"] > W / 2)),
        }

    seg_start_med = {}
    for t in (0, 1):
        ds = sorted(math.hypot(s["start_x"] - own_goal_x(t), 13.0 - 13.0) for s in poss_segments if s["team"] == t)
        seg_start_med[t] = round(ds[len(ds) // 2], 2) if ds else None

    return {
        "id": gid, "seed": d["seed"], "teamSize": n, "seats": d["seats"],
        "me_team": me_team, "frames": len(frames), "seconds": round(len(frames) / 20.0, 2),
        "duration": d["duration"], "reason": fin.get("reason"), "score": fin.get("score"),
        "stats": fin["stats"], "poss_frames": poss_frames,
        "poss_segments": len(poss_segments),
        "seg_start_x": seg_start_med,
        "territory": terr, "dist_hist": dist_hist,
        "goals": goal_rows, "shots": shot_rows, "saves": save_rows,
        "kicks": [{"frame": k["frame"], "team": k["team"], "unit": k["unit"],
                   "x": round(k["x"], 2), "y": round(k["y"], 2),
                   "angle": round(math.degrees(k["angle"]) % 360, 1),
                   "dist": round(dist_to_goal(k, k["team"]), 2)} for k in kicks],
    }


def main():
    out = []
    for gid in GAMES:
        r = analyze(gid)
        out.append(r)
        me = r["me_team"]
        print("=" * 90)
        print("%s seed=%s %dv%d seats=%s score=%s reason=%s" % (
            gid, r["seed"], r["teamSize"], r["teamSize"], r["seats"], r["score"], r["reason"]))
        print("  frames=%d (%.2fs) poss_frames=%s segs=%d seg_start_x_med=%s" % (
            r["frames"], r["seconds"], r["poss_frames"], r["poss_segments"], r["seg_start_x"]))
        print("  territory: third_segments=%s max_prog=%s def3rd=%s att3rd=%s" % (
            r["territory"]["third_segments"],
            [round(x, 1) for x in r["territory"]["max_prog"]],
            r["territory"]["def_third_frames"], r["territory"]["att_third_frames"]))
        print("  dist_hist:", r["dist_hist"])
        print("  GOALS:")
        for g in r["goals"]:
            print("   ", json.dumps(g, ensure_ascii=False))
        print("  SHOTS (<=20 & on target line):")
        for s in r["shots"]:
            print("   ", json.dumps(s, ensure_ascii=False))
        print("  SAVES:")
        for s in r["saves"]:
            print("   ", json.dumps(s, ensure_ascii=False))
        print("  kicks me=%d opp=%d" % (
            sum(1 for k in r["kicks"] if k["team"] == me),
            sum(1 for k in r["kicks"] if k["team"] != me)))
        print("  our shots=%d opp shots=%d" % (
            sum(1 for s in r["shots"] if s["team"] == me),
            sum(1 for s in r["shots"] if s["team"] != me)))
    with open(os.path.join(os.path.dirname(__file__), "postmatch_analysis.json"),
              "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print("\nsaved dev4/postmatch_analysis.json")


if __name__ == "__main__":
    main()
