#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""3V3 足球 · deepseek-v4.1-flash · 正式提交（单文件）。
本文件由 pysim.py（官方 simulation.js 的逐帧精确移植）+ agent_core.py 合并而成。
修改请改源文件后重新运行 dev2/build.py。
"""

import sys
import json
import math
import os


import math

W = 44
H = 26
DT = 0.05
HZ = 20

R_U = 0.34
R_B = 0.22
MOVE = 3.15
DRIBF = 0.58
CTRL = 0.82
TACKLE = 0.12
DRIBD = 0.62
KICKP = 11.0
FRIC = 0.978
WALLR = 0.72

GOAL_TOP = 10.0
GOAL_BOT = 16.0
MOUTH_LO = 10.5
MOUTH_HI = 15.5
GOAL_DEPTH = 0.55

FOUL_FREEZE = 0.6
FOUL_LOCK = 1.0
KICK_CD = 0.35
CONTROL_LOCK = 0.30
STEAL_LOCK = 0.18
SAVE_MIN_SPEED = 4.5

PBOX = {0: (1.0, 6.0, 10.0, 20.0), 1: (34.0, 6.0, 43.0, 20.0)}

SQ2 = 0.7071067811865476
DIRV = {
    'N': (0.0, 0.0), 'U': (0.0, -1.0), 'D': (0.0, 1.0),
    'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-SQ2, -SQ2), 'UR': (SQ2, -SQ2), 'DL': (-SQ2, SQ2), 'DR': (SQ2, SQ2),
}
DIR_KEYS = tuple(DIRV.keys())

# 场地：只有边界是墙，球门开口在 y in [10,16)
_WALL = bytearray(W * H)
for _y in range(H):
    for _x in range(W):
        if _x == 0 or _y == 0 or _x == W - 1 or _y == H - 1:
            if (_x == 0 or _x == W - 1) and GOAL_TOP <= _y < GOAL_BOT:
                continue
            _WALL[_y * W + _x] = 1


def tile_at(x, y):
    tx = int(math.floor(x))
    ty = int(math.floor(y))
    if tx < 0 or ty < 0 or tx >= W or ty >= H:
        return 1
    return _WALL[ty * W + tx]


def circle_hits_wall(x, y, r):
    k = r * SQ2
    for px, py in ((x - r, y), (x + r, y), (x, y - r), (x, y + r),
                   (x - k, y - k), (x + k, y - k), (x - k, y + k), (x + k, y + k)):
        if tile_at(px, py):
            return True
    return False


def ball_hits_wall(x, y):
    return circle_hits_wall(x, y, R_B)


def in_goal_mouth(x, y):
    return MOUTH_LO <= y <= MOUTH_HI


def in_penalty_box(team, x, y):
    b = PBOX[team]
    return b[0] <= x <= b[2] and b[1] <= y <= b[3]


def nearest_outside_box(box, x, y, margin=0.7):
    x1, y1, x2, y2 = box
    cy = min(max(y, y1), y2)
    cx = min(max(x, x1), x2)
    cands = []
    if x1 > 1:
        cands.append((x1 - margin, cy))
    if x2 < W - 1:
        cands.append((x2 + margin, cy))
    cands.append((cx, y1 - margin))
    cands.append((cx, y2 + margin))
    best = cands[0]
    bd = 1e18
    for c in cands:
        d = math.hypot(c[0] - x, c[1] - y)
        if d < bd:
            bd = d
            best = c
    return (min(max(best[0], R_U), W - R_U), min(max(best[1], R_U), H - R_U))


# ------------------------------------------------------------------ 状态构造
class Unit(object):
    __slots__ = ('team', 'index', 'x', 'y', 'fx', 'fy',
                 'kickCd', 'controlLock', 'stealLock', 'foulLock')

    def __init__(self, team, index):
        self.team = team
        self.index = index
        self.x = 0.0
        self.y = 0.0
        self.fx = 1.0 if team == 0 else -1.0
        self.fy = 0.0
        self.kickCd = 0
        self.controlLock = 0
        self.stealLock = 0
        self.foulLock = 0


class St(object):
    __slots__ = ('units', 'bx', 'by', 'bvx', 'bvy', 'owner', 'lastTouch', 'lastTeam',
                 'score', 'frame', 'freeze', 'golden', 'goldenEnd', 'kickoffTeam',
                 'status', 'half', 'n')

    def clone(self):
        s = St.__new__(St)
        s.units = [u for u in self.units]
        for i, u in enumerate(s.units):
            nu = Unit(u.team, u.index)
            nu.x, nu.y, nu.fx, nu.fy = u.x, u.y, u.fx, u.fy
            nu.kickCd, nu.controlLock, nu.stealLock, nu.foulLock = u.kickCd, u.controlLock, u.stealLock, u.foulLock
            s.units[i] = nu
        s.bx, s.by, s.bvx, s.bvy = self.bx, self.by, self.bvx, self.bvy
        s.owner, s.lastTouch, s.lastTeam = self.owner, self.lastTouch, self.lastTeam
        s.score = [self.score[0], self.score[1]]
        s.frame, s.freeze = self.frame, self.freeze
        s.golden, s.goldenEnd, s.kickoffTeam = self.golden, self.goldenEnd, self.kickoffTeam
        s.status, s.half, s.n = self.status, self.half, self.n
        return s


def state_from_obs(obs, steal_foul=None):
    """从观察重建状态。steal_foul: {unit_index: (stealLock_frames, foulLock_frames)} 可选。"""
    n = int(obs.get('teamSize', 3))
    s = St()
    s.n = n
    s.units = []
    for u in obs.get('units', []):
        nu = Unit(int(u['team']), int(u['index']))
        nu.x = float(u['x'])
        nu.y = float(u['y'])
        f = u.get('facing') or {}
        nu.fx = float(f.get('x', 1.0))
        nu.fy = float(f.get('y', 0.0))
        nu.kickCd = int(round(float(u.get('kickCd') or 0.0) * HZ))
        nu.controlLock = int(round(float(u.get('controlLock') or 0.0) * HZ))
        s.units.append(nu)
    s.units.sort(key=lambda u: (u.team, u.index))
    b = obs.get('ball') or {}
    s.bx = float(b.get('x', W / 2.0))
    s.by = float(b.get('y', H / 2.0))
    s.bvx = float(b.get('vx') or 0.0)
    s.bvy = float(b.get('vy') or 0.0)
    s.owner = -1
    oid = b.get('owner')
    if oid:
        for i, u in enumerate(s.units):
            if 't%d' % 0 == 'x':
                pass
        for i, u in enumerate(s.units):
            if unit_id(u) == oid:
                s.owner = i
                break
    s.lastTouch = b.get('lastTouch')
    s.lastTeam = b.get('lastTeam')
    sc = obs.get('score') or [0, 0]
    s.score = [int(sc[0]), int(sc[1])]
    s.frame = int(obs.get('frame') or 0)
    s.freeze = int(round(float(obs.get('freeze') or 0.0) * HZ))
    s.golden = bool(obs.get('golden'))
    s.goldenEnd = 0
    s.kickoffTeam = 0
    s.status = 'playing'
    s.half = int(obs.get('half') or 1)
    if steal_foul:
        for i, u in enumerate(s.units):
            k = (u.team, u.index)
            if k in steal_foul:
                u.stealLock, u.foulLock = steal_foul[k]
    return s


def unit_id(u):
    return 't%du%d' % (u.team, u.index)


def initial_state(n, kickoff_team=0):
    """与 createMatch 的 frame=0 状态一致（freeze=0，球在中圈）。"""
    s = St()
    s.n = n
    s.units = []
    for t in (0, 1):
        for i in range(n):
            u = Unit(t, i)
            u.x = (11 if t == 0 else W - 12) + 0.5
            u.y = SPAWN_Y[n][i] + 0.5
            s.units.append(u)
    s.bx = W / 2.0
    s.by = H / 2.0
    s.bvx = s.bvy = 0.0
    s.owner = -1
    s.lastTouch = None
    s.lastTeam = None
    s.score = [0, 0]
    s.frame = 0
    s.freeze = 0
    s.golden = False
    s.goldenEnd = 0
    s.kickoffTeam = kickoff_team
    s.status = 'playing'
    s.half = 1
    return s


# ------------------------------------------------------------------ 物理
def move_unit(s, u, dx, dy):
    r = R_U
    nx = u.x + dx
    if not circle_hits_wall(nx, u.y, r):
        u.x = nx
    else:
        slide = (1.0 if dx > 0 else -1.0) * r * 0.5
        if not circle_hits_wall(u.x + slide, u.y, r):
            u.x += slide
    ny = u.y + dy
    if not circle_hits_wall(u.x, ny, r):
        u.y = ny
    else:
        slide = (1.0 if dy > 0 else -1.0) * r * 0.5
        if not circle_hits_wall(u.x, u.y + slide, r):
            u.y += slide
    if u.x < r:
        u.x = r
    elif u.x > W - r:
        u.x = W - r
    if u.y < r:
        u.y = r
    elif u.y > H - r:
        u.y = H - r


def separate_units(s):
    us = s.units
    r2 = R_U * 2
    for i in range(len(us)):
        a = us[i]
        for j in range(i + 1, len(us)):
            b = us[j]
            dx = b.x - a.x
            dy = b.y - a.y
            d = math.hypot(dx, dy)
            if d >= r2 or d < 1e-6:
                continue
            push = (r2 - d) / 2.0
            dx /= d
            dy /= d
            ax = a.x - dx * push
            ay = a.y - dy * push
            bx = b.x + dx * push
            by = b.y + dy * push
            if not circle_hits_wall(ax, ay, R_U):
                a.x = ax
                a.y = ay
            if not circle_hits_wall(bx, by, R_U):
                b.x = bx
                b.y = by


def kick_ball(s, u, fx, fy):
    l = math.hypot(fx, fy) or 1.0
    fx /= l
    fy /= l
    off = R_U + R_B + 0.03
    s.owner = -1
    s.bx = u.x + fx * off
    s.by = u.y + fy * off
    if ball_hits_wall(s.bx, s.by):
        s.bx = u.x
        s.by = u.y
    s.bvx = fx * KICKP
    s.bvy = fy * KICKP
    s.lastTouch = unit_id(u)
    s.lastTeam = u.team
    u.kickCd = int(round(KICK_CD * HZ))
    u.controlLock = int(round(CONTROL_LOCK * HZ))


def update_unit(s, u, inp):
    if u.kickCd > 0:
        u.kickCd -= 1
    if u.controlLock > 0:
        u.controlLock -= 1
    if u.stealLock > 0:
        u.stealLock -= 1
    if u.foulLock > 0:
        u.foulLock -= 1
    d = DIRV.get(inp[0]) or (0.0, 0.0)
    aim = inp[1]
    if aim is not None:
        u.fx, u.fy = aim
    elif d[0] or d[1]:
        u.fx, u.fy = d[0], d[1]
    ui = s.units.index(u)
    carrying = (s.owner == ui)
    speed = MOVE * (DRIBF if carrying else 1.0)
    if u.foulLock <= 0 and (d[0] or d[1]):
        move_unit(s, u, d[0] * speed * DT, d[1] * speed * DT)
    if u.foulLock <= 0 and inp[2] and s.owner == ui and u.kickCd <= 0 and u.controlLock <= 0:
        kick_ball(s, u, u.fx, u.fy)


def try_possession(s, kickoff_team=0):
    if s.owner >= 0:
        owner = s.units[s.owner]
        ownerD = math.hypot(owner.x - s.bx, owner.y - s.by)
        best = None
        bd = 1e18
        for i, u in enumerate(s.units):
            if u.team == owner.team or u.stealLock > 0 or u.controlLock > 0:
                continue
            d = math.hypot(u.x - s.bx, u.y - s.by)
            if d < bd:
                bd = d
                best = u
        if best is not None and bd < CTRL and bd + TACKLE < ownerD:
            s.owner = s.units.index(best)
            s.lastTouch = unit_id(best)
            s.lastTeam = best.team
            owner.stealLock = int(round(STEAL_LOCK * HZ))
        return
    best = None
    bd = 1e18
    for u in s.units:
        if u.controlLock > 0 or u.stealLock > 0:
            continue
        d = math.hypot(u.x - s.bx, u.y - s.by)
        if d < bd:
            bd = d
            best = u
    winner = best
    if best is not None:
        for x in s.units:
            if x.team == kickoff_team and x.controlLock <= 0 and x.stealLock <= 0:
                if math.hypot(x.x - s.bx, x.y - s.by) <= bd + 0.06:
                    winner = x
                    break
    if winner is not None and math.hypot(winner.x - s.bx, winner.y - s.by) < CTRL:
        s.owner = s.units.index(winner)
        s.lastTouch = unit_id(winner)
        s.lastTeam = winner.team
        s.bvx = 0.0
        s.bvy = 0.0


def update_ball(s):
    if s.owner >= 0:
        u = s.units[s.owner]
        s.bx = u.x + u.fx * DRIBD
        s.by = u.y + u.fy * DRIBD
        if ball_hits_wall(s.bx, s.by):
            s.bx = u.x
            s.by = u.y
        s.bvx = 0.0
        s.bvy = 0.0
        try_possession(s)
        return -1

    steps = 4
    for _ in range(steps):
        s.bx += s.bvx * DT / steps
        s.by += s.bvy * DT / steps
        if in_goal_mouth(s.bx, s.by):
            if s.bx <= 1.0:
                return 1     # team1 进球
            if s.bx >= W - 1.0:
                return 0     # team0 进球
        if ball_hits_wall(s.bx, s.by):
            px = s.bx - s.bvx * DT / steps
            py = s.by - s.bvy * DT / steps
            if ball_hits_wall(s.bx, py):
                s.bx = px
                s.bvx = -s.bvx * WALLR
            if ball_hits_wall(px, s.by):
                s.by = py
                s.bvy = -s.bvy * WALLR
            if ball_hits_wall(s.bx, s.by):
                s.bx = px
                s.by = py
                s.bvx = -s.bvx * WALLR
                s.bvy = -s.bvy * WALLR

    s.bvx *= FRIC
    s.bvy *= FRIC
    if math.hypot(s.bvx, s.bvy) < 0.02:
        s.bvx = 0.0
        s.bvy = 0.0
    try_possession(s)
    return -1


def commit_foul(s, u, box_team):
    box = PBOX[box_team]
    spot = nearest_outside_box(box, u.x, u.y, 0.9)
    cx = (box[0] + box[2]) / 2.0
    cy = (box[1] + box[3]) / 2.0
    dx = spot[0] - cx
    dy = spot[1] - cy
    l = math.hypot(dx, dy) or 1.0
    u.x = min(max(spot[0] + dx / l * 1.3, R_U), W - R_U)
    u.y = min(max(spot[1] + dy / l * 1.3, R_U), H - R_U)
    u.foulLock = int(round(FOUL_LOCK * HZ))
    u.stealLock = max(u.stealLock, u.foulLock)
    u.kickCd = max(u.kickCd, u.foulLock)
    s.owner = -1
    s.bx = spot[0]
    s.by = spot[1]
    s.bvx = 0.0
    s.bvy = 0.0
    s.lastTouch = None
    s.lastTeam = None
    s.freeze = max(s.freeze, int(round(FOUL_FREEZE * HZ)))


def check_fouls(s):
    for u in s.units:
        if u.foulLock > 0:
            continue
        if in_penalty_box(1 - u.team, u.x, u.y):
            commit_foul(s, u, 1 - u.team)
            return True
    return False


def check_clock(s):
    half_frames = int(round(60 * HZ))
    match_frames = int(round(120 * HZ))
    if not s.golden:
        if s.half == 1 and s.frame >= half_frames:
            s.half = 2
        if s.frame >= match_frames:
            if s.score[0] == s.score[1]:
                s.golden = True
                s.goldenEnd = s.frame + int(round(20 * HZ))
            else:
                s.status = 'finished'


def step(s, inputs, kickoff_team=0):
    """inputs: [(dir,aim,kick) x len(units)]；返回 0/1 表示该帧进球方，-1 无。"""
    if s.status != 'playing':
        return -1
    s.frame += 1
    if s.freeze > 0:
        s.freeze -= 1
        check_clock(s)
        return -1
    for i, u in enumerate(s.units):
        update_unit(s, u, inputs[i])
    separate_units(s)
    if check_fouls(s):
        check_clock(s)
        return -1
    g = update_ball(s)
    check_clock(s)
    return g


SPAWN_Y = {1: [13], 2: [9, 17], 3: [7, 13, 19], 4: [6, 10, 16, 20],
           5: [5, 9, 13, 17, 21], 6: [3, 7, 11, 15, 19, 23]}


def kickoff(s, team):
    ys = SPAWN_Y[s.n]
    for u in s.units:
        y = ys[u.index]
        u.x = (11 if u.team == 0 else W - 12) + 0.5
        u.y = y + 0.5
        u.fx = 1.0 if u.team == 0 else -1.0
        u.fy = 0.0
        u.kickCd = 0
        u.controlLock = 0
        u.stealLock = 0
        u.foulLock = 0
    s.bx = W / 2.0
    s.by = H / 2.0
    s.bvx = 0.0
    s.bvy = 0.0
    s.owner = -1
    s.lastTouch = None
    s.lastTeam = None
    s.freeze = int(round(0.6 * HZ))
    s.kickoffTeam = team


def advance(s, frames):
    """frames: [ [ (dir,aim,kick) x units ] x F ]；返回 [(goalTeam, frameIdx), ...]"""
    scored = []
    for k, fr in enumerate(frames):
        if s.status != 'playing':
            break
        g = step(s, fr, s.kickoffTeam)
        if g >= 0:
            s.score[g] += 1
            scored.append((g, k))
            if s.golden:
                s.status = 'finished'
                break
            kickoff(s, 1 - g)
    return scored




import json
import math


DBG = bool(os.environ.get('SOCCER_DEBUG'))
TRUST = float(os.environ.get('SOCCER_TRUST', '0.6'))
ONEPASS = os.environ.get('SOCCER_ONEPASS', '0') != '0'
SUPX = int(os.environ.get('SOCCER_SUPX', '1'))
FB = int(os.environ.get('SOCCER_FB', '2'))
PRES = int(os.environ.get('SOCCER_PRES', '0'))
SEARCH = int(os.environ.get('SOCCER_SEARCH', '0'))
KEEPMODEL = int(os.environ.get('SOCCER_KEEPMODEL', '0'))
D2 = int(os.environ.get('SOCCER_D2', '0'))
_prev_pos = {}          # 当前窗口的各单位位置 {(team,index): (x,y)}
_prev2_pos = {}         # 上一窗口的位置，用来估计对手速度
_prev_dt = 1.0          # 相邻观察的间隔秒数
_DF = os.environ.get('SOCCER_DEBUGFILE')
_dbgf = open(_DF, 'a', encoding='utf-8') if (DBG and _DF) else None


def dbg(msg):
    if _dbgf is not None:
        _dbgf.write(msg)
        _dbgf.flush()

S2 = 0.7071067811865476
_TY_GRID = [10.6 + 0.2 * i for i in range(25)]           # 10.6 .. 15.4
_TY_FINE = (10.7, 11.3, 11.9, 12.5, 13.0, 13.5, 14.1, 14.7, 15.3)
_GC = 13.0


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


def hyp(a, b):
    return math.sqrt(a * a + b * b)


def dir_for(dx, dy):
    if dx == 0.0 and dy == 0.0:
        return 'N'
    l = math.sqrt(dx * dx + dy * dy)
    dx /= l
    dy /= l
    best, bd = 'N', -2.0
    for k, v in DIRV.items():
        d = v[0] * dx + v[1] * dy
        if d > bd:
            bd = d
            best = k
    return best


def ang_deg(ax, ay, bx, by):
    return int(round(math.degrees(math.atan2(by - ay, bx - ax)))) % 360


def aim_vec(deg):
    r = deg * math.pi / 180.0
    return (math.cos(r), math.sin(r))


# ------------------------------------------------------------------ 球飞行
def ball_fly(bx, by, vx, vy, nframes):
    """复刻 updateBall 的位移/反弹。返回 [(x, y, hit_wall, goal_team), ...]，
    第 k 项 = 起脚后第 k+1 帧球的位置。

    性能：球在场地中间时不可能撞墙，用一个安全矩形跳过 8 点采样。"""
    out = []
    q = DT / 4.0
    for _ in range(nframes):
        gw = -1
        hit = False
        for _s in range(4):
            bx += vx * q
            by += vy * q
            if 10.5 <= by <= 15.5:
                if bx <= 1.0:
                    gw = 1
                    break
                if bx >= W - 1.0:
                    gw = 0
                    break
            if not (1.3 <= bx <= 42.7 and 1.3 <= by <= 24.7) and ball_hits_wall(bx, by):
                px = bx - vx * q
                py = by - vy * q
                if ball_hits_wall(bx, py):
                    bx = px
                    vx = -vx * WALLR
                if ball_hits_wall(px, by):
                    by = py
                    vy = -vy * WALLR
                if ball_hits_wall(bx, by):
                    bx = px
                    by = py
                    vx = -vx * WALLR
                    vy = -vy * WALLR
                hit = True
        vx *= FRIC
        vy *= FRIC
        if hyp(vx, vy) < 0.02:
            vx = 0.0
            vy = 0.0
        out.append((bx, by, hit, gw))
        if gw >= 0:
            break
    return out


def frames_to_reach(d):
    """初速 11 格/秒、每帧 ×0.978，球走 d 格需要多少帧（用于剪短 horizon）。"""
    if d <= 0:
        return 1
    r = 1.0 - d / (KICKP * DT / (1.0 - FRIC))
    if r <= 0.004:
        return 260
    return int(math.log(r) / math.log(FRIC)) + 3


def kick_origin(p, deg):
    """球员位于 p 时，以 deg 朝向起脚后球的初始位置。"""
    f = aim_vec(deg)
    return (p[0] + f[0] * (R_U + R_B + 0.03), p[1] + f[1] * (R_U + R_B + 0.03))


def shot_margin(bx, by, vx, vy, opps, react_t=1.0, horizon=40, trust=1.0):
    """返回 (margin, frames_to_goal) 或 None。

    opps: [(x, y, vx, vy), ...]，vx/vy 是对手最近一窗口的平均速度（格/秒）。

    对手在本窗口的输入在窗口开始时就已锁定 —— 他们无法针对这一脚做反应，
    但**已经决定的移动仍会发生**（实测：门将会沿原计划走到门线中点把球没收）。
    因此用「按最近速度外推」预测对手位置（trust 权重），
    剩下的部分按满速接近球路估计（1-trust）。
    """
    tr = ball_fly(bx, by, vx, vy, horizon)
    m = 1e9
    for k, (x, y, hit, gw) in enumerate(tr):
        t = (k + 1) * DT
        if hit and gw < 0:
            return None
        for o in opps:
            ox = o[0] + o[2] * t * trust
            oy = o[1] + o[3] * t * trust
            reach = MOVE * max(0.0, t - react_t) * (1.0 - trust)
            d = hyp(ox - x, oy - y) - reach - CTRL
            if d < m:
                m = d
        if gw >= 0:
            return (m, k + 1)
    return None


def best_shot(p, gl, opps, react_t=1.0, ty_grid=None, trust=1.0):
    """返回 (score, margin, ty, aim, frames) 或 None。"""
    if ty_grid is None:
        ty_grid = _TY_GRID
    best = None
    hz = frames_to_reach(abs(gl - p[0]) + 2.0)
    for ty in ty_grid:
        deg = ang_deg(p[0], p[1], gl, ty)
        bx, by = kick_origin(p, deg)
        if ball_hits_wall(bx, by):
            continue
        f = aim_vec(deg)
        r = shot_margin(bx, by, f[0] * KICKP, f[1] * KICKP, opps, react_t, horizon=hz, trust=trust)
        if r is None:
            continue
        m, k = r
        if m <= 0.02:
            continue
        sc = m - k * 0.01
        if best is None or sc > best[0]:
            best = (sc, m, ty, deg, k)
    return best


# ------------------------------------------------------------------ 传/射组合
def pass_options(O, mates, opps, gl, sg, max_frame=18, horizon=26, da_step=6, da_max=48):
    """搜索「传球 + 接球人本窗口内起脚」。返回候选列表（按分排序）。
    每项: dict(kind, pass_deg, mate, recv_frame, meet, recv_deg, recv_ty, sc, shot)"""
    out = []
    for mi, T in mates:
        base = ang_deg(O[0], O[1], T[0], T[1])
        for da in range(-da_max, da_max + 1, da_step):
            deg = (base + da) % 360
            bx, by = kick_origin(O, deg)
            if ball_hits_wall(bx, by):
                continue
            f = aim_vec(deg)
            tr = ball_fly(bx, by, f[0] * KICKP, f[1] * KICKP, horizon)
            for k, (x, y, hit, gw) in enumerate(tr):
                t = (k + 1) * DT
                if gw >= 0:
                    break                       # 直接飞进门，交给 best_shot
                if hit:
                    break
                if any(hyp(o[0] + o[2] * t - x, o[1] + o[3] * t - y) - CTRL <= 0.0 for o in opps):
                    break
                if hyp(T[0] - x, T[1] - y) <= MOVE * t + 0.55:
                    fr = k + 2                  # 接球那一帧的下一帧才能起脚
                    if fr <= max_frame:
                        sh = best_shot((x, y), gl, opps, react_t=(20 - fr) * DT, ty_grid=_TY_FINE, trust=TRUST)
                        sc = (2.0 + sh[1]) if sh else 0.0
                        sc += (x - O[0]) * sg * 0.12 - fr * 0.03 - abs(da) * 0.004
                        out.append({'kind': 'combo' if sh else 'pass',
                                    'pass_deg': deg, 'mate': mi, 'recv_frame': fr,
                                    'meet': (x, y), 'shot': sh, 'sc': sc})
                    break
    out.sort(key=lambda z: -z['sc'])
    return out


def clear_aim(O, gl, sg):
    """大脚：踢向前场边路空当。"""
    dy = 7.0 if int(O[1] * 10) % 2 else -7.0
    return ang_deg(O[0], O[1], gl - sg * 13.0, clamp(O[1] + dy, 5.0, 21.0))


# ------------------------------------------------------------------ 防守
def keeper_y(bx, by, bvx, bvy, gl_own, sg):
    """门将站位：球在飞行取门线交点；否则取「球对两门柱张角平分线」。"""
    if hyp(bvx, bvy) > 0.8:
        for (x, y, hit, gw) in ball_fly(bx, by, bvx, bvy, 150):
            if (sg > 0 and x <= gl_own + 0.45) or (sg < 0 and x >= gl_own - 0.45):
                return clamp(y, 10.85, 15.15)
            if hit:
                break
    a1x, a1y = gl_own - bx, 10.0 - by
    a2x, a2y = gl_own - bx, 16.0 - by
    l1 = hyp(a1x, a1y) or 1.0
    l2 = hyp(a2x, a2y) or 1.0
    ux = a1x / l1 + a2x / l2
    uy = a1y / l1 + a2y / l2
    l = hyp(ux, uy)
    if l < 1e-6 or abs(ux) < 1e-6:
        return clamp(by, 10.9, 15.1)
    ux /= l
    uy /= l
    t = (gl_own - bx) / ux
    return clamp(by + uy * t, 10.85, 15.15)


def intercept_point(px, py, vx, vy, ux_, uy_, maxf=45, slack=0.55):
    tr = ball_fly(px, py, vx, vy, maxf)
    for k, (x, y, hit, gw) in enumerate(tr):
        if gw >= 0:
            return None
        if hyp(ux_ - x, uy_ - y) <= MOVE * ((k + 1) * DT) + slack:
            return (x, y, k + 1)
    return None


# ------------------------------------------------------------------ 帧构建
def build_frames(my, targets, actions, opp_box, carrier_idx, guard=True):
    pos = dict((int(u['index']), [float(u['x']), float(u['y'])]) for u in my)
    done = set()
    frames = []
    gx1, gy1, gx2, gy2 = opp_box
    left_box = gx1 > 1.0            # 对方禁区在本方右侧（me==0）
    for f in range(20):
        fr = []
        for u in my:
            i = int(u['index'])
            tx, ty = targets.get(i, (float(u['x']), float(u['y'])))
            px, py = pos[i]
            dirn = 'N'
            aim = None
            a = actions.get(i)
            if a is not None and a[1] == f and i not in done:
                done.add(i)
                fr.append({'dir': 'N', 'aim': a[0], 'kick': True})
                continue
            dx, dy = tx - px, ty - py
            if hyp(dx, dy) > 0.06:
                dirn = dir_for(dx, dy)
                v = DIRV[dirn]
                sp = MOVE * (DRIBF if i == carrier_idx else 1.0)
                nx = clamp(px + v[0] * sp * DT, R_U, W - R_U)
                ny = clamp(py + v[1] * sp * DT, R_U, H - R_U)
                if guard and gy1 - 0.05 < ny < gy2 + 0.05:
                    inside = (nx >= gx1 - 0.06) if left_box else (nx <= gx2 + 0.06)
                    if inside:
                        was = (px >= gx1 - 0.06) if left_box else (px <= gx2 + 0.06)
                        if not was:
                            nx, ny = px, ny
                            dirn = 'U' if v[1] < 0 else ('D' if v[1] > 0 else 'N')
                        else:
                            nx, ny = px, py
                            dirn = 'N'
                pos[i] = [nx, ny]
            fr.append({'dir': dirn, 'aim': aim, 'kick': kick_false()})
        frames.append(fr)
    return frames


def kick_false():
    return False


def step_plan(my, opp_u, me, n, targets, actions, opp_box, carrier_idx, opps_vel,
              ball, owner_key, nframes=20):
    """跑一遍我方计划（对手幽灵按速度直线移动），返回每帧结束时的持球方 key 与我方位置。"""
    s = St()
    s.n = n
    s.units = []
    for u in list(my) + list(opp_u):
        team = int(u['team'])
        nu = Unit(team, int(u['index']))
        nu.x = float(u['x'])
        nu.y = float(u['y'])
        f = u.get('facing') or {}
        nu.fx = float(f.get('x', 1.0))
        nu.fy = float(f.get('y', 0.0))
        nu.kickCd = int(round(float(u.get('kickCd') or 0.0) * HZ))
        nu.controlLock = int(round(float(u.get('controlLock') or 0.0) * HZ))
        s.units.append(nu)
    s.units.sort(key=lambda z: (z.team, z.index))
    s.bx, s.by, s.bvx, s.bvy = ball
    s.owner = -1
    for idx, u in enumerate(s.units):
        if (u.team, u.index) == owner_key:
            s.owner = idx
    s.score = [0, 0]
    s.frame = 0
    s.freeze = 0
    s.golden = False
    s.goldenEnd = 0
    s.kickoffTeam = 0
    s.status = 'playing'
    s.half = 1
    myframes = build_frames(my, targets, actions, opp_box, carrier_idx)
    ghost = {}
    for o in opp_u:
        k = (int(o['team']), int(o['index']))
        ghost[k] = (opps_vel.get(k) or (0.0, 0.0))
    out = []
    for f in range(nframes):
        inp = [None] * len(s.units)
        for idx, u in enumerate(s.units):
            if u.team == me:
                inp[idx] = myframes[f][u.index]
            else:
                v = ghost.get((u.team, u.index), (0.0, 0.0))
                sp = hyp(v[0], v[1])
                if sp > 0.4:
                    d = dir_for(v[0], v[1])
                    inp[idx] = (d, None, False)
                else:
                    inp[idx] = ('N', None, False)
        g = step(s, inp, 0)
        if g >= 0:
            break
        okey = (s.units[s.owner].team, s.units[s.owner].index) if s.owner >= 0 else None
        out.append((okey, [(u.x, u.y) for u in s.units if u.team == me]))
    return out


def neutral(n):
    return {'inputs': [[{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)] for _ in range(20)]}


def avoid_box(x, y, opp_box):
    gx1, gy1, gx2, gy2 = opp_box
    m = 0.5
    if gy1 - 0.05 < y < gy2 + 0.05:
        if gx1 > 1.0:
            if x > gx1 - m:
                x = gx1 - m
        else:
            if x < gx2 + m:
                x = gx2 + m
    return (clamp(x, R_U + 0.02, W - R_U - 0.02), clamp(y, R_U + 0.02, H - R_U - 0.02))


# ------------------------------------------------------------------ 无球进攻站位
def support_pos(u, GL, sg, opps, bx, by, taken, n_slots=4):
    """无球进攻球员的接应点：相对球的位置铺开（近点/中点/高点），
    每个候选点用「站到这里能不能形成无遮挡射门」「离对手多远」「跑动距离」打分。"""
def support_grid(GL, sg, opps, bx, by):
    """本窗口的无球接应点候选（只算一次，全队共用）：(x, y, 射门价值)。"""
    if SUPX == 0:
        xs = [GL - sg * 9.8, GL - sg * 14.0, GL - sg * 20.0]
    elif SUPX == 1:
        xs = [bx + sg * 7.0, bx + sg * 13.0, bx + sg * 19.0, bx + sg * 25.0]
    else:
        xs = [GL - sg * 9.8, GL - sg * 14.0, GL - sg * 20.0,
              bx + sg * 7.0, bx + sg * 13.0, bx + sg * 19.0]
    out = []
    for x0 in xs:
        x = clamp(x0, R_U + 0.3, W - R_U - 0.3)
        # 不许站位落进对方禁区（会犯规）
        for y in (5.0, 8.0, 11.0, 13.0, 15.0, 18.0, 21.0):
            xx = x
            if 34.0 - 0.6 < xx < 43.0 + 0.6 and 6.0 - 0.6 < y < 20.0 + 0.6:
                xx = min(xx, 33.3) if sg > 0 else max(xx, 10.7)
            s = best_shot((xx, y), GL, opps, react_t=1.0, ty_grid=_TY_FINE, trust=TRUST)
            v = (s[1] + 2.2) if s else 0.0
            out.append((xx, y, v))
    return out


def support_pos(u, grid, taken):
    """从共享候选格里给这名球员挑一个：价值高、跑得近、和队友不挤。"""
    cur = (float(u['x']), float(u['y']))
    best = None
    for (x, y, base) in grid:
        v = base - hyp(x - cur[0], y - cur[1]) * 0.055
        for (px, py) in taken:
            d = hyp(x - px, y - py)
            if d < 7.0:
                v -= (7.0 - d) * 0.45
        if best is None or v > best[0]:
            best = (v, x, y)
    return (best[1], best[2])


def best_kick_dir(O, GL, sg, opps, mates, da=10):
    """被逼抢又传不出去时的出球方向。

    判据直白：**球被对手控制得越晚越好**；如果队友能先拿到，额外加分。
    之前版本要求「必须有队友先接到」才考虑该方向，导致无解时退回固定解围方向、
    直接把球送给身边的对手（复盘里 3 个失球都是这么来的）。"""
    best = None
    for deg in range(0, 360, da):
        bx, by = kick_origin(O, deg)
        if ball_hits_wall(bx, by):
            continue
        f = aim_vec(deg)
        tr = ball_fly(bx, by, f[0] * KICKP, f[1] * KICKP, 40)
        t_opp = 9.9
        t_mate = 9.9
        adv = 0.0
        for k, (x, y, hit, gw) in enumerate(tr):
            if gw >= 0:
                return (deg, 99.0)          # 直接飞进门
            if hit:
                adv = (x - O[0]) * sg
                break
            t = (k + 1) * DT
            adv = (x - O[0]) * sg
            if t_opp > 9.0 and any(hyp(o[0] + o[2] * t * TRUST - x, o[1] + o[3] * t * TRUST - y) <= CTRL
                                   for o in opps):
                t_opp = t
            if t_mate > 9.0 and any(hyp(m[0] - x, m[1] - y) <= MOVE * t + CTRL for m in mates):
                t_mate = t
            if t_opp < 9.0 and t_mate < 9.0:
                break
        sc = min(t_opp, 2.0) * 12.0 + adv * 0.22
        if t_mate < t_opp:
            sc += 8.0
        if best is None or sc > best[0]:
            best = (sc, deg)
    if best is None:
        return (clear_aim(O, GL, sg), None)
    return (best[1], None)


# ------------------------------------------------------------------ 主决策
def decide(obs):
    me = int(obs.get('yourTeam', 0))
    n = int(obs.get('teamSize', 3))
    units = obs.get('units') or []
    my = sorted([u for u in units if int(u['team']) == me], key=lambda u: u['index'])
    opp_u = [u for u in units if int(u['team']) != me]
    if not my:
        return neutral(n)
    ball = obs.get('ball') or {}
    bx = float(ball.get('x', W / 2.0))
    by = float(ball.get('y', H / 2.0))
    bvx = float(ball.get('vx') or 0.0)
    bvy = float(ball.get('vy') or 0.0)

    sg = 1.0 if me == 0 else -1.0
    GL = 43.0 if me == 0 else 1.0
    OL = 1.0 if me == 0 else 43.0
    opp_box = (34.0, 6.0, 43.0, 20.0) if me == 0 else (1.0, 6.0, 10.0, 20.0)

    # 对手位置 + 最近一窗口的平均速度（用于预测他们「已锁定」的移动）
    global _prev_pos, _prev2_pos
    _prev2_pos = _prev_pos
    _prev_pos = {}
    for u in units:
        _prev_pos[(int(u['team']), int(u['index']))] = (float(u['x']), float(u['y']))
    opps = []
    for o in opp_u:
        ox = float(o['x'])
        oy = float(o['y'])
        key = (int(o['team']), int(o['index']))
        pv = _prev2_pos.get(key)
        vx = (ox - pv[0]) / _prev_dt if pv is not None else 0.0
        vy = (oy - pv[1]) / _prev_dt if pv is not None else 0.0
        sp = hyp(vx, vy)
        if sp > MOVE:                      # 只可能来自重新开球/换边，视为静止
            vx = vy = 0.0
        if KEEPMODEL and int(o['index']) == 0:
            # 门将这一窗口的目标几乎总是「本方门线上对准球的那一点」：
            # 把它建模成朝该点满速移动，比用历史速度外推准得多
            gx = 43.0 if int(o['team']) == 1 else 1.0
            ty = clamp(by, 10.85, 15.15)
            dx, dy = gx - ox, ty - oy
            l = hyp(dx, dy)
            if l > 0.05:
                vx, vy = dx / l * MOVE, dy / l * MOVE
        opps.append((ox, oy, vx, vy))
    opps_xy = [(o[0], o[1]) for o in opps]
    opps_vel = dict(((int(o['team']), int(o['index'])), (opps[j][2], opps[j][3]))
                    for j, o in enumerate(opp_u))
    oid = ball.get('owner')
    my_ids = set(u['id'] for u in my)
    carrier = next((u for u in my if u['id'] == oid), None) if oid in my_ids else None
    poss = 'mine' if carrier is not None else ('theirs' if oid else 'loose')

    if n == 1:
        fld = list(my)
    else:
        fld = [u for u in my if u['index'] != 0]

    targets = {}
    actions = {}
    carrier_idx = carrier['index'] if carrier is not None else -1

    def d2b(u):
        return hyp(float(u['x']) - bx, float(u['y']) - by)

    fld_sorted = sorted(fld, key=d2b)

    # ---------------------------------------------------------------- 进攻
    if poss == 'mine':
        O = (float(carrier['x']), float(carrier['y']))
        targets[carrier_idx] = O
        sh = best_shot(O, GL, opps, 1.0, trust=TRUST)
        if DBG:
            dbg('W%4d MINE ball(%.1f,%.1f) o(%.1f,%.1f) shot=%s\n' % (
                obs.get('frame', 0), bx, by, O[0], O[1], ('ty=%.1f m=%.2f' % (sh[2], sh[1])) if sh else 'None'))
        if sh is not None:
            actions[carrier_idx] = (sh[3], 0)
        else:
            mates = [(u['index'], (float(u['x']), float(u['y']))) for u in my
                     if u is not carrier and (n == 1 or u['index'] != 0)]
            opts = pass_options(O, mates, opps, GL, sg) if mates else []
            bestc = next((o for o in opts if o['kind'] == 'combo'), None)
            if DBG:
                dbg('   opts=%s\n' % [(o['kind'], round(o['sc'], 2), o['mate'], o['recv_frame']) for o in opts[:3]])
            near = min([hyp(o[0] - O[0], o[1] - O[1]) for o in opps] or [99.0])
            gd = abs(GL - O[0])
            if bestc is not None:
                actions[carrier_idx] = (bestc['pass_deg'], 0)
                targets[bestc['mate']] = bestc['meet']
                actions[bestc['mate']] = (bestc['shot'][3], bestc['recv_frame'])
            else:
                bp = opts[0] if opts else None
                if bp is not None and near < 2.6:
                    # 被逼抢：把球送给前面的人
                    actions[carrier_idx] = (bp['pass_deg'], 0)
                    targets[bp['mate']] = bp['meet']
                elif gd > 18.0 and near < 4.0:
                    mates_xy = [(float(u['x']), float(u['y'])) for u in my
                                if u is not carrier and (n == 1 or u['index'] != 0)]
                    if (FB >= 2 and n >= 3) or (FB == 1 and mates_xy):
                        deg, _ = best_kick_dir(O, GL, sg, opps, mates_xy)
                        actions[carrier_idx] = (deg, 0)
                    else:
                        actions[carrier_idx] = (clear_aim(O, GL, sg), 0)
                else:
                    ty = clamp(by, 8.0, 18.0)
                    ax = GL - sg * 9.8
                    if abs(O[0] - ax) < 1.8:
                        ax = O[0]
                    targets[carrier_idx] = (ax, ty)
        taken = [O]
        grid = support_grid(GL, sg, opps, bx, by)
        for u in my:
            if u['index'] == carrier_idx:
                continue
            p = support_pos(u, grid, taken)
            taken.append(p)
            targets[u['index']] = p
    # ---------------------------------------------------------------- 防守
    elif poss == 'theirs':
        if DBG:
            dbg('W%4d THEIRS ball(%.1f,%.1f) v(%.1f,%.1f)\n' % (obs.get('frame', 0), bx, by, bvx, bvy))
        for u in fld_sorted:
            targets[u['index']] = (float(u['x']), float(u['y']))
        if fld_sorted:
            p = fld_sorted[0]
            if (PRES or n == 1) and hyp(bvx, bvy) < 1.2:
                # 对手持球：站到球与本方球门连线上 0.45 格，既封死射门角又能直接抢断
                dx, dy = OL - bx, _GC - by
                l = hyp(dx, dy) or 1.0
                targets[p['index']] = (bx + dx / l * 0.45, by + dy / l * 0.45)
            else:
                ip = intercept_point(bx, by, bvx, bvy, float(p['x']), float(p['y']), 26)
                targets[p['index']] = (ip[0], ip[1]) if ip else (bx, by)
        if len(fld_sorted) >= 2:
            p = fld_sorted[1]
            if D2:
                threats = sorted(opp_u, key=lambda o: abs(float(o['x']) - OL))[:1]
                t = threats[0]
                ddx, ddy = OL - float(t['x']), _GC - float(t['y'])
                ll = hyp(ddx, ddy) or 1.0
                targets[p['index']] = (float(t['x']) + ddx / ll * 2.6, float(t['y']) + ddy / ll * 2.6)
            else:
                dx, dy = OL - bx, _GC - by
                l = hyp(dx, dy) or 1.0
                targets[p['index']] = (bx + dx / l * 2.2, by + dy / l * 2.2)
        rest = fld_sorted[2:]
        if rest:
            threats = sorted(opp_u, key=lambda o: abs(float(o['x']) - OL))[:len(rest)]
            for u, t in zip(rest, threats):
                ddx, ddy = OL - float(t['x']), _GC - float(t['y'])
                ll = hyp(ddx, ddy) or 1.0
                targets[u['index']] = (float(t['x']) + ddx / ll * 2.6, float(t['y']) + ddy / ll * 2.6)
    # ---------------------------------------------------------------- 松球
    else:
        rank = []
        for u in fld_sorted:
            ip = intercept_point(bx, by, bvx, bvy, float(u['x']), float(u['y']), 40)
            rank.append((ip[1] if ip else 9999, ip, u))
        rank.sort(key=lambda z: z[0])
        for k, (fr, ip, u) in enumerate(rank):
            if ip is None:
                targets[u['index']] = (bx, by)
            elif k == 0 or (k == 1 and fr <= 14):
                targets[u['index']] = (ip[0], ip[1])
            else:
                targets[u['index']] = (GL - sg * 7.0, clamp(by + (k - 1) * 5.0 - 5.0, 3.0, 23.0))
        if len(fld_sorted) >= 3:
            u = rank[-1][2]
            targets[u['index']] = (OL + sg * 13.0, clamp(by, 4.0, 22.0))

    # ---------------------------------------------------------------- 门将
    if n >= 2:
        k = my[0]
        ky = keeper_y(bx, by, bvx, bvy, OL, sg)
        kp = (float(k['x']), float(k['y']))
        if carrier is not None and carrier['index'] == 0:
            sh = best_shot(kp, GL, opps, 1.0, trust=TRUST)
            actions[0] = (sh[3], 0) if sh is not None else (clear_aim(kp, GL, sg), 0)
            targets[0] = kp
        elif poss == 'loose' and abs(bx - OL) < 9.0 and hyp(bvx, bvy) < 3.0:
            ip = intercept_point(bx, by, bvx, bvy, kp[0], kp[1], 20)
            targets[0] = (ip[0], ip[1]) if ip else (OL + sg * 0.32, ky)
        else:
            targets[0] = (OL + sg * 0.32, ky)

    for u in my:
        if u['index'] not in targets:
            targets[u['index']] = (float(u['x']), float(u['y']))
    for i in list(targets.keys()):
        targets[i] = avoid_box(targets[i][0], targets[i][1], opp_box)

    # ---------- 用 pysim 把计划走一遍：拿到球的那一帧就起脚（不用等下个窗口）----------
    if poss != 'mine' and ONEPASS:
        try:
            okey = None
            if oid:
                ou = next((o for o in opp_u if o['id'] == oid), None)
                if ou is not None:
                    okey = (int(ou['team']), int(ou['index']))
            steps = step_plan(my, opp_u, me, n, targets, actions, opp_box, carrier_idx,
                              opps_vel, (bx, by, bvx, bvy), okey, 20)
            mykeys = set((me, int(u['index'])) for u in my)
            for f, (ok, poslist) in enumerate(steps):
                if ok is None or ok[0] != me:
                    continue
                uidx = ok[1]
                if uidx in actions:
                    continue
                k = f + 1                       # 这一帧的下一帧才允许起脚
                if k > 18:
                    break
                p = poslist[[int(x['index']) for x in my].index(uidx)]
                t_el = k * DT
                pred = [(o[0] + o[2] * t_el, o[1] + o[3] * t_el, o[2], o[3]) for o in opps]
                sh = best_shot(p, GL, pred, react_t=(20 - k) * DT, ty_grid=_TY_FINE, trust=TRUST)
                if sh is not None and sh[1] > 0.05:
                    actions[uidx] = (sh[3], k)
                    if DBG:
                        dbg('   ONEPASS u%d f%d ty=%.1f m=%.2f\n' % (uidx, k, sh[2], sh[1]))
                break
        except Exception as e:
            if DBG:
                dbg('   ONEPASS error %s\n' % e)

    base = build_frames(my, targets, actions, opp_box, carrier_idx)
    if not SEARCH:
        return {'inputs': base}
    try:
        best = search_choice(obs, me, n, my, opp_u, base, targets, opp_box, carrier_idx,
                             GL, OL, sg, opps, TRUST)
        if best is not None:
            return {'inputs': best}
    except Exception as e:
        if DBG:
            import traceback
            traceback.print_exc(file=sys.stderr)
    return {'inputs': base}


# ------------------------------------------------------------------ 26 帧 rollout 搜索
NEUTRAL_INP = ('N', None, False)


def ghost_inp(s, u):
    """对手的「无策略」代理行为：松球去追；持球就朝本方球门带并起脚。
    故意不含任何对手策略假设，只用来估「如果我不动会发生什么」。"""
    if s.owner >= 0 and s.units[s.owner] is u:
        gl = 43.0 if u.team == 0 else 1.0
        ty = 14.6 if u.y > 13.0 else 11.4
        return (dir_for(gl - u.x, 13.0 - u.y), ang_deg(u.x, u.y, gl, ty), u.kickCd <= 0 and u.controlLock <= 0)
    return (dir_for(s.bx - u.x, s.by - u.y), None, False)


def rollout(s0, me, myF, nf=26):
    s = s0.clone()
    gf = ga = 0
    nm = len(myF)
    for f in range(nf):
        inp = []
        for idx, u in enumerate(s.units):
            if u.team == me:
                inp.append(myF[f][u.index] if f < nm else NEUTRAL_INP)
            else:
                inp.append(ghost_inp(s, u))
        g = step(s, inp, 0)
        if g >= 0:
            if g == me:
                gf += 1
            else:
                ga += 1
            break
    return gf, ga, s


def shape_value(s, me, GL, OL, trust):
    sg = 1.0 if me == 0 else -1.0
    v = (s.bx - 22.0) * sg * 0.45
    if s.owner >= 0:
        v += 4.0 if s.units[s.owner].team == me else -4.0
    mine = [(u.x, u.y, 0.0, 0.0) for u in s.units if u.team == me]
    opps = [(u.x, u.y, 0.0, 0.0) for u in s.units if u.team != me]
    sh = best_shot((s.bx, s.by), GL, opps, react_t=0.9, ty_grid=_TY_FINE, trust=trust)
    if sh is not None:
        v += 4.0 + min(sh[1], 3.0)
    osh = best_shot((s.bx, s.by), OL, mine, react_t=0.9, ty_grid=_TY_FINE, trust=trust)
    if osh is not None:
        v -= 6.0 + min(osh[1], 3.0)
    return v


def search_choice(obs, me, n, my, opp_u, base, targets, opp_box, carrier_idx,
                  GL, OL, sg, opps, trust):
    s0 = state_from_obs(obs)
    ci = carrier_idx
    cands = [base]
    if ci >= 0:
        bx = float(my[ci]['x'])
        by = float(my[ci]['y'])
        for ty in (10.7, 11.6, 12.5, 13.4, 14.3, 15.2):
            deg = ang_deg(bx, by, GL, ty)
            c = [list(fr) for fr in base]
            c[0][ci] = {'dir': 'N', 'aim': deg, 'kick': True}
            cands.append(c)
        mates = [(int(u['index']), (float(u['x']), float(u['y']))) for u in my
                 if u['index'] != ci and (n == 1 or u['index'] != 0)]
        try:
            opts = pass_options((bx, by), mates, opps, GL, sg, da_step=10, da_max=40)
        except Exception:
            opts = []
        for o in opts[:4]:
            c = [list(fr) for fr in base]
            c[0][ci] = {'dir': 'N', 'aim': o['pass_deg'], 'kick': True}
            if o.get('shot') is not None and o['recv_frame'] < 20:
                c[o['recv_frame']][o['mate']] = {'dir': 'N', 'aim': o['shot'][3], 'kick': True}
            cands.append(c)
        # 带球方向候选
        for d in ('R', 'L', 'U', 'D', 'UR', 'DR', 'UL', 'DL'):
            v = DIRV[d]
            if (GL - bx) * v[0] + (13.0 - by) * v[1] <= 0 and d not in ('R', 'L', 'U', 'D'):
                continue
            c = [list(fr) for fr in base]
            for f in range(20):
                c[f][ci] = {'dir': d, 'aim': None, 'kick': False}
            cands.append(c)
    # 统一转成 pysim 输入格式
    def conv(frames):
        out = []
        for fr in frames:
            row = []
            for x in fr:
                a = x.get('aim')
                if isinstance(a, (int, float)):
                    a = aim_vec(a)
                elif isinstance(a, str):
                    a = DIRV.get(a)
                else:
                    a = None
                row.append((x.get('dir') or 'N', a, bool(x.get('kick'))))
            out.append(row)
        return out

    best = None
    for c in cands:
        gf, ga, s1 = rollout(s0, me, conv(c), 26)
        v = 100.0 * (gf - ga) + shape_value(s1, me, GL, OL, trust)
        if best is None or v > best[0]:
            best = (v, c)
    return best[1]



def main():
    last_n = 3
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
            last_n = int(obs.get('teamSize', last_n))
            out = decide(obs)
        except Exception as e:
            if DBG:
                import traceback
                traceback.print_exc(file=sys.stderr)
            sys.stderr.write('ERR %s\n' % e)
            out = neutral(last_n)
        sys.stdout.write(json.dumps(out, separators=(',', ':')) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()

