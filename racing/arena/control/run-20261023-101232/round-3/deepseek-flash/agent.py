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
    # --- 漂移 / 喷火 ---
    "farm_on": 0.0,            # 旧版直道蛇形（第 1 轮实测不稳定，保留但关闭）
     "drift_on": 0.0,           # 弯道短漂（低速、非喷火阶段）
    "drift_vmax": 11.0,
    "drift_min_speed": 8.0,
    "drift_r_max": 7.5,        # 平滑半径小于该值的弯才漂移
    "drift_alpha_min": 0.0,
    "drift_charge_cap": 0.95,
    "drift_max_frames": 8,     # 单次漂移最多持续帧数（0=不限）
     "drift_comp": 0.6,         # 1=补偿漂移的 1.6 倍转向率
    "drift_speed_max": 15.0,   # 超过该速度不做弯道漂移（高速漂移会甩出赛道）
     "weave_on": 0.0,           # 新：直道受控摆尾短漂蓄能
    "weave_amp": 0.55,         # 叠加在循迹转向上的正弦幅值
    "weave_T": 1.10,           # 摆动周期（秒）
    "weave_r_min": 8.5,        # 仅在小曲率段（平滑半径大于该值）蓄能
    "weave_vmin": 9.5,         # 最低车速
    "weave_speed_max": 19.0,   # 超过该速度不摆尾
    "weave_charge_cap": 0.95,  # 能量足够时停止蓄能
    "weave_lat_max": 1.7,      # 横向偏移超过该值不再摆动
    "weave_base_max": 0.50,    # 基础循迹转向过大（真弯道）时不摆动
    "weave_shape": 2.0,        # 0=正弦 1=方波 2=平方根正弦（离零更久）
     "line_off": 1.6,           # 走内线偏移（格）；0=沿中心线
    "line_off_k": 12.0,        # 偏移随曲率的饱和速度
    "weave_k_lat": 0.12,       # 摆尾时的横向居中增益
    "farm_e_min": 13.0,
    "farm_charge_max": 0.95,
    "farm_k_lat": 0.12,
    "farm_k_vel": 0.8,
    "farm_k_i": 0.05,
    "farm_bias_max": 0.35,
    "boost_on": 1.0,
    "boost_energy_min": 0.05,
    "boost_vmin": 15.0,        # 当前位置的喷火限速低于该值就先不点火
    "boost_margin": 1.0,       # 喷火限速 = turnRate * r_smooth * margin
    "boost_ahead": 22.0,       # 喷火限速剖面的反向刹车减速度
    "boost_lat": 0.0,
    "boost_sm": 1.0,           # 1=两阶段状态机
    "boost_start": 0.20,       # 蓄到该能量才进入喷火阶段
    "boost_stop": 0.02,        # 喷到该能量退出
    "boost_phase_vmin": 14.0,  # 当前喷火限速低于该值时不进入/退出喷火阶段
    "boost_stretch_vmin": 16.0,# 前方 11 格内最低喷火限速需高于该值才点火
    "weave_boost_off": 1.0,    # 1=喷火期间不摆尾（把蓄能和用能分成两个阶段）
    # --- 第 3 轮：持续喷火 + 脉冲短漂（drift/boost overlap）---
     "fast_on": 1.0,            # 1=启用高速喷火剖面 + 持续喷火 + 脉冲漂移
     "fast_cap": 30.0,          # 高速喷火剖面的速度上限
     "fast_margin": 1.1,        # 高速喷火剖面 v = turnRate*r*margin
     "fast_straight_r": 0.0,   # >0 时：平滑半径大于该值的路段用 fast_cap，其余用普通剖面
     "boost_gate": 21.0,        # 当前高速剖面低于该值就不点火（只在直道/缓弯喷火）
    "bootstrap_energy": 0.0,   # 能量低于该值时先不喷火、专心蓄能（0=关闭）
    "bootstrap_charge_max": 0.30,  # 蓄能中 driftCharge 超过该值就不再算 bootstrap
    "pulse_r_min_boot": 4.5,   # bootstrap 阶段的脉冲半径门槛
    "pulse_lat_frac_boot": 0.98,   # bootstrap 阶段的横向门槛
     "fast_brake": 24.0,        # 高速喷火剖面反向传播刹车减速度
    "fast_vmin": 6.0,          # 低于该目标速度不点火
    "fast_ahead_gain": 2.0,    # 目标 = min(当前, 前方 + gain)
    "fast_port_hz": 1.0,       # 喷火时脉冲漂移的占空（0=不漂）
     "pulse_period": 6,         # 脉冲周期（帧）
     "pulse_on_frames": 3,      # 每周期漂移帧数
    "pulse_min_speed": 6.0,    # 低于该速度不脉冲漂移
    "pulse_charge_max": 1.02,  # boostEnergy+driftCharge 低于该值才继续脉冲
    "pulse_steer_min": 0.16,   # |steer| 低于该值漂移无效
     "pulse_amp": 0.35,         # 脉冲漂移叠加的转向幅值
     "pulse_r_min": 7.0,       # 只在平滑半径大于该值的直道段脉冲漂移
     "pulse_lat_frac": 0.95,    # |lat| > frac*halfWidth 时不脉冲
     "cp_safe_dist": 0.0,       # 距下一检查点弧长小于该值时禁脉冲/回中心线
     "cp_aim_on": 0.0,          # 1=临近检查点时直接瞄准检查点中心
    "cp_lat_gain": 0.0,        # >0 时按预测的检查点横向偏差修正目标（横向，不改前视）
    "cp_lat_dist": 8.0,        # 距下一检查点弧长小于该值时启用横向修正
     "safety_on": 1.0,          # 1=启用 20 帧物理 roll-out 安全兜底
     "safety_horizon": 8,      # roll-out 帧数
    "safety_lat_frac": 0.88,   # 预测 |lat| 超过 frac*halfWidth 视为危险
    "safety_brake": 0.5,       # 危险时刹车强度
    "safety_min_speed": 1.5,   # 车速低于该值时不启用安全兜底（避免卡死）
    "drift_steer_cap": 0.0,    # >0 时把脉冲漂移的 |steer| 限制在该值
    "boost_while_brake": 0.0,  # 1=刹车时也喷火（默认关）
    "ctl_total_speed": 1.0,    # 1=用总速度做速度控制（fast 模式）
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
        # 宽窗平滑曲率：近似的"真实弯道半径"，用于判断哪里可以安全喷火/摆尾
        w6 = 6
        ksm = [0.0] * n
        for i in range(n):
            acc = 0.0
            for d in range(-w6, w6 + 1):
                acc += kappa[(i + d) % n]
            ksm[i] = acc / (2 * w6 + 1)
        self.kappa_sm = ksm
        # 喷火工况限速剖面：v = turnRate * r * margin，再反向传播刹车距离
        vb = []
        for i in range(n):
            r = 1.0 / max(abs(ksm[i]), 1e-6)
            vb.append(clamp(R["turnRate"] * r * P["boost_margin"], 6.0, R["boostMaxSpeed"]))
        ab = P["boost_ahead"]
        for _ in range(3):
            for i in range(n - 1, -1, -1):
                j = (i + 1) % n
                ds = self.seglen[i]
                lim = math.sqrt(vb[j] * vb[j] + 2.0 * ab * ds)
                if lim < vb[i]:
                    vb[i] = lim
        self.vboost = vb
        # 第 3 轮：高速喷火剖面（上限更高）
        vf = []
        for i in range(n):
            r = 1.0 / max(abs(ksm[i]), 1e-6)
            if P["fast_straight_r"] > 0.0:
                vf.append(P["fast_cap"] if r > P["fast_straight_r"] else vlim[i])
            else:
                vf.append(clamp(R["turnRate"] * r * P["fast_margin"], 5.0, P["fast_cap"]))
        af = P["fast_brake"]
        for _ in range(3):
            for i in range(n - 1, -1, -1):
                j = (i + 1) % n
                ds = self.seglen[i]
                lim = math.sqrt(vf[j] * vf[j] + 2.0 * af * ds)
                if lim < vf[i]:
                    vf[i] = lim
        self.vfast = vf

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

    def vboost_at(self, s):
        lo = self._seg_of(s)
        s = s % self.L
        seglen = self.cum[lo + 1] - self.cum[lo]
        t = (s - self.cum[lo]) / seglen if seglen > 1e-9 else 0.0
        a = self.vboost[lo]
        b = self.vboost[(lo + 1) % self.n]
        return a + (b - a) * t

    def vfast_at(self, s):
        lo = self._seg_of(s)
        s = s % self.L
        seglen = self.cum[lo + 1] - self.cum[lo]
        t = (s - self.cum[lo]) / seglen if seglen > 1e-9 else 0.0
        a = self.vfast[lo]
        b = self.vfast[(lo + 1) % self.n]
        return a + (b - a) * t

    def ksm_at(self, s):
        lo = self._seg_of(s)
        s = s % self.L
        seglen = self.cum[lo + 1] - self.cum[lo]
        t = (s - self.cum[lo]) / seglen if seglen > 1e-9 else 0.0
        a = self.kappa_sm[lo]
        b = self.kappa_sm[(lo + 1) % self.n]
        return abs(a + (b - a) * t)

    def ksm_sign_at(self, s):
        lo = self._seg_of(s)
        s = s % self.L
        seglen = self.cum[lo + 1] - self.cum[lo]
        t = (s - self.cum[lo]) / seglen if seglen > 1e-9 else 0.0
        a = self.kappa_sm[lo]
        b = self.kappa_sm[(lo + 1) % self.n]
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
        self.recover_side = 1.0
        self.guard_n = 0
        self.rec_n = 0
        self.drift_run = 0
        self.boost_phase = False
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
    def _roll_off(self, car, inp, H, s_hint=None):
        """预测 H 帧：首帧用候选输入，之后用“回正 + 收油”的兜底策略闭环推进。
        恒定输入会高估高增益转向的后果（控制器本来会回打方向），故后续帧用闭环。"""
        c = car.clone()
        off = 0
        tr = self.track
        hint = s_hint
        for i in range(H):
            if i == 0:
                use = inp
            else:
                use, hint = self._fallback_inp(c, hint)
            step_car(tr, c, use)
            if tr.tile(c.x, c.y) != ROAD:
                off += 1
        return off

    def _fallback_inp(self, c, hint):
        tr = self.track
        s, lat, idx, tang = tr.project(c.x, c.y, hint)
        tx, ty = tr.pos_at(s + 2.8)
        ang_rec = math.atan2(ty - c.y, tx - c.x)
        steer = clamp(2.2 * angle_diff(ang_rec, c.angle), -1.0, 1.0)
        return ((0.0, steer, False, False), idx)

    def _guard(self, car, inp, s0, alpha, vF):
        """安全兜底：标称动作会出界时，按“松漂 → 收油 → 回正 → 刹车”顺序降级。"""
        H = max(2, int(P["safety_horizon"]))
        if self._roll_off(car, inp, H) == 0:
            return inp
        self.guard_n += 1
        thr, steer, drift, boost = inp
        tr = self.track
        tx, ty = tr.pos_at(s0 + 3.0)
        ang_rec = math.atan2(ty - car.y, tx - car.x)
        steer_rec = clamp(2.2 * angle_diff(ang_rec, car.angle), -1.0, 1.0)
        cands = [
            (thr, steer, False, False),                       # 松漂/断喷
            (thr, steer_rec, False, False),                   # 直接用回正转向
            (min(thr, 0.0), steer_rec, False, False),         # 收油 + 回正
            (min(thr, -P["safety_brake"]), steer_rec, False, False),  # 刹车 + 回正
            (-1.0, steer_rec, False, False),                  # 全力刹车 + 回正
        ]
        best = None
        for cnd in cands:
            off = self._roll_off(car, cnd, H)
            if off == 0:
                return cnd
            if best is None or off < best[0]:
                best = (off, cnd)
        return best[1]

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
        # 到下一个检查点的弧长距离（用于检查点保护）
        d_cp = 99.0
        cp_idx = int(me_cp) % len(self.cp_s) if self.cp_s else 0
        if self.cp_s:
            d_cp = (self.cp_s[cp_idx] - s0) % tr.L

        # --- 追踪目标 ---
        Ld = clamp(P["lookahead_base"] + P["lookahead_gain"] * speed, 2.0, P["lookahead_max"])
        if P["ll_corner_base"] < 90.0:
            r_loc = 1.0 / max(tr.kappa_s[idx], 1e-6)
            Ld = min(Ld, max(3.0, P["ll_corner_base"] + P["ll_corner_k"] * r_loc))

        # 越野时看近处，尽快回到路面
        if off:
            Ld = min(Ld, P["offroad_ld"])

        # 检查点保障：下一个检查点很快到达时直接朝其中心瞄准。
        # 12 个检查点约每 8 格一个，弦与原弧的最大偏差约 r*(1-cos(pi/12)) ≈ 0.03r，可忽略，
        # 因此“瞄准检查点中心”既不会明显绕远，又能保证每个检查点都真正通过。
        cp_aim = False
        if P["cp_aim_on"] > 0.0 and self.cp_s and not off and d_cp < max(2.0, Ld):
            cpx, cpy = self.cp_pos[cp_idx]
            if d_cp > 1.5:
                tx, ty = cpx, cpy
                ttan = tr.seg[tr._seg_of(self.cp_s[cp_idx] - 0.5)]
            else:
                tx, ty, ttan = tr.pos_tan(self.cp_s[cp_idx] + 3.0)
            cp_aim = True
        else:
            tx, ty, ttan = tr.pos_tan(s0 + Ld)
        # 走内线（切弯心）：把前视目标朝曲率中心偏移，缩短实际路径
        if P["line_off"] > 0.0 and not off and not cp_aim:
            kt = tr.ksm_sign_at(s0 + Ld)
            mag = min(1.0, abs(kt) * P["line_off_k"])
            off_l = min(P["line_off"], max(0.0, tr.half - 1.5)) * mag
            # 已经接近路沿时收回内线偏移
            off_l *= clamp((tr.half - 0.9 - abs(lat)) / 1.0, 0.0, 1.0)
            if off_l > 0.01:
                nxs, nys = -math.sin(ttan), math.cos(ttan)
                sgn = 1.0 if kt > 0 else -1.0
                tx += nxs * off_l * sgn
                ty += nys * off_l * sgn
        # 检查点横向修正：预测到达检查点时的横向偏差，提前把目标点朝反方向偏移。
        # 与“直接瞄准检查点”不同，这里只修正横向，不改变前视距离，不会切穿弯道。
        if (P["cp_lat_gain"] > 0.0 and self.cp_s and not off and speed > 4.0
                and 0.0 < d_cp < P["cp_lat_dist"]):
            nx0, ny0 = -math.sin(tang), math.cos(tang)
            v_lat = car.vx * nx0 + car.vy * ny0
            t_cp = d_cp / max(speed, 1e-3)
            lat_pred = lat + v_lat * t_cp
            corr = clamp(-lat_pred * P["cp_lat_gain"], -2.2, 2.2)
            s_t = s0 + min(Ld, max(1.5, d_cp - 1.0))
            txn, tyn, _ = tr.pos_tan(s_t)
            txn += nx0 * corr
            tyn += ny0 * corr
            tx, ty = txn, tyn

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

        # --- 喷火：蓄能/用能两阶段状态机，避免 0.1 秒级的碎片喷火 ---
        fast_mode = P["fast_on"] > 0.0
        boot = False
        v_bo = tr.vboost_at(s0)
        if fast_mode:
            # 高速喷火剖面：直道目标可以远高于 23，弯前按 fast_brake 提前减速
            v_fa = tr.vfast_at(s0)
            v_ahead_f = min(tr.vfast_at(s0 + 2.0),
                            tr.vfast_at(s0 + max(3.5, abs(vF) * 0.35)))
            target_v = min(v_fa, v_ahead_f + P["fast_ahead_gain"])
            boot = (car.boost_energy < P["bootstrap_energy"]
                    and car.drift_charge < P["bootstrap_charge_max"])
            boosting = (car.boost_energy > 0.02 and not off and vF > 3.0
                        and not boot
                        and target_v > P["fast_vmin"] and v_fa > P["boost_gate"]
                        and (vF < target_v + 0.2 or P["boost_while_brake"] > 0.0))
            base_v = v_fa
        elif P["boost_sm"] > 0.0:
            if self.boost_phase:
                if car.boost_energy <= P["boost_stop"] or v_bo < P["boost_phase_vmin"]:
                    self.boost_phase = False
            else:
                stretch = 99.0
                if car.boost_energy >= P["boost_start"] and v_bo > P["boost_phase_vmin"]:
                    for dd in (2.0, 5.0, 8.0, 11.0):
                        stretch = min(stretch, tr.vboost_at(s0 + dd))
                if car.boost_energy >= P["boost_start"] and stretch > P["boost_stretch_vmin"]:
                    self.boost_phase = True
            boosting = (self.boost_phase and car.boost_energy > 0.02
                        and v_bo > P["boost_vmin"] and v_bo > vF - 0.9
                        and not off and vF > 3.0)
        else:
            boosting = (P["boost_on"] > 0.0 and car.boost_energy > P["boost_energy_min"]
                        and v_bo > P["boost_vmin"] and v_bo > vF - 0.6
                        and not off and vF > 3.0)

        # --- 旧版直道方波漂移蓄能（默认关闭）---
        farm = (P["farm_on"] > 0.0 and not off and speed > 7.0
                and v_t > P["farm_e_min"] and v_ahead0 > P["farm_e_min"]
                and car.boost_energy + car.drift_charge < P["farm_charge_max"])
        # --- 弯道漂移：用平滑半径触发（旧版用 v_t 触发永远不成立）---
        r_now = 1.0 / max(tr.ksm_at(s0), 1e-6)
        in_boost = self.boost_phase if P["boost_sm"] > 0.0 else boosting
        corner_drift = (P["drift_on"] > 0.0 and not off and speed > P["drift_min_speed"]
                        and speed < P["drift_speed_max"] and not in_boost
                        and r_now < P["drift_r_max"] and abs(alpha) > P["drift_alpha_min"]
                        and car.boost_energy + car.drift_charge < P["drift_charge_cap"])
        if corner_drift and P["drift_max_frames"] > 0:
            if self.drift_run >= P["drift_max_frames"]:
                corner_drift = False

        # --- 目标速度 ---
        if fast_mode:
            pass
        elif boosting:
            base_v = v_bo
            v_ahead = min(tr.vboost_at(s0 + 2.0), tr.vboost_at(s0 + max(3.5, abs(vF) * 0.45)))
            target_v = min(base_v, v_ahead + 0.8)
        else:
            base_v = v_t
            v_ahead = tr.vlim_at(s0 + max(2.0, abs(vF) * 0.30))
            target_v = min(base_v, v_ahead + 1.5)
        if off:
            target_v = min(target_v, P["offroad_speed"])
        if opp_slow is not None:
            target_v = min(target_v, opp_slow)

        kappa = 2.0 * math.sin(alpha) / max(Ld, 1.0)
        if vg > 1e-3:
            # 漂移时转向速率 ×1.6；drift_comp=1 完全补偿（跟线更稳），0=不补偿（甩尾蓄能）
            comp = (P["drift_comp"] * (1.0 / R["driftTurnBoost"]) + (1.0 - P["drift_comp"])) if corner_drift else 1.0
            steer_track = kappa * abs(vF) / (R["turnRate"] * vg) * comp * P["steer_gain"]
        else:
            steer_track = 0.0

        # --- 新：直道受控摆尾短漂蓄能（在循迹转向之上叠加低幅正弦） ---
        weave = False
        wave = 0.0
        if (P["weave_on"] > 0.0 and not off and speed > P["weave_vmin"]
                and speed < P["weave_speed_max"]
                and car.boost_energy + car.drift_charge < P["weave_charge_cap"]
                and abs(lat) < P["weave_lat_max"]
                and (P["weave_boost_off"] < 0.5
                     or not (self.boost_phase if P["boost_sm"] > 0.0 else boosting))
                and abs(steer_track) < P["weave_base_max"]):
            k_now = tr.ksm_at(s0)
            k_ahead = tr.ksm_at(s0 + 4.5)
            if (1.0 / max(k_now, 1e-6) > P["weave_r_min"]
                    and 1.0 / max(k_ahead, 1e-6) > P["weave_r_min"] * 0.8):
                weave = True
                ph = TAU * self.t / max(P["weave_T"], 0.05)
                s = math.sin(ph)
                if P["weave_shape"] >= 1.5:
                    s = math.copysign(abs(s) ** 0.45, s)
                elif P["weave_shape"] >= 0.5:
                    s = 1.0 if s >= 0.0 else -1.0
                wave = P["weave_amp"] * s
                # 横向居中修正：偏出中心线越远，回拉越强
                wave += clamp(-lat * P["weave_k_lat"], -0.30, 0.30)

        if farm:
            # 旧版慢速外环：修正漂移造成的横向漂移
            vel_dir = math.atan2(car.vy, car.vx)
            vel_err = angle_diff(ttan, vel_dir)
            self.lat_i = clamp(self.lat_i + (-lat) * P["farm_k_i"] * DT, -0.4, 0.4)
            bias = clamp(P["farm_k_vel"] * vel_err + P["farm_k_lat"] * (-lat) + self.lat_i,
                         -P["farm_bias_max"], P["farm_bias_max"])
            ph = (self.t / max(P["weave_T"], 0.02)) % 2.0
            wave = P["weave_amp"] if ph < 1.0 else -P["weave_amp"]
            steer = clamp(bias + wave, -1.0, 1.0)
            drift = abs(steer) > 0.16
        else:
            steer = clamp(steer_track + wave, -1.0, 1.0)
            self.lat_i = 0.0
            pulse = False
            rmin = P["pulse_r_min_boot"] if boot else P["pulse_r_min"]
            lfrac = P["pulse_lat_frac_boot"] if boot else P["pulse_lat_frac"]
            if (fast_mode and P["fast_port_hz"] > 0.0 and not off
                    and speed > P["pulse_min_speed"]
                    and car.boost_energy + car.drift_charge < P["pulse_charge_max"]
                    and abs(lat) < lfrac * tr.half
                    and d_cp > P["cp_safe_dist"]
                    and 1.0 / max(tr.ksm_at(s0), 1e-6) > rmin
                    and 1.0 / max(tr.ksm_at(s0 + 5.0), 1e-6) > rmin * 0.8):
                fi = int(round(self.t * 20.0))
                per = max(1, int(P["pulse_period"]))
                on = max(1, int(P["pulse_on_frames"]))
                if (fi % per) < on:
                    pulse = True
                    if abs(steer_track) > 0.20:
                        pdir = 1.0 if steer_track > 0.0 else -1.0
                    else:
                        pdir = 1.0 if ((fi // per) % 2 == 0) else -1.0
                    comp2 = P["drift_comp"] * (1.0 / R["driftTurnBoost"]) + (1.0 - P["drift_comp"])
                    steer = clamp(steer_track * comp2 + pdir * P["pulse_amp"], -1.0, 1.0)
                    if P["drift_steer_cap"] > 0.0:
                        steer = clamp(steer, -P["drift_steer_cap"], P["drift_steer_cap"])
            drift = (weave and abs(steer) > 0.16 and abs(steer_track) < P["weave_base_max"] + 0.06) \
                or (corner_drift and abs(steer) > 0.16) \
                or (pulse and abs(steer) > P["pulse_steer_min"])


        if off or speed < 4.2:
            drift = False
        self.drift_run = (self.drift_run + 1) if drift else 0

        # --- 油门 ---
        # fast 模式下用总速度（含漂移保留的侧向速度）做速度控制，避免“前向 23、总速 30”
        # 时误以为没超速而错过刹车点。
        v_ctl = speed if (fast_mode and P["ctl_total_speed"] > 0.0) else abs(vF)
        if v_ctl < target_v - 0.15:
            throttle = 1.0
        elif v_ctl > target_v + 1.0:
            throttle = -1.0
        elif v_ctl > target_v + 0.15:
            throttle = -0.35
        else:
            throttle = 1.0
        out = (throttle, steer, bool(drift), bool(boosting))
        if P["safety_on"] > 0.0 and not off and speed > P["safety_min_speed"]:
            out = self._guard(car, out, s0, alpha, vF)
        return out

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
                self.rec_n += 1
                inp = (-1.0, self.recover_side * 0.8, False, False)
            else:
                inp = self.compute_input(car, me.get("nextCp", 0))
            self.t += DT
            if abs(car.vx) + abs(car.vy) < 0.35:
                self.stuck += 1
                if self.stuck > 12:
                    self.recover = 12
                    self.recover_side = -self.recover_side
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
        if DEBUG:
            try:
                _s, _lat, _i, _t = self.track.project(me["x"], me["y"], None)
            except Exception:
                _s, _lat = 0.0, 0.0
            sys.stderr.write("W t=%.2f s=%.1f lat=%+.2f v=%.2f E=%.2f dc=%.2f dr=%d bo=%d cp=%d g=%d rc=%d\n" % (
                self.t, _s, _lat, me.get("speed", 0.0), me.get("boostEnergy", 0.0),
                me.get("driftCharge", 0.0), int(bool(me.get("drifting"))),
                int(bool(me.get("boosting"))), me.get("nextCp", -1), self.guard_n, self.rec_n))
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
