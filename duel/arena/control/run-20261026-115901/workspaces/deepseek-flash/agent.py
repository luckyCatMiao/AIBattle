#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""无尽弹墙对决 · deepseek-flash 参赛程序.

核心认识
--------
1. 一枪致命 + 子弹永不消失 => 场上子弹只会越来越多，**活着**才是主线。
2. 自己的子弹永远打不到自己 => 只需要把「对手的子弹」当成威胁，威胁数量减半。
3. 开火没有副作用（子弹不衰减、不消耗资源、打不到自己），所以**冷却一到就开火**，
   唯一的决策是往哪个方向打。
4. 玩家 13 格/秒 > 子弹 8.5 格/秒，单发子弹总能靠走位躲开；真正致命的是
   多弹交叉 / 被逼进死角 / 对手贴脸开火（子弹生成点离自己只有 1 格）。
   所以走位同时看：未来若干帧的弹道、离墙距离、与对手的距离（枪口区）。

实现
----
* 精确复刻服务端物理（点判定墙反射、轴分离移动、3 子步），可逐帧预测弹道。
* 每 150ms 做一次束搜索：向后推演 HORIZON 帧，代价 = 敌方子弹威胁场 + 贴墙惩罚 +
  枪口区/中距惩罚；任意一帧与敌方子弹距离 < 判定半径即视为死亡（越晚死代价越小）。
* 取搜索出的前 3 帧作为本窗口走位。
* 开火：本窗口内冷却归零的那一帧开火，瞄准方向由「弹道模拟 + 对手位置预测」打分选出。

