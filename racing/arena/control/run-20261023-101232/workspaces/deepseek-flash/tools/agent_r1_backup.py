#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""俯视角赛车竞速 agent.

stdin 每行一个观察，stdout 每行一个 20 帧输入窗口。
内部用与 simulation.js 完全一致的物理模型做 20 帧闭环 roll-out（只忽略对手车碰撞），
控制律 = 中心线弧长投影 + 纯追踪转向 + 曲率限速剖面 + 漂移蓄能/喷火。
"""
import sys
import json
import math
import os

TAU = 2.0 * math.pi
DT = 1.0 / 20.0

# ---- 物理参数：默认值与 catalog.rules 一致；每局开场从观察里的 rules 覆盖 ----
R = {
    "accel": 17.0,
    "brake": 26.0,
    "reverseAccel": 8.0,
    "maxSpeed": 14.0,
    "boostMaxSpeed": 23.0,
    "boostAccel": 30.0,
    "drag": 0.6,
    "gripNormal": 0.80,
    "gripDrift": 0.985,
    "turnRate": 3.2,
    "driftTurnBoost": 1.6,
    "driftMinSpeed": 4.0,
    "driftChargeRate": 0.55,
    "boostDrain": 0.6,
    "wallRestitution": 0.45,
    "offRoadMax": 7.0,
    "offRoadAccel": 0.35,
    "offRoadDrag": 0.94,
    "carRadius": 0.55,
}
ROAD, GRASS, WALL = 0, 1, 2

DEFAULT_PARAMS = {
    # --- 循迹 ---
    "lookahead_base": 2.6,     # 前视距离 = base + gain*speed，上限 max
    "lookahead_gain": 0.9,
    "lookahead_max": 12.0,     # 12 是安全上限：更长会在弯心切过检查点半径
    "steer_gain": 5.2,         # 纯追踪转向增益
    "ll_corner_base": 99.0,    # （可选）弯道内前视：Ld <= base + k*r
    "ll_corner_k": 0.5,
    # --- 速度剖面 ---
    "speed_margin": 2.0,       # v_lim = 3.2*r*margin，2.0 已在物理极限之上
    "brake_ahead": 24.0,       # 反向传播的刹车减速度（保守）
    "offroad_speed": 5.5,      # 越野时的目标速度
    "offroad_ld": 3.0,         # 越野时的前视
    # --- 漂移 / 喷火（默认关闭：实测漂移掉的速比蓄能够的收益更贵）---
    "drift_on": 0.0,
    "drift_vmax": 11.0,
    "weave_amp": 0.0,
    "weave_T": 0.15,
    "farm_e_min": 13.0,
    "farm_charge_max": 0.95,
    "farm_k_lat": 0.12,
    "farm_k_vel": 0.8,
    "farm_k_i": 0.05,
    "farm_bias_max": 0.35,
    "boost_energy_min": 0.05,
    "boost_vmin": 16.0,
    # --- 对手避让（预测最近距离）---
    "avoid_ttc": 1.4,          # 预测未来 1.4s 内的最近点
    "avoid_miss": 1.55,        # 最近距离小于该值就修正线路
    "avoid_brake_t": 0.45,     # 最近点时间小于该值且会擦碰时轻微减速
    "avoid_lat": 0.0,          # 让线横向量；实测 0（只减速不让线）最稳，避免被挤到路外漏检查点
    "avoid_cp_block": 8.0,     # 距下一个检查点弧长小于该值时不横向让线
    # --- 检查点保护 ---
    "cp_guard": 0.0,           # 1=启用（实测会引入不稳定，默认关闭）
    "cp_guard_r": 9.0,
    "cp_guard_frac": 0.7,
    "cp_guard_shrink": 0.9,
    "debug": 0,
}

P = dict(DEFAULT_PARAMS)
_pf = os.environ.get("AGENT_PARAMS")
if _pf:
    try:
        with open(_pf, "r") as fh:
            P.update(json.load(fh))
    except Exception:
        pass

DEBUG = int(P.get("debug", 0))


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


def angle_diff(a, b):
    d = (a - b + math.pi) % TAU
    return d - math.pi


class Track(object):
    def __init__(self, tr):
        self.W = tr["width"]
        self.H = tr["height"]
        self.tiles = tr["tiles"]
        self.half = tr["halfWidth"]
        self.checkpoints = tr["checkpoints"]
        pts = tr["points"]
        self.P = [(p["x"], p["y"]) for p in pts]
        n = len(self.P)
        self.n = n
        cum = [0.0]
        for i in range(n):
            ax, ay = self.P[i]
            bx, by = self.P[(i + 1) % n]
            cum.append(cum[-1] + math.hypot(bx - ax, by - ay))
        self.cum = cum
        self.L = cum[-1]
        seg = []
        seglen = []
        for i in range(n):
            ax, ay = self.P[i]
            bx, by = self.P[(i + 1) % n]
            seg.append(math.atan2(by - ay, bx - ax))
            seglen.append(cum[i + 1] - cum[i])
        self.seg = seg
        self.seglen = seglen
        self._build_profile()

    def _build_profile(self):
        n = self.n
        seg = self.seg
        kappa = [0.0] * n
        for i in range(n):
            j = (i - 1) % n
            da = angle_diff(seg[i], seg[j])
            ds = 0.5 * (self.seglen[i] + self.seglen[j])
            kappa[i] = da / max(ds, 1e-6)
        # 先做小窗口平滑，去掉折线离散噪声
        sm = [0.0] * n
        for i in range(n):
            sm[i] = (kappa[(i - 1) % n] + 2.0 * kappa[i] + kappa[(i + 1) % n]) / 4.0
        w = 2
        ks = [0.0] * n
        for i in range(n):
            m = 0.0
            for d in range(-w, w + 1):
                v = abs(sm[(i + d) % n])
                if v > m:
                    m = v
            ks[i] = m
        vlim = []
        vlim_hi = []
        for i in range(n):
            r = 1.0 / max(ks[i], 1e-6)
            v = R["turnRate"] * r * P["speed_margin"]
            vlim.append(clamp(v, 4.5, R["maxSpeed"]))
            vlim_hi.append(clamp(v, 4.5, R["boostMaxSpeed"]))
        a = P["brake_ahead"]
        for _ in range(3):
            for i in range(n - 1, -1, -1):
                j = (i + 1) % n
                ds = self.seglen[i]
                lim = math.sqrt(vlim[j] * vlim[j] + 2.0 * a * ds)
                if lim < vlim[i]:
                    vlim[i] = lim
                lim2 = math.sqrt(vlim_hi[j] * vlim_hi[j] + 2.0 * a * ds)
                if lim2 < vlim_hi[i]:
                    vlim_hi[i] = lim2
        self.vlim = vlim
        self.vlim_hi = vlim_hi
        self.kappa = kappa
        self.kappa_s = ks

    def _seg_of(self, s):
        n = self.n
        s = s % self.L
        lo, hi = 0, n
        while lo + 1 < hi:
            mid = (lo + hi) // 2
            if self.cum[mid] <= s:
                lo = mid
            else:
                hi = mid
        return lo

    def pos_at(self, s):
        lo = self._seg_of(s)
        s = s % self.L
        a = self.P[lo]
        b = self.P[(lo + 1) % self.n]
        seglen = self.cum[lo + 1] - self.cum[lo]
        t = (s - self.cum[lo]) / seglen if seglen > 1e-9 else 0.0
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

    def pos_tan(self, s):
        lo = self._seg_of(s)
        x, y = self.pos_at(s)
        return (x, y, self.seg[lo])

    def vlim_at(self, s, hi=False):
        lo = self._seg_of(s)
        s = s % self.L
        seglen = self.cum[lo + 1] - self.cum[lo]
        t = (s - self.cum[lo]) / seglen if seglen > 1e-9 else 0.0
        tab = self.vlim_hi if hi else self.vlim
        a = tab[lo]
        b = tab[(lo + 1) % self.n]
        return a + (b - a) * t

    def project(self, x, y, hint=None):
        """返回 (s, lateral, idx, tan_angle)。lateral>0 表示在赛道行进方向右侧。"""
        n, P, cum = self.n, self.P, self.cum
        if hint is not None:
            rng = range(hint - 30, hint + 31)
        else:
            rng = range(n)
        bi, bd = 0, 1e18
        for i in rng:
            ii = i % n
            dx = P[ii][0] - x
            dy = P[ii][1] - y
            d = dx * dx + dy * dy
            if d < bd:
                bd, bi = d, ii
        best = None
        for seg_i in ((bi - 1) % n, bi):
            a = P[seg_i]
            b = P[(seg_i + 1) % n]
            vx, vy = b[0] - a[0], b[1] - a[1]
            l2 = vx * vx + vy * vy
            if l2 < 1e-12:
                continue
            t = clamp(((x - a[0]) * vx + (y - a[1]) * vy) / l2, 0.0, 1.0)
            px, py = a[0] + vx * t, a[1] + vy * t
            d = math.hypot(x - px, y - py)
            if best is None or d < best[0]:
                s = cum[seg_i] + self.seglen[seg_i] * t
                cross = vx * (y - a[1]) - vy * (x - a[0])
                lat = (1.0 if cross > 0 else -1.0) * d
                best = (d, s, lat, seg_i)
        if best is None:
            return (0.0, 0.0, 0, 0.0)
        return (best[1], best[2], best[3], self.seg[best[3]])

    def tile(self, x, y):
        tx = int(math.floor(x))
        ty = int(math.floor(y))
        if tx < 0 or ty < 0 or tx >= self.W or ty >= self.H:
            return WALL
        return self.tiles[ty * self.W + tx]

    def on_road(self, x, y, margin=0.0):
        return self.tile(x, y) == ROAD

    def road_margin(self, x, y):
        """到路边缘的近似余量（用 8 方向采样）。"""
        best = 9.9
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (0.7, 0.7), (-0.7, 0.7), (0.7, -0.7), (-0.7, -0.7)):
            d = 0.25
            while d < best:
                if self.tile(x + dx * d, y + dy * d) != ROAD:
                    break
                d += 0.25
            best = min(best, d)
        return best


class Car(object):
    __slots__ = ("x", "y", "angle", "vx", "vy", "drift_charge", "boost_energy")

    def __init__(self, x, y, angle, vx, vy, dc=0.0, be=0.0):
        self.x = x
        self.y = y
        self.angle = angle
        self.vx = vx
        self.vy = vy
        self.drift_charge = dc
        self.boost_energy = be

    def clone(self):
        return Car(self.x, self.y, self.angle, self.vx, self.vy,
                   self.drift_charge, self.boost_energy)


def circle_hits_wall(track, x, y, r):
    k = r * 0.7071067811865476
    pts = ((x - r, y), (x + r, y), (x, y - r), (x, y + r),
           (x - k, y - k), (x + k, y - k), (x - k, y + k), (x + k, y + k))
    for px, py in pts:
        if track.tile(px, py) == WALL:
            return True
    return False


def step_car(track, car, inp):
    """与 simulation.updateCar 一致（不含对手碰撞）。inp=(throttle,steer,drift,boost)"""
    throttle, steer, drift, boost = inp
    f = (math.cos(car.angle), math.sin(car.angle))
    right = (-f[1], f[0])
    vF = car.vx * f[0] + car.vy * f[1]
    vL = car.vx * right[0] + car.vy * right[1]
    off = (track.tile(car.x, car.y) == GRASS)

    drifting = bool(drift) and abs(vF) > R["driftMinSpeed"] and abs(steer) > 0.15 and not off
    if throttle > 0:
        vF += R["accel"] * throttle * (R["offRoadAccel"] if off else 1.0) * DT
    elif throttle < 0:
        if vF > 0.5:
            vF -= R["brake"] * DT
        else:
            vF = max(-5.0, vF - R["reverseAccel"] * DT)
    vF *= math.exp(-R["drag"] * DT)
    if off:
        vF *= R["offRoadDrag"]
    sa = abs(vF)
    if sa > 0.25:
        d = 1.0 if vF > 0 else -1.0
        gain = clamp(sa / 8.0, 0.0, 1.0)
        car.angle += steer * R["turnRate"] * gain * (R["driftTurnBoost"] if drifting else 1.0) * d * DT
    vL *= R["gripDrift"] if drifting else R["gripNormal"]

    if drifting:
        car.drift_charge = clamp(car.drift_charge + (abs(vL) * 0.12 + sa * 0.02) * R["driftChargeRate"] * DT, 0.0, 1.0)
    else:
        car.drift_charge = 0.0
    # 松开漂移时蓄能转入喷火能量（比赛规则；判定用 drifting 状态翻转）
    want = bool(boost) and car.boost_energy > 0.02
    if want:
        vF += R["boostAccel"] * DT
        car.boost_energy = max(0.0, car.boost_energy - R["boostDrain"] * DT)
    cap = R["offRoadMax"] if off else (R["boostMaxSpeed"] if want else R["maxSpeed"])
    if vF > cap:
        vF = max(cap, vF - 18.0 * DT)
    if vF < -5.0:
        vF = -5.0
    car.vx = f[0] * vF + right[0] * vL
    car.vy = f[1] * vF + right[1] * vL
    r = R["carRadius"]
    nx = car.x + car.vx * DT
    if not circle_hits_wall(track, nx, car.y, r):
        car.x = nx
    else:
        car.vx = -car.vx * R["wallRestitution"]
        car.vy *= 0.9
    ny = car.y + car.vy * DT
    if not circle_hits_wall(track, car.x, ny, r):
        car.y = ny
    else:
        car.vy = -car.vy * R["wallRestitution"]
        car.vx *= 0.9
    car.x = clamp(car.x, r, track.W - r)
    car.y = clamp(car.y, r, track.H - r)
    return drifting


class Driver(object):
    def __init__(self):
        self.track = None
        self.key = None
        self.hint = None
        self.stuck = 0
        self.recover = 0
        self.t = 0.0
        self.lat_i = 0.0
        self.opp = None
        self.cp_s = []
        self.cp_pos = []

    def on_obs(self, obs):
        rules = obs.get("rules")
        if isinstance(rules, dict):
            for k in R:
                v = rules.get(k)
                if isinstance(v, (int, float)) and v > 0:
                    R[k] = float(v)
        tr = obs.get("track")
        if not isinstance(tr, dict) or "points" not in tr:
            # 观察缺赛道时沿用上一局缓存
            return
        p0 = tr["points"][0] if tr["points"] else {"x": 0, "y": 0}
        key = (obs.get("seed"), round(tr.get("length", 0), 2), len(tr["points"]),
               round(p0.get("x", 0), 2), round(p0.get("y", 0), 2), round(tr.get("halfWidth", 0), 2))
        if self.track is None or key != self.key:
            self.track = Track(tr)
            self.key = key
            self.hint = None
            # 检查点弧长位置
            self.cp_s = []
            for cp in tr["checkpoints"]:
                _, cs, _, _ = self.track.project(cp["x"], cp["y"])
                self.cp_s.append(cs)
            self.cp_pos = [(cp["x"], cp["y"]) for cp in tr["checkpoints"]]

    # ------------------------------------------------------------------
    def compute_input(self, car, me_cp=0):
        tr = self.track
        ang = car.angle
        fx, fy = math.cos(ang), math.sin(ang)
        vF = car.vx * fx + car.vy * fy
        speed = math.hypot(car.vx, car.vy)
        s0, lat, idx, tang = tr.project(car.x, car.y, self.hint)
        self.hint = idx
        off = tr.tile(car.x, car.y) != ROAD

        v_t = tr.vlim_at(s0)
        v_hi = tr.vlim_at(s0, hi=True)
        v_ahead0 = tr.vlim_at(s0 + 6.0)

        # --- 追踪目标 ---
        Ld = clamp(P["lookahead_base"] + P["lookahead_gain"] * speed, 2.0, P["lookahead_max"])
        if P["ll_corner_base"] < 90.0:
            r_loc = 1.0 / max(tr.kappa_s[idx], 1e-6)
            Ld = min(Ld, max(3.0, P["ll_corner_base"] + P["ll_corner_k"] * r_loc))

        # 越野时看近处，尽快回到路面
        if off:
            Ld = min(Ld, P["offroad_ld"])
        # 检查点保护：预测直线飞过检查点时的横向偏差，偏差过大就收短前视
        cp_guard = False
        if P["cp_guard"] > 0 and self.cp_s and not off and speed > 3.0:
            nc = int(me_cp) % len(self.cp_s)
            d_cp = (self.cp_s[nc] - s0) % tr.L
            if d_cp < P["cp_guard_r"]:
                ux, uy = car.vx / speed, car.vy / speed
                cpx, cpy = self.cp_pos[nc]
                pred = math.hypot(car.x + ux * d_cp - cpx, car.y + uy * d_cp - cpy)
                rad = tr.checkpoints[nc]["radius"] if "radius" in tr.checkpoints[nc] else 4.0
                if pred > P["cp_guard_frac"] * rad:
                    cp_guard = True
                    Ld = min(Ld, max(4.0, d_cp * P["cp_guard_shrink"]))
        tx, ty, ttan = tr.pos_tan(s0 + Ld)

        # 对手避让：预测最近距离，只有真要撞上才让线/减速
        opp_slow = None
        if self.opp is not None:
            ox, oy, ovx, ovy = self.opp
            rx, ry = -fy, fx
            dxo, dyo = ox - car.x, oy - car.y
            rvx, rvy = car.vx - ovx, car.vy - ovy
            a = rvx * rvx + rvy * rvy
            if a > 0.04:
                tt = -(dxo * rvx + dyo * rvy) / a
                if 0.0 < tt < P["avoid_ttc"]:
                    mx = dxo + rvx * tt
                    my = dyo + rvy * tt
                    miss = math.hypot(mx, my)
                    if miss < P["avoid_miss"]:
                        side_c = mx * rx + my * ry
                        if side_c > 0.05:
                            want = -1.0
                        elif side_c < -0.05:
                            want = 1.0
                        else:
                            want = -1.0 if lat > 0.0 else 1.0
                        urg = 1.0 - tt / P["avoid_ttc"]
                        maxoff = max(0.0, tr.half - 1.0)
                        o = want * P["avoid_lat"] * (0.4 + urg)
                        room = (maxoff - lat) if o > 0.0 else (maxoff + lat)
                        room = max(0.0, room)
                        o = min(abs(o), room) * (1.0 if o > 0.0 else -1.0)
                        # 临近检查点时不让线（漏检点要绕一整圈，代价远大于一次擦碰）
                        d_cp_av = 99.0
                        if self.cp_s:
                            nc = int(me_cp) % len(self.cp_s)
                            d_cp_av = (self.cp_s[nc] - s0) % tr.L
                        if d_cp_av < P["avoid_cp_block"]:
                            o = 0.0
                        if o != 0.0:
                            La = clamp(math.hypot(dxo, dyo) * 0.75, 2.5, Ld)
                            tx2, ty2, _ = tr.pos_tan(s0 + La)
                            tx, ty = tx2 + rx * o, ty2 + ry * o
                        if tt < P["avoid_brake_t"] and miss < 1.25:
                            opp_slow = max(7.0, math.hypot(ovx, ovy) + 1.0)

        desired = math.atan2(ty - car.y, tx - car.x)
        alpha = angle_diff(desired, ang)
        vg = clamp(abs(vF) / 8.0, 0.0, 1.0)

        # --- 直道方波漂移蓄能 ---
        farm = (P["weave_amp"] > 0.0 and not off and speed > 7.0
                and v_t > P["farm_e_min"] and v_ahead0 > P["farm_e_min"]
                and car.boost_energy + car.drift_charge < P["farm_charge_max"])
        # --- 弯道漂移 ---
        corner_drift = (P["drift_on"] > 0.0 and not off and speed > 4.5
                        and v_t < P["drift_vmax"] and abs(alpha) > 0.06
                        and car.boost_energy < 0.98)

        # --- 喷火 ---
        boosting = (car.boost_energy > P["boost_energy_min"] and v_hi > P["boost_vmin"]
                    and not off and vF > 3.0)

        # --- 目标速度 ---
        base_v = v_hi if boosting else v_t
        if off:
            base_v = min(base_v, P["offroad_speed"])
        v_ahead = tr.vlim_at(s0 + max(2.0, abs(vF) * 0.30), hi=boosting)
        target_v = min(base_v, v_ahead + 1.5)
        if opp_slow is not None:
            target_v = min(target_v, opp_slow)

        kappa = 2.0 * math.sin(alpha) / max(Ld, 1.0)
        if vg > 1e-3:
            tboost = R["driftTurnBoost"] if corner_drift else 1.0
            steer_track = kappa * abs(vF) / (R["turnRate"] * vg * tboost) * P["steer_gain"]
        else:
            steer_track = 0.0
        if farm:
            # 慢速外环：修正漂移造成的横向漂移
            vel_dir = math.atan2(car.vy, car.vx)
            vel_err = angle_diff(ttan, vel_dir)
            self.lat_i = clamp(self.lat_i + (-lat) * P["farm_k_i"] * DT, -0.4, 0.4)
            bias = clamp(P["farm_k_vel"] * vel_err + P["farm_k_lat"] * (-lat) + self.lat_i,
                         -P["farm_bias_max"], P["farm_bias_max"])
            ph = (self.t / max(P["weave_T"], 0.02)) % 2.0
            wave = P["weave_amp"] if ph < 1.0 else -P["weave_amp"]
            steer = clamp(bias + wave, -1.0, 1.0)
        else:
            steer = clamp(steer_track, -1.0, 1.0)
            self.lat_i = 0.0
        drift = (bool(farm) or corner_drift) and abs(steer) > 0.16

        if off or speed < 4.2:
            drift = False

        # --- 油门 ---
        if vF < target_v - 0.15:
            throttle = 1.0
        elif vF > target_v + 1.0:
            throttle = -1.0
        elif vF > target_v + 0.15:
            throttle = -0.35
        else:
            throttle = 1.0
        return (throttle, steer, drift, boosting)

    # ------------------------------------------------------------------
    def window(self, obs):
        self.on_obs(obs)
        tr = self.track
        me = obs["cars"][obs["yourPlayer"]]
        oi = 1 - int(obs["yourPlayer"])
        if 0 <= oi < len(obs["cars"]):
            oc = obs["cars"][oi]
            self.opp = (oc["x"], oc["y"], oc["vx"], oc["vy"])
        else:
            self.opp = None
        car = Car(me["x"], me["y"], me["angle"], me["vx"], me["vy"],
                  me["driftCharge"], me["boostEnergy"])
        frames = []
        prev_drift = bool(me.get("drifting", False))
        cd_left = obs.get("countdownLeft") or 0
        n_cd = int(round(cd_left * 20)) if cd_left > 0 else 0
        for fi in range(20):
            if fi < n_cd:
                # 倒计时：物理不推进，直接给满油门（并保持模型静止）
                frames.append([{"throttle": 1.0, "steer": 0.0, "drift": False, "boost": False}])
                continue
            if self.recover > 0:
                self.recover -= 1
                inp = (-1.0, 0.7, False, False)
            else:
                inp = self.compute_input(car, me.get("nextCp", 0))
            self.t += DT
            if abs(car.vx) + abs(car.vy) < 0.6 and inp[0] > 0:
                self.stuck += 1
                if self.stuck > 10:
                    self.recover = 12
                    self.stuck = 0
            else:
                self.stuck = max(0, self.stuck - 1)

            # 漂移结束时把 driftCharge 转入 boostEnergy（与引擎一致）
            drifting_now = prev_drift
            frames.append([{"throttle": round(inp[0], 3), "steer": round(inp[1], 3),
                            "drift": bool(inp[2]), "boost": bool(inp[3])}])
            was = car.drift_charge
            d_now = step_car(tr, car, inp)
            if prev_drift and not d_now and was > 0.02:
                car.boost_energy = min(1.0, car.boost_energy + was)
            prev_drift = d_now
        return {"inputs": frames}


def speed_of(car):
    return math.hypot(car.vx, car.vy)


def main():
    drv = Driver()
    out = sys.stdout
    last_good = None
    neutral = {"inputs": [[{"throttle": 0, "steer": 0, "drift": False, "boost": False}] for _ in range(20)]}
    straight = {"inputs": [[{"throttle": 1, "steer": 0, "drift": False, "boost": False}] for _ in range(20)]}
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
        except Exception:
            out.write(json.dumps(last_good if last_good is not None else neutral) + "\n")
            out.flush()
            continue
        if obs.get("status") not in (None, "playing"):
            out.write(json.dumps(neutral) + "\n")
            out.flush()
            continue
        try:
            if drv.track is None and not isinstance(obs.get("track"), dict):
                res = straight
            else:
                res = drv.window(obs)
            last_good = res
        except Exception as e:
            import traceback
            sys.stderr.write("ERR %r\n%s\n" % (e, traceback.format_exc()))
            res = last_good if last_good is not None else straight
        out.write(json.dumps(res) + "\n")
        out.flush()


if __name__ == "__main__":
    main()
