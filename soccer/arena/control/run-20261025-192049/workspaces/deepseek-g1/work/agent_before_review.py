#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""3V3 足球 · deepseek-g1 · 正式提交（单文件）。
pysim.py（simulation.js 的逐帧移植）+ core2.py 合并而成。
修改请改源文件后重新运行 dev4/build2.py。
"""

import sys
import json
import math
import os
import time


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
    """Red card: the offender is removed; play restarts from the centre spot."""
    try:
        s.units.remove(u)
    except ValueError:
        pass
    left = sum(1 for x in s.units if x.team == u.team)
    if left == 0:
        s.status = 'finished'
        s.freeze = 0
        return
    kickoff(s, 1 - u.team)


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




import math

DBG = bool(os.environ.get('SOC2_DEBUG'))
_LOG = os.environ.get('SOC2_LOG')


def _log(o):
    if _LOG:
        try:
            with open(_LOG, 'a', encoding='utf-8') as fh:
                fh.write(json.dumps(o, ensure_ascii=False) + chr(10))
        except Exception:
            pass

FIELD_W = 44.0
FIELD_H = 26.0
MY_GOAL_X = {0: 1.0, 1: 43.0}
OPP_GOAL_X = {0: 43.0, 1: 1.0}
ATK = {0: 1.0, 1: -1.0}
PBOX2 = {0: (1.0, 6.0, 10.0, 20.0), 1: (34.0, 6.0, 43.0, 20.0)}

MOUTH_LO = 10.5
MOUTH_HI = 15.5
KICK_OFF = 0.59   # 引擎 kickBall: unitRadius+ballRadius+0.03
CR = 0.82
SPD = 3.15
KEEPER_MAX_K = float(os.environ.get('SOC2_KMAX', '11.0'))
KEEPER_MAX_K_SMALL = float(os.environ.get('SOC2_KMAXS', '8.6'))
KEEPER_KF = float(os.environ.get('SOC2_KF', '0.70'))
KLEAD = float(os.environ.get('SOC2_KLEAD', '0.0'))
SPEED_CLEAR = float(os.environ.get('SOC2_CLEARF', '0.0'))
GAME_CTX = {'desp': False}
WALLN = int(os.environ.get('SOC2_WALLN', '2'))
SMALLW = int(os.environ.get('SOC2_SMALLW', '2'))
SMALLP = int(os.environ.get('SOC2_SMALLP', '2'))
WALLOFF = float(os.environ.get('SOC2_WALLOFF', '1.7'))
GK_RUSH = int(os.environ.get('SOC2_GKRUSH', '0'))
SHOT_TH = float(os.environ.get('SOC2_SHOTTH', '0.05'))
KREACT = float(os.environ.get('SOC2_KREACT', '0.55'))
KICK_MIN = float(os.environ.get('SOC2_KICKMIN', '0.8'))
# 硬性禁区安全边距：任何球员中心都必须离对方禁区至少这么远。
# 规则是「进入对方禁区 = 红牌罚下」，因此这里宁可保守。
BOX_SAFE = float(os.environ.get('SOC2_BOXSAFE', '1.25'))

SHOT_TARGETS = [10.72 + 0.145 * i for i in range(30)]   # 10.72 .. 14.93


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


def hyp(a, b):
    return math.hypot(a, b)


def unit_vec(x, y):
    l = math.hypot(x, y)
    if l < 1e-9:
        return 1.0, 0.0
    return x / l, y / l


DIR_ANGLE = {'R': 0.0, 'DR': 45.0, 'D': 90.0, 'DL': 135.0,
             'L': 180.0, 'UL': 225.0, 'U': 270.0, 'UR': 315.0}
DIR_VEC = {k: (math.cos(math.radians(v)), math.sin(math.radians(v)))
           for k, v in DIR_ANGLE.items()}
DIR_VEC['N'] = (0.0, 0.0)
DIR8 = ('R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR')


def in_box(team, x, y):
    b = PBOX2[team]
    return b[0] <= x <= b[2] and b[1] <= y <= b[3]


def opp_box_of(my_team):
    return PBOX2[1 - my_team]


def near_opp_box(my_team, x, y, margin=None):
    """是否落在「对方禁区 + 安全边距」内。禁区内犯规即红牌，必须提前绕开。"""
    m = BOX_SAFE if margin is None else margin
    b = opp_box_of(my_team)
    return (b[0] - m <= x <= b[2] + m) and (b[1] - m <= y <= b[3] + m)


def safe_spot(my_team, x, y, margin=0.55):
    """把目标点推出对方禁区（至少留 BOX_SAFE 的安全边距）。"""
    b = opp_box_of(my_team)
    margin = max(margin, BOX_SAFE)
    x = clamp(x, 0.45, FIELD_W - 0.45)
    y = clamp(y, 0.45, FIELD_H - 0.45)
    if not near_opp_box(my_team, x, y, margin):
        return x, y
    cands = []
    cands.append((b[0] - margin, y, abs(x - (b[0] - margin))))
    cands.append((b[2] + margin, y, abs(x - (b[2] + margin))))
    cands.append((x, b[1] - margin, abs(y - (b[1] - margin))))
    cands.append((x, b[3] + margin, abs(y - (b[3] + margin))))
    for i, c in enumerate(cands):
        if c[0] < 0.45 or c[0] > FIELD_W - 0.45 or c[1] < 0.45 or c[1] > FIELD_H - 0.45:
            cands[i] = (c[0], c[1], c[2] + 100.0)
    cands.sort(key=lambda c: c[2])
    nx, ny = cands[0][0], cands[0][1]
    return clamp(nx, 0.45, FIELD_W - 0.45), clamp(ny, 0.45, FIELD_H - 0.45)


# ---------------------------------------------------------------- 球路
_FF_C = 0.022 / 0.55


def frames_for(dist):
    """闭式解：sum_{k=0..n-1} 0.55*0.978^k >= dist。"""
    if dist <= 0:
        return 0
    r = 1.0 - dist * _FF_C
    if r <= 1e-6:
        return 400
    return int(math.ceil(math.log(r) / math.log(FRIC)))


def shot_eval(bx, by, tx, ty, opps, keeper=None, kick_frame=0):
    """评估一脚射门。返回 (ok, quality, n_arrive)。"""
    D = hyp(tx - bx, ty - by)
    if D < 1.0:
        return False, -1e9, 0
    ux, uy = (tx - bx) / D, (ty - by) / D
    n_arr = frames_for(D)
    clear = 1e9
    for o in opps:
        dx, dy = o.x - bx, o.y - by
        proj = dx * ux + dy * uy
        if proj < -0.4 or proj > D + 1.2:
            continue
        perp = abs(dx * uy - dy * ux)
        c = perp - CR
        if c < clear:
            clear = c
    # 对手会在飞行途中向球路移动：长球的通道要求更高
    need_clear = 0.10 + SPEED_CLEAR * (n_arr / 20.0)
    if clear < need_clear:
        return False, clear - need_clear, n_arr
    gap = 1e9
    if keeper is not None:
        react = max(0.0, n_arr - (20 - kick_frame))
        gap_need = CR + SPD * react / 20.0 * KREACT
        gap = abs(ty - keeper.y)
        if gap < gap_need:
            return False, gap - gap_need, n_arr
        clear = min(clear, gap - gap_need)
    return True, clear + max(0.0, 16.0 - D) * 0.015, n_arr


def pick_keeper(opps, my_team):
    gx = OPP_GOAL_X[my_team]
    best, bd = None, 1e9
    for o in opps:
        if o.index == 0:
            return o
    for o in opps:
        d = hyp(o.x - gx, o.y - 13.0)
        if d < bd:
            bd, best = d, o
    return best


def best_shot_at(bx, by, opps, my_team, kick_frame=0):
    """射门评估：球的出脚点 = 球员中心 + 0.69*朝向，与中心同向，故用中心即可。"""
    gx = OPP_GOAL_X[my_team]
    keeper = pick_keeper(opps, my_team)
    best = None
    for ty in SHOT_TARGETS:
        ok, q, n_arr = shot_eval(bx, by, gx, ty, opps, keeper, kick_frame)
        if not ok:
            continue
        if best is None or q > best[1]:
            best = (True, q, math.degrees(math.atan2(ty - by, gx - bx)) % 360.0, ty, n_arr)
    return best


def shot_potential(x, y, opps, my_team):
    """从 (x,y) 射门的最大质量（不要求真的起脚，用于选位）。"""
    gx = OPP_GOAL_X[my_team]
    keeper = pick_keeper(opps, my_team)
    best = 0.0
    for ty in SHOT_TARGETS[::3]:
        ok, q, n_arr = shot_eval(x, y, gx, ty, opps, keeper, 0)
        if ok and q > best:
            best = q
    return best


def kick_point(u):
    fx, fy = unit_vec(u.fx, u.fy)
    return u.x + fx * KICK_OFF, u.y + fy * KICK_OFF


# ---------------------------------------------------------------- 球预测
def ball_future(st, frames):
    x, y = st.bx, st.by
    vx, vy = st.bvx, st.bvy
    out = []
    for _ in range(frames):
        for _s in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if MOUTH_LO <= y <= MOUTH_HI and (x <= 1.0 or x >= FIELD_W - 1.0):
                out.append((x, y))
                return out
            hit = False
            if x - R_B < 1.0 and not (MOUTH_LO <= y <= MOUTH_HI):
                x = 1.0 + R_B
                vx = -vx * WALLR
                hit = True
            elif x + R_B > FIELD_W - 1.0 and not (MOUTH_LO <= y <= MOUTH_HI):
                x = FIELD_W - 1.0 - R_B
                vx = -vx * WALLR
                hit = True
            if y - R_B < 1.0:
                y = 1.0 + R_B
                vy = -vy * WALLR
                hit = True
            elif y + R_B > FIELD_H - 1.0:
                y = FIELD_H - 1.0 - R_B
                vy = -vy * WALLR
                hit = True
        vx *= FRIC
        vy *= FRIC
        if math.hypot(vx, vy) < 0.02:
            vx = vy = 0.0
        out.append((x, y))
    return out


def intercept_time(u, path, maxf=60):
    for k, (px, py) in enumerate(path[:maxf]):
        t = (k + 1) / HZ
        if hyp(px - u.x, py - u.y) <= CR + SPD * t:
            return k + 1
    return 999


class Cmd(object):
    __slots__ = ('dir', 'aim', 'kick')

    def __init__(self, d='N', aim=None, kick=False):
        self.dir = d
        self.aim = aim
        self.kick = kick


def move_dir(u, tx, ty, my_team, forbid_box=True):
    dx, dy = tx - u.x, ty - u.y
    d = hyp(dx, dy)
    if d < 0.12:
        return 'N'
    ux, uy = dx / d, dy / d
    best, bestv = 'N', -2.0
    for name in DIR8:
        vx, vy = DIR_VEC[name]
        v = vx * ux + vy * uy
        if forbid_box:
            # 硬性禁止：短前瞻内进入「对方禁区 + 安全边距」的方向直接淘汰。
            bad = False
            for k in (1.0, 2.0, 3.0):
                nx = u.x + vx * SPD * DT * k
                ny = u.y + vy * SPD * DT * k
                if near_opp_box(my_team, nx, ny):
                    bad = True
                    break
            if bad:
                v = -100.0
        if v > bestv:
            bestv, best = v, name
    return best


def sim_pos(x, y, dname, frames, speed, my_team):
    vx, vy = DIR_VEC[dname]
    for _ in range(frames):
        nx, ny = x + vx * speed * DT, y + vy * speed * DT
        nx = clamp(nx, R_U, FIELD_W - R_U)
        ny = clamp(ny, R_U, FIELD_H - R_U)
        if near_opp_box(my_team, nx, ny):
            if not near_opp_box(my_team, nx, y):
                x = nx
            elif not near_opp_box(my_team, x, ny):
                y = ny
        else:
            x, y = nx, ny
    return x, y


# ---------------------------------------------------------------- 门将
def keeper_target(st, my_team, ball_x, ball_y):
    """清道夫门将：球-球门中心连线上，k = 0.70*D。

    dev4/exp_keeper.js 实测：k=0.70D 时 D<=21 的射门全部 0/25 被封；
    k 太浅（<0.5D）会有 14~16/25 个落点能进。门将离开禁区线是合法的：
    禁区限制只针对「对方禁区」。
    """
    gx = MY_GOAL_X[my_team]
    cx, cy = gx, 13.0
    # 用球的短时预测位置，减少跟不上的滞后
    bx, by = ball_x, ball_y
    sp = math.hypot(st.bvx, st.bvy)
    if sp > 1.0:
        bx += st.bvx * KLEAD
        by += st.bvy * KLEAD
    dx, dy = bx - cx, by - cy
    D = math.hypot(dx, dy) or 0.01
    kmax = KEEPER_MAX_K if st.n >= 4 else KEEPER_MAX_K_SMALL
    k = clamp(KEEPER_KF * D, 1.2, kmax)
    ux, uy = dx / D, dy / D
    x = cx + ux * k
    y = cy + uy * k
    x = clamp(x, 0.6, FIELD_W - 0.6)
    y = clamp(y, 1.2, FIELD_H - 1.2)
    return x, y


# ---------------------------------------------------------------- 角色

def lane_clear(bx, by, px, py, opps, ignore=None):
    """从 (bx,by) 到 (px,py) 的直线通道净空（最小垂距 - 控球半径）。"""
    dx, dy = px - bx, py - by
    D = math.hypot(dx, dy)
    if D < 1e-6:
        return 9.0
    ux, uy = dx / D, dy / D
    best = 9.0
    for o in opps:
        if o is ignore:
            continue
        ex, ey = o.x - bx, o.y - by
        proj = ex * ux + ey * uy
        if proj < -0.3 or proj > D + 0.6:
            continue
        perp = abs(ex * uy - ey * ux)
        if perp - CR < best:
            best = perp - CR
    return best


def striker_spot(st, me, opp, bx, by, slot, taken):
    """给射手挑一个「能接球 + 能射门」的站位。"""
    gx = OPP_GOAL_X[me]
    atk = ATK[me]
    cands = []
    # 射门区：禁区外中弧 + 上下两个角
    for k in (10.5, 12.0, 13.5):
        for yy in (7.0, 10.0, 13.0, 16.0, 19.0):
            cands.append((gx - atk * k, yy))
    for k in (4.5, 6.5, 8.5):
        for yy in (3.5, 5.2, 20.8, 22.5):
            cands.append((gx - atk * k, yy))
    best = None
    for (x, y) in cands:
        x, y = safe_spot(me, x, y, 1.0)
        # 与队友不要挤
        crowd = 0.0
        for (ax, ay) in taken:
            d = hyp(ax - x, ay - y)
            if d < 4.0:
                crowd += (4.0 - d)
        lane = lane_clear(bx, by, x, y, opp)
        if lane < 0.05:
            continue
        pot = shot_potential(x, y, opp, me)
        od = min([hyp(o.x - x, o.y - y) for o in opp] or [9.0])
        D = hyp(x - bx, y - by)
        if D > 24.0:
            continue
        sc = pot * 3.5 + min(lane, 3.0) * 0.7 + min(od, 3.0) * 0.5 - crowd * 0.6 - D * 0.03
        if best is None or sc > best[0]:
            best = (sc, x, y)
    if best is None:
        return safe_spot(me, gx - atk * 11.5, 13.0, 1.0)
    return best[1], best[2]

def back_spot(st, me, depth, yoff):
    """防守站位：本方球门中心 -> 球 的连线上，距门中心 depth 格，y 方向偏 yoff。"""
    ogx = MY_GOAL_X[me]
    cx, cy = ogx, 13.0
    bx, by = st.bx, st.by
    dx, dy = bx - cx, by - cy
    D = math.hypot(dx, dy) or 0.01
    ux, uy = dx / D, dy / D
    depth = clamp(depth, 2.0, 26.0)
    x = cx + ux * depth
    y = cy + uy * depth + yoff
    return x, clamp(y, 1.2, FIELD_H - 1.2)


def wall_spot(st, me, k, yoff):
    """球门墙：在「球 -> 本方球门中心」连线上距门中心 k 格，垂直偏移 yoff。

    几何依据：射手距门 D、墙深 k 时，球门张角在墙处的半宽 = 2.5*(1-k/D)。
    k=8 时对 D<=12 的射手几乎全覆盖；两名球员 ±2.2 偏移可覆盖更远的射门。
    墙在本方禁区内，对手进不来，所以不会被绕过。
    """
    ogx = MY_GOAL_X[me]
    cx, cy = ogx, 13.0
    bx, by = st.bx, st.by
    dx, dy = bx - cx, by - cy
    D = math.hypot(dx, dy) or 0.01
    ux, uy = dx / D, dy / D
    k = clamp(k, 1.2, 9.4)
    x = cx + ux * k - uy * yoff
    y = cy + uy * k + ux * yoff
    # 留在本方禁区附近，别跑到场外
    x = clamp(x, 0.7, FIELD_W - 0.7)
    y = clamp(y, 0.7, FIELD_H - 0.7)
    return x, y




def corner_spot(st, me, opp, bx, by, idx):
    """前场支点：优先对方球门两个「死角区」（禁区外侧的 y<6 / y>20 走廊），
    那里门将够不着、对手又常常被球吸引走。"""
    gx = OPP_GOAL_X[me]
    atk = ATK[me]
    cands = [
        (gx - atk * 0.9, 5.0),
        (gx - atk * 0.9, 21.0),
        (gx - atk * 2.6, 4.6),
        (gx - atk * 2.6, 21.4),
        (gx - atk * 4.5, 4.5),
        (gx - atk * 4.5, 21.5),
        (gx - atk * 7.0, 4.0),
        (gx - atk * 7.0, 22.0),
        (gx - atk * 11.5, 13.0),
        (gx - atk * 11.5, 8.5),
        (gx - atk * 11.5, 17.5),
    ]
    best = None
    for (x, y) in cands:
        x, y = safe_spot(me, x, y, 0.9)
        lane = lane_clear(bx, by, x, y, opp)
        pot = shot_potential(x, y, opp, me)
        od = min([hyp(o.x - x, o.y - y) for o in opp] or [9.0])
        sc = lane * 1.6 + pot * 2.2 + min(od, 3.0) * 0.3
        if best is None or sc > best[0]:
            best = (sc, x, y)
    return best[1], best[2]

def support_spots(st, me, opp, want, dists=(5.0, 8.0, 12.0, 16.0, 20.0)):
    """在球周围找「通道干净 + 朝对方球门有推进」的接应点（短传为主）。"""
    bx, by = st.bx, st.by
    gx = OPP_GOAL_X[me]
    cands = []
    for ai in range(0, 18):
        ang = math.radians(ai * 20.0)
        ux, uy = math.cos(ang), math.sin(ang)
        for dist in dists:
            x, y = bx + ux * dist, by + uy * dist
            if not (1.2 <= x <= FIELD_W - 1.2 and 1.2 <= y <= FIELD_H - 1.2):
                continue
            if in_box(1 - me, x, y):
                x, y = safe_spot(me, x, y, 0.9)
            lane = lane_clear(bx, by, x, y, opp)
            if lane < 0.15:
                continue
            prog = (x - bx) * ATK[me]
            od = min([hyp(o.x - x, o.y - y) for o in opp] or [9.0])
            pot = shot_potential(x, y, opp, me) if prog > 6 else 0.0
            sc = (min(lane, 2.5) * 1.3 + prog * 0.22 + min(od, 3.0) * 0.28
                  - dist * 0.03 + pot * 1.6)
            cands.append((sc, x, y))
    cands.sort(key=lambda c: -c[0])
    out = []
    for sc, x, y in cands:
        if all(hyp(x - a, y - b) > 4.5 for a, b in out):
            out.append((x, y))
        if len(out) >= want:
            break
    return out


GAME_CTX = {'desp': False}
DESP_T = float(os.environ.get('SOC2_DESPT', '50'))


def plan_roles(st, me):
    """按 index 固定角色：0 门将，1..n_str 射手（常驻对方半场），其余后卫。

    角色固定是关键——之前按「离球门最近」动态选射手，导致射手每帧换人、
    永远跑不到接应点。
    """
    n = st.n
    my = [u for u in st.units if u.team == me]
    opp = [u for u in st.units if u.team != me]
    owner = st.units[st.owner] if st.owner >= 0 else None
    bx, by = st.bx, st.by
    roles = {}
    ogx = MY_GOAL_X[me]
    D = hyp(bx - ogx, by - 13.0)
    gx = OPP_GOAL_X[me]

    if n == 1:
        roles[0] = ('solo', None)
        return roles, my, opp, owner

    ci = owner.index if (owner is not None and owner.team == me) else None

    # 门将
    k = my[0]
    if ci == 0:
        roles[0] = ('carrier', None)
    elif (ci is not None and len([u for u in my if u.index != 0]) <= 3
          and (bx - ogx) * ATK[me] > 18.0 and GK_RUSH):
        # 小队伍我方在对方半场控球：门将也压上当额外接应（空门风险换来人数优势）
        roles[0] = ('striker', corner_spot(st, me, opp, bx, by, 9))
    else:
        nearest = min(my, key=lambda u: hyp(u.x - bx, u.y - by))
        loose_in_box = (owner is None and in_box(me, bx, by) and
                        hyp(st.bvx, st.bvy) < 5.0)
        if loose_in_box and nearest.index == 0:
            roles[0] = ('chase', None)
        elif (owner is not None and owner.team != me and
              in_box(me, bx, by) and hyp(bx - k.x, by - k.y) < 4.2):
            roles[0] = ('press', owner.index)
        else:
            roles[0] = ('keep', None)

    if ci is not None and ci != 0:
        roles[ci] = ('carrier', None)

    fielders = [u for u in my if u.index != 0]
    if not fielders:
        return roles, my, opp, owner

    if len(fielders) == 1:
        u = fielders[0]
        if u.index == ci:
            roles[u.index] = ('carrier', None)
        elif ci == 0:
            tx = clamp(k.x + ATK[me] * 17.0, 2.0, FIELD_W - 2.0)
            ty = clamp(13.0 + (by - 13.0) * 0.5, 3.0, FIELD_H - 3.0)
            roles[u.index] = ('striker', (tx, ty))
        else:
            roles[u.index] = ('chase', None)
        return roles, my, opp, owner

    n_str = 1 if len(fielders) <= 2 else 2
    str_ids = set(u.index for u in fielders[:n_str])
    back_ids = [u.index for u in fielders[n_str:]]

    # 球离本方球门多远（沿进攻方向的纵深）
    depth_ball = (bx - ogx) * ATK[me]
    nf = len(fielders)

    # 1) 追球/逼抢：球在中前场时派一人
    presser = None
    if ci is None and nf >= SMALLP and depth_ball > 2.0:
        presser = min(fielders, key=lambda u: hyp(u.x - bx, u.y - by))
        if owner is not None and owner.team != me:
            roles[presser.index] = ('press', owner.index)
        else:
            roles[presser.index] = ('chase', None)

    rest = [u for u in fielders if u.index != ci and
            (presser is None or u.index != presser.index)]

    # 2) 门墙：站在本方禁区内、球-球门中心连线上，横向错开覆盖射门扇面
    #    禁区内对手不能进入，所以墙不会被绕后。
    if nf == 1:
        n_wall = 0
    elif GAME_CTX['desp'] and nf >= 3:
        n_wall = 0
    elif ci is not None and nf <= 3:
        n_wall = max(0, min(len(rest) - 1, 1))   # 小队伍我方控球：至少留一个接应点                           # 平/落后且时间不多：全压上
    elif depth_ball < 16.0:
        n_wall = min(len(rest), WALLN if nf >= 5 else (SMALLW if nf == 3 else 2))
    else:
        n_wall = min(len(rest), 1 if depth_ball > 24.0 else 2)
    kw = clamp(0.72 * D, 3.0, 8.6)
    offs = (WALLOFF, -WALLOFF, 2*WALLOFF, -2*WALLOFF)
    for idx, u in enumerate(rest[:n_wall]):
        roles[u.index] = ('wall', (kw, offs[min(idx, 3)]))
    rest = rest[n_wall:]

    # 3) 其余人前场支点（角区/弧顶），常驻不来回跑
    if rest:
        if depth_ball > 2.0:
            for i2, u in enumerate(rest):
                if i2 < 2:
                    if nf <= 2:
                        ss = support_spots(st, me, opp, 1, dists=(5.0, 8.0, 11.0))
                        roles[u.index] = ('striker', ss[0] if ss else corner_spot(st, me, opp, bx, by, i2))
                    else:
                        roles[u.index] = ('striker', corner_spot(st, me, opp, bx, by, i2))
                else:
                    spots = support_spots(st, me, opp, 1)
                    if spots:
                        roles[u.index] = ('striker', spots[0])
                    else:
                        roles[u.index] = ('wall', (kw, offs[min(i2, 3)]))
        else:
            for i2, u in enumerate(rest):
                roles[u.index] = ('wall', (kw, offs[min(i2, 3)]))

    for u in fielders:
        if u.index not in roles:
            roles[u.index] = ('balance', None)

    # 4) 无主球在脚边：任何角色都必须去捡（引擎里静止球不会自己滚过来）
    if owner is None and depth_ball > 8.0:
        best = None
        for u in fielders:
            if roles.get(u.index, ('',))[0] == 'wall':
                continue          # 墙不能离位
            d = hyp(u.x - bx, u.y - by)
            if d < 3.6 and (best is None or d < best[0]):
                best = (d, u)
        if best is not None:
            roles[best[1].index] = ('chase', None)
    return roles, my, opp, owner


def outlet_spot(st, u, me, opp):
    gx = OPP_GOAL_X[me]
    bx, by = st.bx, st.by
    tx = bx + ATK[me] * 11.5
    ty = by + (13.0 - by) * 0.5
    # 别挤在球正前方：按 index 左右分开
    ty += (u.index % 2) * 4.0 - 2.0
    tx = clamp(tx, 4.0, FIELD_W - 4.0)
    tx, ty = safe_spot(me, tx, ty, 0.9)
    return tx, clamp(ty, 2.0, FIELD_H - 2.0)


def predict_pos(x, y, tx, ty, frames, speed):
    """假设球员以 speed 朝 (tx,ty) 直线跑，预测 frames 帧后的位置。"""
    for _ in range(frames):
        dx, dy = tx - x, ty - y
        d = math.hypot(dx, dy)
        if d < 0.05:
            break
        step = speed * DT
        if step >= d:
            x, y = tx, ty
            break
        x += dx / d * step
        y += dy / d * step
    return x, y


def line_hit(bx, by, ux, uy, players, maxd=26.0, skip=None):
    """球从 (bx,by) 沿 (ux,uy) 飞出，返回 (frame, player) 第一个进入 0.82 的人。"""
    d = 0.0
    v = KICKP
    for f in range(1, 130):
        d += v * DT
        v *= FRIC
        if d > maxd:
            break
        px, py = bx + ux * d, by + uy * d
        if px < R_B or px > FIELD_W - R_B or py < R_B or py > FIELD_H - R_B:
            break
        for p in players:
            if p is skip:
                continue
            if math.hypot(p.x - px, p.y - py) <= CR:
                return f, p
    return None, None


def best_pass(st, u, opp, mates, me, mate_targets):
    """找一条能安全送到队友脚下的传球线路。"""
    gx = OPP_GOAL_X[me]
    best = None
    bx, by = u.x, u.y
    press = min([hyp(o.x - bx, o.y - by) for o in opp] or [9.0])
    for m in mates:
        if m.index == u.index:
            continue
        tgt = mate_targets.get(m.index)
        for lead in (0, 6, 12):
            if tgt:
                px, py = predict_pos(m.x, m.y, tgt[0], tgt[1], lead, SPD)
            else:
                px, py = m.x, m.y
            dx, dy = px - bx, py - by
            D = math.hypot(dx, dy)
            if D < 3.0 or D > 24.0:
                continue
            ux, uy = dx / D, dy / D
            f, hit = line_hit(bx, by, ux, uy, st.units, maxd=D + 2.0, skip=u)
            if hit is None or hit is not m:
                # 路上没人 / 被更远的人截住，但至少要保证到队友之前没人
                if hit is not None and hit.team == me:
                    pass
                else:
                    continue
            # 队友周围有没有对手
            od = min([math.hypot(o.x - px, o.y - py) for o in opp] or [9.0])
            if od < 0.95:
                continue
            pot = shot_potential(px, py, opp, me)
            prog = (px - bx) * ATK[me]
            if m.index == 0:
                # reset to the unmarked keeper only under pressure
                if press > 1.55:
                    continue
                sc = 2.1 - D * 0.005
            else:
                if prog < 2.0 and pot < 0.15:
                    continue
                sc = 1.5 + pot * 3.0 + prog * 0.18 + min(od, 3.0) * 0.3 - D * 0.02
            if best is None or sc > best[0]:
                best = (sc, math.degrees(math.atan2(dy, dx)) % 360.0, m.index, px, py, D)
    return best


def eval_kick(st, u, ang, opp, mates, me, mate_targets):
    """评估一脚朝 ang 度踢出的球：先看路上会不会被人截下，再看会不会直接进。"""
    a = math.radians(ang % 360.0)
    ux, uy = math.cos(a), math.sin(a)
    bx = u.x + ux * KICK_OFF
    by = u.y + uy * KICK_OFF
    gx = OPP_GOAL_X[me]
    mates_ix = set(m.index for m in mates)
    d = 0.0
    v = KICKP
    px, py = bx, by
    for _n in range(80):
        d += v * DT
        v *= FRIC
        px = bx + ux * d
        py = by + uy * d
        # 先查拦截（身体挡在前面就不算进球）
        hit = None
        hd = 9.0
        for p in st.units:
            if p is u:
                continue
            dd = math.hypot(p.x - px, p.y - py)
            if dd <= CR and dd < hd:
                hd = dd
                hit = p
        if hit is not None:
            if hit.team == me and hit.index in mates_ix:
                rx, ry = px, py
                prog = (rx - u.x) * ATK[me]
                pot = shot_potential(rx, ry, opp, me)
                od = min([math.hypot(o.x - rx, o.y - ry) for o in opp] or [9.0])
                sc = 1.2 + pot * 3.0 + prog * 0.16 + min(od, 3.0) * 0.25
                if in_box(1 - me, rx, ry):
                    sc -= 1.0
                if prog < 2.0:
                    sc -= 2.6
                return sc
            if hit.team != me:
                return -2.5 - (1.0 if in_box(1 - me, px, py) else 0.0)
            return 0.5
        # 再看进球
        if MOUTH_LO <= py <= MOUTH_HI:
            if (gx > 20 and px >= gx) or (gx < 20 and px <= gx):
                return 100.0 + min(v, 11.0) * 0.1
        if px < R_B or px > FIELD_W - R_B or py < R_B or py > FIELD_H - R_B:
            break
    stopx, stopy = px, py
    if in_box(1 - me, stopx, stopy):
        return -1.0
    myd = min([math.hypot(m.x - stopx, m.y - stopy) for m in st.units
               if m.team == me and m is not u] or [30.0])
    opd = min([math.hypot(o.x - stopx, o.y - stopy) for o in opp] or [30.0])
    prog = (stopx - u.x) * ATK[me]
    sc = prog * 0.12 + (opd - myd) * 0.25 - 0.2
    if myd > 6.0 and opd > 6.0:
        sc -= 0.8
    if prog < 0:
        sc -= 1.4
    return sc


def fly_path(bx, by, ang, maxf=140):
    a = math.radians(ang)
    vx, vy = KICKP * math.cos(a), KICKP * math.sin(a)
    x, y = bx, by
    path = []
    for f in range(maxf):
        for _ in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if in_goal_mouth(x, y):
                if x <= 1.0:
                    return path, f + 1, 1
                if x >= W - 1.0:
                    return path, f + 1, 0
            if ball_hits_wall(x, y):
                px, py = x - vx * DT / 4.0, y - vy * DT / 4.0
                if ball_hits_wall(x, py):
                    x = px
                    vx = -vx * WALLR
                if ball_hits_wall(px, y):
                    y = py
                    vy = -vy * WALLR
                if ball_hits_wall(x, y):
                    x, y = px, py
                    vx = -vx * WALLR
                    vy = -vy * WALLR
        vx *= FRIC
        vy *= FRIC
        if abs(vx) + abs(vy) < 0.02:
            vx = vy = 0.0
        path.append((x, y))
        if vx == 0.0 and vy == 0.0:
            break
    return path, None, -1


RECV = {'idx': None, 'pos': None, 'frame': -999}
T0 = {'t': time.time()}


def budget_left(sec=2.0):
    return (time.time() - T0['t']) < sec


def best_through_pass(st, u, opp, mates, me):
    best = None
    gx = OPP_GOAL_X[me]
    for ai in range(0, 60):
        if ai % 5 == 0 and not budget_left(1.6):
            break
        ang = (ai * 6.0) % 360.0
        a = math.radians(ang)
        ox = u.x + math.cos(a) * KICK_OFF
        oy = u.y + math.sin(a) * KICK_OFF
        if ball_hits_wall(ox, oy):
            ox, oy = u.x, u.y
        path, gf, gt = fly_path(ox, oy, ang)
        if gf is not None:
            if gt == me:
                # 几何上能到球门 ≠ 真能进球：必须再过一遍 shot_eval，
                # 检查路径上的对手与门将。旧版直接返回 500 分，导致团队局
                # 持球人一有机会就朝人墙/门将直射，球权立刻丢失。
                gy = path[-1][1] if path else 13.0
                ok, q, _ = shot_eval(ox, oy, gx, gy, opp, pick_keeper(opp, me), 0)
                if ok and q > SHOT_TH:
                    return (500.0, ang, -1, None)   # -1 = 射门，不是传给 0 号门将
            continue
        if not path:
            continue
        opp_f = None
        mate_f = None
        mate = None
        lim = min(len(path), 60)
        for f in range(lim):
            bx, by = path[f]
            t = (f + 1) / float(HZ)
            if opp_f is None:
                for o in opp:
                    if hyp(o.x - bx, o.y - by) <= CR + SPD * t:
                        opp_f = f
                        break
            if mate_f is None:
                for m in mates:
                    if hyp(m.x - bx, m.y - by) <= CR + SPD * t:
                        mate_f = f
                        mate = m
                        break
            if opp_f is not None and mate_f is not None:
                break
        if mate_f is None:
            continue
        if opp_f is not None and opp_f <= mate_f:
            continue
        bx, by = path[mate_f]
        prog = (bx - u.x) * ATK[me]
        if prog < 4.0:
            continue
        if in_box(1 - me, bx, by):
            continue
        sc = 6.0 + prog * 0.32 + (40 - mate_f) * 0.05
        sc += (30.0 - hyp(gx - bx, 13.0 - by)) * 0.03
        if best is None or sc > best[0]:
            best = (sc, ang, mate.index, (bx, by))
    return best


def carrier_cmd(st, u, opp, me, mates=None, mate_targets=None):
    cmd = Cmd()
    bx, by = st.bx, st.by
    gx = OPP_GOAL_X[me]
    can_kick = (u.kickCd <= 0 and u.controlLock <= 0)
    mates = mates or []
    mate_targets = mate_targets or {}

    if can_kick:
        cands = []
        sh = best_shot_at(u.x, u.y, opp, me)
        dgoal = hyp(gx - u.x, 13.0 - u.y)
        kp = pick_keeper(opp, me)
        keeper_out = False
        if kp is not None:
            keeper_out = hyp(kp.x - gx, kp.y - 13.0) > 4.2
        if sh is not None and sh[1] > SHOT_TH and (dgoal < 14.5 or keeper_out):
            cands.append((60.0 + sh[1], sh[2]))
        ps = best_pass(st, u, opp, mates, me, mate_targets) if mates else None
        if ps is not None:
            cands.append((ps[0], ps[1]))
        bestk = None
        for ang in range(0, 360, 15):
            sc = eval_kick(st, u, ang, opp, mates, me, mate_targets)
            if bestk is None or sc > bestk[0]:
                bestk = (sc, float(ang))
        if bestk is not None:
            cands.append(bestk)
        tp_sel = None
        if mates:
            tp = best_through_pass(st, u, opp, mates, me)
            if tp is not None:
                cands.append((tp[0], tp[1]))
                tp_sel = tp
        cands.sort(reverse=True)
        if cands and cands[0][0] >= KICK_MIN:
            if (tp_sel is not None and tp_sel[2] is not None and tp_sel[2] >= 0
                    and abs((cands[0][1] - tp_sel[1] + 180.0) % 360.0 - 180.0) < 0.01):
                RECV['idx'] = tp_sel[2]
                RECV['pos'] = tp_sel[3]
                RECV['frame'] = st.frame
            cmd.aim = cands[0][1]
            cmd.kick = True
            _log({'f': st.frame, 'x': round(u.x, 1), 'y': round(u.y, 1),
                  'aim': round(cands[0][1] % 360.0, 1), 'sc': round(cands[0][0], 2),
                  'shot': sh is not None and sh[1] > SHOT_TH,
                  'pass': ps[0] if ps else None})
            return cmd

    # 8 方向 8 帧前瞻选位
    dgoal = hyp(gx - u.x, 13.0 - u.y)
    best = None
    for name in DIR8 + ('N',):
        px, py = sim_pos(u.x, u.y, name, 8, SPD * DRIBF, me)
        px, py = safe_spot(me, px, py, 0.55)
        pot = shot_potential(px, py, opp, me)
        prog = (px - u.x) * ATK[me]
        nd = min([hyp(o.x - px, o.y - py) for o in opp] or [9.0])
        sc = pot * 4.0 + prog * 0.09 + min(nd, 3.0) * 0.22
        if hyp(px - gx, py - 13.0) < dgoal:
            sc += 0.05
        if best is None or sc > best[0]:
            best = (sc, name)
    name = best[1] if best else 'N'
    cmd.dir = name

    # 面向：默认朝球门；被贴身时把球转到远离对手的一侧
    near, nd = None, 1e9
    for o in opp:
        d = hyp(o.x - u.x, o.y - u.y)
        if d < nd:
            nd, near = d, o
    if near is not None and nd < 1.45:
        cmd.aim = math.degrees(math.atan2(u.y - near.y, u.x - near.x)) % 360.0
    else:
        cmd.aim = math.degrees(math.atan2(13.0 - u.y, gx - u.x)) % 360.0
    return cmd


def solo_cmd(st, u, opp, me):
    cmd = Cmd()
    bx, by = st.bx, st.by
    owner = st.units[st.owner] if st.owner >= 0 else None
    if owner is not None and owner.team == me:
        return carrier_cmd(st, u, opp, me)
    gx = OPP_GOAL_X[me]
    ogx = MY_GOAL_X[me]
    if owner is not None:
        dx, dy = ogx - bx, 13.0 - by
        dd = hyp(dx, dy) or 1.0
        D = hyp(bx - ogx, by - 13.0)
        db = hyp(u.x - bx, u.y - by)
        if db < 1.05:
            tx, ty = bx, by            # in reach: tackle
        else:
            k = min(2.1, max(0.4, 0.30 * D))
            tx = bx + dx / dd * k
            ty = by + dy / dd * k
        tx = clamp(tx, 0.7, FIELD_W - 0.7)
        ty = clamp(ty, 0.9, FIELD_H - 0.9)
        cmd.dir = move_dir(u, tx, ty, me, forbid_box=False)
        cmd.aim = math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0
        return cmd
    path = ball_future(st, 45)
    px, py = (path[min(len(path) - 1, 30)] if path else (bx, by))
    o = opp[0] if opp else None
    our_t = intercept_time(u, path, 45) if path else 999
    opp_t = intercept_time(o, path, 45) if (o is not None and path) else 999
    if opp_t <= our_t + 3 and our_t > 12 and hyp(bx - ogx, by - 13.0) < 26.0:
        # cannot win the race: hold the shot-line between ball and goal
        dx, dy = ogx - bx, 13.0 - by
        dd = hyp(dx, dy) or 1.0
        k = min(3.0, max(1.0, 0.22 * hyp(bx - ogx, by - 13.0)))
        tx = bx + dx / dd * k
        ty = by + dy / dd * k
        cmd.dir = move_dir(u, tx, ty, me, forbid_box=False)
        cmd.aim = math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0
        return cmd
    tx, ty = safe_spot(me, px, py, 0.5)
    cmd.dir = move_dir(u, tx, ty, me)
    cmd.aim = math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0
    if u.kickCd <= 0 and u.controlLock <= 0 and hyp(bx - u.x, by - u.y) < 1.0:
        sh = best_shot_at(bx, by, opp, me)
        if sh is not None and sh[1] > SHOT_TH:
            cmd.aim = sh[2]
            cmd.kick = True
    return cmd


def chase_cmd(st, u, path, opp, me, theirs):
    cmd = Cmd()
    bx, by = st.bx, st.by
    if theirs:
        o = st.units[st.owner]
        ogx = MY_GOAL_X[me]
        dx, dy = ogx - bx, 13.0 - by
        dd = hyp(dx, dy) or 1.0
        db = hyp(u.x - bx, u.y - by)
        if db < 1.05:
            tx, ty = bx, by
        else:
            tx, ty = bx + dx / dd * 2.0, by + dy / dd * 2.0
        tx, ty = safe_spot(me, tx, ty, 0.45)
        cmd.dir = move_dir(u, tx, ty, me)
        cmd.aim = math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0
        return cmd
    if path:
        px, py = path[min(len(path) - 1, 30)]
        for k in range(0, min(len(path), 45), 2):
            qx, qy = path[k]
            t = (k + 1) / HZ
            if hyp(qx - u.x, qy - u.y) <= CR + SPD * t:
                px, py = qx, qy
                break
    else:
        px, py = bx, by
    tx, ty = safe_spot(me, px, py, 0.45)
    cmd.dir = move_dir(u, tx, ty, me)
    cmd.aim = math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0
    if u.kickCd <= 0 and u.controlLock <= 0 and hyp(bx - u.x, by - u.y) < 1.15:
        sh = best_shot_at(bx, by, opp, me)
        if sh is not None and sh[1] > SHOT_TH:
            cmd.aim = sh[2]
            cmd.kick = True
    return cmd


def cover_cmd(st, u, owner, bx, by, me):
    cmd = Cmd()
    ogx = MY_GOAL_X[me]
    dx, dy = ogx - bx, 13.0 - by
    dd = hyp(dx, dy) or 1.0
    off = min(4.2, 0.45 * hyp(bx - ogx, by - 13.0))
    tx, ty = bx + dx / dd * off, by + dy / dd * off
    tx, ty = safe_spot(me, tx, ty, 0.45)
    cmd.dir = move_dir(u, tx, ty, me)
    cmd.aim = math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0
    return cmd


def opp_default_cmd(st, o):
    bx, by = st.bx, st.by
    owner = st.units[st.owner] if st.owner >= 0 else None
    if owner is not None and owner.team == o.team:
        return Cmd('N', None, False)
    d = move_dir(o, bx, by, o.team, forbid_box=True)
    return Cmd(d, None, False)


def frame_commands_impl(st, me):
    n = st.n
    my = [u for u in st.units if u.team == me]
    opp = [u for u in st.units if u.team != me]
    owner = st.units[st.owner] if st.owner >= 0 else None
    bx, by = st.bx, st.by
    gx = OPP_GOAL_X[me]
    ogx = MY_GOAL_X[me]
    cmds = {}
    roles, my, opp, owner = plan_roles(st, me)
    path = ball_future(st, 45) if owner is None else []
    theirs = owner is not None and owner.team != me

    mate_targets = {}
    for u in my:
        role = roles.get(u.index, ('balance', None))
        kind = role[0]
        if kind == 'striker':
            mate_targets[u.index] = role[1]
        elif kind == 'wall':
            mate_targets[u.index] = wall_spot(st, me, role[1][0], role[1][1])
        elif kind == 'balance':
            mate_targets[u.index] = (bx - ATK[me] * 6.0, 13.0 + (by - 13.0) * 0.5)
    mates_all = [m for m in my if m.index != 0]

    for u in my:
        role = roles.get(u.index, ('balance', None))
        kind = role[0]
        cmd = Cmd()
        if kind == 'carrier':
            cmd = carrier_cmd(st, u, opp, me, mates_all, mate_targets)
        elif kind == 'solo':
            cmd = solo_cmd(st, u, opp, me)
        elif kind == 'keep':
            tx, ty = keeper_target(st, me, bx, by)
            cmd.dir = move_dir(u, tx, ty, me, forbid_box=False)
            cmd.aim = math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0
            if hyp(bx - u.x, by - u.y) < 4.0 and hyp(st.bvx, st.bvy) < 6.0 \
                    and in_box(me, bx, by):
                cmd.dir = move_dir(u, bx, by, me, forbid_box=False)
        elif kind == 'chase':
            cmd = chase_cmd(st, u, path, opp, me, theirs)
        elif kind == 'press':
            o = None
            for q in opp:
                if q.index == role[1]:
                    o = q
            if o is None:
                o = owner
            if o is not None:
                # jockey on the ball-goal line, block the shot cone
                dx, dy = ogx - o.x, 13.0 - o.y
                dd = hyp(dx, dy) or 1.0
                db = hyp(u.x - o.x, u.y - o.y)
                if db < 1.05:
                    tx, ty = o.x, o.y
                else:
                    tx, ty = o.x + dx / dd * 2.0, o.y + dy / dd * 2.0
                tx, ty = safe_spot(me, tx, ty, 0.45)
                cmd.dir = move_dir(u, tx, ty, me)
                cmd.aim = math.degrees(math.atan2(o.y - u.y, o.x - u.x)) % 360.0
        elif kind == 'cover':
            cmd = cover_cmd(st, u, owner, bx, by, me)
        elif kind == 'mark':
            oi = role[1]
            tgt = None
            for o in opp:
                if o.index == oi:
                    tgt = o
            if tgt is not None:
                dx, dy = ogx - tgt.x, 13.0 - tgt.y
                dd = hyp(dx, dy) or 1.0
                tx, ty = tgt.x + dx / dd * 1.3, tgt.y + dy / dd * 1.3
                tx, ty = safe_spot(me, tx, ty, 0.6)
                cmd.dir = move_dir(u, tx, ty, me)
                cmd.aim = math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0
            else:
                cmd.dir = move_dir(u, (u.x + bx) / 2, (u.y + by) / 2, me)
        elif kind == 'wall':
            tx, ty = wall_spot(st, me, role[1][0], role[1][1])
            if hyp(tx - u.x, ty - u.y) > 0.3:
                cmd.dir = move_dir(u, tx, ty, me, forbid_box=False)
            cmd.aim = math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0
        elif kind == 'striker':
            tx, ty = role[1]
            if hyp(tx - u.x, ty - u.y) > 0.25:
                cmd.dir = move_dir(u, tx, ty, me)
                cmd.aim = math.degrees(math.atan2(13.0 - u.y, gx - u.x)) % 360.0
            else:
                # 站定等球，面朝球门
                cmd.dir = 'N'
                cmd.aim = math.degrees(math.atan2(13.0 - u.y, gx - u.x)) % 360.0
        else:
            tx = bx - ATK[me] * 6.0
            ty = 13.0 + (by - 13.0) * 0.5
            tx, ty = safe_spot(me, tx, ty, 0.7)
            cmd.dir = move_dir(u, tx, ty, me)
            cmd.aim = math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0
        cmds[u.index] = cmd
    return cmds, my, opp, owner


def neutral_frame(n):
    return [{"dir": "N", "aim": None, "kick": False} for _ in range(n)]


def frame_commands(st, me):
    cmds, my, opp, owner = frame_commands_impl(st, me)
    # 兜底：贴到「对方禁区 + 1 格」以内且本轮不踢球时，先向外撤。
    # 引擎的球员分离会把贴边的人挤进禁区，而进对方禁区 = 红牌罚下。
    for u in my:
        c = cmds.get(u.index)
        if c is None or c.kick:
            continue
        if near_opp_box(me, u.x, u.y, 1.0):
            tx, ty = safe_spot(me, u.x, u.y, 1.8)
            c.dir = move_dir(u, tx, ty, me)
    if RECV['idx'] is not None and st.owner < 0 and st.lastTeam == me \
            and st.frame - RECV['frame'] <= 45:
        tx, ty = RECV['pos']
        tx, ty = safe_spot(me, tx, ty, 0.35)
        cmd = Cmd()
        # find the designated unit
        for u in my:
            if u.index == RECV['idx']:
                cmd.dir = move_dir(u, tx, ty, me)
                cmd.aim = math.degrees(math.atan2(ty - u.y, tx - u.x)) % 360.0
                cmds[u.index] = cmd
                break
    if st.owner >= 0:
        RECV['idx'] = None
    return cmds, my, opp, owner


def decide_window(s0, me, n):
    T0['t'] = time.time()
    frames = []
    st = s0.clone()
    for f in range(20):
        if st.status != 'playing':
            break
        cmds, my, opp, owner = frame_commands(st, me)
        inp = [None] * len(st.units)
        for u in st.units:
            if u.team == me:
                c = cmds.get(u.index, Cmd())
                aim = None
                if c.aim is not None:
                    a = math.radians(c.aim % 360.0)
                    aim = (math.cos(a), math.sin(a))
                inp[st.units.index(u)] = (c.dir, aim, c.kick)
            else:
                c = opp_default_cmd(st, u)
                inp[st.units.index(u)] = (c.dir, None, False)
        frames.append(inp)
        g = step(st, inp, st.kickoffTeam)
        if g >= 0:
            st.score[g] += 1
            if st.golden:
                st.status = 'finished'
                break
            kickoff(st, 1 - g)
    while len(frames) < 20:
        frames.append(None)
    return frames







































































































































































































































# ===== BEGIN EMBEDDED POLICY =====
import base64 as _b64
import types as _types
_POLICY_B64 = 'IyAtKi0gY29kaW5nOiB1dGYtOCAtKi0KIiIiZGVlcHNlZWstZzEgwrcgcm91bmQtMiBwb2xpY3kuCgpEb2N0cmluZQotLS0tLS0tLQoqIFRoZSBvcHBvbmVudCByZS1wbGFucyBvbmx5IG9uY2UgcGVyIGRlY2lzaW9uIHdpbmRvdywgc28gYSBzaG90IHJlbGVhc2VkIG9uCiAgdGhlIGZpcnN0IGZyYW1lcyBvZiBhIHdpbmRvdyBpcyBpbnZpc2libGUgdG8gdGhlaXIga2VlcGVyIGZvciB1cCB0byAxIHMuCiogVGhlaXIgZGVmZW5zaXZlIGxpbmUgaXMgY2xhbXBlZCB0byB4PD0zNiAoYXR0YWNraW5nIGNvb3JkcykuICBBIGJhbGwgYmV5b25kCiAgdGhhdCBsaW5lIGlzIGRlZmVuZGVkIGJ5IHRoZSBrZWVwZXIgYWxvbmUuCiogVGhlcmVmb3JlIHRoZSBtYWluIHdlYXBvbiBpcyBhICpjb3JuZXIgcG9hY2hlcio6IGEgZm9yd2FyZCBzdGF0aW9uZWQgaW4gdGhlCiAgY29ycmlkb3IgYmVzaWRlIHRoZWlyIHBlbmFsdHkgYm94ICh5PDUuNSBvciB5PjIwLjUsIHh+MzcuLjQwLCB3aGljaCBpcyBsZWdhbAogIGJlY2F1c2Ugb25seSB0aGUgYm94IGl0c2VsZiBpcyBmb3JiaWRkZW4pLCBmZWQgYnkgYSBzaG9ydCBwYXNzLCBzaG9vdGluZyBhdAogIHRoZSBORUFSIGNvcm5lci4gIEEgc2hvb3RlciBhdCAoMzgsNCkgYWltaW5nIGF0ICg0MywxMC42KSBzY29yZXMgZXZlbiBpZiB0aGUKICBrZWVwZXIgaXMgYWxyZWFkeSBhdCBpdHMgY2hhcmdlIHNwb3QuCiogRXZlcnl0aGluZyBlbHNlIGlzIGxhbmUgZGlzY2lwbGluZTogbmV2ZXIgZW50ZXIgdGhlIG9wcG9uZW50IGJveCAocmVkIGNhcmQpLAogIGtlZXAgYm9kaWVzIGluIHRoZWlyIHNob290aW5nIGxhbmVzLCBrZWVwZXIgb24gdGhlIGdvYWwgbGluZS4KClRoZSB3aW5kb3cgcGxhbiBpcyBwcm9kdWNlZCBieSByb2xsaW5nIG91ciBvd24gZXhhY3QgZW5naW5lIGZvcndhcmQgYWdhaW5zdCBhCnBvcnQgb2YgdGhlIG9wcG9uZW50IHBvbGljeSwgYW5kIGNob29zaW5nIHRoZSBiZXN0IG9mIHNldmVyYWwgcGxheSBzdHlsZXMuCiIiIgoKaW1wb3J0IG1hdGgKClcsIEggPSA0NC4wLCAyNi4wCkRUID0gMC4wNQpNT1YgPSAzLjE1CkRSSUIgPSAwLjU4ICogTU9WCkNSID0gMC44MgpSX0IgPSAwLjIyClJfVSA9IDAuMzQKS0lDS1AgPSAxMS4wCktJQ0tfT0ZGID0gMC42OQpHTF9MTywgR0xfSEkgPSAxMC41LCAxNS41CgpPQk9YID0gezA6ICgzNC4wLCA2LjAsIDQzLjAsIDIwLjApLCAxOiAoMS4wLCA2LjAsIDEwLjAsIDIwLjApfQpPV05CT1ggPSB7MDogKDEuMCwgNi4wLCAxMC4wLCAyMC4wKSwgMTogKDM0LjAsIDYuMCwgNDMuMCwgMjAuMCl9CgpTUTIgPSAwLjcwNzEwNjc4MTE4NjU0NzYKRElSUyA9IHsKICAgICdOJzogKDAuMCwgMC4wKSwgJ1UnOiAoMC4wLCAtMS4wKSwgJ0QnOiAoMC4wLCAxLjApLAogICAgJ0wnOiAoLTEuMCwgMC4wKSwgJ1InOiAoMS4wLCAwLjApLAogICAgJ1VMJzogKC1TUTIsIC1TUTIpLCAnVVInOiAoU1EyLCAtU1EyKSwgJ0RMJzogKC1TUTIsIFNRMiksICdEUic6IChTUTIsIFNRMiksCn0KRElSX0tFWVMgPSAoJ04nLCAnVScsICdEJywgJ0wnLCAnUicsICdVTCcsICdVUicsICdETCcsICdEUicpCgpfV0FMTCA9IGJ5dGVhcnJheSg0NCAqIDI2KQpmb3IgX3kgaW4gcmFuZ2UoMjYpOgogICAgZm9yIF94IGluIHJhbmdlKDQ0KToKICAgICAgICBpZiBfeCA9PSAwIG9yIF95ID09IDAgb3IgX3ggPT0gNDMgb3IgX3kgPT0gMjU6CiAgICAgICAgICAgIGlmIChfeCA9PSAwIG9yIF94ID09IDQzKSBhbmQgMTAgPD0gX3kgPCAxNjoKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAgIF9XQUxMW195ICogNDQgKyBfeF0gPSAxCgoKZGVmIHRpbGVfYXQoeCwgeSk6CiAgICB0eCA9IGludChtYXRoLmZsb29yKHgpKQogICAgdHkgPSBpbnQobWF0aC5mbG9vcih5KSkKICAgIGlmIHR4IDwgMCBvciB0eSA8IDAgb3IgdHggPj0gNDQgb3IgdHkgPj0gMjY6CiAgICAgICAgcmV0dXJuIDEKICAgIHJldHVybiBfV0FMTFt0eSAqIDQ0ICsgdHhdCgoKZGVmIGhpdHNfd2FsbCh4LCB5LCByKToKICAgIGsgPSByICogU1EyCiAgICBmb3IgcHgsIHB5IGluICgoeCAtIHIsIHkpLCAoeCArIHIsIHkpLCAoeCwgeSAtIHIpLCAoeCwgeSArIHIpLAogICAgICAgICAgICAgICAgICAgKHggLSBrLCB5IC0gayksICh4ICsgaywgeSAtIGspLCAoeCAtIGssIHkgKyBrKSwgKHggKyBrLCB5ICsgaykpOgogICAgICAgIGlmIHRpbGVfYXQocHgsIHB5KToKICAgICAgICAgICAgcmV0dXJuIFRydWUKICAgIHJldHVybiBGYWxzZQoKCmRlZiBjbGFtcCh2LCBhLCBiKToKICAgIHJldHVybiBhIGlmIHYgPCBhIGVsc2UgKGIgaWYgdiA+IGIgZWxzZSB2KQoKCmRlZiBzZ25fYXRrKG1lKToKICAgIHJldHVybiAxLjAgaWYgbWUgPT0gMCBlbHNlIC0xLjAKCgpkZWYgb3BwX2d4KG1lKToKICAgIHJldHVybiA0My4wIGlmIG1lID09IDAgZWxzZSAxLjAKCgpkZWYgb3duX2d4KG1lKToKICAgIHJldHVybiAxLjAgaWYgbWUgPT0gMCBlbHNlIDQzLjAKCgpkZWYgaW5fYm94KG1lLCB4LCB5LCBtPTAuMCk6CiAgICBiID0gT0JPWFttZV0KICAgIHJldHVybiBiWzBdIC0gbSA8PSB4IDw9IGJbMl0gKyBtIGFuZCBiWzFdIC0gbSA8PSB5IDw9IGJbM10gKyBtCgoKZGVmIGluX293bl9ib3gobWUsIHgsIHksIG09MC4wKToKICAgIGIgPSBPV05CT1hbbWVdCiAgICByZXR1cm4gYlswXSAtIG0gPD0geCA8PSBiWzJdICsgbSBhbmQgYlsxXSAtIG0gPD0geSA8PSBiWzNdICsgbQoKCmRlZiBzYWZlX3B0KG1lLCB4LCB5LCBtPTAuODUpOgogICAgIiIiUHVzaCBhIGRlc2lyZWQgcG9pbnQgb3V0IG9mIHRoZSBvcHBvbmVudCBib3ggKHJlZCBjYXJkKS4iIiIKICAgIHggPSBjbGFtcCh4LCAwLjYsIFcgLSAwLjYpCiAgICB5ID0gY2xhbXAoeSwgMC42LCBIIC0gMC42KQogICAgYiA9IE9CT1hbbWVdCiAgICBpZiBiWzBdIC0gbSA8PSB4IDw9IGJbMl0gKyBtIGFuZCBiWzFdIC0gbSA8PSB5IDw9IGJbM10gKyBtOgogICAgICAgIGNhbmRzID0gW10KICAgICAgICBpZiBiWzBdID4gMS4wOgogICAgICAgICAgICBjYW5kcy5hcHBlbmQoKGJbMF0gLSBtLCBjbGFtcCh5LCBiWzFdLCBiWzNdKSkpCiAgICAgICAgaWYgYlsyXSA8IFcgLSAxLjA6CiAgICAgICAgICAgIGNhbmRzLmFwcGVuZCgoYlsyXSArIG0sIGNsYW1wKHksIGJbMV0sIGJbM10pKSkKICAgICAgICBjYW5kcy5hcHBlbmQoKGNsYW1wKHgsIGJbMF0sIGJbMl0pLCBiWzFdIC0gbSkpCiAgICAgICAgY2FuZHMuYXBwZW5kKChjbGFtcCh4LCBiWzBdLCBiWzJdKSwgYlszXSArIG0pKQogICAgICAgIGJlc3QsIGJkID0gY2FuZHNbMF0sIDFlMTgKICAgICAgICBmb3IgY3gsIGN5IGluIGNhbmRzOgogICAgICAgICAgICBpZiAwLjQgPD0gY3ggPD0gVyAtIDAuNCBhbmQgMC40IDw9IGN5IDw9IEggLSAwLjQ6CiAgICAgICAgICAgICAgICBkZCA9IChjeCAtIHgpICoqIDIgKyAoY3kgLSB5KSAqKiAyCiAgICAgICAgICAgICAgICBpZiBkZCA8IGJkOgogICAgICAgICAgICAgICAgICAgIGJkLCBiZXN0ID0gZGQsIChjeCwgY3kpCiAgICAgICAgeCwgeSA9IGJlc3QKICAgIHJldHVybiB4LCB5CgoKZGVmIHN0ZXBfb2sobWUsIHgsIHksIHZ4LCB2eSwgc3RlcHM9NSwgbT0wLjg1LCBzcGVlZD1NT1YpOgogICAgZm9yIGsgaW4gcmFuZ2UoMSwgc3RlcHMgKyAxKToKICAgICAgICBpZiBpbl9ib3gobWUsIHggKyB2eCAqIHNwZWVkICogRFQgKiBrLCB5ICsgdnkgKiBzcGVlZCAqIERUICogaywgbSk6CiAgICAgICAgICAgIHJldHVybiBGYWxzZQogICAgcmV0dXJuIFRydWUKCgpkZWYgbW92ZV9kaXIodSwgdHgsIHR5LCBtZSwgYWxsb3dfYm94PUZhbHNlLCBtPTAuODUsIHNwZWVkPU1PVik6CiAgICAiIiI4LWRpciBncmVlZHkgdG93YXJkICh0eCx0eSkgdGhhdCBuZXZlciBzdGVwcyBpbnRvIHRoZSBvcHBvbmVudCBib3guIiIiCiAgICBkeCwgZHkgPSB0eCAtIHUueCwgdHkgLSB1LnkKICAgIGQgPSBtYXRoLmh5cG90KGR4LCBkeSkKICAgIGlmIGQgPCAwLjA1OgogICAgICAgIHJldHVybiAnTicKICAgIHV4LCB1eSA9IGR4IC8gZCwgZHkgLyBkCiAgICBiZXN0LCBiZXN0diA9IE5vbmUsIC0xZTE4CiAgICBmb3IgbmFtZSBpbiBESVJfS0VZUzoKICAgICAgICB2eCwgdnkgPSBESVJTW25hbWVdCiAgICAgICAgaWYgdnggPT0gMC4wIGFuZCB2eSA9PSAwLjA6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgaWYgbm90IGFsbG93X2JveCBhbmQgbm90IHN0ZXBfb2sobWUsIHUueCwgdS55LCB2eCwgdnksIDUsIG0sIHNwZWVkKToKICAgICAgICAgICAgY29udGludWUKICAgICAgICB2ID0gdnggKiB1eCArIHZ5ICogdXkKICAgICAgICBpZiB2ID4gYmVzdHY6CiAgICAgICAgICAgIGJlc3R2LCBiZXN0ID0gdiwgbmFtZQogICAgaWYgYmVzdCBpcyBOb25lOgogICAgICAgICMgc2xpZGUgYWxvbmcgdGhlIGJveCBmYWNlCiAgICAgICAgYiA9IE9CT1hbbWVdCiAgICAgICAgY3kgPSAoYlsxXSArIGJbM10pICogMC41CiAgICAgICAgd2FudCA9IC0xLjAgaWYgdS55IDwgY3kgZWxzZSAxLjAKICAgICAgICBmb3IgbmFtZSBpbiBESVJfS0VZUzoKICAgICAgICAgICAgdngsIHZ5ID0gRElSU1tuYW1lXQogICAgICAgICAgICBpZiB2eCA9PSAwLjAgYW5kIHZ5ID09IDAuMDoKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAgIGlmIG5vdCBzdGVwX29rKG1lLCB1LngsIHUueSwgdngsIHZ5LCA1LCBtLCBzcGVlZCk6CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICB2ID0gdnkgKiB3YW50ICsgdnggKiAoMC4zIGlmIGFicyh2eCkgPiAwIGVsc2UgMC4wKQogICAgICAgICAgICBpZiB2ID4gYmVzdHY6CiAgICAgICAgICAgICAgICBiZXN0diwgYmVzdCA9IHYsIG5hbWUKICAgIHJldHVybiBiZXN0IG9yICdOJwoKCmRlZiBtb3ZlX2Rpcl9hdm9pZCh1LCB0eCwgdHksIG1lLCBvcHBzLCBhbGxvd19ib3g9RmFsc2UsIG09MC44NSwgc3BlZWQ9TU9WLCBhdm9pZF9yPTIuMik6CiAgICBkeCwgZHkgPSB0eCAtIHUueCwgdHkgLSB1LnkKICAgIGQgPSBtYXRoLmh5cG90KGR4LCBkeSkKICAgIGlmIGQgPCAwLjA1OgogICAgICAgIHJldHVybiAnTicKICAgIHV4LCB1eSA9IGR4IC8gZCwgZHkgLyBkCiAgICBiZXN0LCBiZXN0diA9IE5vbmUsIC0xZTE4CiAgICBmb3IgbmFtZSBpbiBESVJfS0VZUzoKICAgICAgICB2eCwgdnkgPSBESVJTW25hbWVdCiAgICAgICAgaWYgdnggPT0gMC4wIGFuZCB2eSA9PSAwLjA6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgaWYgbm90IGFsbG93X2JveCBhbmQgbm90IHN0ZXBfb2sobWUsIHUueCwgdS55LCB2eCwgdnksIDUsIG0sIHNwZWVkKToKICAgICAgICAgICAgY29udGludWUKICAgICAgICB2ID0gdnggKiB1eCArIHZ5ICogdXkKICAgICAgICBmb3IgbyBpbiBvcHBzOgogICAgICAgICAgICBveCwgb3kgPSBvLnggLSB1LngsIG8ueSAtIHUueQogICAgICAgICAgICBvZCA9IG1hdGguaHlwb3Qob3gsIG95KQogICAgICAgICAgICBpZiAxZS02IDwgb2QgPCBhdm9pZF9yOgogICAgICAgICAgICAgICAgZG90ID0gKHZ4ICogb3ggKyB2eSAqIG95KSAvIG9kCiAgICAgICAgICAgICAgICBpZiBkb3QgPiAwLjA6CiAgICAgICAgICAgICAgICAgICAgdiAtPSBkb3QgKiAoYXZvaWRfciAtIG9kKSAvIGF2b2lkX3IgKiAxLjMKICAgICAgICBpZiB2ID4gYmVzdHY6CiAgICAgICAgICAgIGJlc3R2LCBiZXN0ID0gdiwgbmFtZQogICAgcmV0dXJuIGJlc3Qgb3IgJ04nCgoKIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gYmFsbCBtb2RlbApkZWYgZmxpZ2h0KHgwLCB5MCwgYW5nLCBtYXhmPTEyMCk6CiAgICAiIiJFbmdpbmUtZmFpdGhmdWwgYmFsbCBmbGlnaHQuICAtPiAocHRzLCBnb2FsX3RlYW1fb3JfTm9uZSkiIiIKICAgIHZ4LCB2eSA9IEtJQ0tQICogbWF0aC5jb3MoYW5nKSwgS0lDS1AgKiBtYXRoLnNpbihhbmcpCiAgICB4LCB5ID0geDAsIHkwCiAgICBwdHMgPSBbXQogICAgZm9yIF9mIGluIHJhbmdlKG1heGYpOgogICAgICAgIGZvciBfcyBpbiByYW5nZSg0KToKICAgICAgICAgICAgeCArPSB2eCAqIERUIC8gNC4wCiAgICAgICAgICAgIHkgKz0gdnkgKiBEVCAvIDQuMAogICAgICAgICAgICBpZiBHTF9MTyA8PSB5IDw9IEdMX0hJOgogICAgICAgICAgICAgICAgaWYgeCA8PSAxLjA6CiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHB0cywgMQogICAgICAgICAgICAgICAgaWYgeCA+PSBXIC0gMS4wOgogICAgICAgICAgICAgICAgICAgIHJldHVybiBwdHMsIDAKICAgICAgICAgICAgaWYgeCA8IDEuMyBvciB4ID4gNDIuNyBvciB5IDwgMS4zIG9yIHkgPiAyNC43OgogICAgICAgICAgICAgICAgcGFzcwogICAgICAgICAgICBlbGlmIDEuMyA8IHggPCA0Mi43IGFuZCAxLjMgPCB5IDwgMjQuNzoKICAgICAgICAgICAgICAgIHBhc3MKICAgICAgICAgICAgaWYgKHggPCAxLjMgb3IgeCA+IDQyLjcgb3IgeSA8IDEuMyBvciB5ID4gMjQuNykgYW5kIGhpdHNfd2FsbCh4LCB5LCBSX0IpOgogICAgICAgICAgICAgICAgcHggPSB4IC0gdnggKiBEVCAvIDQuMAogICAgICAgICAgICAgICAgcHkgPSB5IC0gdnkgKiBEVCAvIDQuMAogICAgICAgICAgICAgICAgaWYgaGl0c193YWxsKHgsIHB5LCBSX0IpOgogICAgICAgICAgICAgICAgICAgIHgsIHkgPSBweCwgeQogICAgICAgICAgICAgICAgICAgIHZ4ID0gLXZ4ICogMC43MgogICAgICAgICAgICAgICAgaWYgaGl0c193YWxsKHB4LCB5LCBSX0IpOgogICAgICAgICAgICAgICAgICAgIHgsIHkgPSB4LCBweQogICAgICAgICAgICAgICAgICAgIHZ5ID0gLXZ5ICogMC43MgogICAgICAgICAgICAgICAgaWYgaGl0c193YWxsKHgsIHksIFJfQik6CiAgICAgICAgICAgICAgICAgICAgeCwgeSA9IHB4LCBweQogICAgICAgICAgICAgICAgICAgIHZ4ID0gLXZ4ICogMC43MgogICAgICAgICAgICAgICAgICAgIHZ5ID0gLXZ5ICogMC43MgogICAgICAgIHZ4ICo9IDAuOTc4CiAgICAgICAgdnkgKj0gMC45NzgKICAgICAgICBpZiBtYXRoLmh5cG90KHZ4LCB2eSkgPCAwLjAyOgogICAgICAgICAgICBicmVhawogICAgICAgIHB0cy5hcHBlbmQoKHgsIHkpKQogICAgcmV0dXJuIHB0cywgTm9uZQoKCmRlZiBzaG90X3F1YWxpdHkoeDAsIHkwLCBhbmcsIG1lLCBvcHBzLCBibGluZF9zaGlmdD0wLjAsIG1heGY9ODApOgogICAgIiIiKHBfZ29hbCwgZ29hbF90ZWFtLCBjbGVhcmFuY2UpIGZvciBhIGtpY2sgZnJvbSAoeDAseTApIGFsb25nIGFuZy4KCiAgICBvcHBzOiBsaXN0IG9mIHVuaXRzIHdpdGggLngvLnkvLmluZGV4LiAgQ29uc2VydmF0aXZlIHJlYWNoIG1vZGVsOiBlYWNoCiAgICBvcHBvbmVudCBtYXkgbW92ZSBhdCBmdWxsIHNwZWVkIGFmdGVyIGl0cyByZWFjdGlvbiBkZWxheS4iIiIKICAgIHB0cywgZ3QgPSBmbGlnaHQoeDAsIHkwLCBhbmcsIG1heGYpCiAgICBpZiBub3QgcHRzOgogICAgICAgIHJldHVybiAwLjAsIGd0LCAtOS4wCiAgICBpZiBndCAhPSBtZToKICAgICAgICByZXR1cm4gMC4wLCBndCwgLTkuMAogICAgd29yc3QgPSA5LjAKICAgIG5wdHMgPSBsZW4ocHRzKQogICAgZm9yIG8gaW4gb3BwczoKICAgICAgICBkZWxheSA9IDAuNTUKICAgICAgICBpZiBnZXRhdHRyKG8sICdpbmRleCcsIDk5KSA9PSAwIGFuZCBsZW4ob3BwcykgPiAwOgogICAgICAgICAgICBkZWxheSA9IDAuOTUKICAgICAgICBkZWxheSA9IG1heCgwLjA1LCBkZWxheSAtIGJsaW5kX3NoaWZ0KQogICAgICAgIG94LCBveSA9IG8ueCwgby55CiAgICAgICAgbSA9IDkuMAogICAgICAgIGZvciB0IGluIHJhbmdlKG5wdHMpOgogICAgICAgICAgICBieCwgYnkgPSBwdHNbdF0KICAgICAgICAgICAgZGQgPSBtYXRoLmh5cG90KGJ4IC0gb3gsIGJ5IC0gb3kpIC0gQ1IgLSBNT1YgKiBtYXgoMC4wLCAodCArIDEpICogRFQgLSBkZWxheSkKICAgICAgICAgICAgaWYgZGQgPCBtOgogICAgICAgICAgICAgICAgbSA9IGRkCiAgICAgICAgaWYgbSA8IHdvcnN0OgogICAgICAgICAgICB3b3JzdCA9IG0KICAgIHJldHVybiBjbGFtcCgod29yc3QgKyAwLjI1KSAvIDEuMSwgMC4wLCAxLjApLCBndCwgd29yc3QKCgpTSE9UX1lTID0gKDEwLjYyLCAxMS4zNSwgMTIuMiwgMTMuMCwgMTMuOCwgMTQuNjUsIDE1LjM4KQoKCmRlZiBiZXN0X3Nob3Qoc3QsIG1lLCB1LCBvcHBzLCBtYXhfYW5nX29mZj1tYXRoLnBpKToKICAgICIiIkJlc3QgKHAsIGFuZywgdHkpIHNob3QgZm9yIHVuaXQgdS4iIiIKICAgIGd4ID0gb3BwX2d4KG1lKQogICAgYmVzdCA9ICgwLjAsIE5vbmUsIE5vbmUpCiAgICAjIGtpY2sgb3JpZ2luYXRlcyBzbGlnaHRseSBhaGVhZCBvZiB0aGUgdW5pdAogICAgZm9yIHR5IGluIFNIT1RfWVM6CiAgICAgICAgYW5nID0gbWF0aC5hdGFuMih0eSAtIHUueSwgZ3ggLSB1LngpCiAgICAgICAgaWYgYWJzKCgoYW5nIC0gbWF0aC5hdGFuMih1LmZ5LCB1LmZ4KSArIG1hdGgucGkpICUgKDIgKiBtYXRoLnBpKSkgLSBtYXRoLnBpKSA+IG1heF9hbmdfb2ZmOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIGZ4LCBmeSA9IG1hdGguY29zKGFuZyksIG1hdGguc2luKGFuZykKICAgICAgICBzeCwgc3kgPSB1LnggKyBmeCAqIEtJQ0tfT0ZGLCB1LnkgKyBmeSAqIEtJQ0tfT0ZGCiAgICAgICAgcCwgZ3QsIGNsciA9IHNob3RfcXVhbGl0eShzeCwgc3ksIGFuZywgbWUsIG9wcHMpCiAgICAgICAgaWYgcCA+IGJlc3RbMF06CiAgICAgICAgICAgIGJlc3QgPSAocCwgYW5nLCB0eSkKICAgIHJldHVybiBiZXN0CgoKIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIG9wcG9uZW50IG1vZGVsClMyID0gbWF0aC5zcXJ0KDAuNSkKX09EID0gWygnTicsIDAsIDApLCAoJ1UnLCAwLCAtMSksICgnRCcsIDAsIDEpLCAoJ0wnLCAtMSwgMCksICgnUicsIDEsIDApLAogICAgICAgKCdVTCcsIC1TMiwgLVMyKSwgKCdVUicsIFMyLCAtUzIpLCAoJ0RMJywgLVMyLCBTMiksICgnRFInLCBTMiwgUzIpXQpfT0RNQVAgPSB7ZFswXTogKGRbMV0sIGRbMl0pIGZvciBkIGluIF9PRH0KX01JUiA9IHsnTCc6ICdSJywgJ1InOiAnTCcsICdVTCc6ICdVUicsICdVUic6ICdVTCcsICdETCc6ICdEUicsICdEUic6ICdETCd9CgoKZGVmIF9vc2FmZSh4LCB5KToKICAgIHJldHVybiAoeCA+PSAxLjQgYW5kIHggPD0gNDIuNiBhbmQgeSA+PSAxLjQgYW5kIHkgPD0gMjQuNgogICAgICAgICAgICBhbmQgbm90ICh4ID49IDMzLjAgYW5kIHkgPj0gNS4wIGFuZCB5IDw9IDIxLjApKQoKCmNsYXNzIF9PVShvYmplY3QpOgogICAgX19zbG90c19fID0gKCdpZCcsICd0ZWFtJywgJ2luZGV4JywgJ3gnLCAneScsICdmeCcsICdmeScpCgogICAgZGVmIF9faW5pdF9fKHNlbGYsIHVpZCwgdGVhbSwgaW5kZXgsIHgsIHksIGZ4LCBmeSk6CiAgICAgICAgc2VsZi5pZCwgc2VsZi50ZWFtLCBzZWxmLmluZGV4ID0gdWlkLCB0ZWFtLCBpbmRleAogICAgICAgIHNlbGYueCwgc2VsZi55LCBzZWxmLmZ4LCBzZWxmLmZ5ID0geCwgeSwgZngsIGZ5CgoKZGVmIF9vbG9jYWwoc3QsIHRlYW0pOgogICAgdXMgPSBbXQogICAgZm9yIHUgaW4gc3QudW5pdHM6CiAgICAgICAgaWYgdGVhbToKICAgICAgICAgICAgdXMuYXBwZW5kKF9PVSgndCVkdSVkJyAlICh1LnRlYW0sIHUuaW5kZXgpLCAwIGlmIHUudGVhbSA9PSB0ZWFtIGVsc2UgMSwKICAgICAgICAgICAgICAgICAgICAgICAgICB1LmluZGV4LCA0NC4wIC0gdS54LCB1LnksIC11LmZ4LCB1LmZ5KSkKICAgICAgICBlbHNlOgogICAgICAgICAgICB1cy5hcHBlbmQoX09VKCd0JWR1JWQnICUgKHUudGVhbSwgdS5pbmRleCksIDAgaWYgdS50ZWFtID09IHRlYW0gZWxzZSAxLAogICAgICAgICAgICAgICAgICAgICAgICAgIHUuaW5kZXgsIHUueCwgdS55LCB1LmZ4LCB1LmZ5KSkKICAgIG93bmVyID0gTm9uZQogICAgaWYgc3Qub3duZXIgPj0gMDoKICAgICAgICBvID0gc3QudW5pdHNbc3Qub3duZXJdCiAgICAgICAgb3duZXIgPSAndCVkdSVkJyAlIChvLnRlYW0sIG8uaW5kZXgpCiAgICBiID0geyd4JzogKDQ0LjAgLSBzdC5ieCkgaWYgdGVhbSBlbHNlIHN0LmJ4LCAneSc6IHN0LmJ5LAogICAgICAgICAndngnOiAoLXN0LmJ2eCkgaWYgdGVhbSBlbHNlIHN0LmJ2eCwgJ3Z5Jzogc3QuYnZ5LCAnb3duZXInOiBvd25lcn0KICAgIHJldHVybiB7J3VuaXRzJzogdXMsICd1cyc6IFt1IGZvciB1IGluIHVzIGlmIHUudGVhbSA9PSAwXSwKICAgICAgICAgICAgJ3RoZW0nOiBbdSBmb3IgdSBpbiB1cyBpZiB1LnRlYW0gPT0gMV0sICdiYWxsJzogYiwgJ24nOiBzdC5ufQoKCmRlZiBfb21vdmUodSwgdCk6CiAgICBiZXN0LCBidiA9ICdOJywgMWU5CiAgICBmb3IgbmFtZSwgZHgsIGR5IGluIF9PRDoKICAgICAgICB4LCB5ID0gdS54ICsgZHggKiAwLjE1NzUsIHUueSArIGR5ICogMC4xNTc1CiAgICAgICAgaWYgbm90IF9vc2FmZSh4LCB5KToKICAgICAgICAgICAgY29udGludWUKICAgICAgICB2ID0gbWF0aC5oeXBvdCh0WzBdIC0geCwgdFsxXSAtIHkpCiAgICAgICAgaWYgbmFtZSA9PSAnTic6CiAgICAgICAgICAgIHYgKz0gMC4wMjUKICAgICAgICBpZiB1LnggPiAzMy41IGFuZCB0WzBdIDwgMzMuNSBhbmQgdS55IDwgNiBhbmQgdFsxXSA+IDY6CiAgICAgICAgICAgIHYgKz0gbWF4KDAuMCwgeCAtIDMzLjQ1KSAqIDAuMwogICAgICAgIGlmIHYgPCBidjoKICAgICAgICAgICAgYnYsIGJlc3QgPSB2LCBuYW1lCiAgICByZXR1cm4gYmVzdAoKCmRlZiBfb3Nob3QodSwgcyk6CiAgICBiZXN0ID0geydzY29yZSc6IC0xMDAuMCwgJ2FpbSc6IDAuMH0KICAgIGd5ID0gMTAuNjUKICAgIHdoaWxlIGd5IDw9IDE1LjM2OgogICAgICAgIGR4LCBkeSA9IDQzLjAgLSB1LngsIGd5IC0gdS55CiAgICAgICAgbG4gPSBtYXRoLmh5cG90KGR4LCBkeSkKICAgICAgICBpZiBsbiA8PSAyNC43IGFuZCBkeCA+PSAwOgogICAgICAgICAgICB1eCwgdXkgPSBkeCAvIGxuLCBkeSAvIGxuCiAgICAgICAgICAgIHgsIHkgPSB1LnggKyB1eCAqIDAuNTksIHUueSArIHV5ICogMC41OQogICAgICAgICAgICB2LCBtbiwgYmxvY2tlZCwgdCA9IDExLjAsIDEwLjAsIEZhbHNlLCAwLjAKICAgICAgICAgICAgZm9yIF8gaW4gcmFuZ2UoMTQ1KToKICAgICAgICAgICAgICAgIHggKz0gdXggKiB2ICogMC4wNQogICAgICAgICAgICAgICAgeSArPSB1eSAqIHYgKiAwLjA1CiAgICAgICAgICAgICAgICB0ICs9IDAuMDUKICAgICAgICAgICAgICAgIHYgKj0gMC45NzgKICAgICAgICAgICAgICAgIGlmIHggPj0gNDM6CiAgICAgICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgICAgIGlmIHggPCAxLjIgb3IgeSA8IDEuMjMgb3IgeSA+IDI0Ljc3OgogICAgICAgICAgICAgICAgICAgIGJsb2NrZWQgPSBUcnVlCiAgICAgICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgICAgIGZvciBlIGluIHNbJ3RoZW0nXToKICAgICAgICAgICAgICAgICAgICBkZCA9IG1hdGguaHlwb3QoeCAtIGUueCwgeSAtIGUueSkgLSAwLjgyIC0gMy4xNSAqIG1heCgwLjAsIHQgLSAwLjcyKQogICAgICAgICAgICAgICAgICAgIGlmIGRkIDwgbW46CiAgICAgICAgICAgICAgICAgICAgICAgIG1uID0gZGQKICAgICAgICAgICAgICAgIGZvciBhIGluIHNbJ3VzJ106CiAgICAgICAgICAgICAgICAgICAgaWYgYS5pZCAhPSB1LmlkIGFuZCB0IDwgMC42NToKICAgICAgICAgICAgICAgICAgICAgICAgZGQgPSBtYXRoLmh5cG90KHggLSBhLngsIHkgLSBhLnkpIC0gMC44NgogICAgICAgICAgICAgICAgICAgICAgICBpZiBkZCA8IG1uOgogICAgICAgICAgICAgICAgICAgICAgICAgICAgbW4gPSBkZAogICAgICAgICAgICBpZiB4ID49IDQzIGFuZCBub3QgYmxvY2tlZDoKICAgICAgICAgICAgICAgIHNjID0gbW4gLSAwLjAzNSAqIHQKICAgICAgICAgICAgICAgIGlmIHNjID4gYmVzdFsnc2NvcmUnXToKICAgICAgICAgICAgICAgICAgICBiZXN0ID0geydzY29yZSc6IHNjLCAnYWltJzogbWF0aC5kZWdyZWVzKG1hdGguYXRhbjIoZHksIGR4KSl9CiAgICAgICAgZ3kgKz0gMC40NwogICAgcmV0dXJuIGJlc3QKCgpkZWYgX29wYXRoKHMsIHN0ZXBzPTg1KToKICAgIHBhdGggPSBbXQogICAgeCwgeSA9IHNbJ2JhbGwnXVsneCddLCBzWydiYWxsJ11bJ3knXQogICAgdngsIHZ5ID0gc1snYmFsbCddWyd2eCddLCBzWydiYWxsJ11bJ3Z5J10KICAgIGZvciBpIGluIHJhbmdlKHN0ZXBzKToKICAgICAgICBwYXRoLmFwcGVuZCh7J3gnOiB4LCAneSc6IHksICd0JzogaSAqIDAuMDV9KQogICAgICAgIHggKz0gdnggKiAwLjA1CiAgICAgICAgeSArPSB2eSAqIDAuMDUKICAgICAgICBpZiB5IDwgMS4yMzoKICAgICAgICAgICAgeSwgdnkgPSAyLjQ2IC0geSwgLXZ5ICogMC43MgogICAgICAgIGlmIHkgPiAyNC43NzoKICAgICAgICAgICAgeSwgdnkgPSA0OS41NCAtIHksIC12eSAqIDAuNzIKICAgICAgICBpZiB4IDwgMS4yMzoKICAgICAgICAgICAgeCwgdnggPSAyLjQ2IC0geCwgLXZ4ICogMC43MgogICAgICAgIGlmIHggPiA0Mi43NzoKICAgICAgICAgICAgeCwgdnggPSA4NS41NCAtIHgsIC12eCAqIDAuNzIKICAgICAgICB2eCAqPSAwLjk3OAogICAgICAgIHZ5ICo9IDAuOTc4CiAgICByZXR1cm4gcGF0aAoKCmRlZiBfb2ludGVyY2VwdCh1LCBwYXRoKToKICAgIGZvciBwIGluIHBhdGg6CiAgICAgICAgaWYgX29zYWZlKHBbJ3gnXSwgcFsneSddKSBhbmQgbWF0aC5oeXBvdCh1LnggLSBwWyd4J10sIHUueSAtIHBbJ3knXSkgPD0gMy4xNSAqIHBbJ3QnXSArIDAuNjU6CiAgICAgICAgICAgIHJldHVybiAocFsneCddLCBwWyd5J10pCiAgICBwID0gcGF0aFstMV0KICAgIGlmIG5vdCBfb3NhZmUocFsneCddLCBwWyd5J10pOgogICAgICAgIHAgPSB7J3gnOiBtaW4oMzMuMzUsIHBbJ3gnXSksICd5JzogY2xhbXAocFsneSddLCAxLjUsIDI0LjUpfQogICAgcmV0dXJuIChwWyd4J10sIHBbJ3knXSkKCgpkZWYgX29wb2xpY3koc3QsIHRlYW0sIHZhcmlhbnQ9J21haW4nKToKICAgICIiIlBvcnQgb2YgdGhlIG9wcG9uZW50IHBvbGljeTsgcmV0dXJucyBsaXN0IG9mIChkaXIsIGFpbV9kZWcsIGtpY2spLiIiIgogICAgcyA9IF9vbG9jYWwoc3QsIHRlYW0pCiAgICBiID0gc1snYmFsbCddCiAgICBvd25lciA9IE5vbmUKICAgIGZvciB1IGluIHNbJ3VuaXRzJ106CiAgICAgICAgaWYgdS5pZCA9PSBiWydvd25lciddOgogICAgICAgICAgICBvd25lciA9IHUKICAgIG91ciA9IG93bmVyIGlzIG5vdCBOb25lIGFuZCBvd25lci50ZWFtID09IDAKICAgIHBhdGggPSBfb3BhdGgocykKICAgIHRhcmdldHMgPSB7fQogICAgZWxpZ2libGUgPSBbdSBmb3IgdSBpbiBzWyd1cyddIGlmIHNbJ24nXSA9PSAxIG9yIHUuaW5kZXggIT0gMF0KICAgIHBpY2tzID0gc29ydGVkKCgodSwgX29jb3N0KHUsIHBhdGgpKSBmb3IgdSBpbiBlbGlnaWJsZSksIGtleT1sYW1iZGEgejogelsxXSkKICAgIGNoYXNlciA9IHBpY2tzWzBdWzBdIGlmIHBpY2tzIGVsc2UgTm9uZQogICAgaWYgb3duZXIgaXMgbm90IE5vbmUgYW5kIG5vdCBvdXIgYW5kIGVsaWdpYmxlOgogICAgICAgIGNoYXNlciA9IHNvcnRlZChlbGlnaWJsZSwga2V5PWxhbWJkYSBhOiBtYXRoLmh5cG90KGEueCAtIGJbJ3gnXSwgYS55IC0gYlsneSddKSlbMF0KICAgIGZvciB1IGluIHNbJ3VzJ106CiAgICAgICAgaWYgb3VyIGFuZCBvd25lciBpcyBub3QgTm9uZSBhbmQgdS5pZCA9PSBvd25lci5pZDoKICAgICAgICAgICAgY29udGludWUKICAgICAgICBpZiBzWyduJ10gPiAxIGFuZCB1LmluZGV4ID09IDA6CiAgICAgICAgICAgIGd4LCBneSA9IDMuMywgMTMuMAogICAgICAgICAgICBpZiBiWyd2eCddIDwgLTAuMToKICAgICAgICAgICAgICAgIGhpdCA9IE5vbmUKICAgICAgICAgICAgICAgIGZvciBwIGluIHBhdGg6CiAgICAgICAgICAgICAgICAgICAgaWYgcFsneCddIDw9IGd4ICsgMC4yNToKICAgICAgICAgICAgICAgICAgICAgICAgaGl0ID0gcAogICAgICAgICAgICAgICAgICAgICAgICBicmVhawogICAgICAgICAgICAgICAgZ3kgPSBjbGFtcChoaXRbJ3knXSwgMTAuNjUsIDE1LjM1KSBpZiBoaXQgZWxzZSBjbGFtcCgxMyArIChiWyd5J10gLSAxMykgKiAwLjM2LCAxMC42NSwgMTUuMzUpCiAgICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICBneSA9IGNsYW1wKDEzICsgKGJbJ3knXSAtIDEzKSAqIG1pbigwLjYsIDMuMiAvIG1heCg0LCBiWyd4J10gLSAxKSksIDEwLjY1LCAxNS4zNSkKICAgICAgICAgICAgaWYgYlsneCddIDwgMTA6CiAgICAgICAgICAgICAgICBneCA9IGNsYW1wKGJbJ3gnXSAtIDEuMiwgMiwgNSkKICAgICAgICAgICAgICAgIGd5ID0gY2xhbXAoYlsneSddLCA5LjgsIDE2LjIpCiAgICAgICAgICAgIGlmIG93bmVyIGlzIE5vbmU6CiAgICAgICAgICAgICAgICBwID0gX29pbnRlcmNlcHQodSwgcGF0aCkKICAgICAgICAgICAgICAgIGlmIG1hdGguaHlwb3QodS54IC0gcFswXSwgdS55IC0gcFsxXSkgLyAzLjE1IDwgMS4yNSBhbmQgcFswXSA8IDEyOgogICAgICAgICAgICAgICAgICAgIGd4LCBneSA9IHBbMF0sIHBbMV0KICAgICAgICAgICAgdGFyZ2V0c1t1LmlkXSA9IChneCwgZ3kpCiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgaWYgY2hhc2VyIGlzIG5vdCBOb25lIGFuZCB1LmlkID09IGNoYXNlci5pZCBhbmQgbm90IG91cjoKICAgICAgICAgICAgaWYgb3duZXIgaXMgbm90IE5vbmU6CiAgICAgICAgICAgICAgICB0YXJnZXRzW3UuaWRdID0gKG1pbigzMy4zLCBiWyd4J10pLCBiWyd5J10pCiAgICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICB0YXJnZXRzW3UuaWRdID0gX29pbnRlcmNlcHQodSwgcGF0aCkKICAgICAgICAgICAgY29udGludWUKICAgICAgICB0cnk6CiAgICAgICAgICAgIHJhbmsgPSBuZXh0KGkgZm9yIGksIHYgaW4gZW51bWVyYXRlKGVsaWdpYmxlKSBpZiB2LmlkID09IHUuaWQpCiAgICAgICAgZXhjZXB0IFN0b3BJdGVyYXRpb246CiAgICAgICAgICAgIHJhbmsgPSAwCiAgICAgICAgciA9IG1heCgxLCBsZW4oZWxpZ2libGUpKQogICAgICAgIGlmIG91cjoKICAgICAgICAgICAgeCA9IGNsYW1wKGJbJ3gnXSArIDUgKyAocmFuayAlIDIpICogMiwgMTMsIDMyLjUpCiAgICAgICAgICAgIHkgPSBjbGFtcCg1LjUgKyByYW5rICogKDE1LjAgLyBtYXgoMSwgciAtIDEpKSwgMywgMjMpCiAgICAgICAgICAgIGlmIHZhcmlhbnQgPT0gJ2xpbmsnOgogICAgICAgICAgICAgICAgeCA9IGNsYW1wKGJbJ3gnXSArIDcgKyAocmFuayAlIDIpICogMiwgMTAsIDMyLjQpCiAgICAgICAgICAgICAgICB5ID0gY2xhbXAoYlsneSddICsgKDEgaWYgcmFuayAlIDIgZWxzZSAtMSkgKiAoNCArIChyYW5rIC8vIDIpICogMyksIDMuNSwgMjIuNSkKICAgICAgICBlbHNlOgogICAgICAgICAgICB4ID0gY2xhbXAoYlsneCddIC0gMy4yLCA4LCAyOSkKICAgICAgICAgICAgeSA9IGNsYW1wKGJbJ3knXSArIChyYW5rIC0gKHIgLSAxKSAvIDIuMCkgKiAzLjEsIDMsIDIzKQogICAgICAgICAgICBpZiBvd25lciBpcyBub3QgTm9uZSBhbmQgcmFuayAlIDIgPT0gMDoKICAgICAgICAgICAgICAgIHggPSBjbGFtcChvd25lci54IC0gMi41LCA5LCAzMCkKICAgICAgICAgICAgICAgIHkgPSBjbGFtcChvd25lci55ICsgKHJhbmsgJSAzIC0gMSkgKiAyLjQsIDMsIDIzKQogICAgICAgIGlmIHNbJ24nXSA+PSA0IGFuZCB1LmluZGV4ID09IHNbJ24nXSAtIDE6CiAgICAgICAgICAgIHggPSBjbGFtcChiWyd4J10gLSA4LCA4LCAyNCkKICAgICAgICAgICAgeSA9IGNsYW1wKDEzICsgKGJbJ3knXSAtIDEzKSAqIDAuNSwgNywgMTkpCiAgICAgICAgdGFyZ2V0c1t1LmlkXSA9ICh4LCB5KQogICAgb3V0ID0gW10KICAgIGZvciB1IGluIHNbJ3VzJ106CiAgICAgICAgaWYgb3VyIGFuZCBvd25lciBpcyBub3QgTm9uZSBhbmQgdS5pZCA9PSBvd25lci5pZDoKICAgICAgICAgICAgYSA9IF9vY2FycnkodSwgcywgdmFyaWFudCkKICAgICAgICBlbHNlOgogICAgICAgICAgICB0ID0gdGFyZ2V0cy5nZXQodS5pZCkgb3IgKGJbJ3gnXSwgYlsneSddKQogICAgICAgICAgICBhaW0gPSBtYXRoLmRlZ3JlZXMobWF0aC5hdGFuMigxMyAtIHUueSwgNDMgLSB1LngpKSAlIDM2MC4wCiAgICAgICAgICAgIHNoID0gX29zaG90KHUsIHMpIGlmIG1hdGguaHlwb3QodS54IC0gYlsneCddLCB1LnkgLSBiWyd5J10pIDwgMS41IGVsc2UgTm9uZQogICAgICAgICAgICBraWNrID0gYm9vbChzaCBhbmQgc2hbJ3Njb3JlJ10gPiAwKQogICAgICAgICAgICBpZiBzaCBpcyBub3QgTm9uZSBhbmQgc2hbJ3Njb3JlJ10gPiAtMC4xOgogICAgICAgICAgICAgICAgYWltID0gc2hbJ2FpbSddCiAgICAgICAgICAgIGlmIHUuaW5kZXggPT0gMCBhbmQgc1snbiddID4gMSBhbmQgdS54IDwgMTA6CiAgICAgICAgICAgICAgICBhaW0gPSBtYXRoLmRlZ3JlZXMobWF0aC5hdGFuMigtNiBpZiB1LnkgPCAxMyBlbHNlIDYsIDE1KSkgJSAzNjAuMAogICAgICAgICAgICAgICAga2ljayA9IFRydWUKICAgICAgICAgICAgYSA9IHsnZGlyJzogX29tb3ZlKHUsIHQpLCAnYWltJzogYWltLCAna2ljayc6IGtpY2t9CiAgICAgICAgaWYgdGVhbToKICAgICAgICAgICAgYVsnYWltJ10gPSAoMTgwIC0gYVsnYWltJ10gKyAzNjApICUgMzYwCiAgICAgICAgICAgIGFbJ2RpciddID0gX01JUi5nZXQoYVsnZGlyJ10sIGFbJ2RpciddKQogICAgICAgIG91dC5hcHBlbmQoKGFbJ2RpciddLCBhWydhaW0nXSwgYVsna2ljayddKSkKICAgIHJldHVybiBvdXQKCgpkZWYgX29jb3N0KHUsIHBhdGgpOgogICAgZm9yIHAgaW4gcGF0aDoKICAgICAgICBpZiBfb3NhZmUocFsneCddLCBwWyd5J10pIGFuZCBtYXRoLmh5cG90KHUueCAtIHBbJ3gnXSwgdS55IC0gcFsneSddKSA8PSAzLjE1ICogcFsndCddICsgMC42NToKICAgICAgICAgICAgcmV0dXJuIHBbJ3QnXQogICAgcCA9IHBhdGhbLTFdCiAgICByZXR1cm4gbWF0aC5oeXBvdCh1LnggLSBwWyd4J10sIHUueSAtIHBbJ3knXSkgLyAzLjE1CgoKZGVmIF9vY2FycnkodSwgcywgdmFyaWFudD0nbWFpbicpOgogICAgc2ggPSBfb3Nob3QodSwgcykKICAgIHByZXNzdXJlID0gbWluKFttYXRoLmh5cG90KGUueCAtIHUueCwgZS55IC0gdS55KSBmb3IgZSBpbiBzWyd0aGVtJ11dIG9yIFs5LjBdKQogICAgdGhyID0geydhdHRhY2snOiAtMi4wLCAnd2lkZSc6IDAuMjUsICdsaW5rJzogLTAuNDV9LmdldCh2YXJpYW50LCAtMC4xMikKICAgIGlmIHNoWydzY29yZSddID4gdGhyIG9yICh1LnggPiAzMC41IGFuZCBzaFsnc2NvcmUnXSA+IC0wLjg1IGFuZCBwcmVzc3VyZSA8IDIpOgogICAgICAgIHJldHVybiB7J2Rpcic6ICdOJywgJ2FpbSc6IHNoWydhaW0nXSwgJ2tpY2snOiBUcnVlfQogICAgdGFyZ2V0ID0gKDMzLjI1LCBjbGFtcCh1LnksIDksIDE3KSkKICAgIGlmIHUueCA+IDMxLjU6CiAgICAgICAgaWYgdS55IDwgMTIuODoKICAgICAgICAgICAgc2lkZSA9IDQuNgogICAgICAgIGVsaWYgdS55ID4gMTMuMjoKICAgICAgICAgICAgc2lkZSA9IDIxLjQKICAgICAgICBlbHNlOgogICAgICAgICAgICBrcCA9IFtlIGZvciBlIGluIHNbJ3RoZW0nXSBpZiBlLmluZGV4ID09IDBdCiAgICAgICAgICAgIHNpZGUgPSA0LjYgaWYgKGtwIGFuZCBrcFswXS55ID4gMTMpIGVsc2UgMjEuNAogICAgICAgIHRhcmdldCA9ICgzOS43IGlmICh1LnkgPCA0Ljkgb3IgdS55ID4gMjEuMSkgZWxzZSAzMi43NSwgc2lkZSkKICAgIHBhcyA9IE5vbmUKICAgIGlmIHByZXNzdXJlIDwgMi40IG9yICh1LmluZGV4ID09IDAgYW5kIHNbJ24nXSA+IDEgYW5kIHUueCA8IDEyKSBvciAodmFyaWFudCA9PSAnbGluaycgYW5kIHNbJ24nXSA+IDEpOgogICAgICAgIGJ2ID0gLTFlOQogICAgICAgIG9wdGlvbnMgPSBbeyd4JzogYS54LCAneSc6IGEueSwgJ3JlY2VpdmVyJzogYX0KICAgICAgICAgICAgICAgICAgIGZvciBhIGluIHNbJ3VzJ10gaWYgYS5pZCAhPSB1LmlkIGFuZCBhLnggPiB1LnggKyAyXQogICAgICAgIGlmIHUueCA8IDI4OgogICAgICAgICAgICBmb3IgZHkgaW4gKC0xMCwgLTUsIDAsIDUsIDEwKToKICAgICAgICAgICAgICAgIG9wdGlvbnMuYXBwZW5kKHsneCc6IG1pbigzMy4wLCB1LnggKyAoNiBpZiBhYnMoZHkpID09IDEwIGVsc2UgMTIpKSwKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAneSc6IGNsYW1wKHUueSArIGR5LCAyLCAyNCl9KQogICAgICAgIGZvciBwIGluIG9wdGlvbnM6CiAgICAgICAgICAgIGxuID0gbWF0aC5oeXBvdChwWyd4J10gLSB1LngsIHBbJ3knXSAtIHUueSkKICAgICAgICAgICAgaWYgbG4gPCAzIG9yIGxuID4gMjA6CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICB1eCwgdXkgPSAocFsneCddIC0gdS54KSAvIGxuLCAocFsneSddIC0gdS55KSAvIGxuCiAgICAgICAgICAgIG1hcmdpbiwgdCwgdiA9IDEwLjAsIDAuMCwgMTEuMAogICAgICAgICAgICB4LCB5ID0gdS54ICsgdXggKiAwLjYsIHUueSArIHV5ICogMC42CiAgICAgICAgICAgIGsgPSAwCiAgICAgICAgICAgIHdoaWxlIGsgPCAxMDAgYW5kIG1hdGguaHlwb3QoeCAtIHUueCwgeSAtIHUueSkgPCBsbiAtIDAuNToKICAgICAgICAgICAgICAgIHggKz0gdXggKiB2ICogMC4wNQogICAgICAgICAgICAgICAgeSArPSB1eSAqIHYgKiAwLjA1CiAgICAgICAgICAgICAgICB2ICo9IDAuOTc4CiAgICAgICAgICAgICAgICB0ICs9IDAuMDUKICAgICAgICAgICAgICAgIGZvciBlIGluIHNbJ3RoZW0nXToKICAgICAgICAgICAgICAgICAgICBkZCA9IG1hdGguaHlwb3QoeCAtIGUueCwgeSAtIGUueSkgLSAwLjgyIC0gMy4xNSAqIG1heCgwLjAsIHQgLSAwLjM1KQogICAgICAgICAgICAgICAgICAgIGlmIGRkIDwgbWFyZ2luOgogICAgICAgICAgICAgICAgICAgICAgICBtYXJnaW4gPSBkZAogICAgICAgICAgICAgICAgayArPSAxCiAgICAgICAgICAgIHZhbCA9IDMgKiBtaW4obWFyZ2luLCAyKSArIChwWyd4J10gLSB1LngpICogMC4xNiArICgxLjUgaWYgcC5nZXQoJ3JlY2VpdmVyJykgZWxzZSAwKSAtIGFicyhwWyd5J10gLSAxMykgKiAwLjAyCiAgICAgICAgICAgIGlmIHZhbCA+IGJ2OgogICAgICAgICAgICAgICAgYnYgPSB2YWwKICAgICAgICAgICAgICAgIHBhcyA9IHsnZGlyJzogJ04nLCAnYWltJzogbWF0aC5kZWdyZWVzKG1hdGguYXRhbjIocFsneSddIC0gdS55LCBwWyd4J10gLSB1LngpKSAlIDM2MCwKICAgICAgICAgICAgICAgICAgICAgICAna2ljayc6IFRydWUsICdtYXJnaW4nOiBtYXJnaW59CiAgICAgICAgaWYgcGFzIGlzIG5vdCBOb25lIGFuZCAocGFzWydtYXJnaW4nXSA+IC0wLjIgb3IgcHJlc3N1cmUgPCAxLjIgb3IgdS54IDwgMTApOgogICAgICAgICAgICByZXR1cm4gcGFzCiAgICBiZXN0LCBidiA9IE5vbmUsIC0xZTkKICAgIGZvciBuYW1lLCBkeCwgZHkgaW4gX09EOgogICAgICAgIHgsIHkgPSB1LnggKyBkeCAqIDAuMDkxMzUsIHUueSArIGR5ICogMC4wOTEzNQogICAgICAgIGlmIG5vdCBfb3NhZmUoeCwgeSk6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgdmFsdWUgPSAtbWF0aC5oeXBvdCh0YXJnZXRbMF0gLSB4LCB0YXJnZXRbMV0gLSB5KQogICAgICAgIGZvciBlIGluIHNbJ3RoZW0nXToKICAgICAgICAgICAgZGQgPSBtYXRoLmh5cG90KHggLSBlLngsIHkgLSBlLnkpCiAgICAgICAgICAgIGlmIGRkIDwgMi41OgogICAgICAgICAgICAgICAgdmFsdWUgLT0gMS40ICogKDIuNSAtIGRkKSAqKiAyCiAgICAgICAgaWYgdmFsdWUgPiBidjoKICAgICAgICAgICAgYnYsIGJlc3QgPSB2YWx1ZSwgbmFtZQogICAgZSA9IG1pbihzWyd0aGVtJ10sIGtleT1sYW1iZGEgejogbWF0aC5oeXBvdCh6LnggLSB1LngsIHoueSAtIHUueSkpIGlmIHNbJ3RoZW0nXSBlbHNlIE5vbmUKICAgIGlmIHByZXNzdXJlIDwgMyBhbmQgZSBpcyBub3QgTm9uZToKICAgICAgICBhaW0gPSBtYXRoLmRlZ3JlZXMobWF0aC5hdGFuMih1LnkgLSBlLnksIHUueCAtIGUueCkpICUgMzYwCiAgICBlbHNlOgogICAgICAgIGFpbSA9IG1hdGguZGVncmVlcyhtYXRoLmF0YW4yKHRhcmdldFsxXSAtIHUueSwgdGFyZ2V0WzBdIC0gdS54KSkgJSAzNjAKICAgIHJldHVybiB7J2Rpcic6IGJlc3Qgb3IgJ04nLCAnYWltJzogYWltLCAna2ljayc6IEZhbHNlfQoKCmRlZiBvcHBfcGxhbihzdCwgbWUsIGhvcml6b249MjApOgogICAgIiIiMjAtZnJhbWUgcGxhbiBmb3IgdGhlIG9wcG9uZW50LCBmcm9tIHRoZSB0cnVlIHN0YXRlIGF0IHdpbmRvdyBzdGFydC4iIiIKICAgIHJvd3MgPSBbXQogICAgc2ltID0gc3QuY2xvbmUoKQogICAgb3RoZXIgPSAxIC0gbWUKICAgIGZvciBmIGluIHJhbmdlKGhvcml6b24pOgogICAgICAgIGFjdHMgPSBfb3BvbGljeShzaW0sIG90aGVyLCAnbWFpbicpCiAgICAgICAgaW5wID0gW10KICAgICAgICByb3cgPSB7fQogICAgICAgIGZvciB1IGluIHNpbS51bml0czoKICAgICAgICAgICAgaWYgdS50ZWFtID09IG90aGVyOgogICAgICAgICAgICAgICAgZCwgYWltLCBraWNrID0gYWN0c1t1LmluZGV4XQogICAgICAgICAgICAgICAgYWEgPSBtYXRoLnJhZGlhbnMoYWltKQogICAgICAgICAgICAgICAgaW5wLmFwcGVuZCgoZCwgKG1hdGguY29zKGFhKSwgbWF0aC5zaW4oYWEpKSwga2ljaykpCiAgICAgICAgICAgICAgICByb3dbdS5pbmRleF0gPSBpbnBbLTFdCiAgICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICBpbnAuYXBwZW5kKCgnTicsIE5vbmUsIEZhbHNlKSkKICAgICAgICByb3dzLmFwcGVuZChyb3cpCiAgICAgICAgZyA9IEFfc3RlcChzaW0sIGlucCkKICAgICAgICBpZiBnID49IDAgb3Igc2ltLnN0YXR1cyAhPSAncGxheWluZyc6CiAgICAgICAgICAgIGJyZWFrCiAgICB3aGlsZSBsZW4ocm93cykgPCBob3Jpem9uOgogICAgICAgIHJvd3MuYXBwZW5kKHt9KQogICAgcmV0dXJuIHJvd3MKCgpBX3N0ZXAgPSBOb25lCgoKZGVmIHNldF9lbmdpbmUoZm4pOgogICAgZ2xvYmFsIEFfc3RlcAogICAgQV9zdGVwID0gZm4KCgojID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gb3VyIHBsYXkKZGVmIHRlYW1fdW5pdHMoc3QsIG1lKToKICAgIHJldHVybiBbdSBmb3IgdSBpbiBzdC51bml0cyBpZiB1LnRlYW0gPT0gbWVdCgoKZGVmIHJvbGVzX2ZvcihuKToKICAgIGlmIG4gPD0gMToKICAgICAgICByZXR1cm4gezA6ICdzb2xvJ30KICAgIGlmIG4gPT0gMjoKICAgICAgICByZXR1cm4gezA6ICdrZWVwZXInLCAxOiAnc3RyaWtlcid9CiAgICBpZiBuID09IDM6CiAgICAgICAgcmV0dXJuIHswOiAna2VlcGVyJywgMTogJ3Bvc3QwJywgMjogJ3N0cmlrZXInfQogICAgaWYgbiA9PSA0OgogICAgICAgIHJldHVybiB7MDogJ2tlZXBlcicsIDE6ICdwb3N0MCcsIDI6ICdwb3N0MScsIDM6ICdzdHJpa2VyJ30KICAgIGlmIG4gPT0gNToKICAgICAgICByZXR1cm4gezA6ICdrZWVwZXInLCAxOiAncG9zdDAnLCAyOiAncG9zdDEnLCAzOiAnc3RyaWtlcicsIDQ6ICdzdHJpa2VyJ30KICAgIHJldHVybiB7MDogJ2tlZXBlcicsIDE6ICdwb3N0MCcsIDI6ICdwb3N0MScsIDM6ICdzdHJpa2VyJywgNDogJ3N0cmlrZXInLCA1OiAnc3RyaWtlcid9CgoKZGVmIG5lYXJlc3QodW5pdHMsIHgsIHkpOgogICAgaWYgbm90IHVuaXRzOgogICAgICAgIHJldHVybiBOb25lCiAgICByZXR1cm4gbWluKHVuaXRzLCBrZXk9bGFtYmRhIG86IChvLnggLSB4KSAqKiAyICsgKG8ueSAtIHkpICoqIDIpCgoKZGVmIGNvcm5lcl9zcG90cyhtZSk6CiAgICBhID0gc2duX2F0ayhtZSkKICAgIGd4ID0gb3BwX2d4KG1lKQogICAgcmV0dXJuIFsoZ3ggLSBhICogNC40LCA0LjEpLCAoZ3ggLSBhICogNC40LCAyMS45KV0KCgpkZWYgcG9hY2hlcl9zcG90KHN0LCBtZSwgb3BwcywgYmFsbF94eSwgcHJlZmVyPU5vbmUpOgogICAgIiIiQ2hvb3NlIHRoZSBjb3JyaWRvciBzaWRlLiBTYW1lIHNpZGUgYXMgdGhlIGJhbGwgaXMgYSBzaG9ydGVyIHBhc3M7CiAgICB0aGUgc2lkZSB3aXRoIGZld2VyIG9wcG9uZW50cyBpcyBzYWZlci4iIiIKICAgIGJ4LCBieSA9IGJhbGxfeHkKICAgIGJlc3QsIGJ2ID0gTm9uZSwgLTFlMTgKICAgIGZvciBpLCAoc3gsIHN5KSBpbiBlbnVtZXJhdGUoY29ybmVyX3Nwb3RzKG1lKSk6CiAgICAgICAgY3Jvd2QgPSAwLjAKICAgICAgICBmb3IgbyBpbiBvcHBzOgogICAgICAgICAgICBkID0gbWF0aC5oeXBvdChvLnggLSBzeCwgby55IC0gc3kpCiAgICAgICAgICAgIGlmIGQgPCA2LjA6CiAgICAgICAgICAgICAgICBjcm93ZCArPSAoNi4wIC0gZCkKICAgICAgICBzaWRlX3dhbnQgPSAxLjAgaWYgKGkgPT0gMCkgPT0gKGJ5IDwgMTMuMCkgZWxzZSAwLjAKICAgICAgICB2ID0gLWNyb3dkICogMC4zNSArIHNpZGVfd2FudCAqIDIuMgogICAgICAgIGlmIHByZWZlciBpcyBub3QgTm9uZSBhbmQgcHJlZmVyID09IGk6CiAgICAgICAgICAgIHYgKz0gMy4wCiAgICAgICAgaWYgdiA+IGJ2OgogICAgICAgICAgICBidiwgYmVzdCA9IHYsIChzeCwgc3kpCiAgICByZXR1cm4gYmVzdAoKCmRlZiBib3hfZWRnZShtZSwgeSk6CiAgICBhID0gc2duX2F0ayhtZSkKICAgIHJldHVybiBvcHBfZ3gobWUpIC0gYSAqIDkuNCwgY2xhbXAoeSwgMy4yLCAyMi44KQoKCmNsYXNzIF9QKG9iamVjdCk6CiAgICBfX3Nsb3RzX18gPSAoJ3gnLCAneScsICdpbmRleCcpCgogICAgZGVmIF9faW5pdF9fKHNlbGYsIHgsIHksIGluZGV4KToKICAgICAgICBzZWxmLngsIHNlbGYueSwgc2VsZi5pbmRleCA9IHgsIHksIGluZGV4CgoKS0VFUF9UR1QgPSB7J3knOiBOb25lLCAnbWUnOiBOb25lLCAnZnJhbWUnOiAtOTk5fQoKCmRlZiBiZXN0X3Nob3RfZnJvbShtZSwgb3gsIG95LCBvYnN0YWNsZXMsIGFpbXM9Tm9uZSk6CiAgICAiIiJCZXN0IHNob3QgcGdvIGZvciBhIGh5cG90aGV0aWNhbCBzaG9vdGVyIGF0IChveCxveSkgKHVzZWQgZm9yIHRoZWlyIHNpZGUpLiIiIgogICAgZ3ggPSA0My4wIGlmIG1lID09IDAgZWxzZSAxLjAKICAgIGJlc3QgPSAwLjAKICAgIGZvciB0eSBpbiAoYWltcyBvciBTSE9UX1lTKToKICAgICAgICBhbmcgPSBtYXRoLmF0YW4yKHR5IC0gb3ksIGd4IC0gb3gpCiAgICAgICAgZngsIGZ5ID0gbWF0aC5jb3MoYW5nKSwgbWF0aC5zaW4oYW5nKQogICAgICAgIHAsIGd0LCBjbHIgPSBzaG90X3F1YWxpdHkob3ggKyBmeCAqIEtJQ0tfT0ZGLCBveSArIGZ5ICogS0lDS19PRkYsIGFuZywgbWUsIG9ic3RhY2xlcykKICAgICAgICBpZiBwID4gYmVzdDoKICAgICAgICAgICAgYmVzdCA9IHAKICAgIHJldHVybiBiZXN0CgoKZGVmIGtlZXBlcl9iZXN0X3koc3QsIG1lKToKICAgICIiIlBpY2sgdGhlIGdvYWwtbGluZSB5IHRoYXQgbWluaW1pc2VzIHRoZSBvcHBvbmVudCdzIGJlc3Qgc2hvdC4iIiIKICAgIGd4ID0gb3duX2d4KG1lKQogICAgYSA9IHNnbl9hdGsobWUpCiAgICBteSA9IFt1IGZvciB1IGluIHN0LnVuaXRzIGlmIHUudGVhbSA9PSBtZV0KICAgIG9wcHMgPSBbdSBmb3IgdSBpbiBzdC51bml0cyBpZiB1LnRlYW0gIT0gbWVdCiAgICBpZiBub3Qgb3BwczoKICAgICAgICByZXR1cm4gMTMuMAogICAgb3duZXIgPSBzdC51bml0c1tzdC5vd25lcl0gaWYgMCA8PSBzdC5vd25lciA8IGxlbihzdC51bml0cykgZWxzZSBOb25lCiAgICBpZiBvd25lciBpcyBub3QgTm9uZSBhbmQgb3duZXIudGVhbSAhPSBtZToKICAgICAgICBveCwgb3kgPSBvd25lci54LCBvd25lci55CiAgICBlbHNlOgogICAgICAgIG94LCBveSA9IHN0LmJ4LCBzdC5ieQogICAgaWYgKGFicyhveCAtIGd4KSA+IDMwLjApOgogICAgICAgIHJldHVybiBjbGFtcCgxMy4wICsgKG95IC0gMTMuMCkgKiAwLjQ1LCAxMC44LCAxNS4yKQogICAgYmVzdCwgYmVzdHYgPSAxMy4wLCAxZTkKICAgIGZvciBkeSBpbiAoMTAuNzUsIDExLjM1LCAxMS45NSwgMTIuNSwgMTMuMSwgMTMuNywgMTQuMywgMTQuOSwgMTUuMzUpOgogICAgICAgIG9icyA9IFtdCiAgICAgICAgZm9yIHUgaW4gc3QudW5pdHM6CiAgICAgICAgICAgIGlmIHUudGVhbSA9PSBtZSBhbmQgdS5pbmRleCA9PSAwOgogICAgICAgICAgICAgICAgb2JzLmFwcGVuZChfUChneCArIGEgKiAwLjgsIGR5LCAwKSkKICAgICAgICAgICAgZWxzZToKICAgICAgICAgICAgICAgIG9icy5hcHBlbmQoX1AodS54LCB1LnksIHUuaW5kZXggaWYgdS50ZWFtID09IG1lIGVsc2UgMjUwKSkKICAgICAgICBwID0gYmVzdF9zaG90X2Zyb20oMSAtIG1lLCBveCwgb3ksIG9icykKICAgICAgICBpZiBwIDwgYmVzdHY6CiAgICAgICAgICAgIGJlc3R2LCBiZXN0ID0gcCwgZHkKICAgIHJldHVybiBiZXN0CgoKZGVmIGtlZXBlcl9zcG90KHN0LCBtZSk6CiAgICBneCA9IG93bl9neChtZSkKICAgIGEgPSBzZ25fYXRrKG1lKQogICAgYnkgPSBzdC5ieQogICAgbmVhciA9IDEwLjk1IGlmIGJ5IDwgMTMuMCBlbHNlIDE1LjA1CiAgICByZXR1cm4gZ3ggKyBhICogMC44NSwgbmVhcgoKCmRlZiBrZWVwZXJfY21kKHN0LCBtZSwgdSwgb3Bwcyk6CiAgICBneCA9IG93bl9neChtZSkKICAgIGEgPSBzZ25fYXRrKG1lKQogICAgaWYgc3Qub3duZXIgPCAwOgogICAgICAgIGQgPSBtYXRoLmh5cG90KHN0LmJ4IC0gdS54LCBzdC5ieSAtIHUueSkKICAgICAgICBzcCA9IG1hdGguaHlwb3Qoc3QuYnZ4LCBzdC5idnkpCiAgICAgICAgb3duID0gaW5fb3duX2JveChtZSwgc3QuYngsIHN0LmJ5LCAwLjUpCiAgICAgICAgY2xvc2VyID0gYW55KG1hdGguaHlwb3Qoby54IC0gc3QuYngsIG8ueSAtIHN0LmJ5KSA8IGQgLSAwLjMgZm9yIG8gaW4gb3BwcykKICAgICAgICBpZiBkIDwgMS42IG9yIChvd24gYW5kIHNwIDwgNy4wIGFuZCBkIDwgNS4wIGFuZCBub3QgY2xvc2VyKToKICAgICAgICAgICAgcmV0dXJuIChtb3ZlX2Rpcih1LCBzdC5ieCwgc3QuYnksIG1lLCBhbGxvd19ib3g9RmFsc2UpLCBOb25lLCBGYWxzZSkKICAgIGRfYmFsbCA9IChzdC5ieCAtIGd4KSAqIGEKICAgIG5lYXJfeSA9IDEwLjk1IGlmIHN0LmJ5IDwgMTMuMCBlbHNlIDE1LjA1CiAgICB0eCA9IGd4ICsgYSAqIDAuNzUKICAgIHR5ID0gbmVhcl95CiAgICBzcCA9IG1hdGguaHlwb3Qoc3QuYnZ4LCBzdC5idnkpCiAgICBtb3ZpbmdfaW4gPSAoZ3ggLSBzdC5ieCkgKiBzdC5idnggPiAwLjQgYW5kIHNwID4gMC44CiAgICBpZiBtb3ZpbmdfaW46CiAgICAgICAgcHRzLCBndCA9IGZsaWdodChzdC5ieCwgc3QuYnksIG1hdGguYXRhbjIoc3QuYnZ5LCBzdC5idngpLCA2MCkKICAgICAgICBjcm9zcyA9IE5vbmUKICAgICAgICBmb3IgKHB4LCBweSkgaW4gcHRzOgogICAgICAgICAgICBpZiAoYSA+IDAgYW5kIHB4IDw9IGd4ICsgMC4zKSBvciAoYSA8IDAgYW5kIHB4ID49IGd4IC0gMC4zKToKICAgICAgICAgICAgICAgIGNyb3NzID0gcHkKICAgICAgICAgICAgICAgIGJyZWFrCiAgICAgICAgaWYgY3Jvc3MgaXMgbm90IE5vbmU6CiAgICAgICAgICAgIHR5ID0gY2xhbXAoY3Jvc3MsIDEwLjIsIDE1LjgpCiAgICAgICAgICAgIHR4ID0gZ3ggKyBhICogMC41CiAgICAgICAgZWxzZToKICAgICAgICAgICAgdHkgPSAxMy4wCiAgICBpZiBkX2JhbGwgPCA4LjA6CiAgICAgICAgdHggPSBneCArIGEgKiAxLjYKICAgIHJldHVybiAobW92ZV9kaXIodSwgdHgsIHR5LCBtZSwgYWxsb3dfYm94PUZhbHNlKSwgTm9uZSwgRmFsc2UpCgoKZGVmIHBvc3RfdGFyZ2V0KHN0LCBtZSwgcm9sZSwgcmFuaz0wLCBubGluZT0yKToKICAgICIiIlR3byBwb3N0cyBvbiB0aGUgZ29hbCBsaW5lOiBvbmUgb24gdGhlIGZhciBwb3N0LCBvbmUgaW4gdGhlIG1pZGRsZSwKICAgIHdpdGggdGhlIGtlZXBlciBvbiB0aGUgbmVhciBwb3N0LiAgVG9nZXRoZXIgdGhleSBjb3ZlciB0aGUgd2hvbGUgbW91dGguIiIiCiAgICBneCA9IG93bl9neChtZSkKICAgIGEgPSBzZ25fYXRrKG1lKQogICAgaWYgc3QuYnkgPCAxMy4wOgogICAgICAgIG5lYXJfeSwgZmFyX3kgPSAxMC45NSwgMTUuMDUKICAgIGVsc2U6CiAgICAgICAgbmVhcl95LCBmYXJfeSA9IDE1LjA1LCAxMC45NQogICAgeSA9IGZhcl95IGlmIHJvbGUgPT0gJ3Bvc3QwJyBlbHNlIDEzLjAKICAgIHJldHVybiBneCArIGEgKiAwLjYsIHkKCgpkZWYgcHJlc3NfdGFyZ2V0KHN0LCBtZSwgdSwgb3BwX293bmVyKToKICAgIGd4ID0gb3duX2d4KG1lKQogICAgaWYgb3BwX293bmVyIGlzIG5vdCBOb25lOgogICAgICAgIHB4LCBweSA9IG9wcF9vd25lci54ICsgb3BwX293bmVyLmZ4ICogMC42Miwgb3BwX293bmVyLnkgKyBvcHBfb3duZXIuZnkgKiAwLjYyCiAgICBlbHNlOgogICAgICAgIHB4LCBweSA9IHN0LmJ4ICsgc3QuYnZ4ICogMC4xNSwgc3QuYnkgKyBzdC5idnkgKiAwLjE1CiAgICBkeCwgZHkgPSBneCAtIHB4LCAxMy4wIC0gcHkKICAgIGRkID0gbWF0aC5oeXBvdChkeCwgZHkpIG9yIDEuMAogICAgIyBzdGFuZCB+Mi42IHVuaXRzIGdvYWwtc2lkZSBvZiB0aGUgYmFsbDogYSAwLjgyIGRpc2MgdGhlcmUgY292ZXJzIHRoZSB3aG9sZQogICAgIyBzaG90IGNvbmUsIHNvIHRoZWlyIHNob3QoKSBzZWVzIG5vIGxhbmUuICBTdGlsbCBjbG9zZSBlbm91Z2ggdG8gdGFja2xlLgogICAgayA9IGNsYW1wKDAuMjIgKiBkZCwgMS43LCAzLjApCiAgICByZXR1cm4gY2xhbXAocHggKyBkeCAvIGRkICogaywgMC42LCBXIC0gMC42KSwgY2xhbXAocHkgKyBkeSAvIGRkICogaywgMC42LCBIIC0gMC42KQoKCmRlZiBwdW50X2V2YWwoc3QsIG1lLCB1LCBvcHBzLCBtYXRlcywgdG1heD05NSk6CiAgICAiIiJMb25nIGJhbGwgaW50byBzcGFjZTsgZ29vZCB3aGVuIG9uZSBvZiBvdXIgcnVubmVycyB3aW5zIHRoZSByYWNlLiIiIgogICAgYSA9IHNnbl9hdGsobWUpCiAgICBneCA9IG9wcF9neChtZSkKICAgIG15ID0gW20gZm9yIG0gaW4gbWF0ZXMgaWYgbS5pbmRleCAhPSAwIG9yIHN0Lm4gPT0gMV0gKyBbdV0KICAgIGJlc3QgPSBOb25lCiAgICB0YXJnZXRzID0gW10KICAgIGZvciBkIGluICgxMi4wLCAxNy4wLCAyMi4wKToKICAgICAgICB0YXJnZXRzLmFwcGVuZCgoZ3ggLSBhICogZCwgNC4xKSkKICAgICAgICB0YXJnZXRzLmFwcGVuZCgoZ3ggLSBhICogZCwgMjEuOSkpCiAgICBmb3IgbSBpbiBtYXRlczoKICAgICAgICBpZiBtLmluZGV4ID09IDAgYW5kIHN0Lm4gPiAxOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIHRhcmdldHMuYXBwZW5kKChtLnggKyBhICogMi4wLCBtLnkpKQogICAgZm9yICh0eCwgdHkpIGluIHRhcmdldHM6CiAgICAgICAgdHgsIHR5ID0gc2FmZV9wdChtZSwgdHgsIHR5LCAwLjUpCiAgICAgICAgYW5nID0gbWF0aC5hdGFuMih0eSAtIHUueSwgdHggLSB1LngpCiAgICAgICAgZDAgPSBtYXRoLmh5cG90KHR4IC0gdS54LCB0eSAtIHUueSkKICAgICAgICBpZiBkMCA8IDkuMDoKICAgICAgICAgICAgY29udGludWUKICAgICAgICBmeCwgZnkgPSBtYXRoLmNvcyhhbmcpLCBtYXRoLnNpbihhbmcpCiAgICAgICAgc3gsIHN5ID0gdS54ICsgZnggKiBLSUNLX09GRiwgdS55ICsgZnkgKiBLSUNLX09GRgogICAgICAgIHB0cywgZ3QgPSBmbGlnaHQoc3gsIHN5LCBhbmcsIHRtYXggKyAxMikKICAgICAgICBpZiBndCBpcyBub3QgTm9uZSBvciBub3QgcHRzOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIG91cnNfdCA9IE5vbmUKICAgICAgICBmb3IgdCBpbiByYW5nZShsZW4ocHRzKSk6CiAgICAgICAgICAgIGlmIHQgPiB0bWF4OgogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgYngsIGJ5ID0gcHRzW3RdCiAgICAgICAgICAgIGlmIG1hdGguaHlwb3QoYnggLSBzeCwgYnkgLSBzeSkgPCA3LjA6CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICBlbCA9ICh0ICsgMSkgKiBEVAogICAgICAgICAgICBpZiBhbnkobWF0aC5oeXBvdChieCAtIG0ueCwgYnkgLSBtLnkpIDw9IE1PViAqIGVsICsgQ1IgKiAwLjkgZm9yIG0gaW4gbXkpOgogICAgICAgICAgICAgICAgb3Vyc190ID0gdAogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICBpZiBvdXJzX3QgaXMgTm9uZToKICAgICAgICAgICAgY29udGludWUKICAgICAgICBieCwgYnkgPSBwdHNbb3Vyc190XQogICAgICAgIHRoZWlyc190ID0gOS4wCiAgICAgICAgZm9yIG8gaW4gb3BwczoKICAgICAgICAgICAgZm9yIHQgaW4gcmFuZ2Uob3Vyc190LCBtaW4obGVuKHB0cyksIHRtYXgpKToKICAgICAgICAgICAgICAgIHB4LCBweSA9IHB0c1t0XQogICAgICAgICAgICAgICAgaWYgbWF0aC5oeXBvdChweCAtIG8ueCwgcHkgLSBvLnkpIDw9IE1PViAqICh0ICsgMSkgKiBEVCArIENSICogMC45OgogICAgICAgICAgICAgICAgICAgIHRoZWlyc190ID0gbWluKHRoZWlyc190LCAodCArIDEpICogRFQpCiAgICAgICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgZWxzZToKICAgICAgICAgICAgICAgIHRoZWlyc190ID0gbWluKHRoZWlyc190LCBtYXRoLmh5cG90KGJ4IC0gby54LCBieSAtIG8ueSkgLyBNT1YpCiAgICAgICAgb3Vyc19zZWMgPSAob3Vyc190ICsgMSkgKiBEVAogICAgICAgIGlmIG91cnNfc2VjICsgMC4zNSA+IHRoZWlyc190OgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIGNvcnJpZG9yID0gKGJ5IDwgNi4yIG9yIGJ5ID4gMTkuOCkKICAgICAgICBib251cyA9IDAuMzAgaWYgY29ycmlkb3IgZWxzZSAwLjAKICAgICAgICBkX2dvYWwgPSBhYnMoZ3ggLSBieCkKICAgICAgICBpZiBkX2dvYWwgPCAyNi4wOgogICAgICAgICAgICBib251cyArPSAwLjIwCiAgICAgICAgaWYgZF9nb2FsIDwgMTUuMDoKICAgICAgICAgICAgYm9udXMgKz0gMC4yNQogICAgICAgIHBfYWZ0ZXIgPSByZWNlaXZlcl9zaG90X3ZhbHVlKHN0LCBtZSwgKGJ4LCBieSksIG9wcHMsIGJsaW5kX3NoaWZ0PW91cnNfc2VjKQogICAgICAgIGFkdiA9IChieCAtIHUueCkgKiBhCiAgICAgICAgdmFsID0gMC42MCAqIHBfYWZ0ZXIgKyAwLjAyMCAqIGFkdiArIGJvbnVzICsgMC4wOCAqIG1pbigyLjAsIHRoZWlyc190IC0gb3Vyc19zZWMpIC0gMC4wMTAgKiBkMAogICAgICAgIGlmIGJlc3QgaXMgTm9uZSBvciB2YWwgPiBiZXN0WzBdOgogICAgICAgICAgICBiZXN0ID0gKHZhbCwgYW5nLCAoYngsIGJ5KSwgb3Vyc190KQogICAgcmV0dXJuIGJlc3QKCgpkZWYgcGFzc19ldmFsKHN0LCBtZSwgdSwgbWF0ZSwgb3BwcywgbGVhZF90b3dhcmRfZ29hbD0xLjUsIHRtYXg9OTApOgogICAgIiIiKHZhbHVlLCBhbmcsIHJlY3ZfeHksIHJlY3ZfdCkgZm9yIGEgcGFzcyB1IC0+IG1hdGUuIiIiCiAgICBhID0gc2duX2F0ayhtZSkKICAgIHR4ID0gbWF0ZS54ICsgYSAqIGxlYWRfdG93YXJkX2dvYWwKICAgIHR5ID0gbWF0ZS55ICsgKDEzLjAgLSBtYXRlLnkpICogMC4xNQogICAgdHgsIHR5ID0gc2FmZV9wdChtZSwgdHgsIHR5LCAwLjUpCiAgICBhbmcgPSBtYXRoLmF0YW4yKHR5IC0gdS55LCB0eCAtIHUueCkKICAgIGQwID0gbWF0aC5oeXBvdChtYXRlLnggLSB1LngsIG1hdGUueSAtIHUueSkKICAgIGlmIGQwIDwgMS40OgogICAgICAgIHJldHVybiBOb25lCiAgICBmeCwgZnkgPSBtYXRoLmNvcyhhbmcpLCBtYXRoLnNpbihhbmcpCiAgICBzeCwgc3kgPSB1LnggKyBmeCAqIEtJQ0tfT0ZGLCB1LnkgKyBmeSAqIEtJQ0tfT0ZGCiAgICBwdHMsIGd0ID0gZmxpZ2h0KHN4LCBzeSwgYW5nLCB0bWF4ICsgNikKICAgIGlmIGd0IGlzIG5vdCBOb25lIG9yIG5vdCBwdHM6CiAgICAgICAgcmV0dXJuIE5vbmUKICAgICMgcmVjZWl2ZXIgY2hhc2UKICAgIHJlY3ZfdCA9IE5vbmUKICAgIHJ4LCByeSA9IG1hdGUueCwgbWF0ZS55CiAgICBmb3IgdCBpbiByYW5nZShsZW4ocHRzKSk6CiAgICAgICAgYngsIGJ5ID0gcHRzW3RdCiAgICAgICAgaWYgbWF0aC5oeXBvdChieCAtIHJ4LCBieSAtIHJ5KSA8PSBNT1YgKiAodCArIDEpICogRFQgKyBDUiAqIDAuODU6CiAgICAgICAgICAgIHJlY3ZfdCA9IHQKICAgICAgICAgICAgYnJlYWsKICAgIGlmIHJlY3ZfdCBpcyBOb25lOgogICAgICAgIHJldHVybiBOb25lCiAgICBpZiByZWN2X3QgPiB0bWF4OgogICAgICAgIHJldHVybiBOb25lCiAgICBpZiByZWN2X3QgPiAyNiBhbmQgbWF0aC5oeXBvdChtYXRlLnggLSB1LngsIG1hdGUueSAtIHUueSkgPCAxNC4wOgogICAgICAgIHJldHVybiBOb25lCiAgICAjIGxhbmUgY2xlYXJhbmNlOiB0aGUgcGFzcyBpcyBzbG93LCBvcHBvbmVudHMgcmVhY3QgYWZ0ZXIgMC40NSBzCiAgICB3b3JzdCA9IDkuMAogICAgZm9yIG8gaW4gb3BwczoKICAgICAgICBpZiBvIGlzIG1hdGU6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgbSA9IDkuMAogICAgICAgIGZvciB0IGluIHJhbmdlKDAsIHJlY3ZfdCArIDEpOgogICAgICAgICAgICBieCwgYnkgPSBwdHNbdF0KICAgICAgICAgICAgZGQgPSBtYXRoLmh5cG90KGJ4IC0gby54LCBieSAtIG8ueSkgLSBDUiAtIE1PViAqIG1heCgwLjAsICh0ICsgMSkgKiBEVCAtIDAuNzApICogMC44NQogICAgICAgICAgICBpZiBkZCA8IG06CiAgICAgICAgICAgICAgICBtID0gZGQKICAgICAgICBpZiBtIDwgd29yc3Q6CiAgICAgICAgICAgIHdvcnN0ID0gbQogICAgaWYgd29yc3QgPCAtMC4zNToKICAgICAgICByZXR1cm4gTm9uZQogICAgYngsIGJ5ID0gcHRzW3JlY3ZfdF0KICAgIHJldHVybiAod29yc3QsIGFuZywgKGJ4LCBieSksIHJlY3ZfdCkKCgpkZWYgcmVjZWl2ZXJfc2hvdF92YWx1ZShzdCwgbWUsIHBvcywgb3BwcywgYmxpbmRfc2hpZnQ9MC4wKToKICAgICIiIkJlc3Qgc2hvdCBwZ28gZm9yIGEgaHlwb3RoZXRpY2FsIHVuaXQgc3RhbmRpbmcgYXQgcG9zLiIiIgogICAgZ3ggPSBvcHBfZ3gobWUpCiAgICBiZXN0ID0gMC4wCiAgICBmb3IgdHkgaW4gKDEwLjcsIDEzLjAsIDE1LjMpOgogICAgICAgIGFuZyA9IG1hdGguYXRhbjIodHkgLSBwb3NbMV0sIGd4IC0gcG9zWzBdKQogICAgICAgIGZ4LCBmeSA9IG1hdGguY29zKGFuZyksIG1hdGguc2luKGFuZykKICAgICAgICBzeCwgc3kgPSBwb3NbMF0gKyBmeCAqIEtJQ0tfT0ZGLCBwb3NbMV0gKyBmeSAqIEtJQ0tfT0ZGCiAgICAgICAgcCwgZ3QsIGNsciA9IHNob3RfcXVhbGl0eShzeCwgc3ksIGFuZywgbWUsIG9wcHMsIGJsaW5kX3NoaWZ0PWJsaW5kX3NoaWZ0KQogICAgICAgIGlmIHAgPiBiZXN0OgogICAgICAgICAgICBiZXN0ID0gcAogICAgcmV0dXJuIGJlc3QKCgpkZWYgbWF0ZV9wb3RlbnRpYWwoc3QsIG1lLCBtLCBtYXRlcywgb3BwcywgZGVwdGg9MSk6CiAgICAiIiJIb3cgZGFuZ2Vyb3VzIGlzIGdpdmluZyB0aGUgYmFsbCB0byBtOiBzaG9vdCBub3csIG9yIG9uZSBtb3JlIHBhc3MuIiIiCiAgICBiZXN0ID0gcmVjZWl2ZXJfc2hvdF92YWx1ZShzdCwgbWUsIChtLngsIG0ueSksIG9wcHMpCiAgICBpZiBkZXB0aCA+IDA6CiAgICAgICAgZm9yIG8gaW4gbWF0ZXM6CiAgICAgICAgICAgIGlmIG8gaXMgbToKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAgIGlmIG8uaW5kZXggPT0gMCBhbmQgc3QubiA+IDE6CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICByID0gcGFzc19ldmFsKHN0LCBtZSwgbSwgbywgb3BwcywgbGVhZF90b3dhcmRfZ29hbD0xLjApCiAgICAgICAgICAgIGlmIHIgaXMgTm9uZToKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAgIGxhbmUsIGFuZywgcG9zLCBydCA9IHIKICAgICAgICAgICAgaWYgcnQgPiAzNDoKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAgIHBzID0gcmVjZWl2ZXJfc2hvdF92YWx1ZShzdCwgbWUsIHBvcywgb3BwcywgYmxpbmRfc2hpZnQ9cnQgKiBEVCkKICAgICAgICAgICAgaWYgMC44OCAqIHBzID4gYmVzdDoKICAgICAgICAgICAgICAgIGJlc3QgPSAwLjg4ICogcHMKICAgIHJldHVybiBiZXN0CgoKZGVmIGRyaWJibGVfdGFyZ2V0KHN0LCBtZSwgdSwgb3Bwcyk6CiAgICAiIiJXaGVyZSB0aGUgY2FycmllciBzaG91bGQgZHJpdmU6IHRoZSBjb3JyaWRvciBjb3JuZXIgcm91dGUgb3IgdGhlIGJveCBlZGdlLiIiIgogICAgYSA9IHNnbl9hdGsobWUpCiAgICBneCA9IG9wcF9neChtZSkKICAgICMgaWYgYWxyZWFkeSBpbiB0aGUgY29ycmlkb3IgYmFuZCwgZHJpdmUgYWxvbmcgaXQgdG93YXJkIHRoZSBnb2FsIGxpbmUKICAgIGlmIHUueSA8IDYuMiBvciB1LnkgPiAxOS44OgogICAgICAgIHNpZGUgPSAzLjkgaWYgdS55IDwgMTMuMCBlbHNlIDIyLjEKICAgICAgICAjIHRoZSBsaW5lIG9mIGRlZmVuZGVycyBjYW5ub3QgZm9sbG93IGJleW9uZCB4PTM2IChhdHRhY2tpbmcgZnJhbWUpLAogICAgICAgICMgc28gdGhlIHNob290aW5nIHNwb3QgaXMgNi41IHVuaXRzIGZyb20gdGhlIGdvYWwgbGluZSwgaW4gdGhlIGNvcnJpZG9yCiAgICAgICAgdHggPSBneCAtIGEgKiA2LjUKICAgICAgICByZXR1cm4gc2FmZV9wdChtZSwgdHgsIHNpZGUsIDAuNDUpCiAgICAjIG90aGVyd2lzZSBoZWFkIGZvciB0aGUgY2xvc2VzdCBjb3JyaWRvciBtb3V0aAogICAgc2lkZSA9IDQuMCBpZiB1LnkgPCAxMy4wIGVsc2UgMjIuMAogICAgaWYgKGd4IC0gdS54KSAqIGEgPCA5LjA6CiAgICAgICAgcmV0dXJuIHNhZmVfcHQobWUsIHUueCArIGEgKiAzLjAsIHNpZGUsIDAuNDUpCiAgICByZXR1cm4gc2FmZV9wdChtZSwgZ3ggLSBhICogOS42LCBjbGFtcCh1LnkgKyAoMTMuMCAtIHUueSkgKiAwLjIsIDYuNSwgMTkuNSksIDAuNSkKCgpkZWYgY2xlYXJfYWhlYWQoc3QsIG1lLCB1LCBvcHBzKToKICAgICIiIlB1bnQgdG93YXJkIHRoZSBjb3JyaWRvciBjb3JuZXIgb2YgdGhlIGZhciBzaWRlIChhIHJlYWwgY2xlYXJhbmNlKS4iIiIKICAgIGEgPSBzZ25fYXRrKG1lKQogICAgYmVzdCwgYnYgPSBOb25lLCAtMWUxOAogICAgZm9yIGNhbmQgaW4gKGNvcm5lcl9zcG90cyhtZSlbMF0sIGNvcm5lcl9zcG90cyhtZSlbMV0sCiAgICAgICAgICAgICAgICAgKHUueCArIGEgKiAxNCwgY2xhbXAodS55LCA0LjAsIDIyLjApKSwKICAgICAgICAgICAgICAgICAodS54ICsgYSAqIDEwLCAxMy4wKSk6CiAgICAgICAgYW5nID0gbWF0aC5hdGFuMihjYW5kWzFdIC0gdS55LCBjYW5kWzBdIC0gdS54KQogICAgICAgIGZ4LCBmeSA9IG1hdGguY29zKGFuZyksIG1hdGguc2luKGFuZykKICAgICAgICBzeCwgc3kgPSB1LnggKyBmeCAqIEtJQ0tfT0ZGLCB1LnkgKyBmeSAqIEtJQ0tfT0ZGCiAgICAgICAgcHRzLCBndCA9IGZsaWdodChzeCwgc3ksIGFuZywgOTApCiAgICAgICAgaWYgbm90IHB0czoKICAgICAgICAgICAgY29udGludWUKICAgICAgICB3b3JzdCA9IDkuMAogICAgICAgIGZvciBvIGluIG9wcHM6CiAgICAgICAgICAgIGZvciB0IGluIHJhbmdlKDAsIGxlbihwdHMpLCAyKToKICAgICAgICAgICAgICAgIGJ4LCBieSA9IHB0c1t0XQogICAgICAgICAgICAgICAgZGQgPSBtYXRoLmh5cG90KGJ4IC0gby54LCBieSAtIG8ueSkgLSBDUiAtIE1PViAqIG1heCgwLjAsICh0ICsgMSkgKiBEVCAtIDAuNSkKICAgICAgICAgICAgICAgIGlmIGRkIDwgd29yc3Q6CiAgICAgICAgICAgICAgICAgICAgd29yc3QgPSBkZAogICAgICAgIGlmIHdvcnN0ID4gYnY6CiAgICAgICAgICAgIGJ2LCBiZXN0ID0gd29yc3QsIGFuZwogICAgcmV0dXJuIGJlc3QKCgojIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBjYXJyaWVyIGFjdGlvbgpUUkFDRSA9IE5vbmUKCgpkZWYgY2Fycmllcl9hY3Rpb24oc3QsIG1lLCB1LCBtYXRlcywgb3Bwcywgc3R5bGUsIGN0eCk6CiAgICBjYWNoZSA9IE5vbmUKICAgIGtleSA9IE5vbmUKICAgIGlmIGN0eCBpcyBub3QgTm9uZSBhbmQgJ2NhY2hlJyBpbiBjdHg6CiAgICAgICAgY2FjaGUgPSBjdHhbJ2NhY2hlJ10KICAgICAgICBrZXkgPSAodS5pbmRleCwgc3QuZnJhbWUgPj4gMikKICAgICAgICBoaXQgPSBjYWNoZS5nZXQoa2V5KQogICAgICAgIGlmIGhpdCBpcyBub3QgTm9uZToKICAgICAgICAgICAgcmV0dXJuIGhpdAogICAgY21kID0gX2NhcnJpZXJfYWN0aW9uKHN0LCBtZSwgdSwgbWF0ZXMsIG9wcHMsIHN0eWxlLCBjdHgpCiAgICBpZiBjYWNoZSBpcyBub3QgTm9uZToKICAgICAgICBjYWNoZVtrZXldID0gY21kCiAgICByZXR1cm4gY21kCgoKZGVmIF9jYXJyaWVyX2FjdGlvbihzdCwgbWUsIHUsIG1hdGVzLCBvcHBzLCBzdHlsZSwgY3R4KToKICAgIGEgPSBzZ25fYXRrKG1lKQogICAgZ3ggPSBvcHBfZ3gobWUpCiAgICBkZyA9IGFicyhneCAtIHUueCkKICAgIHNob3QgPSBiZXN0X3Nob3Qoc3QsIG1lLCB1LCBvcHBzKQogICAgcCA9IHNob3RbMF0KICAgICMgLS0tLSBwYXNzZXMKICAgIGJlc3QgPSBOb25lCiAgICBmb3IgbSBpbiBtYXRlczoKICAgICAgICByID0gcGFzc19ldmFsKHN0LCBtZSwgdSwgbSwgb3BwcywgbGVhZF90b3dhcmRfZ29hbD1zdHlsZS5nZXQoJ2xlYWQnLCAxLjIpKQogICAgICAgIGlmIHIgaXMgTm9uZToKICAgICAgICAgICAgY29udGludWUKICAgICAgICBsYW5lLCBhbmcsIHBvcywgcnQgPSByCiAgICAgICAgcHMgPSByZWNlaXZlcl9zaG90X3ZhbHVlKHN0LCBtZSwgcG9zLCBvcHBzLCBibGluZF9zaGlmdD1ydCAqIERUKQogICAgICAgIGNoYWluID0gbWF0ZV9wb3RlbnRpYWwoc3QsIG1lLCBtLCBtYXRlcywgb3BwcywgZGVwdGg9MSkKICAgICAgICBpZiAwLjgwICogY2hhaW4gPiBwczoKICAgICAgICAgICAgcHMgPSAwLjgwICogY2hhaW4KICAgICAgICBwcm9nID0gKHBvc1swXSAtIHUueCkgKiBhCiAgICAgICAgdmFsID0gMS4zMCAqIHBzICsgMC4wMzAgKiBwcm9nICsgMC4xMCAqIG1pbihsYW5lLCAxLjApICAgICAgICAgICAgIC0gMC4wMjAgKiBtYXRoLmh5cG90KHBvc1swXSAtIHUueCwgcG9zWzFdIC0gdS55KQogICAgICAgIGlmIHBvc1sxXSA8IDYuMiBvciBwb3NbMV0gPiAxOS44OgogICAgICAgICAgICB2YWwgKz0gMC4xMiAgICAgICAgICAjIGNvcnJpZG9yIHJlY2VpdmVycyBhcmUgZ29sZAogICAgICAgIGlmIChwb3NbMF0gLSBvd25fZ3gobWUpKSAqIGEgPiAyNi4wOgogICAgICAgICAgICB2YWwgKz0gMC4xMCAgICAgICAgICAjIGxhbmRzIGluIHRoZSBhdHRhY2tpbmcgdGhpcmQKICAgICAgICBpZiBydCA+IDMwOgogICAgICAgICAgICB2YWwgLT0gMC4xMCAqICgocnQgLSAzMCkgLyAyMC4wKQogICAgICAgIGlmIHBzIDwgMC4wNSBhbmQgcHJvZyA8IDguMDoKICAgICAgICAgICAgdmFsIC09IDAuMzUgICAgICAgICAgIyBwb2ludGxlc3Mgc3F1YXJlIHBhc3MKICAgICAgICBpZiBiZXN0IGlzIE5vbmUgb3IgdmFsID4gYmVzdFswXToKICAgICAgICAgICAgYmVzdCA9ICh2YWwsIGFuZywgbSwgcG9zLCBydCwgcHMpCiAgICBwZSA9IHB1bnRfZXZhbChzdCwgbWUsIHUsIG9wcHMsIG1hdGVzKQogICAgaWYgcGUgaXMgbm90IE5vbmU6CiAgICAgICAgdmFsX3AsIGFuZ19wID0gcGVbMF0sIHBlWzFdCiAgICAgICAgaWYgVFJBQ0U6CiAgICAgICAgICAgIFRSQUNFWy0xXVsncHVudCddID0gKHJvdW5kKHZhbF9wLCAyKSwgcm91bmQocGVbMl1bMF0sIDEpLCByb3VuZChwZVsyXVsxXSwgMSksIHBlWzNdKQogICAgZWxzZToKICAgICAgICB2YWxfcCwgYW5nX3AgPSAtOS4wLCBOb25lCiAgICB0aHJfcyA9IHN0eWxlLmdldCgnc2hvb3RfdGhyJywgMC41KQogICAgdGhyX3AgPSBzdHlsZS5nZXQoJ3Bhc3NfdGhyJywgMC41KQogICAgdGhyX3UgPSBzdHlsZS5nZXQoJ3B1bnRfdGhyJywgMC40MCkKICAgIG1vZGUgPSBzdHlsZS5nZXQoJ2NhcnJpZXInLCAnYXV0bycpCiAgICBpZiBUUkFDRSBpcyBub3QgTm9uZToKICAgICAgICBUUkFDRS5hcHBlbmQoeydmJzogc3QuZnJhbWUsICdpZHgnOiB1LmluZGV4LCAneCc6IHJvdW5kKHUueCwgMSksICd5Jzogcm91bmQodS55LCAxKSwKICAgICAgICAgICAgICAgICAgICAgICdzaG90Jzogcm91bmQocCwgMiksICd0eSc6IHNob3RbMl0sCiAgICAgICAgICAgICAgICAgICAgICAncGFzcyc6IE5vbmUgaWYgYmVzdCBpcyBOb25lIGVsc2UgKHJvdW5kKGJlc3RbMF0sIDIpLCBiZXN0WzJdLmluZGV4LAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3VuZChiZXN0WzNdWzBdLCAxKSwgcm91bmQoYmVzdFszXVsxXSwgMSksIGJlc3RbNF0pLAogICAgICAgICAgICAgICAgICAgICAgJ3N0eWxlJzogbW9kZSwgJ3Rocic6ICh0aHJfcywgdGhyX3ApfSkKICAgIGlmIG1vZGUgPT0gJ3Nob290JyBhbmQgcCA+IDAuMDI6CiAgICAgICAgcmV0dXJuICgnTicsIHNob3RbMV0sIFRydWUpCiAgICBpZiBtb2RlID09ICdwYXNzJyBhbmQgYmVzdCBpcyBub3QgTm9uZSBhbmQgYmVzdFswXSA+IDAuMDI6CiAgICAgICAgcmV0dXJuICgnTicsIGJlc3RbMV0sIFRydWUpCiAgICBpZiBwID49IHRocl9zOgogICAgICAgIHJldHVybiAoJ04nLCBzaG90WzFdLCBUcnVlKQogICAgaWYgYmVzdCBpcyBub3QgTm9uZSBhbmQgYmVzdFswXSA+PSB0aHJfcDoKICAgICAgICByZXR1cm4gKCdOJywgYmVzdFsxXSwgVHJ1ZSkKICAgIGRlZXAgPSAodS54IC0gb3duX2d4KG1lKSkgKiBzZ25fYXRrKG1lKSA8IDI2LjAKICAgIGlmIGFuZ19wIGlzIG5vdCBOb25lIGFuZCB2YWxfcCA+PSB0aHJfdSBhbmQgKGRlZXAgb3IgYmVzdCBpcyBOb25lKToKICAgICAgICByZXR1cm4gKCdOJywgYW5nX3AsIFRydWUpCiAgICAjIC0tLS0gcHJlc3N1cmU/ICBjbGVhciBpZiBkZWVwIGFuZCBwcmVzc2VkCiAgICBwcmVzcyA9IG1pbihbbWF0aC5oeXBvdChvLnggLSB1LngsIG8ueSAtIHUueSkgZm9yIG8gaW4gb3Bwc10gb3IgWzkuMF0pCiAgICBpZiBzdHlsZS5nZXQoJ2NsZWFyJykgYW5kIHByZXNzIDwgMS40IGFuZCBkZyA+IDI0LjA6CiAgICAgICAgYW5nID0gY2xlYXJfYWhlYWQoc3QsIG1lLCB1LCBvcHBzKQogICAgICAgIGlmIGFuZyBpcyBub3QgTm9uZToKICAgICAgICAgICAgcmV0dXJuICgnTicsIGFuZywgVHJ1ZSkKICAgIGlmIHUuaW5kZXggPT0gMCBhbmQgc3QubiA+IDE6CiAgICAgICAgbmVhciA9IG5lYXJlc3Qob3BwcywgdS54LCB1LnkpCiAgICAgICAgaWYgbmVhciBpcyBub3QgTm9uZToKICAgICAgICAgICAgYW5nID0gbWF0aC5hdGFuMih1LnkgLSBuZWFyLnksIHUueCAtIG5lYXIueCkKICAgICAgICBlbHNlOgogICAgICAgICAgICBhbmcgPSBtYXRoLmF0YW4yKDEzLjAgLSB1LnksIG9wcF9neChtZSkgLSB1LngpCiAgICAgICAgcmV0dXJuICgnTicsIGFuZywgRmFsc2UpCiAgICB0eCwgdHkgPSBkcmliYmxlX3RhcmdldChzdCwgbWUsIHUsIG9wcHMpCiAgICAjIHNoaWVsZDogZmFjZSBhd2F5IGZyb20gdGhlIGNsb3Nlc3Qgb3Bwb25lbnQgd2hpbGUgbW92aW5nCiAgICBuZWFyID0gbmVhcmVzdChbbyBmb3IgbyBpbiBvcHBzXSwgdS54LCB1LnkpCiAgICBpZiBuZWFyIGlzIG5vdCBOb25lIGFuZCBtYXRoLmh5cG90KG5lYXIueCAtIHUueCwgbmVhci55IC0gdS55KSA8IDMuMDoKICAgICAgICBhbmcgPSBtYXRoLmF0YW4yKHUueSAtIG5lYXIueSwgdS54IC0gbmVhci54KQogICAgZWxzZToKICAgICAgICBhbmcgPSBtYXRoLmF0YW4yKHR5IC0gdS55LCB0eCAtIHUueCkKICAgIHJldHVybiAobW92ZV9kaXJfYXZvaWQodSwgdHgsIHR5LCBtZSwgb3BwcywgRmFsc2UsIDAuODUsIERSSUIpLCBhbmcsIEZhbHNlKQoKCmRlZiBzb2xvX2FjdGlvbihzdCwgbWUsIHUsIG9wcHMsIHN0eWxlLCBjdHgpOgogICAgYSA9IHNnbl9hdGsobWUpCiAgICBvd25lciA9IHN0LnVuaXRzW3N0Lm93bmVyXSBpZiAwIDw9IHN0Lm93bmVyIDwgbGVuKHN0LnVuaXRzKSBlbHNlIE5vbmUKICAgIGlmIG93bmVyIGlzIG5vdCBOb25lIGFuZCBvd25lci50ZWFtID09IG1lOgogICAgICAgIHNob3QgPSBiZXN0X3Nob3Qoc3QsIG1lLCB1LCBvcHBzKQogICAgICAgIGlmIHNob3RbMF0gPiAwLjAzOgogICAgICAgICAgICByZXR1cm4gKCdOJywgc2hvdFsxXSwgVHJ1ZSkKICAgICAgICB0eCwgdHkgPSBkcmliYmxlX3RhcmdldChzdCwgbWUsIHUsIG9wcHMpCiAgICAgICAgbmVhciA9IG5lYXJlc3Qob3BwcywgdS54LCB1LnkpCiAgICAgICAgaWYgbmVhciBpcyBub3QgTm9uZSBhbmQgbWF0aC5oeXBvdChuZWFyLnggLSB1LngsIG5lYXIueSAtIHUueSkgPCAzLjI6CiAgICAgICAgICAgIGFuZyA9IG1hdGguYXRhbjIodS55IC0gbmVhci55LCB1LnggLSBuZWFyLngpCiAgICAgICAgZWxzZToKICAgICAgICAgICAgYW5nID0gbWF0aC5hdGFuMih0eSAtIHUueSwgdHggLSB1LngpCiAgICAgICAgcmV0dXJuIChtb3ZlX2Rpcl9hdm9pZCh1LCB0eCwgdHksIG1lLCBvcHBzLCBGYWxzZSwgMC44NSwgRFJJQiksIGFuZywgRmFsc2UpCiAgICBpZiBvd25lciBpcyBub3QgTm9uZToKICAgICAgICAjIGludGVycG9zZSBvbiB0aGUgYmFsbCAtPiBvd24gZ29hbCBsaW5lLCBjbG9zZSB0byB0aGUgYmFsbAogICAgICAgIG94LCBveSA9IG93bmVyLnggKyBvd25lci5meCAqIDAuNjIsIG93bmVyLnkgKyBvd25lci5meSAqIDAuNjIKICAgICAgICBkeCwgZHkgPSBvd25fZ3gobWUpIC0gb3gsIDEzLjAgLSBveQogICAgICAgIGRkID0gbWF0aC5oeXBvdChkeCwgZHkpIG9yIDEuMAogICAgICAgIGsgPSAxLjEKICAgICAgICB0eCwgdHkgPSBveCArIGR4IC8gZGQgKiBrLCBveSArIGR5IC8gZGQgKiBrCiAgICAgICAgdHggPSBjbGFtcCh0eCwgMC42LCBXIC0gMC42KQogICAgICAgIHR5ID0gY2xhbXAodHksIDAuNiwgSCAtIDAuNikKICAgICAgICByZXR1cm4gKG1vdmVfZGlyKHUsIHR4LCB0eSwgbWUsIGFsbG93X2JveD1GYWxzZSksIE5vbmUsIEZhbHNlKQogICAgIyBsb29zZSBiYWxsOiBjaGFzZSBwcmVkaWN0ZWQgcG9zaXRpb24KICAgIHB0cywgZ3QgPSBmbGlnaHQoc3QuYngsIHN0LmJ5LCBtYXRoLmF0YW4yKHN0LmJ2eSwgc3QuYnZ4KSwgNDApIGlmIChzdC5idnggb3Igc3QuYnZ5KSBlbHNlIChbXSwgTm9uZSkKICAgIHRndCA9IChzdC5ieCwgc3QuYnkpCiAgICBmb3IgdCwgcCBpbiBlbnVtZXJhdGUocHRzKToKICAgICAgICBpZiBtYXRoLmh5cG90KHBbMF0gLSB1LngsIHBbMV0gLSB1LnkpIDw9IE1PViAqICh0ICsgMSkgKiBEVCArIENSICogMC45OgogICAgICAgICAgICB0Z3QgPSBwCiAgICAgICAgICAgIGJyZWFrCiAgICByZXR1cm4gKG1vdmVfZGlyKHUsIHRndFswXSwgdGd0WzFdLCBtZSwgYWxsb3dfYm94PUZhbHNlKSwgTm9uZSwgRmFsc2UpCgoKZGVmIHBpdm90X3Nwb3Qoc3QsIG1lLCBvcHBzLCBvd25lcik6CiAgICAiIiJPdXRsZXQgMTAtMTIgdW5pdHMgdXBmaWVsZCBvZiB0aGUgYmFsbCwgaW4gdGhlIGxlYXN0IGNyb3dkZWQgbGFuZS4iIiIKICAgIGEgPSBzZ25fYXRrKG1lKQogICAgYngsIGJ5ID0gc3QuYngsIHN0LmJ5CiAgICB0eCA9IGJ4ICsgYSAqIDExLjAKICAgIGJlc3QsIGJ2ID0gTm9uZSwgLTFlMTgKICAgIGZvciBkeSBpbiAoLTcuMCwgLTMuNSwgMC4wLCAzLjUsIDcuMCk6CiAgICAgICAgdHkgPSBjbGFtcChieSArIGR5LCAyLjUsIDIzLjUpCiAgICAgICAgcHgsIHB5ID0gc2FmZV9wdChtZSwgdHgsIHR5LCAwLjkpCiAgICAgICAgY3Jvd2QgPSAwLjAKICAgICAgICBmb3IgbyBpbiBvcHBzOgogICAgICAgICAgICBkID0gbWF0aC5oeXBvdChvLnggLSBweCwgby55IC0gcHkpCiAgICAgICAgICAgIGlmIGQgPCA1LjA6CiAgICAgICAgICAgICAgICBjcm93ZCArPSAoNS4wIC0gZCkKICAgICAgICB2ID0gLWNyb3dkICsgKDAuNiBpZiBhYnMoZHkpID4gMi4wIGVsc2UgMC4wKQogICAgICAgIGlmIHYgPiBidjoKICAgICAgICAgICAgYnYsIGJlc3QgPSB2LCAocHgsIHB5KQogICAgcmV0dXJuIGJlc3QKCgpkZWYgcm9sZXNfcG9zaXRpb25zKHN0LCBtZSwgbiwgcm9sZXMsIG9wcHMsIGJhbGxfc2lkZSk6CiAgICAiIiJCYXNlIHRhcmdldHMgZm9yIG9mZi1iYWxsIHVuaXRzLiIiIgogICAgbXkgPSB0ZWFtX3VuaXRzKHN0LCBtZSkKICAgIGEgPSBzZ25fYXRrKG1lKQogICAgb3V0ID0ge30KICAgIG93bmVyID0gc3QudW5pdHNbc3Qub3duZXJdIGlmIDAgPD0gc3Qub3duZXIgPCBsZW4oc3QudW5pdHMpIGVsc2UgTm9uZQogICAgd2Vfb3duID0gb3duZXIgaXMgbm90IE5vbmUgYW5kIG93bmVyLnRlYW0gPT0gbWUKICAgIGRfZGVmID0gKHN0LmJ4IC0gb3duX2d4KG1lKSkgKiBhCiAgICBkX29wcCA9IChvcHBfZ3gobWUpIC0gc3QuYngpICogYQogICAgc3RyaWtlcl9pZHggPSBzb3J0ZWQoaSBmb3IgaSBpbiByb2xlcyBpZiByb2xlc1tpXSA9PSAnc3RyaWtlcicpCiAgICB0b3Bfc3RyaWtlciA9IHN0cmlrZXJfaWR4Wy0xXSBpZiBzdHJpa2VyX2lkeCBlbHNlIE5vbmUKICAgIHBvc3RfaWRzID0gc29ydGVkKGkgZm9yIGkgaW4gcm9sZXMgaWYgcm9sZXNbaV0gaW4gKCdwb3N0MCcsICdwb3N0MScpKQogICAgcG9zdF9yYW5rID0ge2l4OiBrIGZvciBrLCBpeCBpbiBlbnVtZXJhdGUocG9zdF9pZHMpfQogICAgcG9zdF9uID0gbWF4KDEsIGxlbihwb3N0X2lkcykpCiAgICBmb3IgdSBpbiBteToKICAgICAgICByb2xlID0gcm9sZXMuZ2V0KHUuaW5kZXgsICdzdHJpa2VyJykKICAgICAgICBpZiByb2xlID09ICdrZWVwZXInOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIGlmIHJvbGUgaW4gKCdwb3N0MCcsICdwb3N0MScpOgogICAgICAgICAgICBvdXRbdS5pbmRleF0gPSBwb3N0X3RhcmdldChzdCwgbWUsIHJvbGUsIHBvc3RfcmFuay5nZXQodS5pbmRleCwgMCksIHBvc3RfbikKICAgICAgICBlbGlmIHJvbGUgPT0gJ3N0cmlrZXInOgogICAgICAgICAgICBpZiB3ZV9vd24gb3Igc3Qub3duZXIgPCAwOgogICAgICAgICAgICAgICAgaWYgdS5pbmRleCA9PSB0b3Bfc3RyaWtlciBvciBuID09IDI6CiAgICAgICAgICAgICAgICAgICAgIyB0aGUgZGVlcGVzdCBzdHJpa2VyIGlzIGFsd2F5cyB0aGUgbG9uZy1iYWxsIHRhcmdldAogICAgICAgICAgICAgICAgICAgIG91dFt1LmluZGV4XSA9IHBvYWNoZXJfc3BvdChzdCwgbWUsIG9wcHMsIChzdC5ieCwgc3QuYnkpKQogICAgICAgICAgICAgICAgZWxzZToKICAgICAgICAgICAgICAgICAgICBvdXRbdS5pbmRleF0gPSBwaXZvdF9zcG90KHN0LCBtZSwgb3Bwcywgb3duZXIpCiAgICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICBpZiBkX2RlZiA+IDIyLjA6CiAgICAgICAgICAgICAgICAgICAgb3V0W3UuaW5kZXhdID0gcG9hY2hlcl9zcG90KHN0LCBtZSwgb3BwcywgKHN0LmJ4LCBzdC5ieSkpCiAgICAgICAgICAgICAgICBlbHNlOgogICAgICAgICAgICAgICAgICAgIHR5ID0gY2xhbXAoc3QuYnksIDYuMCwgMjAuMCkKICAgICAgICAgICAgICAgICAgICBvdXRbdS5pbmRleF0gPSAoY2xhbXAoc3QuYnggLSBhICogNi4wLCA4LjAsIDM2LjApLAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGFtcCgxMy4wICsgKHR5IC0gMTMuMCkgKiAwLjUsIDYuNSwgMTkuNSkpCiAgICByZXR1cm4gb3V0CgoKZGVmIGZyYW1lX2NtZHMoc3QsIG1lLCBuLCBzdHlsZSwgY3R4KToKICAgIG15ID0gdGVhbV91bml0cyhzdCwgbWUpCiAgICBvcHBzID0gW3UgZm9yIHUgaW4gc3QudW5pdHMgaWYgdS50ZWFtICE9IG1lXQogICAgaWYgbm90IG15OgogICAgICAgIHJldHVybiB7fQogICAgcm9sZXMgPSByb2xlc19mb3IobikKICAgIG93bmVyID0gc3QudW5pdHNbc3Qub3duZXJdIGlmIDAgPD0gc3Qub3duZXIgPCBsZW4oc3QudW5pdHMpIGVsc2UgTm9uZQogICAgd2Vfb3duID0gb3duZXIgaXMgbm90IE5vbmUgYW5kIG93bmVyLnRlYW0gPT0gbWUKICAgIHRoZXlfb3duID0gb3duZXIgaXMgbm90IE5vbmUgYW5kIG93bmVyLnRlYW0gIT0gbWUKICAgIGNtZHMgPSB7fQogICAgaWYgbiA9PSAxOgogICAgICAgIGNtZHNbMF0gPSBzb2xvX2FjdGlvbihzdCwgbWUsIG15WzBdLCBvcHBzLCBzdHlsZSwgY3R4KQogICAgICAgIHJldHVybiBjbWRzCiAgICBrZWVwZXIgPSBteVswXQogICAgZmllbGRlcnMgPSBbdSBmb3IgdSBpbiBteSBpZiB1LmluZGV4ICE9IDBdCiAgICBiYWxsX3NpZGUgPSAndG9wJyBpZiBzdC5ieSA8IDEzLjAgZWxzZSAnYm90JwogICAgYmFzZSA9IHJvbGVzX3Bvc2l0aW9ucyhzdCwgbWUsIG4sIHJvbGVzLCBvcHBzLCBiYWxsX3NpZGUpCiAgICBpZiB3ZV9vd246CiAgICAgICAgbWF0ZXMgPSBbdSBmb3IgdSBpbiBmaWVsZGVycyBpZiB1IGlzIG5vdCBvd25lcl0KICAgICAgICBpZiBzdHlsZS5nZXQoJ2JhY2twYXNzJywgVHJ1ZSk6CiAgICAgICAgICAgIG1hdGVzID0gbWF0ZXMgKyBba2VlcGVyXQogICAgICAgIGNtZHNbb3duZXIuaW5kZXhdID0gY2Fycmllcl9hY3Rpb24oc3QsIG1lLCBvd25lciwgbWF0ZXMsIG9wcHMsIHN0eWxlLCBjdHgpCiAgICBjaGFzZXIgPSBOb25lCiAgICBpZiBzdC5vd25lciA8IDAgYW5kIGZpZWxkZXJzOgogICAgICAgIGJlc3RfdCA9IDFlOQogICAgICAgIHB0cywgZ3QgPSBmbGlnaHQoc3QuYngsIHN0LmJ5LCBtYXRoLmF0YW4yKHN0LmJ2eSwgc3QuYnZ4KSwgNDUpIGlmIChzdC5idnggb3Igc3QuYnZ5KSBlbHNlIChbXSwgTm9uZSkKICAgICAgICBmb3IgdSBpbiBmaWVsZGVyczoKICAgICAgICAgICAgdHQgPSA5OTkKICAgICAgICAgICAgZm9yIHQsIHAgaW4gZW51bWVyYXRlKHB0cyk6CiAgICAgICAgICAgICAgICBpZiBtYXRoLmh5cG90KHBbMF0gLSB1LngsIHBbMV0gLSB1LnkpIDw9IE1PViAqICh0ICsgMSkgKiBEVCArIENSICogMC45OgogICAgICAgICAgICAgICAgICAgIHR0ID0gdAogICAgICAgICAgICAgICAgICAgIGJyZWFrCiAgICAgICAgICAgIGlmIHR0IDwgYmVzdF90OgogICAgICAgICAgICAgICAgYmVzdF90LCBjaGFzZXIgPSB0dCwgdQogICAgcHJlc3NlciA9IE5vbmUKICAgIGlmIHRoZXlfb3duIGFuZCBmaWVsZGVyczoKICAgICAgICAjIG5lYXJlc3Qgc3RyaWtlciBqb2NrZXlzIHRoZSBiYWxsOyBldmVyeW9uZSBlbHNlIGZvcm1zIGEgbGluZSAzLjIKICAgICAgICAjIGdvYWwtc2lkZSBvZiB0aGUgYmFsbCwgc3ByZWFkIGFjcm9zcyB0aGUgcGl0Y2ggKHRoZWlyIG93biBzY2hlbWUpLgogICAgICAgIGNhbmQgPSBbdSBmb3IgdSBpbiBmaWVsZGVycyBpZiByb2xlcy5nZXQodS5pbmRleCkgPT0gJ3N0cmlrZXInXQogICAgICAgIGlmIG5vdCBjYW5kOgogICAgICAgICAgICBjYW5kID0gZmllbGRlcnMKICAgICAgICBwcmVzc2VyID0gbWluKGNhbmQsIGtleT1sYW1iZGEgdTogbWF0aC5oeXBvdCh1LnggLSBvd25lci54LCB1LnkgLSBvd25lci55KSkKICAgICAgICBsaW5lX3VuaXRzID0gW3UgZm9yIHUgaW4gZmllbGRlcnMgaWYgdSBpcyBub3QgcHJlc3Nlcl0KICAgICAgICBhYSA9IHNnbl9hdGsobWUpCiAgICAgICAgZF9iYWxsID0gKHN0LmJ4IC0gb3duX2d4KG1lKSkgKiBhYQogICAgICAgIGxpbmVfZCA9IGNsYW1wKGRfYmFsbCAtIDMuMiwgOC4wLCAyOS4wKQogICAgICAgIGxpbmVfdW5pdHMuc29ydChrZXk9bGFtYmRhIHo6IHouaW5kZXgpCiAgICAgICAgZm9yIGssIGx1IGluIGVudW1lcmF0ZShsaW5lX3VuaXRzKToKICAgICAgICAgICAgb2ZmID0gKGsgLSAobGVuKGxpbmVfdW5pdHMpIC0gMSkgLyAyLjApICogMy4xCiAgICAgICAgICAgIGJhc2VbbHUuaW5kZXhdID0gKG93bl9neChtZSkgKyBhYSAqIGxpbmVfZCwKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhbXAoc3QuYnkgKyBvZmYsIDMuMCwgMjMuMCkpCiAgICBmb3IgdSBpbiBmaWVsZGVyczoKICAgICAgICBpZiB1LmluZGV4IGluIGNtZHM6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgcm9sZSA9IHJvbGVzLmdldCh1LmluZGV4LCAnc3RyaWtlcicpCiAgICAgICAgdGd0ID0gYmFzZS5nZXQodS5pbmRleCkKICAgICAgICBpZiB0aGV5X293biBhbmQgdSBpcyBwcmVzc2VyOgogICAgICAgICAgICB0eCwgdHkgPSBwcmVzc190YXJnZXQoc3QsIG1lLCB1LCBvd25lcikKICAgICAgICAgICAgY21kc1t1LmluZGV4XSA9IChtb3ZlX2Rpcl9hdm9pZCh1LCB0eCwgdHksIG1lLCBvcHBzLCBGYWxzZSwgMC44NSwgTU9WKSwgTm9uZSwgRmFsc2UpCiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgaWYgc3Qub3duZXIgPCAwIGFuZCB1IGlzIGNoYXNlcjoKICAgICAgICAgICAgcHRzLCBndCA9IGZsaWdodChzdC5ieCwgc3QuYnksIG1hdGguYXRhbjIoc3QuYnZ5LCBzdC5idngpLCA2MCkgaWYgKHN0LmJ2eCBvciBzdC5idnkpIGVsc2UgKFtdLCBOb25lKQogICAgICAgICAgICB0Z3QyID0gKHN0LmJ4LCBzdC5ieSkKICAgICAgICAgICAgdGd0X3QgPSA5OTkKICAgICAgICAgICAgZm9yIHQsIHAgaW4gZW51bWVyYXRlKHB0cyk6CiAgICAgICAgICAgICAgICBpZiBtYXRoLmh5cG90KHBbMF0gLSB1LngsIHBbMV0gLSB1LnkpIDw9IE1PViAqICh0ICsgMSkgKiBEVCArIENSICogMC45OgogICAgICAgICAgICAgICAgICAgIHRndDIgPSBwCiAgICAgICAgICAgICAgICAgICAgdGd0X3QgPSB0CiAgICAgICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgIyBpZiBhbiBvcHBvbmVudCB3aW5zIHRoZSByYWNlLCB0YWtlIHRoZSBnb2FsLXNpZGUgYmxvY2tpbmcgc3BvdCBpbnN0ZWFkCiAgICAgICAgICAgIG9wcF90ID0gOTk5CiAgICAgICAgICAgIGZvciBvIGluIG9wcHM6CiAgICAgICAgICAgICAgICBmb3IgdCwgcCBpbiBlbnVtZXJhdGUocHRzKToKICAgICAgICAgICAgICAgICAgICBpZiBtYXRoLmh5cG90KHBbMF0gLSBvLngsIHBbMV0gLSBvLnkpIDw9IE1PViAqICh0ICsgMSkgKiBEVCArIENSICogMC45OgogICAgICAgICAgICAgICAgICAgICAgICBvcHBfdCA9IG1pbihvcHBfdCwgdCkKICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICAgICAgb3BwX3QgPSBtaW4ob3BwX3QsIGludChtYXRoLmh5cG90KHN0LmJ4IC0gby54LCBzdC5ieSAtIG8ueSkgLyBNT1YgKiAyMCkgKyAxKQogICAgICAgICAgICBpZiBvcHBfdCArIDEgPCB0Z3RfdDoKICAgICAgICAgICAgICAgIGR4LCBkeSA9IG93bl9neChtZSkgLSB0Z3QyWzBdLCAxMy4wIC0gdGd0MlsxXQogICAgICAgICAgICAgICAgZGQgPSBtYXRoLmh5cG90KGR4LCBkeSkgb3IgMS4wCiAgICAgICAgICAgICAgICB0Z3QyID0gKGNsYW1wKHRndDJbMF0gKyBkeCAvIGRkICogMi4wLCAwLjYsIFcgLSAwLjYpLAogICAgICAgICAgICAgICAgICAgICAgICBjbGFtcCh0Z3QyWzFdICsgZHkgLyBkZCAqIDIuMCwgMC42LCBIIC0gMC42KSkKICAgICAgICAgICAgY21kc1t1LmluZGV4XSA9IChtb3ZlX2Rpcih1LCB0Z3QyWzBdLCB0Z3QyWzFdLCBtZSwgYWxsb3dfYm94PUZhbHNlKSwgTm9uZSwgRmFsc2UpCiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgaWYgdGd0IGlzIE5vbmU6CiAgICAgICAgICAgIHRndCA9IChzdC5ieCwgc3QuYnkpCiAgICAgICAgaWYgaW5fYm94KG1lLCB1LngsIHUueSwgMC45NSk6CiAgICAgICAgICAgIHRndCA9IHNhZmVfcHQobWUsIHUueCwgdS55LCAxLjYpCiAgICAgICAgY21kc1t1LmluZGV4XSA9IChtb3ZlX2Rpcl9hdm9pZCh1LCB0Z3RbMF0sIHRndFsxXSwgbWUsIG9wcHMsIEZhbHNlLCAwLjksIE1PViksIE5vbmUsIEZhbHNlKQogICAgaWYgMCBub3QgaW4gY21kczoKICAgICAgICBjbWRzWzBdID0ga2VlcGVyX2NtZChzdCwgbWUsIGtlZXBlciwgb3BwcykKICAgIHJldHVybiBjbWRzCgoKIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gZXZhbHVhdGUKZGVmIGNoYW5jZV92YWx1ZShzdCwgbWUpOgogICAgaWYgc3Qub3duZXIgPCAwIG9yIHN0LnVuaXRzW3N0Lm93bmVyXS50ZWFtICE9IG1lOgogICAgICAgIHJldHVybiAwLjAKICAgIHUgPSBzdC51bml0c1tzdC5vd25lcl0KICAgIG8gPSBbeCBmb3IgeCBpbiBzdC51bml0cyBpZiB4LnRlYW0gIT0gbWVdCiAgICBwLCBhbmcsIHR5ID0gYmVzdF9zaG90KHN0LCBtZSwgdSwgbykKICAgIHJldHVybiBwCgoKZGVmIGV2YWx1YXRlX3JvbGxvdXQoc2ltLCBtZSwgbiwgZ29hbCwgc3R5bGUsIGZyYW1lc19sZWZ0KToKICAgIHYgPSAwLjAKICAgIGlmIGdvYWwgPT0gbWU6CiAgICAgICAgdiArPSAxMDAwLjAKICAgIGVsaWYgZ29hbCBpcyBub3QgTm9uZToKICAgICAgICB2IC09IDEwMDAuMAogICAgdiArPSA1NS4wICogY2hhbmNlX3ZhbHVlKHNpbSwgbWUpCiAgICBpZiBzaW0ub3duZXIgPj0gMCBhbmQgc2ltLnVuaXRzW3NpbS5vd25lcl0udGVhbSAhPSBtZToKICAgICAgICBvdSA9IHNpbS51bml0c1tzaW0ub3duZXJdCiAgICAgICAgcCwgYW5nLCB0eSA9IGJlc3Rfc2hvdChzaW0sIDEgLSBtZSwgb3UsIFt4IGZvciB4IGluIHNpbS51bml0cyBpZiB4LnRlYW0gPT0gbWVdKQogICAgICAgIHYgLT0gNDUuMCAqIHAKICAgIGlmIHNpbS5vd25lciA+PSAwOgogICAgICAgIGlmIHNpbS51bml0c1tzaW0ub3duZXJdLnRlYW0gPT0gbWU6CiAgICAgICAgICAgIHYgKz0gMTAuMAogICAgICAgICAgICB2ICs9IDAuMjUgKiAoKHNpbS5ieCAtIG93bl9neChtZSkpICogc2duX2F0ayhtZSkpCiAgICAgICAgZWxzZToKICAgICAgICAgICAgdiAtPSA2LjAKICAgICAgICAgICAgdiAtPSAwLjI1ICogKChzaW0uYnggLSBvd25fZ3gobWUpKSAqIHNnbl9hdGsobWUpKQogICAgZWxzZToKICAgICAgICB2ICs9IDAuMTUgKiAoKHNpbS5ieCAtIG93bl9neChtZSkpICogc2duX2F0ayhtZSkpCiAgICByZXR1cm4gdgoKCmRlZiBkZWNpZGUoc3QwLCBtZSwgbiwgQSwgZGVidWc9RmFsc2UpOgogICAgc2V0X2VuZ2luZShBLnN0ZXApCiAgICBpZiBuID4gMSBhbmQgYW55KHUudGVhbSA9PSBtZSBhbmQgdS5pbmRleCA9PSAwIGZvciB1IGluIHN0MC51bml0cyk6CiAgICAgICAgS0VFUF9UR1RbJ21lJ10gPSBtZQogICAgICAgIEtFRVBfVEdUWyd5J10gPSBrZWVwZXJfYmVzdF95KHN0MCwgbWUpCiAgICAgICAgS0VFUF9UR1RbJ2ZyYW1lJ10gPSBzdDAuZnJhbWUKICAgIGVsc2U6CiAgICAgICAgS0VFUF9UR1RbJ21lJ10gPSBOb25lCiAgICBvcHBfcm93cyA9IG9wcF9wbGFuKHN0MCwgbWUsIDIwKQogICAgc3R5bGVzID0gWwogICAgICAgIHsnY2Fycmllcic6ICdhdXRvJywgJ3Nob290X3Rocic6IDAuNSwgJ3Bhc3NfdGhyJzogMC40NSwgJ2xlYWQnOiAxLjIsICdjbGVhcic6IFRydWV9LAogICAgICAgIHsnY2Fycmllcic6ICdzaG9vdCcsICdzaG9vdF90aHInOiAwLjA1LCAncGFzc190aHInOiAwLjU1LCAnbGVhZCc6IDEuMiwgJ2NsZWFyJzogVHJ1ZX0sCiAgICAgICAgeydjYXJyaWVyJzogJ3Bhc3MnLCAnc2hvb3RfdGhyJzogMC43NSwgJ3Bhc3NfdGhyJzogMC4wMiwgJ2xlYWQnOiAxLjYsICdjbGVhcic6IFRydWV9LAogICAgICAgIHsnY2Fycmllcic6ICdkcmliYmxlJywgJ3Nob290X3Rocic6IDAuODUsICdwYXNzX3Rocic6IDkuMCwgJ2xlYWQnOiAxLjIsICdjbGVhcic6IFRydWV9LAogICAgICAgIHsnY2Fycmllcic6ICdhdXRvJywgJ3Nob290X3Rocic6IDAuMzAsICdwYXNzX3Rocic6IDAuMzAsICdsZWFkJzogMC42LCAnY2xlYXInOiBUcnVlfSwKICAgIF0KICAgIGJlc3Rfcm93cywgYmVzdF92ID0gTm9uZSwgLTFlMTgKICAgIGZvciBzdHlsZSBpbiBzdHlsZXM6CiAgICAgICAgc2ltID0gc3QwLmNsb25lKCkKICAgICAgICByb3dzID0gW10KICAgICAgICBnb2FsID0gTm9uZQogICAgICAgIGN0eCA9IHsnY2FjaGUnOiB7fX0KICAgICAgICBmb3IgZiBpbiByYW5nZSgyMCk6CiAgICAgICAgICAgIGlmIHNpbS5zdGF0dXMgIT0gJ3BsYXlpbmcnOgogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgY21kcyA9IGZyYW1lX2NtZHMoc2ltLCBtZSwgbiwgc3R5bGUsIGN0eCkKICAgICAgICAgICAgaW5wID0gW10KICAgICAgICAgICAgZm9yIHUgaW4gc2ltLnVuaXRzOgogICAgICAgICAgICAgICAgaWYgdS50ZWFtID09IG1lOgogICAgICAgICAgICAgICAgICAgIGMgPSBjbWRzLmdldCh1LmluZGV4KSBvciAoJ04nLCBOb25lLCBGYWxzZSkKICAgICAgICAgICAgICAgICAgICBpZiBjWzFdIGlzIG5vdCBOb25lIGFuZCBub3QgaXNpbnN0YW5jZShjWzFdLCB0dXBsZSk6CiAgICAgICAgICAgICAgICAgICAgICAgIGMgPSAoY1swXSwgKG1hdGguY29zKGNbMV0pLCBtYXRoLnNpbihjWzFdKSksIGNbMl0pCiAgICAgICAgICAgICAgICAgICAgaW5wLmFwcGVuZChjKQogICAgICAgICAgICAgICAgZWxzZToKICAgICAgICAgICAgICAgICAgICBjID0gb3BwX3Jvd3NbZl0uZ2V0KHUuaW5kZXgpIGlmIGYgPCBsZW4ob3BwX3Jvd3MpIGVsc2UgTm9uZQogICAgICAgICAgICAgICAgICAgIGlucC5hcHBlbmQoYyBvciAoJ04nLCBOb25lLCBGYWxzZSkpCiAgICAgICAgICAgIHJvd3MuYXBwZW5kKHsodS50ZWFtLCB1LmluZGV4KTogaW5wW2ldIGZvciBpLCB1IGluIGVudW1lcmF0ZShzaW0udW5pdHMpfSkKICAgICAgICAgICAgZyA9IEEuc3RlcChzaW0sIGlucCwgc2ltLmtpY2tvZmZUZWFtKQogICAgICAgICAgICBpZiBnID49IDA6CiAgICAgICAgICAgICAgICBnb2FsID0gZwogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICB2ID0gZXZhbHVhdGVfcm9sbG91dChzaW0sIG1lLCBuLCBnb2FsLCBzdHlsZSwgMjAgLSBsZW4ocm93cykpCiAgICAgICAgaWYgZGVidWc6CiAgICAgICAgICAgIGltcG9ydCBzeXMgYXMgX3MKICAgICAgICAgICAgX3Muc3RkZXJyLndyaXRlKCdzdHlsZSAlcyB2ICUuMmYgZ29hbCAlcyBmcmFtZXMgJWRcbicgJSAoc3R5bGUuZ2V0KCdjYXJyaWVyJyksIHYsIGdvYWwsIGxlbihyb3dzKSkpCiAgICAgICAgaWYgdiA+IGJlc3RfdjoKICAgICAgICAgICAgYmVzdF92LCBiZXN0X3Jvd3MgPSB2LCByb3dzCiAgICBvdXQgPSBsaXN0KGJlc3Rfcm93cykKICAgIHdoaWxlIGxlbihvdXQpIDwgMjA6CiAgICAgICAgb3V0LmFwcGVuZCh7KHUudGVhbSwgdS5pbmRleCk6ICgnTicsIE5vbmUsIEZhbHNlKSBmb3IgdSBpbiBzdDAudW5pdHN9KQogICAgcmV0dXJuIG91dAo='
_POL = _types.ModuleType('policy')
exec(compile(_b64.b64decode(_POLICY_B64).decode('utf-8'), 'policy_embedded.py', 'exec'),
     _POL.__dict__)
# ===== END EMBEDDED POLICY =====


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        n = 1
        try:
            obs = json.loads(line)
            n = int(obs.get('teamSize') or 1)
            me = int(obs.get('yourTeam') or 0)
            if obs.get('status') not in (None, 'playing'):
                print(json.dumps({"inputs": [neutral_frame(n) for _ in range(20)]}), flush=True)
                continue
            st = state_from_obs(obs)
            sc = obs.get('score') or [0, 0]
            tl = float(obs.get('timeLeft') or 120.0)
            golden = bool(obs.get('golden'))
            GAME_CTX['desp'] = (int(sc[me]) <= int(sc[1 - me])) and (golden or tl < DESP_T)
            try:
                fr = _POL.decide(st, me, n, sys.modules[__name__])
            except Exception:
                if os.environ.get('SOC2_DEBUG'):
                    import traceback
                    traceback.print_exc()
                fr = decide_window(st, me, n)
            out = []
            for f in fr:
                if not isinstance(f, dict):
                    out.append(neutral_frame(n))
                else:
                    row = []
                    for i in range(n):
                        d, aim, kick = f.get((me, i), ('N', None, False))
                        deg = None
                        if aim is not None:
                            deg = round(math.degrees(math.atan2(aim[1], aim[0])) % 360.0, 2)
                            if deg >= 360.0 or deg < 0.0:
                                deg = 0.0
                        row.append({"dir": d, "aim": deg, "kick": bool(kick)})
                    out.append(row)
            print(json.dumps({"inputs": out}), flush=True)
        except Exception as e:
            if os.environ.get('SOC2_DEBUG'):
                import traceback
                traceback.print_exc()
            else:
                import sys as _s
                _s.stderr.write('ERR %r\n' % (e,))
            print(json.dumps({"inputs": [neutral_frame(n) for _ in range(20)]}), flush=True)


if __name__ == '__main__':
    main()