所有可调参数都可以用 DUEL_* 环境变量覆盖，便于离线调参；比赛时环境里没有这些变量，
使用的就是文件里的默认值。
"""

import os
import sys
import json
import math
from collections import deque

# ---------------------------------------------------------------- 可调参数

def _envf(name, default):
    try:
        v = os.environ.get(name)
        return float(v) if v is not None and v != '' else float(default)
    except Exception:
        return float(default)


DEFAULTS = {
    'HORIZON': 18,      # 走位搜索向前看的帧数
    'BEAM': 56,         # 束宽
    'SAFE_R': 0.72,     # 判定半径 0.67 + 余量
    'SOFT_R': 3.2,      # 软威胁半径
    'W_SOFT': 5.0,      # 软威胁权重
    'W_WALL': 1.5,      # 贴墙惩罚
    'WALL_R': 2.0,      # 贴墙惩罚起算距离（格）
    'W_NEAR': 6.0,      # 与对手过近的惩罚权重
    'NEAR_R': 6.0,      # 与对手过近的起算距离（格）
    'W_MUZZLE': 220.0,  # 枪口区（贴脸）惩罚权重
    'MUZZLE_R': 2.6,    # 枪口区半径（格）
    'VIRT_AIM': 1.0,    # 是否把「对手可能朝我开的那一枪」当威胁
    'VIRT_FACE': 1.0,   # 是否把「对手朝当前朝向开的那一枪」当威胁
    'AIM_HIT_R': 0.74,  # 瞄准评分里算「命中」的距离
    'AIM_W_HIT': 26.0,  # 命中权重
    'AIM_W_NEAR': 1.6,  # 擦过权重
    'AIM_TAU': 34.0,    # 时间衰减
    'AIM_STEPS': 160,   # 瞄准时模拟的子弹帧数
    'AIM_LEAD': 8,      # 对手速度预测的可信帧数
    'W_APPROACH': 0.45, # 主动接近对手的权重（按迷宫 BFS 距离）
    'APPROACH_FAR': 7.0,  # 超过这个 BFS 距离才开始拉近
    'APPROACH_CAP': 1e9,  # 拉近权重上限（默认不封顶，否则远处没有梯度会原地发呆）
    # 对手「边走边开火」威胁建模：冷却 ≤2 帧时，把未来 1~3 帧能到达的位置
    # 都当成可能的枪口，并按朝我方向补虚拟弹。解决旧版只把枪口钉在
    # 当前观察位置、被对手横移 0.46~1.30 格后打穿的问题。
    'OPP_MOVE_VIRT': 1, # 1=启用移动枪口虚拟弹
    'VIRT_RINGS': 2,    # 每个可达半径上的采样环数（外环 16 点，内环 8 点）
    # 对手贴身危险区：按对手剩余冷却决定「必须保持的距离」，越近代价越高。
    'KEEP': 1,
    'KEEP_R0': 3.40,    # 冷却 ≤2 帧（下一帧就能开火）时的软禁区半径
    'KEEP_R1': 2.90,    # 冷却 ≤6 帧
    'KEEP_R2': 2.40,    # 冷却 ≤10 帧
    'KEEP_RB': 1.50,    # 其余时候的贴身下限
    'W_KEEP': 90.0,     # 禁区代价权重（按 (R-d)^2）
    'KEEP_PRED': 1,     # 1=同时用上一窗口速度外推对手位置，避免迎面冲锋低估危险
}
# 允许用 DUEL_* 环境变量覆盖（离线调参用；比赛环境里没有这些变量）
TUNE = dict(DEFAULTS)
for _k in list(TUNE):
    _v = os.environ.get('DUEL_' + _k)
    if _v not in (None, ''):
        try:
            TUNE[_k] = float(_v)
        except ValueError:
            pass

SUB = 3                                    # 子弹子步数（与裁判一致）

SQ = 0.7071067811865476  # Math.SQRT1_2

DIRV = {
    'N': (0.0, 0.0),
    'U': (0.0, -1.0), 'D': (0.0, 1.0), 'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-SQ, -SQ), 'UR': (SQ, -SQ), 'DL': (-SQ, SQ), 'DR': (SQ, SQ),
}
MOVE_DIRS = ('N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR')
AIM_DIRS = ('U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR')

NEUTRAL_FRAME = {'dir': 'N', 'aim': None, 'fire': False}
NEUTRAL = {'inputs': [dict(NEUTRAL_FRAME) for _ in range(3)]}

# 八个采样点，和 catalog.circleHitsWall 完全一致
OCT = tuple((math.cos((i / 8.0) * math.pi * 2.0), math.sin((i / 8.0) * math.pi * 2.0))
            for i in range(8))


# ---------------------------------------------------------------- 物理

class Field(object):
    """静态地图 + 与裁判一致的几何判定。"""

    __slots__ = ('tiles', 'W', 'H', 'clear', 'step_len', 'prad', 'passable')

    def __init__(self, tiles, W, H, step_len, prad):
        self.tiles = tiles
        self.W = W
        self.H = H
        self.step_len = step_len
        self.prad = prad
        self.clear = self._clearance()
        self.passable = self._passable()

    def _passable(self):
        """格心能否站人（用于迷宫寻路）。"""
        W, H = self.W, self.H
        out = [False] * (W * H)
        for y in range(H):
            for x in range(W):
                out[y * W + x] = not self.circle_hits(x + 0.5, y + 0.5, self.prad)
        return out

    def bfs_from(self, tx, ty):
        """从 (tx,ty) 格出发的迷宫最短路步数；-1 表示走不到。"""
        W, H, pas = self.W, self.H, self.passable
        dist = [-1] * (W * H)
        if not (0 <= tx < W and 0 <= ty < H):
            return dist
        i0 = ty * W + tx
        if not pas[i0]:
            best = None
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    x, y = tx + dx, ty + dy
                    if 0 <= x < W and 0 <= y < H and pas[y * W + x]:
                        d = dx * dx + dy * dy
                        if best is None or d < best[0]:
                            best = (d, y * W + x)
            if best is None:
                return dist
            i0 = best[1]
        dist[i0] = 0
        q = deque([i0])
        while q:
            i = q.popleft()
            d = dist[i] + 1
            x = i % W
            if x > 0 and pas[i - 1] and dist[i - 1] < 0:
                dist[i - 1] = d
                q.append(i - 1)
            if x < W - 1 and pas[i + 1] and dist[i + 1] < 0:
                dist[i + 1] = d
                q.append(i + 1)
            if i >= W and pas[i - W] and dist[i - W] < 0:
                dist[i - W] = d
                q.append(i - W)
            if i + W < W * H and pas[i + W] and dist[i + W] < 0:
                dist[i + W] = d
                q.append(i + W)
        return dist

    def wall(self, x, y):
        if x < 0.0 or y < 0.0:
            return True
        xi = int(x)
        yi = int(y)
        if xi >= self.W or yi >= self.H:
            return True
        return self.tiles[yi * self.W + xi] != 0

    def circle_hits(self, x, y, r):
        if self.wall(x, y):
            return True
        t = self.tiles
        W = self.W
        H = self.H
        for cx, cy in OCT:
            px = x + cx * r
            py = y + cy * r
            if px < 0.0 or py < 0.0:
                return True
            xi = int(px)
            yi = int(py)
            if xi >= W or yi >= H:
                return True
            if t[yi * W + xi] != 0:
                return True
        return False

    def move(self, x, y, d):
        """返回这一帧走完后的 (x, y)；轴分离，与裁判一致。"""
        mx, my = DIRV[d]
        if mx == 0.0 and my == 0.0:
            return x, y
        sl = self.step_len
        r = self.prad
        nx = x + mx * sl
        if not self.circle_hits(nx, y, r):
            x = nx
        ny = y + my * sl
        if not self.circle_hits(x, ny, r):
            y = ny
        return x, y

    def _clearance(self):
        """每格到最近墙的格数（BFS）。"""
        W, H, t = self.W, self.H, self.tiles
        INF = 999
        d = [INF] * (W * H)
        q = deque()
        for i in range(W * H):
            if t[i] != 0:
                d[i] = 0
                q.append(i)
        while q:
            i = q.popleft()
            nd = d[i] + 1
            x = i % W
            y = i // W
            if x > 0 and d[i - 1] > nd:
                d[i - 1] = nd
                q.append(i - 1)
            if x < W - 1 and d[i + 1] > nd:
                d[i + 1] = nd
                q.append(i + 1)
            if y > 0 and d[i - W] > nd:
                d[i - W] = nd
                q.append(i - W)
            if y < H - 1 and d[i + W] > nd:
                d[i + W] = nd
                q.append(i + W)
        return d

    def clearance_at(self, x, y):
        xi = int(x)
        yi = int(y)
        if xi < 0 or yi < 0 or xi >= self.W or yi >= self.H:
            return 0
        return self.clear[yi * self.W + xi]


_FIELD_CACHE = {}


def get_field(seed, tiles, W, H, step_len, prad):
    """同一 seed 地图固定不变，Field（含离墙距离场）只算一次。"""
    key = (seed, W, H, step_len, prad)
    f = _FIELD_CACHE.get(key)
    if f is None:
        f = Field(tiles, W, H, step_len, prad)
        _FIELD_CACHE[key] = f
    return f


def advance_bullet(bx, by, vx, vy, sub_dt, field):
    """推进一帧（3 子步，轴分离完全弹性反射），与裁判一致。"""
    wall = field.wall
    for _ in range(SUB):
        nx = bx + vx * sub_dt
        if wall(nx, by):
            vx = -vx
        else:
            bx = nx
        ny = by + vy * sub_dt
        if wall(bx, ny):
            vy = -vy
        else:
            by = ny
    return bx, by, vx, vy


def dir_of(x, y):
    """把向量量化到 8 方向（与 simulation.vecToDir 一致）。"""
    if abs(x) < 1e-9 and abs(y) < 1e-9:
        return 'N'
    ln = math.hypot(x, y)
    ux, uy = x / ln, y / ln
    best, bd = 'N', -2.0
    for k, (dx, dy) in DIRV.items():
        if k == 'N':
            continue
        dot = ux * dx + uy * dy
        if dot > bd:
            bd = dot
            best = k
    return best


# ---------------------------------------------------------------- Agent

class Agent(object):

    def __init__(self, **kw):
        self.opp_hist = []
        self.opp_vel = (0.0, 0.0)
        self.frames_seen = 0
        self.debug = kw.get('debug', False)

    def act(self, obs):
        try:
            return self._act(obs)
        except Exception as exc:  # 任何异常都不该让整场技术负
            if self.debug:
                print('act error: %r' % (exc,), file=sys.stderr)
            return NEUTRAL

    def _act(self, obs):
        if obs.get('status') != 'playing':
            return NEUTRAL

        T = TUNE
        HORIZON = int(T['HORIZON'])
        BEAM = int(T['BEAM'])
        SAFE_R = T['SAFE_R']
        SOFT_R = T['SOFT_R']
        W_SOFT = T['W_SOFT']
        W_WALL = T['W_WALL']
        WALL_R = T['WALL_R']
        W_NEAR = T['W_NEAR']
        NEAR_R = T['NEAR_R']
        W_MUZZLE = T['W_MUZZLE']
        MUZZLE_R = T['MUZZLE_R']
        VIRT_AIM = T['VIRT_AIM']
        VIRT_FACE = T['VIRT_FACE']
        W_APPROACH = T['W_APPROACH']
        APPROACH_FAR = T['APPROACH_FAR']
        APPROACH_CAP = T['APPROACH_CAP']
        OPP_MOVE_VIRT = T['OPP_MOVE_VIRT']
        VIRT_RINGS = T['VIRT_RINGS']
        KEEP = T['KEEP']
        KEEP_R0 = T['KEEP_R0']
        KEEP_R1 = T['KEEP_R1']
        KEEP_R2 = T['KEEP_R2']
        KEEP_RB = T['KEEP_RB']
        W_KEEP = T['W_KEEP']
        KEEP_PRED = T['KEEP_PRED']

        rules = obs.get('rules') or {}
        hz = float(rules.get('hz', 20))
        dt = 1.0 / hz
        prad = float(rules.get('playerRadius', 0.45))
        brad = float(rules.get('bulletRadius', 0.22))
        pspeed = float(rules.get('playerSpeed', 13))
        bspeed = float(rules.get('bulletSpeed', 8.5))
        step_len = pspeed * dt
        sub_dt = dt / SUB
        hit_r = prad + brad

        m = obs['map']
        W = int(m['width'])
        H = int(m['height'])
        tiles = m['tiles']
        field = get_field(int(obs.get('seed', 0)), tiles, W, H, step_len, prad)

        me_idx = int(obs.get('yourPlayer', 0))
        players = obs['players']
        me = players[me_idx]
        opp = players[1 - me_idx]

        # 记录对手速度（每 3 帧一次观测）
        op = (float(opp['x']), float(opp['y']))
        self.opp_hist.append(op)
        if len(self.opp_hist) > 2:
            self.opp_hist.pop(0)
        if len(self.opp_hist) == 2:
            (px, py), (cx, cy) = self.opp_hist
            self.opp_vel = ((cx - px) / 3.0, (cy - py) / 3.0)
        self.frames_seen += 1

        mx = float(me['x'])
        my = float(me['y'])
        cooldown = int(me.get('cooldown', 0))
        oppx = float(opp['x'])
        oppy = float(opp['y'])

        # ---------------- 1. 威胁：敌方子弹的未来弹道
        bx = []
        by = []
        bvx = []
        bvy = []
        for b in obs.get('bullets', []):
            if int(b['owner']) == me_idx:
                continue  # 自己的子弹永远打不到自己
            bx.append(float(b['x']))
            by.append(float(b['y']))
            bvx.append(float(b['vx']))
            bvy.append(float(b['vy']))

        # 虚拟弹：对手随时可能朝我 / 朝它的朝向开火，按最坏情况加入
        oc = int(opp.get('cooldown', 0))
        if oc <= 2:
            spawn_d = prad + brad + 0.12
            d = dir_of(mx - oppx, my - oppy)
            faces = []
            if VIRT_AIM and d != 'N':
                faces.append(d)
            if VIRT_FACE:
                d2 = dir_of(float(opp['fx']), float(opp['fy']))
                if d2 != 'N' and d2 not in faces:
                    faces.append(d2)
            for fd in faces:
                ux, uy = DIRV[fd]
                bx.append(oppx + ux * spawn_d)
                by.append(oppy + uy * spawn_d)
                bvx.append(ux * bspeed)
                bvy.append(uy * bspeed)

            # 旧版把枪口钉在「当前观察位置」，但对手在开火前还会移动最多
            # 3 帧（0.65 格/帧）。下面把本窗口内对手能到达的圆盘边缘也当成
            # 可能的开枪位置：外环 16 点 + 内环 8 点（半径按 k 缩放），
            # 每点朝我方当前位置补一颗虚拟弹。这样对手「横移半步再开火」
            # 的弹道也会进入束搜索的威胁场。
            if OPP_MOVE_VIRT > 0.5:
                step = pspeed * dt
                k = min(3, oc + 1)  # 本窗口内它最多还能走几帧才开火
                rings = int(max(1, min(2, VIRT_RINGS)))
                for ri in range(rings):
                    rr = step * k * (1.0 if ri == 0 else 0.5)
                    n_ang = 16 if ri == 0 else 8
                    for ai in range(n_ang):
                        ang = (ai + 0.5 * (ri == 0)) * (2.0 * math.pi / n_ang)
                        px = oppx + rr * math.cos(ang)
                        py = oppy + rr * math.sin(ang)
                        if field.circle_hits(px, py, prad):
                            continue
                        fd = dir_of(mx - px, my - py)
                        if fd == 'N':
                            continue
                        ux, uy = DIRV[fd]
                        sx = px + ux * spawn_d
                        sy = py + uy * spawn_d
                        if field.wall(sx, sy):
                            continue
                        bx.append(sx)
                        by.append(sy)
                        bvx.append(ux * bspeed)
                        bvy.append(uy * bspeed)

        # 逐帧推演
        posx = list(bx)
        posy = list(by)
        alive_idx = list(range(len(bx)))
        grids = [None] * (HORIZON + 1)
        for t in range(1, HORIZON + 1):
            xs = []
            ys = []
            keep = []
            for i in alive_idx:
                nx, ny, nvx, nvy = advance_bullet(posx[i], posy[i], bvx[i], bvy[i], sub_dt, field)
                posx[i] = nx
                posy[i] = ny
                bvx[i] = nvx
                bvy[i] = nvy
                xs.append(nx)
                ys.append(ny)
                keep.append(i)
            alive_idx = keep
            g = {}
            for k in range(len(xs)):
                key = (int(xs[k] // 3.0), int(ys[k] // 3.0))
                v = g.get(key)
                if v is None:
                    g[key] = [(xs[k], ys[k])]
                else:
                    v.append((xs[k], ys[k]))
            grids[t] = g

        safe_r2 = SAFE_R * SAFE_R
        soft_r2 = SOFT_R * SOFT_R
        clear_map = field.clear
        fW = field.W
        fH = field.H
        # 对手贴身危险区半径：冷却越短，能「横移一小步再开火」的容错越小，
        # 因此必须留出更大的距离。旧版只有固定的 2.6 格枪口惩罚，且在
        # 40 秒后的密集弹场里经常被束搜索牺牲掉。
        if oc <= 2:
            keep_r = KEEP_R0
        elif oc <= 6:
            keep_r = KEEP_R1
        elif oc <= 10:
            keep_r = KEEP_R2
        else:
            keep_r = KEEP_RB
        kpred = min(3, oc + 1) if oc <= 2 else 3
        ppx = oppx + self.opp_vel[0] * kpred
        ppy = oppy + self.opp_vel[1] * kpred
        # 迷宫寻路距离场（从对手出发）：安全时主动靠近，避免「没子弹就原地发呆」
        if W_APPROACH > 0.0:
            dist_map = field.bfs_from(int(oppx), int(oppy))
        else:
            dist_map = None

        def frame_cost(x, y, t):
            g = grids[t]
            bx0 = int(x // 3.0)
            by0 = int(y // 3.0)
            c = 0.0
            for gx in (bx0 - 1, bx0, bx0 + 1):
                for gy in (by0 - 1, by0, by0 + 1):
                    lst = g.get((gx, gy))
                    if not lst:
                        continue
                    for (px, py) in lst:
                        dx = x - px
                        dy = y - py
                        d2 = dx * dx + dy * dy
                        if d2 < safe_r2:
                            return -1.0  # 死亡
                        if d2 < soft_r2:
                            d = math.sqrt(d2)
                            c += (SOFT_R - d) * (SOFT_R - d) * W_SOFT
            xi = int(x)
            yi = int(y)
            cl = clear_map[yi * fW + xi] if (0 <= xi < fW and 0 <= yi < fH) else 0
            if cl < WALL_R:
                c += (WALL_R - cl) * (WALL_R - cl) * W_WALL
            if dist_map is not None and 0 <= xi < fW and 0 <= yi < fH:
                dd = dist_map[yi * fW + xi]
                if dd > APPROACH_FAR:
                    c += min((dd - APPROACH_FAR) * W_APPROACH, APPROACH_CAP)
            if KEEP > 0.5:
                dk = math.hypot(x - oppx, y - oppy)
                if KEEP_PRED > 0.5:
                    dk = min(dk, math.hypot(x - ppx, y - ppy))
                if dk < keep_r:
                    c += (keep_r - dk) * (keep_r - dk) * W_KEEP
            return c

        # ---------------- 2. 束搜索走位
        near_r2 = NEAR_R * NEAR_R
        muz_r2 = MUZZLE_R * MUZZLE_R

        frontier = [(mx, my, 0.0, ())]
        for t in range(1, HORIZON + 1):
            cands = []
            for (x, y, cost, acts) in frontier:
                for d in MOVE_DIRS:
                    nx, ny = field.move(x, y, d)
                    fc = frame_cost(nx, ny, t)
                    if fc < 0.0:
                        # 死亡：越晚死代价越小，但不再往下展开
                        cands.append((nx, ny, cost + 1e6 * (HORIZON - t + 1), acts))
                        continue
                    nc = cost + fc
                    ddx = nx - oppx
                    ddy = ny - oppy
                    dd2 = ddx * ddx + ddy * ddy
                    if dd2 < muz_r2:
                        nc += (MUZZLE_R - math.sqrt(dd2)) * W_MUZZLE
                    elif dd2 < near_r2:
                        nc += (NEAR_R - math.sqrt(dd2)) * (NEAR_R - math.sqrt(dd2)) * W_NEAR
                    if len(acts) < 3:
                        nacts = acts + (d,)
                    else:
                        nacts = acts
                    cands.append((nx, ny, nc, nacts))
            if not cands:
                break
            cands.sort(key=lambda s: s[2])
            seen = set()
            pruned = []
            for s in cands:
                first = s[3][0] if s[3] else 'N'
                key = (first, int(s[0] * 2.0), int(s[1] * 2.0))
                if key in seen:
                    continue
                seen.add(key)
                pruned.append(s)
                if len(pruned) >= BEAM:
                    break
            frontier = pruned

        best = min(frontier, key=lambda s: s[2]) if frontier else (mx, my, 0.0, ())
        path = list(best[3])
        while len(path) < 3:
            path.append('N')

        # 走位落点（用于选开火帧/瞄准方向）
        pxs = [mx]
        pys = [my]
        cx, cy = mx, my
        for d in path:
            cx, cy = field.move(cx, cy, d)
            pxs.append(cx)
            pys.append(cy)

        # ---------------- 3. 开火与瞄准
        shot = self._choose_shot(field, pxs, pys, cooldown, opp,
                                 prad, brad, bspeed, sub_dt, self.opp_vel)

        inputs = []
        for i in range(3):
            fire = (shot is not None and shot[0] == i)
            inputs.append({
                'dir': path[i],
                'aim': (shot[1] if fire else None),
                'fire': fire,
            })
        return {'inputs': inputs}

    # ---------------- 开火决策

    def _choose_shot(self, field, pxs, pys, cooldown, opp,
                     prad, brad, bspeed, sub_dt, opp_vel=(0.0, 0.0)):
        """返回 (帧下标, 瞄准方向) 或 None。冷却只有在本窗口内归零才可能开火。"""
        if cooldown > 2:
            return None
        frames = list(range(cooldown, 3))

        ox = float(opp['x'])
        oy = float(opp['y'])
        vx, vy = opp_vel
        NP = int(TUNE['AIM_STEPS'])
        LEAD = int(TUNE['AIM_LEAD'])
        opx = [0.0] * (NP + 1)
        opy = [0.0] * (NP + 1)
        for t in range(1, NP + 1):
            k = t if t < LEAD else LEAD
            opx[t] = ox + vx * k
            opy[t] = oy + vy * k

        spawn_d = prad + brad + 0.12
        best = None
        best_score = -1.0
        for fi in frames:
            sx = pxs[fi + 1]
            sy = pys[fi + 1]
            for d in AIM_DIRS:
                ux, uy = DIRV[d]
                if field.wall(sx + ux * spawn_d, sy + uy * spawn_d):
                    continue  # 枪口贴墙，这一枪根本打不出去
                score = self._shot_score(field, sx + ux * spawn_d, sy + uy * spawn_d,
                                         ux * bspeed, uy * bspeed, opx, opy,
                                         sub_dt, ox, oy)
                score += (2 - fi) * 0.02  # 早一帧开火 = 早一帧进冷却
                if score > best_score:
                    best_score = score
                    best = (fi, d)
        return best

    def _shot_score(self, field, x, y, vx, vy, opx, opy, sub_dt, ox, oy):
        """模拟一发子弹 160 帧，给「靠近对手」的弹道打分。"""
        T = TUNE
        hit_r = T['AIM_HIT_R']
        hit_r2 = hit_r * hit_r
        w_hit = T['AIM_W_HIT']
        w_near = T['AIM_W_NEAR']
        tau = T['AIM_TAU']
        score = 0.0
        NP = int(TUNE['AIM_STEPS'])
        for t in range(1, NP + 1):
            x, y, vx, vy = advance_bullet(x, y, vx, vy, sub_dt, field)
            dx = x - opx[t]
            dy = y - opy[t]
            d2 = dx * dx + dy * dy
            w = math.exp(-t / tau)
            if d2 < hit_r2:
                score += w_hit * w
            elif d2 < 6.25:
                score += (2.5 - math.sqrt(d2)) * w_near * w
        score += 0.06 * math.exp(-math.hypot(ox - x, oy - y) / 20.0)
        return score


# ---------------------------------------------------------------- main

def main():
    ag = Agent(debug=True)
    stdin = sys.stdin.buffer
    stdout = sys.stdout.buffer
    while True:
        line = stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line.decode('utf-8', 'replace'))
            out = ag.act(obs)
        except Exception as exc:
            print('top error: %r' % (exc,), file=sys.stderr)
            out = NEUTRAL
        try:
            stdout.write((json.dumps(out) + '\n').encode('utf-8'))
            stdout.flush()
        except Exception:
            break


if __name__ == '__main__':
    main()
