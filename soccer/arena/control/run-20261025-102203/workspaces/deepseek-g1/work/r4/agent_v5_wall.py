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
_POLICY_B64 = 'IyAtKi0gY29kaW5nOiB1dGYtOCAtKi0KIiIiZGVlcHNlZWstZzEgwrcgcm91bmQtMyBwb2xpY3kuCgpEb2N0cmluZToKICAqIERlZmVuY2U6IHR3byAicG9zdCIgZGVmZW5kZXJzIHN0YW5kIG9uIHRoZSBnb2FsIGxpbmUgYXQgdGhlIHR3byBtb3V0aAogICAgY29ybmVycyB3aGVuZXZlciB0aGUgYmFsbCBpcyBpbiBvdXIgZGVmZW5zaXZlIHpvbmU7IHRoZSBrZWVwZXIgY292ZXJzIHRoZQogICAgY2VudHJlIGF0IGRlcHRoIH4yLiAgQWxsIHRocmVlIGF2b2lkIHRoZSBvcHBvbmVudCBib3guCiAgKiBPZmZlbmNlOiB0aGUgY2FycmllciBkcml2ZXMgdG8gdGhlIHNob290aW5nIGxpbmUgKDEgdW5pdCBvdXRzaWRlIHRoZQogICAgb3Bwb25lbnQgYm94KSBhbmQgc2hvb3RzIGF0IHRoZSBjb3JuZXIgZmFydGhlc3QgZnJvbSB0aGUgZW5lbXkga2VlcGVyLgogICAgU2hvdHMgYXJlIHRha2VuIG9uIHRoZSBmaXJzdCBmcmFtZSBvZiBhIGRlY2lzaW9uIHdpbmRvdywgc28gdGhlIGtlZXBlcgogICAgb25seSBsZWFybnMgYWJvdXQgdGhlIHNob3Qgb25lIHdpbmRvdyBsYXRlci4KICAqIFRlYW0tbWF0ZXMgcHVzaCB0byB0aGUgc2hvb3RpbmcgbGluZSBhcyBwYXNzaW5nIG91dGxldHM7IHRoZSBrZWVwZXIgaXMgYQogICAgc2FmZSBiYWNrLXBhc3Mgb3V0bGV0IGFuZCBkaXN0cmlidXRlcyBsb25nIGJhbGxzLgogICogQWJzb2x1dGVseSBubyBlbnRyeSBpbnRvIHRoZSBvcHBvbmVudCBwZW5hbHR5IGJveCAocmVkIGNhcmQpLgoiIiIKCmltcG9ydCBtYXRoCmltcG9ydCBvcwoKVywgSCA9IDQ0LjAsIDI2LjAKRFQgPSAwLjA1CkhaID0gMjAKTU9WID0gMy4xNQpEUklCID0gMC41OCAqIE1PVgpDUiA9IDAuODIKUl9CID0gMC4yMgpLSUNLX09GRiA9IDAuNjkKR0xfTE8sIEdMX0hJID0gMTAuNSwgMTUuNQpTQUZFX00gPSAwLjg1ICAgICAgICAgICMgc3RheSB0aGlzIGZhciBvdXRzaWRlIHRoZSBvcHBvbmVudCBib3gKClNRMiA9IDAuNzA3MTA2NzgxMTg2NTQ3NgpESVJTID0gewogICAgJ04nOiAoMC4wLCAwLjApLCAnVSc6ICgwLjAsIC0xLjApLCAnRCc6ICgwLjAsIDEuMCksCiAgICAnTCc6ICgtMS4wLCAwLjApLCAnUic6ICgxLjAsIDAuMCksCiAgICAnVUwnOiAoLVNRMiwgLVNRMiksICdVUic6IChTUTIsIC1TUTIpLCAnREwnOiAoLVNRMiwgU1EyKSwgJ0RSJzogKFNRMiwgU1EyKSwKfQpESVJfS0VZUyA9ICgnTicsICdVJywgJ0QnLCAnTCcsICdSJywgJ1VMJywgJ1VSJywgJ0RMJywgJ0RSJykKCl9XQUxMID0gYnl0ZWFycmF5KDQ0ICogMjYpCmZvciBfeSBpbiByYW5nZSgyNik6CiAgICBmb3IgX3ggaW4gcmFuZ2UoNDQpOgogICAgICAgIGlmIF94ID09IDAgb3IgX3kgPT0gMCBvciBfeCA9PSA0MyBvciBfeSA9PSAyNToKICAgICAgICAgICAgaWYgKF94ID09IDAgb3IgX3ggPT0gNDMpIGFuZCAxMCA8PSBfeSA8IDE2OgogICAgICAgICAgICAgICAgY29udGludWUKICAgICAgICAgICAgX1dBTExbX3kgKiA0NCArIF94XSA9IDEKCgpkZWYgdGlsZV9hdCh4LCB5KToKICAgIHR4ID0gaW50KG1hdGguZmxvb3IoeCkpCiAgICB0eSA9IGludChtYXRoLmZsb29yKHkpKQogICAgaWYgdHggPCAwIG9yIHR5IDwgMCBvciB0eCA+PSA0NCBvciB0eSA+PSAyNjoKICAgICAgICByZXR1cm4gMQogICAgcmV0dXJuIF9XQUxMW3R5ICogNDQgKyB0eF0KCgpkZWYgaGl0c193YWxsKHgsIHksIHIpOgogICAgayA9IHIgKiBTUTIKICAgIGZvciBweCwgcHkgaW4gKCh4IC0gciwgeSksICh4ICsgciwgeSksICh4LCB5IC0gciksICh4LCB5ICsgciksCiAgICAgICAgICAgICAgICAgICAoeCAtIGssIHkgLSBrKSwgKHggKyBrLCB5IC0gayksICh4IC0gaywgeSArIGspLCAoeCArIGssIHkgKyBrKSk6CiAgICAgICAgaWYgdGlsZV9hdChweCwgcHkpOgogICAgICAgICAgICByZXR1cm4gVHJ1ZQogICAgcmV0dXJuIEZhbHNlCgoKZGVmIGNsYW1wKHYsIGEsIGIpOgogICAgcmV0dXJuIGEgaWYgdiA8IGEgZWxzZSAoYiBpZiB2ID4gYiBlbHNlIHYpCgoKZGVmIG93bl9neChtZSk6CiAgICByZXR1cm4gMS4wIGlmIG1lID09IDAgZWxzZSA0My4wCgoKZGVmIG9wcF9neChtZSk6CiAgICByZXR1cm4gNDMuMCBpZiBtZSA9PSAwIGVsc2UgMS4wCgoKZGVmIGF0ayhtZSk6CiAgICByZXR1cm4gMS4wIGlmIG1lID09IDAgZWxzZSAtMS4wCgoKT0JPWCA9IHswOiAoMzQuMCwgNi4wLCA0My4wLCAyMC4wKSwgMTogKDEuMCwgNi4wLCAxMC4wLCAyMC4wKX0KT1dOQk9YID0gezA6ICgxLjAsIDYuMCwgMTAuMCwgMjAuMCksIDE6ICgzNC4wLCA2LjAsIDQzLjAsIDIwLjApfQoKCmRlZiBpbl9ib3goYiwgeCwgeSk6CiAgICByZXR1cm4gYlswXSA8PSB4IDw9IGJbMl0gYW5kIGJbMV0gPD0geSA8PSBiWzNdCgoKZGVmIGluX29ib3gobWUsIHgsIHksIG09MC4wKToKICAgIGIgPSBPQk9YW21lXQogICAgcmV0dXJuIGJbMF0gLSBtIDw9IHggPD0gYlsyXSArIG0gYW5kIGJbMV0gLSBtIDw9IHkgPD0gYlszXSArIG0KCgpkZWYgc2FmZV9wdChtZSwgeCwgeSwgbT1TQUZFX00pOgogICAgIiIiY2xhbXAgYSBkZXNpcmVkIHN0YW5kaW5nIHBvaW50IG91dCBvZiB0aGUgb3Bwb25lbnQgYm94ICgrbWFyZ2luKS4iIiIKICAgIHggPSBjbGFtcCh4LCAwLjYsIFcgLSAwLjYpCiAgICB5ID0gY2xhbXAoeSwgMC42LCBIIC0gMC42KQogICAgYiA9IE9CT1hbbWVdCiAgICBpZiBub3QgaW5fYm94KGIsIHgsIHkpOgogICAgICAgICMgc3RpbGwgZW5mb3JjZSBtYXJnaW4gb25seSB3aGVuIGNsb3NlIHRvIHRoZSBib3ggYmFuZAogICAgICAgIGlmIGJbMV0gLSBtIDw9IHkgPD0gYlszXSArIG06CiAgICAgICAgICAgIGlmIGJbMF0gLSBtIDw9IHggPD0gYlsyXSArIG06CiAgICAgICAgICAgICAgICBpZiB4IDwgKGJbMF0gKyBiWzJdKSAqIDAuNToKICAgICAgICAgICAgICAgICAgICB4ID0gYlswXSAtIG0KICAgICAgICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICAgICAgeCA9IGJbMl0gKyBtCiAgICAgICAgcmV0dXJuIHgsIHkKICAgICMgaW5zaWRlOiBwdXNoIHRvIHRoZSBuZWFyZXN0IGxlZ2FsIGZhY2UKICAgIGNhbmRzID0gW10KICAgIGlmIGJbMF0gPiAxLjA6CiAgICAgICAgY2FuZHMuYXBwZW5kKChiWzBdIC0gbSwgY2xhbXAoeSwgYlsxXSwgYlszXSkpKQogICAgaWYgYlsyXSA8IFcgLSAxLjA6CiAgICAgICAgY2FuZHMuYXBwZW5kKChiWzJdICsgbSwgY2xhbXAoeSwgYlsxXSwgYlszXSkpKQogICAgY2FuZHMuYXBwZW5kKChjbGFtcCh4LCBiWzBdLCBiWzJdKSwgYlsxXSAtIG0pKQogICAgY2FuZHMuYXBwZW5kKChjbGFtcCh4LCBiWzBdLCBiWzJdKSwgYlszXSArIG0pKQogICAgYmVzdCwgYmQgPSBjYW5kc1swXSwgMWUxOAogICAgZm9yIGN4LCBjeSBpbiBjYW5kczoKICAgICAgICBpZiAwLjUgPD0gY3ggPD0gVyAtIDAuNSBhbmQgMC41IDw9IGN5IDw9IEggLSAwLjU6CiAgICAgICAgICAgIGRkID0gKGN4IC0geCkgKiogMiArIChjeSAtIHkpICoqIDIKICAgICAgICAgICAgaWYgZGQgPCBiZDoKICAgICAgICAgICAgICAgIGJkLCBiZXN0ID0gZGQsIChjeCwgY3kpCiAgICByZXR1cm4gYmVzdAoKCmRlZiBzdGVwX29rKG1lLCB4LCB5LCB2eCwgdnksIHN0ZXBzPTUsIG09U0FGRV9NLCBzcGVlZD1NT1YpOgogICAgZm9yIGsgaW4gcmFuZ2UoMSwgc3RlcHMgKyAxKToKICAgICAgICBpZiBpbl9vYm94KG1lLCB4ICsgdnggKiBzcGVlZCAqIERUICogaywgeSArIHZ5ICogc3BlZWQgKiBEVCAqIGssIG0pOgogICAgICAgICAgICByZXR1cm4gRmFsc2UKICAgIHJldHVybiBUcnVlCgoKZGVmIG1vdmVfZGlyKHUsIHR4LCB0eSwgbWUsIGFsbG93X2JveD1GYWxzZSwgbT1TQUZFX00sIHNwZWVkPU1PViwgZXh0cmE9Tm9uZSk6CiAgICAiIiI4LWRpcmVjdGlvbiBtb3ZlIHRvd2FyZCAodHgsdHkpOyBoYXJkIGZpbHRlciBhZ2FpbnN0IG9wcG9uZW50IGJveC4iIiIKICAgIGR4LCBkeSA9IHR4IC0gdS54LCB0eSAtIHUueQogICAgZCA9IG1hdGguaHlwb3QoZHgsIGR5KQogICAgaWYgZCA8IDAuMDY6CiAgICAgICAgcmV0dXJuICdOJwogICAgdXgsIHV5ID0gZHggLyBkLCBkeSAvIGQKICAgIGJlc3QsIGJlc3R2ID0gTm9uZSwgLTFlMTgKICAgIGZvciBuYW1lIGluIERJUl9LRVlTOgogICAgICAgIHZ4LCB2eSA9IERJUlNbbmFtZV0KICAgICAgICBpZiB2eCA9PSAwLjAgYW5kIHZ5ID09IDAuMDoKICAgICAgICAgICAgY29udGludWUKICAgICAgICBpZiBub3QgYWxsb3dfYm94IGFuZCBub3Qgc3RlcF9vayhtZSwgdS54LCB1LnksIHZ4LCB2eSwgNSwgbSwgc3BlZWQpOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIHYgPSB2eCAqIHV4ICsgdnkgKiB1eQogICAgICAgIGlmIGV4dHJhIGlzIG5vdCBOb25lOgogICAgICAgICAgICB2ICs9IGV4dHJhKHZ4LCB2eSkKICAgICAgICBpZiB2ID4gYmVzdHY6CiAgICAgICAgICAgIGJlc3R2LCBiZXN0ID0gdiwgbmFtZQogICAgaWYgYmVzdCBpcyBOb25lOgogICAgICAgICMgYmxvY2tlZDogc2xpZGUgYWxvbmcgdGhlIGJveCBlZGdlCiAgICAgICAgYmIgPSBPQk9YW21lXQogICAgICAgIGN5ID0gKGJiWzFdICsgYmJbM10pICogMC41CiAgICAgICAgdHkyID0gYmJbMV0gLSBtIGlmIHUueSA8IGN5IGVsc2UgYmJbM10gKyBtCiAgICAgICAgZm9yIG5hbWUgaW4gRElSX0tFWVM6CiAgICAgICAgICAgIHZ4LCB2eSA9IERJUlNbbmFtZV0KICAgICAgICAgICAgaWYgdnggPT0gMC4wIGFuZCB2eSA9PSAwLjA6CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICBpZiBzdGVwX29rKG1lLCB1LngsIHUueSwgdngsIHZ5LCA1LCBtLCBzcGVlZCk6CiAgICAgICAgICAgICAgICB2ID0gdnggKiB1eCArIHZ5ICogKDEuMCBpZiB0eTIgPiB1LnkgZWxzZSAtMS4wKQogICAgICAgICAgICAgICAgaWYgdiA+IGJlc3R2OgogICAgICAgICAgICAgICAgICAgIGJlc3R2LCBiZXN0ID0gdiwgbmFtZQogICAgcmV0dXJuIGJlc3Qgb3IgJ04nCgoKIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gYmFsbCBzaW0KZGVmIHNpbV9iYWxsKGJ4LCBieSwgYW5nLCBtYXhmPTE2MCk6CiAgICAiIiJGYWl0aGZ1bCBiYWxsIGZsaWdodCAoSlMgcG9ydCkuIFJldHVybnMgKHB0cywgZ29hbF90ZWFtX29yX05vbmUsIGVuZCkuIiIiCiAgICB2eCwgdnkgPSAxMS4wICogbWF0aC5jb3MoYW5nKSwgMTEuMCAqIG1hdGguc2luKGFuZykKICAgIHgsIHkgPSBieCwgYnkKICAgIHB0cyA9IFtdCiAgICBmb3IgZiBpbiByYW5nZShtYXhmKToKICAgICAgICBmb3IgcyBpbiByYW5nZSg0KToKICAgICAgICAgICAgeCArPSB2eCAqIERUIC8gNC4wCiAgICAgICAgICAgIHkgKz0gdnkgKiBEVCAvIDQuMAogICAgICAgICAgICBpZiBHTF9MTyA8PSB5IDw9IEdMX0hJOgogICAgICAgICAgICAgICAgaWYgeCA8PSAxLjA6CiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHB0cywgMSwgKHgsIHkpCiAgICAgICAgICAgICAgICBpZiB4ID49IFcgLSAxLjA6CiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHB0cywgMCwgKHgsIHkpCiAgICAgICAgICAgIGlmIGhpdHNfd2FsbCh4LCB5LCBSX0IpOgogICAgICAgICAgICAgICAgcHggPSB4IC0gdnggKiBEVCAvIDQuMAogICAgICAgICAgICAgICAgcHkgPSB5IC0gdnkgKiBEVCAvIDQuMAogICAgICAgICAgICAgICAgaWYgaGl0c193YWxsKHgsIHB5LCBSX0IpOgogICAgICAgICAgICAgICAgICAgIHgsIHkgPSBweCwgeQogICAgICAgICAgICAgICAgICAgIHZ4ID0gLXZ4ICogMC43MgogICAgICAgICAgICAgICAgaWYgaGl0c193YWxsKHB4LCB5LCBSX0IpOgogICAgICAgICAgICAgICAgICAgIHgsIHkgPSB4LCBweQogICAgICAgICAgICAgICAgICAgIHZ5ID0gLXZ5ICogMC43MgogICAgICAgICAgICAgICAgaWYgaGl0c193YWxsKHgsIHksIFJfQik6CiAgICAgICAgICAgICAgICAgICAgeCwgeSA9IHB4LCBweQogICAgICAgICAgICAgICAgICAgIHZ4ID0gLXZ4ICogMC43MgogICAgICAgICAgICAgICAgICAgIHZ5ID0gLXZ5ICogMC43MgogICAgICAgIHZ4ICo9IDAuOTc4CiAgICAgICAgdnkgKj0gMC45NzgKICAgICAgICBpZiBtYXRoLmh5cG90KHZ4LCB2eSkgPCAwLjAyOgogICAgICAgICAgICBwdHMuYXBwZW5kKCh4LCB5KSkKICAgICAgICAgICAgYnJlYWsKICAgICAgICBwdHMuYXBwZW5kKCh4LCB5KSkKICAgIHJldHVybiBwdHMsIE5vbmUsICh4LCB5KQoKCmRlZiBiYWxsX2Z1dHVyZShzdCwgbWF4Zj0xMjApOgogICAgdngsIHZ5ID0gc3QuYnZ4LCBzdC5idnkKICAgIHgsIHkgPSBzdC5ieCwgc3QuYnkKICAgIG91dCA9IFtdCiAgICBmb3IgZiBpbiByYW5nZShtYXhmKToKICAgICAgICBmb3IgcyBpbiByYW5nZSg0KToKICAgICAgICAgICAgeCArPSB2eCAqIERUIC8gNC4wCiAgICAgICAgICAgIHkgKz0gdnkgKiBEVCAvIDQuMAogICAgICAgICAgICBpZiBHTF9MTyA8PSB5IDw9IEdMX0hJOgogICAgICAgICAgICAgICAgaWYgeCA8PSAxLjAgb3IgeCA+PSBXIC0gMS4wOgogICAgICAgICAgICAgICAgICAgIG91dC5hcHBlbmQoKHgsIHkpKQogICAgICAgICAgICAgICAgICAgIHJldHVybiBvdXQKICAgICAgICAgICAgaWYgaGl0c193YWxsKHgsIHksIFJfQik6CiAgICAgICAgICAgICAgICBweCA9IHggLSB2eCAqIERUIC8gNC4wCiAgICAgICAgICAgICAgICBweSA9IHkgLSB2eSAqIERUIC8gNC4wCiAgICAgICAgICAgICAgICBpZiBoaXRzX3dhbGwoeCwgcHksIFJfQik6CiAgICAgICAgICAgICAgICAgICAgeCwgeSA9IHB4LCB5CiAgICAgICAgICAgICAgICAgICAgdnggPSAtdnggKiAwLjcyCiAgICAgICAgICAgICAgICBpZiBoaXRzX3dhbGwocHgsIHksIFJfQik6CiAgICAgICAgICAgICAgICAgICAgeCwgeSA9IHgsIHB5CiAgICAgICAgICAgICAgICAgICAgdnkgPSAtdnkgKiAwLjcyCiAgICAgICAgICAgICAgICBpZiBoaXRzX3dhbGwoeCwgeSwgUl9CKToKICAgICAgICAgICAgICAgICAgICB4LCB5ID0gcHgsIHB5CiAgICAgICAgICAgICAgICAgICAgdnggPSAtdnggKiAwLjcyCiAgICAgICAgICAgICAgICAgICAgdnkgPSAtdnkgKiAwLjcyCiAgICAgICAgdnggKj0gMC45NzgKICAgICAgICB2eSAqPSAwLjk3OAogICAgICAgIGlmIG1hdGguaHlwb3QodngsIHZ5KSA8IDAuMDI6CiAgICAgICAgICAgIHZ4ID0gdnkgPSAwLjAKICAgICAgICBvdXQuYXBwZW5kKCh4LCB5KSkKICAgIHJldHVybiBvdXQKCgpfRkZDID0gMC4wMjIgLyAwLjU1Cl9IT0xEID0geyd2JzogMH0KX0tIID0geydtZSc6IE5vbmUsICdzdGFydCc6IC0xLCAnZnJhbWUnOiAtOTk5fQoKCmRlZiBmcmFtZXNfZm9yX2Rpc3QoZCk6CiAgICBpZiBkIDw9IDAuMDoKICAgICAgICByZXR1cm4gMAogICAgciA9IDEuMCAtIGQgKiBfRkZDCiAgICBpZiByIDw9IDFlLTY6CiAgICAgICAgcmV0dXJuIDQwMAogICAgcmV0dXJuIGludChtYXRoLmNlaWwobWF0aC5sb2cocikgLyBtYXRoLmxvZygwLjk3OCkpKQoKCmRlZiBsYW5lX3Jpc2socHRzLCB1bml0cywgaz0wLjUsIHNraXA9KCksIHRtYXg9Tm9uZSwgZGVsYXk9MC4wLCBrZWVwZXJfZGVsYXk9Tm9uZSk6CiAgICAiIiJtaW4gb3ZlciB1bml0cyBvZiAoZGlzdGFuY2UgdG8gYmFsbCBwYXRoIC0gQ1IgLSBNT1YqbWF4KDAsdC1kZWxheSkqaykuCgogICAgZGVsYXkgbW9kZWxzIHRoZSAxIEh6IGJsaW5kIHdpbmRvdzogYW4gb3Bwb25lbnQgY2Fubm90IHJlYWN0IHRvIGEga2ljawogICAgdW50aWwgaXRzIG5leHQgZGVjaXNpb24gd2luZG93LCBzbyBpdCBvbmx5IGNvdmVycyBkaXN0YW5jZSBhZnRlciBgZGVsYXlgLgogICAgIiIiCiAgICBpZiBub3QgdW5pdHM6CiAgICAgICAgcmV0dXJuIDkuMAogICAgd29yc3QgPSA5LjAKICAgIG4gPSBsZW4ocHRzKSBpZiB0bWF4IGlzIE5vbmUgZWxzZSBtaW4obGVuKHB0cyksIHRtYXgpCiAgICBmb3IgbyBpbiB1bml0czoKICAgICAgICBpZiBvIGluIHNraXA6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgbSA9IDkuMAogICAgICAgIG94LCBveSA9IG8ueCwgby55CiAgICAgICAgZGx5ID0gZGVsYXkKICAgICAgICBrayA9IGsKICAgICAgICBpZiBrZWVwZXJfZGVsYXkgaXMgbm90IE5vbmUgYW5kIGdldGF0dHIobywgJ2luZGV4JywgOTkpID09IDA6CiAgICAgICAgICAgIGRseSA9IGtlZXBlcl9kZWxheQogICAgICAgIGZvciB0IGluIHJhbmdlKG4pOgogICAgICAgICAgICB4LCB5ID0gcHRzW3RdCiAgICAgICAgICAgIGRkID0gbWF0aC5oeXBvdCh4IC0gb3gsIHkgLSBveSkgLSBDUiAtIE1PViAqIG1heCgwLjAsICh0ICsgMSkgKiBEVCAtIGRseSkgKiBrawogICAgICAgICAgICBpZiBkZCA8IG06CiAgICAgICAgICAgICAgICBtID0gZGQKICAgICAgICAgICAgICAgIGlmIG0gPCB3b3JzdCAtIDMuMDoKICAgICAgICAgICAgICAgICAgICBicmVhawogICAgICAgIGlmIG0gPCB3b3JzdDoKICAgICAgICAgICAgd29yc3QgPSBtCiAgICAgICAgICAgIGlmIHdvcnN0IDwgLTEuNToKICAgICAgICAgICAgICAgIGJyZWFrCiAgICByZXR1cm4gd29yc3QKCgpkZWYgZGlzdChhLCBiKToKICAgIHJldHVybiBtYXRoLmh5cG90KGEueCAtIGIueCwgYS55IC0gYi55KQoKCiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIHNob290aW5nClNIT1RfVEFSR0VUUyA9ICgxMC41NSwgMTEuMSwgMTEuNywgMTIuMywgMTMuMCwgMTMuNywgMTQuMywgMTQuOSwgMTUuNDUpCgoKZGVmIGJlc3Rfc2hvdChzdCwgdSwgbWUsIHVuaXRzLCBrPTAuNDUpOgogICAgIiIiUGljayB0aGUgZ29hbC1tb3V0aCB0YXJnZXQgd2l0aCB0aGUgc2FmZXN0IGxhbmUuCgogICAgVGhlIGVuZW15IGtlZXBlciB0cmFja3MgdGhlIGJhbGwncyB5LCBzbyBhdCB0aGUgY3Jvc3NpbmcgbW9tZW50IGl0IGlzIGNsb3NlCiAgICB0byB0aGUgc2hvb3RlcidzIG93biB5IChhIDEgSHogYmxpbmQgd2luZG93IG1lYW5zIGl0IGNhbm5vdCByZWFjdCB0byB0aGUKICAgIHNob3QgaXRzZWxmKS4gIFdlIHRoZXJlZm9yZSBzY29yZSB0aGUga2VlcGVyIGFnYWluc3QgYSAqcHJlZGljdGVkKiBsYXRlcmFsCiAgICBwb3NpdGlvbiwgbm90IGl0cyBjdXJyZW50IG9uZTogc2hvdHMgYXJlIGFpbWVkIGF0IHRoZSBjb3JuZXIgdGhlIGtlZXBlciBpcwogICAgbW92aW5nIGF3YXkgZnJvbS4KICAgICIiIgogICAgZ3ggPSBvcHBfZ3gobWUpCiAgICBvcHAgPSBbbyBmb3IgbyBpbiB1bml0cyBpZiBvLnRlYW0gIT0gbWVdCiAgICBrcCA9IE5vbmUKICAgIGZvciBvIGluIG9wcDoKICAgICAgICBpZiBvLmluZGV4ID09IDA6CiAgICAgICAgICAgIGtwID0gbwogICAgICAgICAgICBicmVhawogICAga3BfcHJlZCA9IE5vbmUKICAgIGlmIGtwIGlzIG5vdCBOb25lOgogICAgICAgIGtwX3ByZWQgPSBjbGFtcCgwLjY4ICogdS55ICsgMC4zMiAqIGtwLnksIDEwLjE1LCAxNS44NSkKICAgICMgc2hvb3QgYXQgdGhlIGdhcHMgb2YgdGhlIGdvYWwtbGluZSB3YWxsIGFzIHdlbGwgYXMgdGhlIHBsYWluIGNvcm5lcnMKICAgIHRhcmdldHMgPSBsaXN0KFNIT1RfVEFSR0VUUykKICAgIHdhbGwgPSBzb3J0ZWQoby55IGZvciBvIGluIG9wcCBpZiBhYnMoby54IC0gZ3gpIDwgMy41KQogICAgaWYgd2FsbDoKICAgICAgICBnYXBzID0gW3dhbGxbMF0gLSAwLjk1XQogICAgICAgIGZvciBpIGluIHJhbmdlKGxlbih3YWxsKSAtIDEpOgogICAgICAgICAgICBnYXBzLmFwcGVuZCgod2FsbFtpXSArIHdhbGxbaSArIDFdKSAqIDAuNSkKICAgICAgICBnYXBzLmFwcGVuZCh3YWxsWy0xXSArIDAuOTUpCiAgICAgICAgZm9yIHkgaW4gZ2FwczoKICAgICAgICAgICAgaWYgMTAuNSA8PSB5IDw9IDE1LjU6CiAgICAgICAgICAgICAgICB0YXJnZXRzLmFwcGVuZCh5KQogICAgYmVzdCA9IE5vbmUKICAgIGZvciB0eSBpbiB0YXJnZXRzOgogICAgICAgIGFuZyA9IG1hdGguYXRhbjIodHkgLSB1LnksIGd4IC0gdS54KQogICAgICAgIGZ4LCBmeSA9IG1hdGguY29zKGFuZyksIG1hdGguc2luKGFuZykKICAgICAgICBzeCwgc3kgPSB1LnggKyBmeCAqIEtJQ0tfT0ZGLCB1LnkgKyBmeSAqIEtJQ0tfT0ZGCiAgICAgICAgcHRzLCBndCwgZW5kID0gc2ltX2JhbGwoc3gsIHN5LCBhbmcsIDE2MCkKICAgICAgICBpZiBndCAhPSBtZSBvciBub3QgcHRzOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIG90aGVycyA9IFtvIGZvciBvIGluIG9wcCBpZiBvIGlzIG5vdCBrcF0KICAgICAgICByaXNrID0gbGFuZV9yaXNrKHB0cywgb3RoZXJzLCAwLjUsIHNraXA9KHUsKSwgZGVsYXk9MC45KSBpZiBvdGhlcnMgZWxzZSA5LjAKICAgICAgICBpZiBrcCBpcyBub3QgTm9uZToKICAgICAgICAgICAgY2kgPSAwCiAgICAgICAgICAgIGJkID0gMWU5CiAgICAgICAgICAgIGZvciBpLCBwIGluIGVudW1lcmF0ZShwdHMpOgogICAgICAgICAgICAgICAgZGQgPSBhYnMocFswXSAtIGtwLngpCiAgICAgICAgICAgICAgICBpZiBkZCA8IGJkOgogICAgICAgICAgICAgICAgICAgIGJkID0gZGQKICAgICAgICAgICAgICAgICAgICBjaSA9IGkKICAgICAgICAgICAgY3Jvc3NpbmcgPSBwdHNbY2ldCiAgICAgICAgICAgIGRrID0gbWF0aC5oeXBvdChjcm9zc2luZ1swXSAtIGtwLngsIGNyb3NzaW5nWzFdIC0ga3BfcHJlZCkgLSBDUgogICAgICAgICAgICAjIGFmdGVyIHRoZSBmaXJzdCBibGluZCB3aW5kb3cgdGhlIGtlZXBlciBjYW4gcmVhY3QgYXQgZnVsbCBzcGVlZDsKICAgICAgICAgICAgIyBsb25nLXJhbmdlIHNob3RzIGFyZSB0aGVyZWZvcmUgZWF0ZW4gYWxpdmUKICAgICAgICAgICAgdF9jcm9zcyA9IGNpICogRFQKICAgICAgICAgICAgZGsgLT0gTU9WICogbWF4KDAuMCwgdF9jcm9zcyAtIDEuMCkgKiAwLjg1CiAgICAgICAgICAgIGlmIGRrIDwgcmlzazoKICAgICAgICAgICAgICAgIHJpc2sgPSBkawogICAgICAgIGlmIGJlc3QgaXMgTm9uZSBvciByaXNrID4gYmVzdFswXToKICAgICAgICAgICAgYmVzdCA9IChyaXNrLCBhbmcsIHR5KQogICAgcmV0dXJuIGJlc3QKCgpkZWYgc2hvdWxkX3Nob290KHN0LCB1LCBtZSwgc2hvdCk6CiAgICBkZyA9IGFicyhvcHBfZ3gobWUpIC0gdS54KQogICAgcmlzayA9IHNob3RbMF0KICAgIGlmIGRnIDw9IDEyLjggYW5kIHJpc2sgPiAtMC4xNToKICAgICAgICByZXR1cm4gVHJ1ZQogICAgaWYgZGcgPD0gMTUuMCBhbmQgcmlzayA+IDAuNzU6CiAgICAgICAgcmV0dXJuIFRydWUKICAgIGlmIGRnIDw9IDE4LjAgYW5kIHJpc2sgPiAxLjcwOgogICAgICAgIHJldHVybiBUcnVlCiAgICBpZiBkZyA8PSAyMS4wIGFuZCByaXNrID4gMi42MDoKICAgICAgICByZXR1cm4gVHJ1ZQogICAgaWYgZGcgPD0gMjQuMCBhbmQgcmlzayA+IDMuNDA6CiAgICAgICAgcmV0dXJuIFRydWUKICAgIHJldHVybiBGYWxzZQoKCiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIHBhc3NpbmcKZGVmIHBhc3Nfb3B0aW9uKHN0LCB1LCBtLCBtZSwgdW5pdHMsIHNwb3Q9Tm9uZSwgaz0wLjU1LCBkZWxheT0wLjksIG1heGQ9MjUuMCk6CiAgICAiIiJFdmFsdWF0ZSBhIHBhc3MgdG8gbWF0ZSBtIChwb3NzaWJseSBsZWQgdG93YXJkIHNwb3QpLgoKICAgIExvbmcgcGFzc2VzIGFyZSBhbGxvd2VkICh1cCB0byAyNSB1bml0cywgdGhlIGJhbGwncyBmdWxsIHJhbmdlKSBhbmQgdGhlCiAgICBsYW5lIHJpc2sgdXNlcyB0aGUgMSBIeiBibGluZCB3aW5kb3c6IG9wcG9uZW50cyBjYW5ub3QgcmVhY3QgdG8gYSBraWNrCiAgICB1bnRpbCB0aGVpciBuZXh0IGRlY2lzaW9uIHdpbmRvdywgc28gb25seSBib2RpZXMgYWxyZWFkeSBjbG9zZSB0byB0aGUgbGFuZQogICAgbWF0dGVyIGZvciBzaG9ydCBmbGlnaHRzLgogICAgIiIiCiAgICBkMCA9IG1hdGguaHlwb3QobS54IC0gdS54LCBtLnkgLSB1LnkpCiAgICBpZiBkMCA8IDEuMiBvciBkMCA+IG1heGQ6CiAgICAgICAgcmV0dXJuIE5vbmUKICAgIHR4LCB0eSA9IG0ueCwgbS55CiAgICBpZiBzcG90IGlzIG5vdCBOb25lOgogICAgICAgIGR4LCBkeSA9IHNwb3RbMF0gLSBtLngsIHNwb3RbMV0gLSBtLnkKICAgICAgICBkZCA9IG1hdGguaHlwb3QoZHgsIGR5KQogICAgICAgIGlmIGRkID4gMC4xNToKICAgICAgICAgICAgIyBmaXhlZCBwb2ludDogbWVldCB3aGVyZSB0aGUgYmFsbCBhbmQgdGhlIHJ1bm5lciBhcnJpdmUgdG9nZXRoZXIKICAgICAgICAgICAgZm9yIF8gaW4gcmFuZ2UoNik6CiAgICAgICAgICAgICAgICBkYiA9IG1hdGguaHlwb3QodHggLSB1LngsIHR5IC0gdS55KQogICAgICAgICAgICAgICAgdHQgPSBmcmFtZXNfZm9yX2Rpc3QobWF4KDAuMCwgZGIgLSBLSUNLX09GRikpIC8gMjAuMAogICAgICAgICAgICAgICAga2sgPSBtaW4oZGQsIE1PViAqIHR0KSAvIGRkCiAgICAgICAgICAgICAgICBudHgsIG50eSA9IG0ueCArIGR4ICoga2ssIG0ueSArIGR5ICoga2sKICAgICAgICAgICAgICAgIGlmIG1hdGguaHlwb3QobnR4IC0gdHgsIG50eSAtIHR5KSA8IDAuMDQ6CiAgICAgICAgICAgICAgICAgICAgdHgsIHR5ID0gbnR4LCBudHkKICAgICAgICAgICAgICAgICAgICBicmVhawogICAgICAgICAgICAgICAgdHgsIHR5ID0gbnR4LCBudHkKICAgICMga2VlcCB0aGUgbGVhZCBwb2ludCBsZWdhbAogICAgdHgsIHR5ID0gc2FmZV9wdChtZSwgdHgsIHR5LCAwLjYpCiAgICBhbmcgPSBtYXRoLmF0YW4yKHR5IC0gdS55LCB0eCAtIHUueCkKICAgIGZ4LCBmeSA9IG1hdGguY29zKGFuZyksIG1hdGguc2luKGFuZykKICAgIHN4LCBzeSA9IHUueCArIGZ4ICogS0lDS19PRkYsIHUueSArIGZ5ICogS0lDS19PRkYKICAgIHB0cywgZ3QsIGVuZCA9IHNpbV9iYWxsKHN4LCBzeSwgYW5nLCAxNTApCiAgICBpZiBndCBpcyBub3QgTm9uZToKICAgICAgICByZXR1cm4gTm9uZQogICAgaWYgbm90IHB0czoKICAgICAgICByZXR1cm4gTm9uZQogICAgYXJyaXZhbCA9IG1pbihwdHMsIGtleT1sYW1iZGEgcDogKHBbMF0gLSB0eCkgKiogMiArIChwWzFdIC0gdHkpICoqIDIpCiAgICBtaXNzID0gbWF0aC5oeXBvdChhcnJpdmFsWzBdIC0gdHgsIGFycml2YWxbMV0gLSB0eSkKICAgIGlmIG1pc3MgPiAxLjU6CiAgICAgICAgcmV0dXJuIE5vbmUKICAgIG9wcF9vbmx5ID0gW3ggZm9yIHggaW4gdW5pdHMgaWYgeC50ZWFtICE9IG1lIGFuZCB4IGlzIG5vdCB1IGFuZCB4IGlzIG5vdCBtXQogICAgcmlzayA9IGxhbmVfcmlzayhwdHMsIG9wcF9vbmx5LCBrLCBza2lwPSh1LCBtKSwgZGVsYXk9ZGVsYXkpCiAgICBpZiByaXNrIDwgLTEuNjoKICAgICAgICByZXR1cm4gTm9uZQogICAgIyB3aG8gaXMgY2xvc2VzdCB0byB0aGUgcG9pbnQgd2hlcmUgdGhlIGJhbGwgY2FuIGFjdHVhbGx5IGJlIGNhdWdodD8KICAgIGFyciA9IG1pbihwdHMsIGtleT1sYW1iZGEgcDogKHBbMF0gLSB0eCkgKiogMiArIChwWzFdIC0gdHkpICoqIDIpCiAgICBvYSA9IG1pbihbbWF0aC5oeXBvdChvLnggLSBhcnJbMF0sIG8ueSAtIGFyclsxXSkgZm9yIG8gaW4gb3BwX29ubHldIG9yIFs5LjBdKQogICAgbWEgPSBtYXRoLmh5cG90KG0ueCAtIGFyclswXSwgbS55IC0gYXJyWzFdKQogICAgaWYgb2EgPCAxLjA1IGFuZCBvYSA8IG1hIC0gMC4xOgogICAgICAgIHJldHVybiBOb25lICAgICAgICAgICAgICAgICAgICAgICMgYSBkZWZlbmRlciBpcyBzdGFuZGluZyBvbiB0aGUgcmVjZXB0aW9uIHBvaW50CiAgICBwcm9nID0gKHR4IC0gdS54KSAqIGF0ayhtZSkKICAgIG9wZW5fID0gbWluKFttYXRoLmh5cG90KG8ueCAtIHR4LCBvLnkgLSB0eSkgZm9yIG8gaW4gdW5pdHMgaWYgby50ZWFtICE9IG1lXSBvciBbOS4wXSkKICAgIHNjID0gKDAuMzAgKiBwcm9nICsgMC4zNCAqIG1pbihyaXNrLCAyLjUpIC0gMC4wMTIgKiBkMCAtIDAuMzAgKiBtaXNzCiAgICAgICAgICArIDAuMTAgKiBtaW4ob3Blbl8sIDQuMCkgKyAwLjE2ICogbWluKG9hLCA1LjApIC0gMC4xMCAqIG1heCgwLjAsIG1hIC0gMS4yKSkKICAgIGlmIHByb2cgPCAtMS4wOgogICAgICAgIHNjIC09IDEuMgogICAgIyBwYXNzZXMgdGhhdCBwdXQgdGhlIGJhbGwgYXQgdGhlIHNob290aW5nIGxpbmUgYXJlIHRoZSBtb25leSBiYWxsCiAgICBpZiBhYnMoKG9wcF9neChtZSkgLSB0eCkpIDwgMTIuMDoKICAgICAgICBzYyArPSAwLjU1CiAgICByZXR1cm4gKHNjLCBhbmcsIHR4LCB0eSwgcmlzaykKCgpkZWYgYmVzdF9wYXNzKHN0LCB1LCBtZSwgbWF0ZXMsIHVuaXRzLCBzcG90cywgaz0wLjU1LCBkZWxheT0wLjksIG1heGQ9MjUuMCk6CiAgICBiZXN0ID0gTm9uZQogICAgZm9yIG0gaW4gbWF0ZXM6CiAgICAgICAgaWYgbSBpcyB1OgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIHNwb3QgPSBzcG90cy5nZXQobS5pbmRleCkgaWYgc3BvdHMgZWxzZSBOb25lCiAgICAgICAgcG8gPSBwYXNzX29wdGlvbihzdCwgdSwgbSwgbWUsIHVuaXRzLCBzcG90LCBrLCBkZWxheT1kZWxheSwgbWF4ZD1tYXhkKQogICAgICAgIGlmIHBvIGlzIE5vbmU6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgaWYgYmVzdCBpcyBOb25lIG9yIHBvWzBdID4gYmVzdFswXToKICAgICAgICAgICAgYmVzdCA9IChwb1swXSwgcG9bMV0sIG0uaW5kZXgsIHBvWzJdLCBwb1szXSkKICAgIHJldHVybiBiZXN0CgoKIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0ga2VlcGVyCmRlZiBrZWVwZXJfc3BvdChzdCwgbWUpOgogICAgZ3ggPSBvd25fZ3gobWUpCiAgICBzZ24gPSBhdGsobWUpCiAgICBzcCA9IG1hdGguaHlwb3Qoc3QuYnZ4LCBzdC5idnkpCiAgICBkZXB0aCA9IDIuMAogICAgdHkgPSAxMy4wCiAgICBtb3ZpbmdfdG9fZ29hbCA9IChneCAtIHN0LmJ4KSAqIHN0LmJ2eCA+IDAuNSBhbmQgc3AgPiAwLjgKICAgIGlmIG1vdmluZ190b19nb2FsOgogICAgICAgIHB0cyA9IGJhbGxfZnV0dXJlKHN0LCA2MCkKICAgICAgICBjcm9zcyA9IE5vbmUKICAgICAgICBmb3IgKHgsIHkpIGluIHB0czoKICAgICAgICAgICAgaWYgKHNnbiA+IDAgYW5kIHggPD0gZ3ggKyAwLjIpIG9yIChzZ24gPCAwIGFuZCB4ID49IGd4IC0gMC4yKToKICAgICAgICAgICAgICAgIGNyb3NzID0geQogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICBpZiBjcm9zcyBpcyBub3QgTm9uZToKICAgICAgICAgICAgdHkgPSBjcm9zcwogICAgICAgICAgICBkZXB0aCA9IDAuOQogICAgZWxzZToKICAgICAgICAjIHNoYWRlIHNsaWdodGx5IHRvIHRoZSBiYWxsIHNpZGUKICAgICAgICB0eSA9IDEzLjAgKyBjbGFtcCgoc3QuYnkgLSAxMy4wKSAqIDAuMjUsIC0xLjYsIDEuNikKICAgIHJldHVybiBneCArIHNnbiAqIGRlcHRoLCBjbGFtcCh0eSwgMTAuMiwgMTUuOCkKCgpkZWYga2VlcGVyX2NtZChzdCwgdSwgbWUsIG9wcCk6CiAgICBneCA9IG93bl9neChtZSkKICAgICMgY29sbGVjdCBsb29zZSBiYWxscyBpbnNpZGUgb3VyIG93biBib3gKICAgIGlmIHN0Lm93bmVyIDwgMDoKICAgICAgICBkID0gbWF0aC5oeXBvdChzdC5ieCAtIHUueCwgc3QuYnkgLSB1LnkpCiAgICAgICAgc3AgPSBtYXRoLmh5cG90KHN0LmJ2eCwgc3QuYnZ5KQogICAgICAgIGluX293biA9IGluX2JveChPV05CT1hbbWVdLCBzdC5ieCwgc3QuYnkpCiAgICAgICAgb3BwX2Nsb3NlciA9IGFueShtYXRoLmh5cG90KG8ueCAtIHN0LmJ4LCBvLnkgLSBzdC5ieSkgPCBkIC0gMC4zNSBmb3IgbyBpbiBvcHApCiAgICAgICAgaWYgKGQgPCAxLjggb3IgKGluX293biBhbmQgc3AgPCA2LjAgYW5kIGQgPCA0LjUgYW5kIG5vdCBvcHBfY2xvc2VyKSk6CiAgICAgICAgICAgIHJldHVybiAobW92ZV9kaXIodSwgc3QuYngsIHN0LmJ5LCBtZSwgYWxsb3dfYm94PVRydWUpLCBOb25lLCBGYWxzZSkKICAgIHR4LCB0eSA9IGtlZXBlcl9zcG90KHN0LCBtZSkKICAgIHJldHVybiAobW92ZV9kaXIodSwgdHgsIHR5LCBtZSwgYWxsb3dfYm94PVRydWUpLCBOb25lLCBGYWxzZSkKCgojIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBjYXJyaWVyCmRlZiBzaGllbGRfYWltKHN0LCB1LCBtZSwgdW5pdHMsIHByZWZlcj1Ob25lKToKICAgICIiIldoZXJlIHRvIHBvaW50IHRoZSBkcmliYmxlZCBiYWxsICgwLjYyIGluIGZyb250IG9mIGZhY2luZykuICBLZWVwIGl0IGFzCiAgICBmYXIgYXMgcG9zc2libGUgZnJvbSBldmVyeSBvcHBvbmVudDogYSBzaW5nbGUgY2hhc2VyIGNhbiB0aGVuIG5ldmVyIGJlCiAgICB3aXRoaW4gMC41IG9mIHRoZSBiYWxsLCB3aGljaCBpcyB3aGF0IGEgc3RlYWwgcmVxdWlyZXMuIiIiCiAgICBvcHAgPSBbbyBmb3IgbyBpbiB1bml0cyBpZiBvLnRlYW0gIT0gbWVdCiAgICBpZiBub3Qgb3BwOgogICAgICAgIHJldHVybiBOb25lCiAgICBiZXN0LCBidiA9IE5vbmUsIC0xZTE4CiAgICBmb3IgZGVnIGluIHJhbmdlKDAsIDM2MCwgMjApOgogICAgICAgIGEgPSBtYXRoLnJhZGlhbnMoZGVnKQogICAgICAgIGZ4LCBmeSA9IG1hdGguY29zKGEpLCBtYXRoLnNpbihhKQogICAgICAgIGJ4LCBieSA9IHUueCArIGZ4ICogMC42MiwgdS55ICsgZnkgKiAwLjYyCiAgICAgICAgaWYgaGl0c193YWxsKGJ4LCBieSwgUl9CKToKICAgICAgICAgICAgY29udGludWUKICAgICAgICBkbWluID0gOS4wCiAgICAgICAgZm9yIG8gaW4gb3BwOgogICAgICAgICAgICBkID0gbWF0aC5oeXBvdChvLnggLSBieCwgby55IC0gYnkpCiAgICAgICAgICAgIGlmIGQgPCBkbWluOgogICAgICAgICAgICAgICAgZG1pbiA9IGQKICAgICAgICAgICAgICAgIGlmIGRtaW4gPCAwLjY6CiAgICAgICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICB2ID0gbWluKGRtaW4sIDMuNCkKICAgICAgICBpZiBwcmVmZXIgaXMgbm90IE5vbmU6CiAgICAgICAgICAgIHYgKz0gMC4yOCAqIChmeCAqIHByZWZlclswXSArIGZ5ICogcHJlZmVyWzFdKQogICAgICAgIGlmIHYgPiBidjoKICAgICAgICAgICAgYnYsIGJlc3QgPSB2LCBkZWcKICAgIHJldHVybiBiZXN0CgoKZGVmIGNhcnJpZXJfY21kKHN0LCB1LCBtZSwgbWF0ZXMsIHVuaXRzLCBzcG90cywgZGFuZ2VyKToKICAgIGd4ID0gb3BwX2d4KG1lKQogICAgYSA9IGF0ayhtZSkKICAgIHNob290ID0gYmVzdF9zaG90KHN0LCB1LCBtZSwgdW5pdHMpCiAgICBpZiBzaG9vdCBpcyBub3QgTm9uZSBhbmQgc2hvdWxkX3Nob290KHN0LCB1LCBtZSwgc2hvb3QpOgogICAgICAgIHJldHVybiAobW92ZV9kaXIodSwgdS54ICsgbWF0aC5jb3Moc2hvb3RbMV0pLCB1LnkgKyBtYXRoLnNpbihzaG9vdFsxXSksCiAgICAgICAgICAgICAgICAgICAgICAgICBtZSwgYWxsb3dfYm94PUZhbHNlKSwKICAgICAgICAgICAgICAgIG1hdGguZGVncmVlcyhzaG9vdFsxXSkgJSAzNjAuMCwgVHJ1ZSkKICAgICMgcGFzcyB1bmRlciBwcmVzc3VyZSBvciB0byBhIGJldHRlci1wbGFjZWQgbWF0ZQogICAgcHJlc3MgPSBtaW4oW21hdGguaHlwb3Qoby54IC0gdS54LCBvLnkgLSB1LnkpIGZvciBvIGluIHVuaXRzIGlmIG8udGVhbSAhPSBtZV0gb3IgWzkuMF0pCiAgICBicCA9IGJlc3RfcGFzcyhzdCwgdSwgbWUsIG1hdGVzLCB1bml0cywgc3BvdHMpCiAgICBpZiBicCBpcyBub3QgTm9uZToKICAgICAgICBzYywgYW5nLCBtaWR4LCB0eCwgdHkgPSBicAogICAgICAgIGlmIHNjID4gKDAuMTAgaWYgcHJlc3MgPCAzLjIgZWxzZSAwLjQ1KToKICAgICAgICAgICAgcmV0dXJuIChtb3ZlX2Rpcih1LCB1LnggKyBtYXRoLmNvcyhhbmcpLCB1LnkgKyBtYXRoLnNpbihhbmcpLCBtZSwgYWxsb3dfYm94PUZhbHNlKSwKICAgICAgICAgICAgICAgICAgICBtYXRoLmRlZ3JlZXMoYW5nKSAlIDM2MC4wLCBUcnVlKQogICAgIyBwcm90ZWN0ZWQgY2FycmllciBpbnNpZGUgb3VyIG93biBib3g6IGxhdW5jaCBub3csIG5ldmVyIGRyaWJibGUgaW4gcGxhY2UKICAgIGlmIGluX2JveChPV05CT1hbbWVdLCB1LngsIHUueSkgYW5kIHByZXNzIDwgNi4wOgogICAgICAgIGFuZyA9IHB1bnRfYWltKHN0LCB1LCBtZSkKICAgICAgICBpZiBhbmcgaXMgbm90IE5vbmU6CiAgICAgICAgICAgIHJldHVybiAoJ04nLCBtYXRoLmRlZ3JlZXMoYW5nKSAlIDM2MC4wLCBUcnVlKQogICAgIyBvdGhlcndpc2UgZHJpdmUgZm9yd2FyZDogdGhlIG9wcG9uZW50IGhvbGRzIGEgY29tcGFjdCBibG9jayBpbiBmcm9udCBvZgogICAgIyB0aGUgYmFsbCwgc28gYXBwcm9hY2ggdGhlIHNob290aW5nIGJhbmQgYWxvbmcgdGhlIG9wZW4gd2luZwogICAgZGcgPSBhYnMoZ3ggLSB1LngpCiAgICBvcHAgPSBbbyBmb3IgbyBpbiB1bml0cyBpZiBvLnRlYW0gIT0gbWVdCiAgICBiYW5kID0gZ3ggLSBhICogMTAuMgogICAgYWlteCA9IHUueCArIGEgKiA2LjAKICAgIHRvcF9zY29yZSA9IHN1bSgxLjAgLyAoMS4wICsgbWF0aC5oeXBvdChvLnggLSBhaW14LCBvLnkgLSA0LjYpKSBmb3IgbyBpbiBvcHApCiAgICBib3Rfc2NvcmUgPSBzdW0oMS4wIC8gKDEuMCArIG1hdGguaHlwb3Qoby54IC0gYWlteCwgby55IC0gMjEuNCkpIGZvciBvIGluIG9wcCkKICAgIHd5ID0gNC42IGlmIHRvcF9zY29yZSA8PSBib3Rfc2NvcmUgZWxzZSAyMS40CiAgICBpZiBkZyA+IDExLjA6CiAgICAgICAgdHgwID0gdS54ICsgYSAqIDguMAogICAgICAgIGlmIChiYW5kIC0gdHgwKSAqIGEgPCAwLjA6CiAgICAgICAgICAgIHR4MCA9IGJhbmQKICAgICAgICB0dHkgPSB3eQogICAgZWxzZToKICAgICAgICB0eDAgPSBiYW5kCiAgICAgICAgdHR5ID0gY2xhbXAodS55ICsgKDEzLjAgLSB1LnkpICogMC4zMCwgNy4wLCAxOS4wKQogICAgdHgsIHR0eSA9IHNhZmVfcHQobWUsIHR4MCwgdHR5LCAwLjk1KQogICAgZHgsIGR5ID0gdHggLSB1LngsIHR0eSAtIHUueQogICAgZGQgPSBtYXRoLmh5cG90KGR4LCBkeSkgb3IgMS4wCiAgICBhaW0gPSBzaGllbGRfYWltKHN0LCB1LCBtZSwgdW5pdHMsIHByZWZlcj0oZHggLyBkZCwgZHkgLyBkZCkpCiAgICByZXR1cm4gKG1vdmVfZGlyKHUsIHR4LCB0dHksIG1lLCBhbGxvd19ib3g9RmFsc2UpLCBhaW0sIEZhbHNlKQoKCiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIHJ1bm5lcnMKZGVmIHJ1bm5lcl9zcG90cyhtZSwgYngsIGJ5KToKICAgIGd4ID0gb3BwX2d4KG1lKQogICAgYSA9IGF0ayhtZSkKICAgIHhsaW5lID0gZ3ggLSBhICogOS40CiAgICB4bWlkID0gZ3ggLSBhICogMTIuMAogICAgcmV0dXJuIFsoeGxpbmUsIDUuNCksICh4bGluZSwgMjAuNiksICh4bGluZSwgMTMuMCksCiAgICAgICAgICAgICh4bWlkLCA3LjUpLCAoeG1pZCwgMTguNSksICh4bWlkLCAxMy4wKV0KCgpkZWYgcGlja19zcG90KG1lLCB1LCBvcHAsIHRha2VuLCBzcG90cyk6CiAgICBiZXN0LCBic2MgPSBOb25lLCAtMWUxOAogICAgZm9yIChzeCwgc3kpIGluIHNwb3RzOgogICAgICAgIHN4LCBzeSA9IHNhZmVfcHQobWUsIHN4LCBzeSwgMC45NSkKICAgICAgICBjcm93ZCA9IHN1bShtYXgoMC4wLCAzLjUgLSBtYXRoLmh5cG90KHN4IC0gdFswXSwgc3kgLSB0WzFdKSkgZm9yIHQgaW4gdGFrZW4pCiAgICAgICAgb2QgPSBtaW4oW21hdGguaHlwb3Qoby54IC0gc3gsIG8ueSAtIHN5KSBmb3IgbyBpbiBvcHBdIG9yIFs5LjBdKQogICAgICAgIHRyYXZlbCA9IG1hdGguaHlwb3Qoc3ggLSB1LngsIHN5IC0gdS55KQogICAgICAgIGJkID0gbWF0aC5oeXBvdCh1LnggLSBzeCwgdS55IC0gc3kpCiAgICAgICAgaWYgYmQgPCAwLjQ6CiAgICAgICAgICAgIGJkID0gMC4wCiAgICAgICAgc2MgPSBtaW4ob2QsIDMuMCkgKiAwLjkgKyBtaW4oMy4wLCBiZCkgKiAwLjE1IC0gY3Jvd2QgKiAxLjIgLSB0cmF2ZWwgKiAwLjAyCiAgICAgICAgaWYgYmVzdCBpcyBOb25lIG9yIHNjID4gYnNjOgogICAgICAgICAgICBic2MsIGJlc3QgPSBzYywgKHN4LCBzeSkKICAgIHJldHVybiBiZXN0CgoKIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gZGVmZW5jZQpQT1NUX1kxLCBQT1NUX1kyID0gMTAuOSwgMTUuMQpLRUVQX0RFUFRIID0gMi4wCgoKZGVmIHBvc3Rfc3BvdChtZSwgd2hpY2gpOgogICAgZ3ggPSBvd25fZ3gobWUpCiAgICBzZ24gPSBhdGsobWUpICAgICAgICAgICMgaW53YXJkCiAgICB5ID0gUE9TVF9ZMSBpZiB3aGljaCA9PSAwIGVsc2UgUE9TVF9ZMgogICAgcmV0dXJuIGd4ICsgc2duICogMC41NSwgeQoKCmRlZiBwcmVzc190YXJnZXQoc3QsIHUsIG1lLCBvd25lcik6CiAgICAiIiJnbyBmb3IgdGhlIGJhbGwsIGJ1dCBmcm9tIHRoZSBnb2FsIHNpZGUuIiIiCiAgICBneCA9IG93bl9neChtZSkKICAgIGJ4LCBieSA9IHN0LmJ4LCBzdC5ieQogICAgIyBwcmVkaWN0ZWQgYmFsbCBwb3NpdGlvbiBzaG9ydGx5IGFoZWFkCiAgICBweCwgcHkgPSBieCArIHN0LmJ2eCAqIDAuMTUsIGJ5ICsgc3QuYnZ5ICogMC4xNQogICAgaWYgb3duZXIgaXMgbm90IE5vbmU6CiAgICAgICAgcHgsIHB5ID0gb3duZXIueCArIG93bmVyLmZ4ICogMC42Miwgb3duZXIueSArIG93bmVyLmZ5ICogMC42MgogICAgZHgsIGR5ID0gZ3ggLSBweCwgMTMuMCAtIHB5CiAgICBkZCA9IG1hdGguaHlwb3QoZHgsIGR5KSBvciAxLjAKICAgIGsgPSAwLjQ1CiAgICB0eCwgdHkgPSBweCArIGR4IC8gZGQgKiBrLCBweSArIGR5IC8gZGQgKiBrCiAgICByZXR1cm4gY2xhbXAodHgsIDAuNiwgVyAtIDAuNiksIGNsYW1wKHR5LCAwLjYsIEggLSAwLjYpCgoKZGVmIGNvdmVyX3RhcmdldChzdCwgbWUsIG9wcCwgdGFrZW4pOgogICAgZ3ggPSBvd25fZ3gobWUpCiAgICBieCwgYnkgPSBzdC5ieCwgc3QuYnkKICAgIGR4LCBkeSA9IGd4IC0gYngsIDEzLjAgLSBieQogICAgZGQgPSBtYXRoLmh5cG90KGR4LCBkeSkgb3IgMS4wCiAgICBrID0gY2xhbXAoMC40MiAqIGRkLCAzLjUsIDEwLjApCiAgICB0eCwgdHkgPSBieCArIGR4IC8gZGQgKiBrLCBieSArIGR5IC8gZGQgKiBrCiAgICByZXR1cm4gc2FmZV9wdChtZSwgdHgsIHR5LCAwLjkpCgojIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBwbGFuClBPU1RfWTEsIFBPU1RfWTIgPSAxMC45LCAxNS4xClNJREVfVE9QLCBTSURFX0JPVCA9IDIuNiwgMjMuNAoKCmRlZiByb2xlX3RhYmxlKG4sIG1lKToKICAgIHJ0ID0gezA6ICdrZWVwZXInfQogICAgaWYgbiA9PSAyOgogICAgICAgIHJ0WzFdID0gJ3N0cmlrZXInCiAgICBlbGlmIG4gPT0gMzoKICAgICAgICBydFsxXSA9ICdwb3N0MCcKICAgICAgICBydFsyXSA9ICdzdHJpa2VyJwogICAgZWxpZiBuID09IDQ6CiAgICAgICAgcnRbMV0gPSAncG9zdDAnCiAgICAgICAgcnRbMl0gPSAnc3RyaWtlcicKICAgICAgICBydFszXSA9ICdzdHJpa2VyJwogICAgZWxpZiBuID09IDU6CiAgICAgICAgcnQudXBkYXRlKHsxOiAncG9zdDAnLCAyOiAncG9zdDEnLCAzOiAnc3RyaWtlcicsIDQ6ICdzdHJpa2VyJ30pCiAgICBlbHNlOgogICAgICAgIHJ0LnVwZGF0ZSh7MTogJ3Bvc3QwJywgMjogJ3Bvc3QxJywgMzogJ3N0cmlrZXInLCA0OiAnc3RyaWtlcicsIDU6ICdzdHJpa2VyJ30pCiAgICByZXR1cm4gcnQKCgpkZWYgc2NyZWVuX3Nwb3Qoc3QsIG1lLCByb2xlLCBieSk6CiAgICAiIiJEZWZlbnNpdmUgc3RhdGlvbi4KCiAgICBzdG9wcGVyOiBzdGFuZCBvbiB0aGUgYmFsbCAtPiBnb2FsLWNlbnRyZSBsaW5lIDIuMiB1bml0cyBpbiBmcm9udCBvZiB0aGUKICAgIGJhbGwuICBGcm9tIDEyIHVuaXRzIG91dCB0aGUgZ29hbCBzdWJ0ZW5kcyBvbmx5IH4yMyBkZWdyZWVzLCBzbyBhIGJvZHkgYXQKICAgIDIuMiB1bml0cyBibG9ja3MgdGhlIHdob2xlIGdvYWwgbW91dGg6IHRoaXMgaXMgdGhlIG9ubHkgcmVsaWFibGUgd2F5IHRvCiAgICBzdG9wIGNsb3NlLXJhbmdlIGNvcm5lciBzaG90cyAodGhlIGtlZXBlciBjYW5ub3QgcmVhY2ggdGhlbSkuCiAgICBjb3Zlcjogc3dlZXAganVzdCBpbiBmcm9udCBvZiAvIGluc2lkZSBvdXIgb3duIGJveCAob3Bwb25lbnRzIG1heSBub3QKICAgIGZvbGxvdyB1cyBpbiB0aGVyZSkuCiAgICAiIiIKICAgIGd4ID0gb3duX2d4KG1lKQogICAgYSA9IGF0ayhtZSkKICAgIGJ4ID0gc3QuYngKICAgIGRfYmFsbCA9IChieCAtIGd4KSAqIGEKICAgIGlmIHJvbGUgPT0gJ2NvdmVyJzoKICAgICAgICB4ID0gZ3ggKyBhICogY2xhbXAoNC41ICsgMC4zNSAqIGRfYmFsbCwgNy4wLCAxNC4wKQogICAgICAgIHkgPSBjbGFtcCgxMy4wICsgKHN0LmJ5IC0gMTMuMCkgKiAwLjM1LCA1LjUsIDIwLjUpCiAgICBlbHNlOgogICAgICAgIGlmIGRfYmFsbCA8IDIwLjA6CiAgICAgICAgICAgIGR4LCBkeSA9IGd4IC0gYngsIDEzLjAgLSBzdC5ieQogICAgICAgICAgICBkZCA9IG1hdGguaHlwb3QoZHgsIGR5KSBvciAxLjAKICAgICAgICAgICAgayA9IGNsYW1wKDAuMzUgKiBkZCwgMS43LCAzLjApCiAgICAgICAgICAgIHgsIHkgPSBieCArIGR4IC8gZGQgKiBrLCBzdC5ieSArIGR5IC8gZGQgKiBrCiAgICAgICAgZWxzZToKICAgICAgICAgICAgeCA9IGd4ICsgYSAqIGNsYW1wKDYuMCArIDAuNTUgKiBkX2JhbGwsIDEwLjAsIDIwLjApCiAgICAgICAgICAgIHkgPSBjbGFtcCgxMy4wICsgKHN0LmJ5IC0gMTMuMCkgKiAwLjM1LCA0LjAsIDIyLjApCiAgICB4ID0gY2xhbXAoeCwgMC44LCBXIC0gMC44KQogICAgeSA9IGNsYW1wKHksIDAuOCwgSCAtIDAuOCkKICAgIHJldHVybiBzYWZlX3B0KG1lLCB4LCB5LCAwLjU1KQoKCmRlZiBuZWFyX2Zhcl95KGJ5KToKICAgIGlmIGJ5IDwgMTMuMDoKICAgICAgICByZXR1cm4gUE9TVF9ZMSwgUE9TVF9ZMgogICAgcmV0dXJuIFBPU1RfWTIsIFBPU1RfWTEKCgpkZWYgcG9zdF9zcG90KG1lLCB3aGljaCwgYnkpOgogICAgZ3ggPSBvd25fZ3gobWUpCiAgICBzZ24gPSBhdGsobWUpCiAgICBuZWFyLCBmYXIgPSBuZWFyX2Zhcl95KGJ5KQogICAgeSA9IGZhciBpZiB3aGljaCA9PSAwIGVsc2UgMTMuMAogICAgcmV0dXJuIGd4ICsgc2duICogMC41NSwgeQoKCmRlZiBrZWVwZXJfcmVzdF9zcG90KHN0LCBtZSk6CiAgICBneCA9IG93bl9neChtZSkKICAgIHNnbiA9IGF0ayhtZSkKICAgIHNwID0gbWF0aC5oeXBvdChzdC5idngsIHN0LmJ2eSkKICAgIG5lYXIsIGZhciA9IG5lYXJfZmFyX3koc3QuYnkpCiAgICB0eSA9IG5lYXIKICAgIGRlcHRoID0gMC44CiAgICBtb3ZpbmdfdG9fZ29hbCA9IChneCAtIHN0LmJ4KSAqIHN0LmJ2eCA+IDAuNiBhbmQgc3AgPiAwLjgKICAgIGlmIG1vdmluZ190b19nb2FsOgogICAgICAgIHB0cyA9IGJhbGxfZnV0dXJlKHN0LCA2MCkKICAgICAgICBjcm9zcyA9IE5vbmUKICAgICAgICBmb3IgKHgsIHkpIGluIHB0czoKICAgICAgICAgICAgaWYgKHNnbiA+IDAgYW5kIHggPD0gZ3ggKyAwLjMpIG9yIChzZ24gPCAwIGFuZCB4ID49IGd4IC0gMC4zKToKICAgICAgICAgICAgICAgIGNyb3NzID0geQogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICBpZiBjcm9zcyBpcyBub3QgTm9uZToKICAgICAgICAgICAgdHkgPSBjcm9zcwogICAgICAgICAgICBkZXB0aCA9IDAuNQogICAgICAgIGVsc2U6CiAgICAgICAgICAgIHR5ID0gMTMuMAogICAgcmV0dXJuIGd4ICsgc2duICogZGVwdGgsIGNsYW1wKHR5LCAxMC4yLCAxNS44KQoKCmRlZiBjaG9vc2Vfc2lkZShtZSwgb3BwKToKICAgICIiIkNvcnJpZG9yIGZhcnRoZXIgZnJvbSB0aGUgb3Bwb25lbnRzLCBtZWFzdXJlZCBhdCB0aGUgc2hvb3RpbmcgYmFuZC4iIiIKICAgIGd4ID0gb3BwX2d4KG1lKQogICAgYSA9IGF0ayhtZSkKICAgIGF4ID0gZ3ggLSBhICogMTAuMAogICAgc2NvcmVfdG9wID0gc2NvcmVfYm90ID0gMC4wCiAgICBmb3IgbyBpbiBvcHA6CiAgICAgICAgc2NvcmVfdG9wICs9IDEuMCAvICgxLjAgKyBtYXRoLmh5cG90KG8ueCAtIGF4LCBvLnkgLSA0LjIpKQogICAgICAgIHNjb3JlX2JvdCArPSAxLjAgLyAoMS4wICsgbWF0aC5oeXBvdChvLnggLSBheCwgby55IC0gMjEuOCkpCiAgICByZXR1cm4gU0lERV9UT1AgaWYgc2NvcmVfdG9wIDw9IHNjb3JlX2JvdCBlbHNlIFNJREVfQk9UCgoKZGVmIHN0YWdlX3Nwb3QobWUsIHNpZGUpOgogICAgIiIiU3RhZ2luZyBwb2ludCBqdXN0IGluc2lkZSBvdXIgb3duIGJveCwgb24gdGhlIGNob3NlbiB3aW5nLiIiIgogICAgZ3ggPSBvd25fZ3gobWUpCiAgICBhID0gYXRrKG1lKQogICAgaWYgc2lkZSA9PSBTSURFX1RPUDoKICAgICAgICB5ID0gNi45CiAgICBlbHNlOgogICAgICAgIHkgPSAxOS4xCiAgICByZXR1cm4gZ3ggKyBhICogOC45LCB5CgoKZGVmIHdpbmdlcl9zcG90KG1lLCBieCwgc2lkZSwgc2xvdCk6CiAgICAiIiJBYnNvbHV0ZSBhdHRhY2tpbmcgc3RhdGlvbnMuICBFdmVyeXRoaW5nIHN0YXlzIG91dHNpZGUgdGhlIG9wcG9uZW50IGJveAogICAgKHNob290aW5nIGxpbmUgeHNoLCAwLjkgaW4gZnJvbnQgb2YgaXQpIHNvIGEgcmVjZWl2ZXIgbmV2ZXIgaGFzIHRvIHN0ZXAgaW4uCiAgICBTbG90cyAwLTIgYXJlIHRoZSBib3gtZWRnZSBzaG9vdGluZyBzdGF0aW9ucywgMy00IHRoZSB3aWRlIG91dGxldHMuIiIiCiAgICBhID0gYXRrKG1lKQogICAgZ3ggPSBvcHBfZ3gobWUpCiAgICB4c2ggPSBneCAtIGEgKiA5LjkKICAgIHh3ID0gZ3ggLSBhICogMTIuNgogICAgaWYgc2xvdCA9PSAwOgogICAgICAgIHJldHVybiB4c2gsIDEzLjAKICAgIGlmIHNsb3QgPT0gMToKICAgICAgICByZXR1cm4geHNoLCAxMC45CiAgICBpZiBzbG90ID09IDI6CiAgICAgICAgcmV0dXJuIHhzaCwgMTUuMQogICAgaWYgc2xvdCA9PSAzOgogICAgICAgIHJldHVybiB4dywgNC4yCiAgICByZXR1cm4geHcsIDIxLjgKCgpfR0MgPSB7J21lJzogTm9uZSwgJ3NpZGUnOiBOb25lLCAnYngnOiBOb25lLCAnZnJhbWUnOiAtOTk5LCAnc3BvdHMnOiBOb25lLCAnbmVhcl9nb2FsJzogTm9uZX0KCgpkZWYgYXR0YWNrZXJfc3BvdHMobWUsIG9wcCwgc3RyaWtlcl9saXN0LCBieCwgYnksIHNpZGUsIGZyYW1lLCBuZWFyX2dvYWwpOgogICAgIiIiU3RhZ2dlcmVkIGF0dGFja2luZyBzaGFwZTogb25lIHN0cmlrZXIgaG9sZHMgdGhlIHNob290aW5nIGxpbmUsIHRoZQogICAgb3RoZXJzIG9mZmVyIGEgbGluayBzdGF0aW9uIH45IHVuaXRzIGFoZWFkIG9mIHRoZSBiYWxsLiAgV2l0aG91dCB0aGUgbGluawogICAgbWFuIHRoZSBiYWxsIGhhcyB0byB0cmF2ZWwgMjArIHVuaXRzIGluIG9uZSBraWNrLCB3aGljaCBpcyBleGFjdGx5IHRoZQogICAgcGFzcyB0aGF0IGdldHMgaW50ZXJjZXB0ZWQuIiIiCiAgICBnbG9iYWwgX0dDCiAgICBmcmVzaCA9IChfR0NbJ21lJ10gPT0gbWUgYW5kIF9HQ1snc2lkZSddID09IHNpZGUgYW5kIF9HQ1snc3BvdHMnXSBpcyBub3QgTm9uZQogICAgICAgICAgICAgYW5kIDAgPD0gZnJhbWUgLSBfR0NbJ2ZyYW1lJ10gPD0gMTAwCiAgICAgICAgICAgICBhbmQgbWF0aC5oeXBvdChieCAtIF9HQ1snYngnXSwgYnkgLSBfR0NbJ2J5J10pIDwgNS4wCiAgICAgICAgICAgICBhbmQgX0dDWyduZWFyX2dvYWwnXSA9PSBuZWFyX2dvYWwpCiAgICBpZiBmcmVzaDoKICAgICAgICByZXR1cm4gZGljdChfR0NbJ3Nwb3RzJ10pCiAgICBhID0gYXRrKG1lKQogICAgZ3ggPSBvcHBfZ3gobWUpCiAgICBteXByb2cgPSAoYnggLSBvd25fZ3gobWUpKSAqIGEKICAgIGRlZXAgPSBneCAtIGEgKiAxMC4xCiAgICB3aW5nID0gNC42IGlmIHNpZGUgPT0gU0lERV9UT1AgZWxzZSAyMS40CiAgICBmYXIgPSAyMS40IGlmIHNpZGUgPT0gU0lERV9UT1AgZWxzZSA0LjYKICAgIGxpbmtfbG8sIGxpbmtfaGkgPSBzb3J0ZWQoKGd4IC0gYSAqIDE3LjAsIGd4IC0gYSAqIDEwLjYpKQogICAgbGluayA9IGNsYW1wKGJ4ICsgYSAqIDkuMCwgbGlua19sbywgbGlua19oaSkKICAgIG91dCA9IHt9CiAgICBvcmRlcmVkID0gc29ydGVkKHN0cmlrZXJfbGlzdCwga2V5PWxhbWJkYSB6OiB6LmluZGV4KQogICAgZm9yIGksIHUgaW4gZW51bWVyYXRlKG9yZGVyZWQpOgogICAgICAgIGlmIGkgPT0gbGVuKG9yZGVyZWQpIC0gMToKICAgICAgICAgICAgIyB0YXJnZXQgbWFuOiB0aGUgbG9uZy1iYWxsIHN0YXRpb24gb24gdGhlIGNvcnJpZG9yIHRoZSBibG9jayBpcwogICAgICAgICAgICAjIG5vdCB1c2luZywgcmlnaHQgb24gdGhlIHNob290aW5nIGJhbmQKICAgICAgICAgICAgY2FuZCA9IFsoZGVlcCwgd2luZyksIChkZWVwLCAxMy4wICsgKHdpbmcgLSAxMy4wKSAqIDAuNDUpLAogICAgICAgICAgICAgICAgICAgIChkZWVwLCAxMy4wKSwgKGRlZXAgKyBhICogMS42LCB3aW5nKV0KICAgICAgICBlbGlmIG15cHJvZyA+IDEwLjA6CiAgICAgICAgICAgICMgZmluaXNoZXIgLyBmYXIgcG9zdCBwYXJ0bmVyCiAgICAgICAgICAgIGNhbmQgPSBbKGRlZXAsIDEzLjApLCAoZGVlcCwgMTMuMCArIChmYXIgLSAxMy4wKSAqIDAuNiksCiAgICAgICAgICAgICAgICAgICAgKGRlZXAgLSBhICogMi4wLCAxMy4wKSwgKGRlZXAsIDEzLjAgKyAod2luZyAtIDEzLjApICogMC42KV0KICAgICAgICBlbHNlOgogICAgICAgICAgICAjIGxpbmsgbWFuIGJldHdlZW4gdGhlIGJ1aWxkLXVwIGFuZCB0aGUgdGFyZ2V0CiAgICAgICAgICAgIGNhbmQgPSBbKGxpbmssIHdpbmcpLCAobGluaywgMTMuMCArICh3aW5nIC0gMTMuMCkgKiAwLjUpLAogICAgICAgICAgICAgICAgICAgIChsaW5rLCAxMy4wKSwgKGxpbmsgKyBhICogMy4wLCB3aW5nKV0KICAgICAgICBzcCA9IHBpY2tfc3BvdChtZSwgdSwgb3BwLCBsaXN0KG91dC52YWx1ZXMoKSksIGNhbmQsIChieCwgYnkpKQogICAgICAgIG91dFt1LmluZGV4XSA9IHNwCiAgICBfR0MgPSB7J21lJzogbWUsICdzaWRlJzogc2lkZSwgJ2J4JzogYngsICdieSc6IGJ5LCAnZnJhbWUnOiBmcmFtZSwgJ3Nwb3RzJzogb3V0LAogICAgICAgICAgICduZWFyX2dvYWwnOiBuZWFyX2dvYWx9CiAgICByZXR1cm4gZGljdChvdXQpCgoKZGVmIHBvYWNoZXJfc3BvdHMobWUpOgogICAgZ3ggPSBvcHBfZ3gobWUpCiAgICBhID0gYXRrKG1lKQogICAgeHNoID0gZ3ggLSBhICogOS45CiAgICB4dyA9IGd4IC0gYSAqIDEyLjYKICAgIHJldHVybiBbKHhzaCwgMTMuMCksICh4c2gsIDEwLjkpLCAoeHNoLCAxNS4xKSwKICAgICAgICAgICAgKHh3LCA0LjIpLCAoeHcsIDIxLjgpLCAoeHcsIDkuMCksICh4dywgMTcuMCksICh4dywgMTMuMCldCgoKZGVmIHBpY2tfc3BvdChtZSwgdSwgb3BwLCB0YWtlbiwgc3BvdHMsIGJhbGxfeHk9Tm9uZSk6CiAgICBiZXN0LCBic2MgPSBOb25lLCAtMWUxOAogICAgZm9yIChzeCwgc3kpIGluIHNwb3RzOgogICAgICAgIHN4LCBzeSA9IHNhZmVfcHQobWUsIHN4LCBzeSwgMC45NSkKICAgICAgICBjcm93ZCA9IHN1bShtYXgoMC4wLCAzLjUgLSBtYXRoLmh5cG90KHN4IC0gdFswXSwgc3kgLSB0WzFdKSkgZm9yIHQgaW4gdGFrZW4pCiAgICAgICAgb2QgPSBtaW4oW21hdGguaHlwb3Qoby54IC0gc3gsIG8ueSAtIHN5KSBmb3IgbyBpbiBvcHBdIG9yIFs5LjBdKQogICAgICAgIHRyYXZlbCA9IG1hdGguaHlwb3Qoc3ggLSB1LngsIHN5IC0gdS55KQogICAgICAgIGxlYWQgPSAoc3ggLSB1LngpICogYXRrKG1lKQogICAgICAgIHNjID0gbWluKG9kLCAzLjUpICogMC45ICsgbWluKDUuMCwgbGVhZCkgKiAwLjE1IC0gY3Jvd2QgKiAxLjEgLSB0cmF2ZWwgKiAwLjAyCiAgICAgICAgaWYgYmFsbF94eSBpcyBub3QgTm9uZToKICAgICAgICAgICAgYmQgPSBtYXRoLmh5cG90KHN4IC0gYmFsbF94eVswXSwgc3kgLSBiYWxsX3h5WzFdKQogICAgICAgICAgICBpZiBiZCA+IDE1LjA6CiAgICAgICAgICAgICAgICBzYyAtPSAoYmQgLSAxNS4wKSAqIDAuNwogICAgICAgICAgICBpZiBiZCA8IDQuMDoKICAgICAgICAgICAgICAgIHNjIC09ICg0LjAgLSBiZCkgKiAwLjI1CiAgICAgICAgaWYgYmVzdCBpcyBOb25lIG9yIHNjID4gYnNjOgogICAgICAgICAgICBic2MsIGJlc3QgPSBzYywgKHN4LCBzeSkKICAgIHJldHVybiBiZXN0CgoKZGVmIGJ1aWxkX3BsYW4oc3QsIG1lLCBuKToKICAgIG15ID0gW3UgZm9yIHUgaW4gc3QudW5pdHMgaWYgdS50ZWFtID09IG1lXQogICAgb3BwID0gW3UgZm9yIHUgaW4gc3QudW5pdHMgaWYgdS50ZWFtICE9IG1lXQogICAgcnVzaCA9IGJvb2woc3QuZ29sZGVuKSBvciAoc3QuZnJhbWUgPj0gMjEwMCBhbmQgc3Quc2NvcmVbMF0gPT0gc3Quc2NvcmVbMV0pCiAgICBwbGFuID0geydtb2RlJzogJ2xvb3NlJywgJ2NhcnJpZXInOiBOb25lLCAncm9sZXMnOiByb2xlX3RhYmxlKG4sIG1lKSwKICAgICAgICAgICAgJ3Nwb3RzJzoge30sICdjaGFzZXInOiBOb25lLCAnc2lkZSc6IGNob29zZV9zaWRlKG1lLCBvcHApLCAncnVzaCc6IHJ1c2h9CiAgICBpZiBub3QgbXk6CiAgICAgICAgcmV0dXJuIHBsYW4KICAgIG93bmVyID0gc3QudW5pdHNbc3Qub3duZXJdIGlmIDAgPD0gc3Qub3duZXIgPCBsZW4oc3QudW5pdHMpIGVsc2UgTm9uZQogICAgYngsIGJ5ID0gc3QuYngsIHN0LmJ5CiAgICBzaWRlID0gcGxhblsnc2lkZSddCiAgICBpZiBuID09IDE6CiAgICAgICAgaWYgb3duZXIgaXMgbm90IE5vbmUgYW5kIG93bmVyLnRlYW0gPT0gbWU6CiAgICAgICAgICAgIHBsYW5bJ21vZGUnXSA9ICdzb2xvX29mZicKICAgICAgICBlbGlmIG93bmVyIGlzIG5vdCBOb25lOgogICAgICAgICAgICBwbGFuWydtb2RlJ10gPSAnc29sb19kZWYnCiAgICAgICAgZWxzZToKICAgICAgICAgICAgcGxhblsnbW9kZSddID0gJ3NvbG9fbG9vc2UnCiAgICAgICAgcmV0dXJuIHBsYW4KICAgIGZpZWxkZXJzID0gW3UgZm9yIHUgaW4gbXkgaWYgdS5pbmRleCAhPSAwXQogICAgZF9kZWYgPSAoYnggLSBvd25fZ3gobWUpKSAqIGF0ayhtZSkKICAgIGRfYXRrID0gKG9wcF9neChtZSkgLSBieCkgKiBhdGsobWUpCiAgICBzdHJpa2VyX2xpc3QgPSBbdSBmb3IgdSBpbiBmaWVsZGVycyBpZiBwbGFuWydyb2xlcyddLmdldCh1LmluZGV4KSA9PSAnc3RyaWtlciddCgogICAgaWYgb3duZXIgaXMgbm90IE5vbmUgYW5kIG93bmVyLnRlYW0gPT0gbWU6CiAgICAgICAgcGxhblsnbW9kZSddID0gJ29mZicKICAgICAgICBwbGFuWydjYXJyaWVyJ10gPSBvd25lci5pbmRleAogICAgICAgIG5lYXJfZ29hbCA9IGRfYXRrIDwgMjIuMAogICAgICAgIHN0cmlrZXJfbGlzdC5zb3J0KGtleT1sYW1iZGEgejogei5pbmRleCkKICAgICAgICBwbGFuWydzcG90cyddLnVwZGF0ZShhdHRhY2tlcl9zcG90cyhtZSwgb3BwLCBzdHJpa2VyX2xpc3QsIGJ4LCBieSwgc2lkZSwKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdC5mcmFtZSwgbmVhcl9nb2FsKSkKICAgICAgICBwcm9nID0gbWF4KDAuMCwgKGJ4IC0gb3duX2d4KG1lKSkgKiBhdGsobWUpKQogICAgICAgIGZvciB1IGluIGZpZWxkZXJzOgogICAgICAgICAgICByb2xlID0gcGxhblsncm9sZXMnXS5nZXQodS5pbmRleCkKICAgICAgICAgICAgaWYgcm9sZSA9PSAncG9zdDAnOgogICAgICAgICAgICAgICAgIyBmYXItcG9zdCB3YWxsIG1hbjsgd2hlbiB0aGUgYmFsbCBpcyB1cGZpZWxkIGhlIHN0ZXBzIG91dCB0bwogICAgICAgICAgICAgICAgIyB0aGUgcHJvdGVjdGVkIGxhdW5jaCBwbGF0Zm9ybSBhdCB0aGUgZWRnZSBvZiBvdXIgb3duIGJveAogICAgICAgICAgICAgICAgaWYgcHJvZyA+IDIwLjA6CiAgICAgICAgICAgICAgICAgICAgbHAgPSAob3duX2d4KG1lKSArIGF0ayhtZSkgKiA4LjYsCiAgICAgICAgICAgICAgICAgICAgICAgICAgNi45IGlmIHNpZGUgPT0gU0lERV9UT1AgZWxzZSAxOS4xKQogICAgICAgICAgICAgICAgICAgIHBsYW5bJ3Nwb3RzJ11bdS5pbmRleF0gPSBzYWZlX3B0KG1lLCBscFswXSwgbHBbMV0sIDAuNCkKICAgICAgICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICAgICAgcGxhblsnc3BvdHMnXVt1LmluZGV4XSA9IHBvc3Rfc3BvdChtZSwgMCwgYnkpCiAgICAgICAgICAgIGVsaWYgcm9sZSA9PSAncG9zdDEnOgogICAgICAgICAgICAgICAgcGxhblsnc3BvdHMnXVt1LmluZGV4XSA9IHBvc3Rfc3BvdChtZSwgMSwgYnkpCiAgICAgICAgaWYgb3duZXIuaW5kZXggPT0gMDoKICAgICAgICAgICAgIyBrZWVwZXIgb24gdGhlIGJhbGw6IGEgcHJvdGVjdGVkIG91dGxldCBpbnNpZGUgb3VyIG93biBib3ggdGFrZXMKICAgICAgICAgICAgIyB0aGUgZmlyc3QgcGFzcywgdGhlbiBsYXVuY2hlczsgaG9sZGluZyBpcyBuZXZlciBhbiBvcHRpb24KICAgICAgICAgICAgcGxhblsnbW9kZSddID0gJ2tlZXBlcicKICAgICAgICAgICAgbHAgPSBvdXRsZXRfc3BvdChtZSwgc2lkZSkKICAgICAgICAgICAgY2FuZCA9IFt1IGZvciB1IGluIGZpZWxkZXJzIGlmIHBsYW5bJ3JvbGVzJ10uZ2V0KHUuaW5kZXgpID09ICdwb3N0MCddCiAgICAgICAgICAgIGNhbmQgPSBjYW5kIG9yIGZpZWxkZXJzCiAgICAgICAgICAgIG91ID0gbWluKGNhbmQsIGtleT1sYW1iZGEgejogbWF0aC5oeXBvdCh6LnggLSBscFswXSwgei55IC0gbHBbMV0pKQogICAgICAgICAgICBwbGFuWydvdXRsZXQnXSA9IG91LmluZGV4CiAgICAgICAgICAgIHBsYW5bJ3Nwb3RzJ11bb3UuaW5kZXhdID0gbHAKICAgICAgICByZXR1cm4gcGxhbgogICAgaWYgb3duZXIgaXMgbm90IE5vbmU6CiAgICAgICAgcGxhblsnbW9kZSddID0gJ2RlZicKICAgICAgICBkX2RlZiA9IChieCAtIG93bl9neChtZSkpICogYXRrKG1lKQogICAgICAgIHdpbmcgPSA0LjYgaWYgc2lkZSA9PSBTSURFX1RPUCBlbHNlIDIxLjQKICAgICAgICBmb3IgdSBpbiBmaWVsZGVyczoKICAgICAgICAgICAgcm9sZSA9IHBsYW5bJ3JvbGVzJ10uZ2V0KHUuaW5kZXgpCiAgICAgICAgICAgIGlmIHJvbGUgPT0gJ3Bvc3QwJzoKICAgICAgICAgICAgICAgIHBsYW5bJ3Nwb3RzJ11bdS5pbmRleF0gPSBwb3N0X3Nwb3QobWUsIDAsIGJ5KQogICAgICAgICAgICBlbGlmIHJvbGUgPT0gJ3Bvc3QxJzoKICAgICAgICAgICAgICAgIHBsYW5bJ3Nwb3RzJ11bdS5pbmRleF0gPSBwb3N0X3Nwb3QobWUsIDEsIGJ5KQogICAgICAgICAgICBlbGlmIG4gPT0gMiBhbmQgZF9kZWYgPCAyNi4wOgogICAgICAgICAgICAgICAgcGxhblsnc3BvdHMnXVt1LmluZGV4XSA9IHBvc3Rfc3BvdChtZSwgMCwgYnkpCiAgICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICBycyA9IFsob3BwX2d4KG1lKSAtIGF0ayhtZSkgKiAxMC4wLCB3aW5nKSwKICAgICAgICAgICAgICAgICAgICAgIChvcHBfZ3gobWUpIC0gYXRrKG1lKSAqIDEwLjAsIDEzLjApLAogICAgICAgICAgICAgICAgICAgICAgKG9wcF9neChtZSkgLSBhdGsobWUpICogMTQuMCwgd2luZyksCiAgICAgICAgICAgICAgICAgICAgICAob3BwX2d4KG1lKSAtIGF0ayhtZSkgKiAxMC4wLCAxMy4wICsgKHdpbmcgLSAxMy4wKSAqIDAuNildCiAgICAgICAgICAgICAgICBzcCA9IHBpY2tfc3BvdChtZSwgdSwgb3BwLCBbXSwgcnMsIChieCwgYnkpKQogICAgICAgICAgICAgICAgcGxhblsnc3BvdHMnXVt1LmluZGV4XSA9IHNwCiAgICAgICAgcmV0dXJuIHBsYW4KICAgIHBsYW5bJ21vZGUnXSA9ICdsb29zZScKICAgIGlmIGZpZWxkZXJzOgogICAgICAgIHB0cyA9IGJhbGxfZnV0dXJlKHN0LCA4MCkKCiAgICAgICAgZGVmIGl0aW1lKHVuaXQpOgogICAgICAgICAgICBmb3Iga2ssIHB0IGluIGVudW1lcmF0ZShwdHMpOgogICAgICAgICAgICAgICAgaWYgbWF0aC5oeXBvdChwdFswXSAtIHVuaXQueCwgcHRbMV0gLSB1bml0LnkpIDw9IE1PViAqIChrayArIDEpICogRFQgKyBDUiAqIDAuOToKICAgICAgICAgICAgICAgICAgICByZXR1cm4ga2sKICAgICAgICAgICAgcmV0dXJuIDk5OQogICAgICAgIHJhbmtlZCA9IHNvcnRlZChmaWVsZGVycywga2V5PWl0aW1lKQogICAgICAgIG1pbmVfdCA9IGl0aW1lKHJhbmtlZFswXSkKICAgICAgICBvcHBfdCA9IG1pbihbaXRpbWUobykgZm9yIG8gaW4gb3BwXSBvciBbOTk5XSkKICAgICAgICBwbGFuWydjaGFzZXInXSA9IHJhbmtlZFswXS5pbmRleAogICAgICAgIHRha2VuID0gW10KICAgICAgICB3aW5nID0gNC42IGlmIHNpZGUgPT0gU0lERV9UT1AgZWxzZSAyMS40CiAgICAgICAgZm9yIHUgaW4gZmllbGRlcnM6CiAgICAgICAgICAgIHJvbGUgPSBwbGFuWydyb2xlcyddLmdldCh1LmluZGV4KQogICAgICAgICAgICBpZiByb2xlID09ICdwb3N0MCc6CiAgICAgICAgICAgICAgICBwbGFuWydzcG90cyddW3UuaW5kZXhdID0gcG9zdF9zcG90KG1lLCAwLCBieSkKICAgICAgICAgICAgZWxpZiByb2xlID09ICdwb3N0MSc6CiAgICAgICAgICAgICAgICBwbGFuWydzcG90cyddW3UuaW5kZXhdID0gcG9zdF9zcG90KG1lLCAxLCBieSkKICAgICAgICAgICAgZWxzZToKICAgICAgICAgICAgICAgIHNwID0gcGlja19zcG90KG1lLCB1LCBvcHAsIHRha2VuLAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWyhvcHBfZ3gobWUpIC0gYXRrKG1lKSAqIDEwLjAsIHdpbmcpLAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChvcHBfZ3gobWUpIC0gYXRrKG1lKSAqIDEwLjAsIDEzLjApLAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChvcHBfZ3gobWUpIC0gYXRrKG1lKSAqIDEzLjAsIHdpbmcpXSwgKGJ4LCBieSkpCiAgICAgICAgICAgICAgICBwbGFuWydzcG90cyddW3UuaW5kZXhdID0gc3AKICAgICAgICAgICAgICAgIHRha2VuLmFwcGVuZChzcCkKICAgICAgICBpZiBkX2RlZiA8IDE4LjAgYW5kIG9wcF90ICsgMiA8IG1pbmVfdDoKICAgICAgICAgICAgcGxhblsnY2hhc2VyJ10gPSBOb25lCiAgICByZXR1cm4gcGxhbgoKCmRlZiBsYW5lX2NsZWFyX3Nob3J0KGJ4LCBieSwgcHgsIHB5LCBvcHBzKToKICAgIGR4LCBkeSA9IHB4IC0gYngsIHB5IC0gYnkKICAgIEQgPSBtYXRoLmh5cG90KGR4LCBkeSkKICAgIGlmIEQgPCAxZS02OgogICAgICAgIHJldHVybiA5LjAKICAgIHV4LCB1eSA9IGR4IC8gRCwgZHkgLyBECiAgICBiZXN0ID0gOS4wCiAgICBmb3IgbyBpbiBvcHBzOgogICAgICAgIGV4LCBleSA9IG8ueCAtIGJ4LCBvLnkgLSBieQogICAgICAgIHByb2ogPSBleCAqIHV4ICsgZXkgKiB1eQogICAgICAgIGlmIHByb2ogPCAtMC4zIG9yIHByb2ogPiBEICsgMC42OgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIHBlcnAgPSBhYnMoZXggKiB1eSAtIGV5ICogdXgpCiAgICAgICAgaWYgcGVycCAtIDAuODIgPCBiZXN0OgogICAgICAgICAgICBiZXN0ID0gcGVycCAtIDAuODIKICAgIHJldHVybiBiZXN0CgoKZGVmIHB1bnRfYWltKHN0LCB1LCBtZSk6CiAgICAiIiJDbGVhciB0aGUgYmFsbCB0byBzcGFjZTogbWF4IGZvcndhcmQgZ2FpbiB3aXRoIGEgbGFuZSBubyBvcHBvbmVudCBjYW4KICAgIHJlYWNoIGluc2lkZSB0aGUgMSBIeiBibGluZCB3aW5kb3cuICBMYW5kaW5nIGluc2lkZSB0aGUgb3Bwb25lbnQgYm94IGlzCiAgICBwZW5hbGlzZWQgKHRoZWlyIGtlZXBlciBjb2xsZWN0cyBpdCkuIiIiCiAgICBhID0gYXRrKG1lKQogICAgb3BwID0gW28gZm9yIG8gaW4gc3QudW5pdHMgaWYgby50ZWFtICE9IG1lXQogICAgbWF0ZXMgPSBbbSBmb3IgbSBpbiBzdC51bml0cyBpZiBtLnRlYW0gPT0gbWUgYW5kIG0gaXMgbm90IHVdCiAgICBiZXN0LCBic2MgPSBOb25lLCAtMWUxOAogICAgZm9yIGRlZyBpbiByYW5nZSgtODUsIDg2LCA1KToKICAgICAgICBiYXNlID0gMC4wIGlmIGEgPiAwIGVsc2UgMTgwLjAKICAgICAgICBhbmcgPSBtYXRoLnJhZGlhbnMoYmFzZSArIGRlZykKICAgICAgICBmeCwgZnkgPSBtYXRoLmNvcyhhbmcpLCBtYXRoLnNpbihhbmcpCiAgICAgICAgc3gsIHN5ID0gdS54ICsgZnggKiBLSUNLX09GRiwgdS55ICsgZnkgKiBLSUNLX09GRgogICAgICAgIGlmIG5vdCAoMC4zIDwgc3ggPCBXIC0gMC4zIGFuZCAwLjMgPCBzeSA8IEggLSAwLjMpOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIHB0cywgZ3QsIGVuZCA9IHNpbV9iYWxsKHN4LCBzeSwgYW5nLCA5MCkKICAgICAgICBpZiBndCBpcyBub3QgTm9uZSBvciBub3QgcHRzOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIGV4LCBleSA9IHB0c1stMV0KICAgICAgICBhZHYgPSAoZXggLSB1LngpICogYQogICAgICAgIHJpc2sgPSBsYW5lX3Jpc2socHRzLCBvcHAsIDAuNywgc2tpcD0odSwpLCBkZWxheT0xLjApCiAgICAgICAgbWF0ZV9kID0gbWluKFttYXRoLmh5cG90KG0ueCAtIGV4LCBtLnkgLSBleSkgZm9yIG0gaW4gbWF0ZXNdIG9yIFsxMi4wXSkKICAgICAgICBvcHBfZCA9IG1pbihbbWF0aC5oeXBvdChvLnggLSBleCwgby55IC0gZXkpIGZvciBvIGluIG9wcF0gb3IgWzEyLjBdKQogICAgICAgIHNjID0gYWR2ICogMC4xMCArIG1pbihyaXNrLCAzLjApICogMC42MAogICAgICAgIHNjIC09IDAuMTAgKiBtaW4obWF0ZV9kLCAxMC4wKSArIDAuMTIgKiBtaW4ob3BwX2QsIDEwLjApCiAgICAgICAgaWYgaW5fYm94KE9CT1hbbWVdLCBleCwgZXkpOgogICAgICAgICAgICBzYyAtPSAxLjYKICAgICAgICBpZiBiZXN0IGlzIE5vbmUgb3Igc2MgPiBic2M6CiAgICAgICAgICAgIGJzYywgYmVzdCA9IHNjLCBhbmcKICAgIHJldHVybiBiZXN0CgoKZGVmIGtlZXBlcl9ob2xkX2NtZChzdCwgdSwgbWUsIG1hdGVzLCBvcHAsIHBsYW4pOgogICAgIiIiVGhlIGtlZXBlciBtdXN0IG5ldmVyIHNpdCBvbiB0aGUgYmFsbDogcGFzcyB0byB0aGUgZnJlZSBvdXRsZXQgaW5zaWRlIG91cgogICAgb3duIGJveCwgZWxzZSBsYXVuY2ggbG9uZywgZWxzZSBjbGVhci4gIEhvbGRpbmcgaXMgYSAwOjAgbWFjaGluZS4iIiIKICAgIHNwb3RzID0gcGxhbi5nZXQoJ3Nwb3RzJywge30pCiAgICBob2xkID0gX0hPTEQuZ2V0KCd2JywgMCkKICAgIGJwID0gYmVzdF9wYXNzKHN0LCB1LCBtZSwgbWF0ZXMsIHN0LnVuaXRzLCBzcG90cywgaz0wLjUsIGRlbGF5PTAuODUsIG1heGQ9MjQuMCkKICAgIGlmIGJwIGlzIG5vdCBOb25lIGFuZCBicFswXSA+IDAuNzoKICAgICAgICByZXR1cm4gKCdOJywgbWF0aC5kZWdyZWVzKGJwWzFdKSAlIDM2MC4wLCBUcnVlKQogICAgaWYgYnAgaXMgbm90IE5vbmUgYW5kIGhvbGQgPj0gNiBhbmQgYnBbMF0gPiAtMC42OgogICAgICAgIHJldHVybiAoJ04nLCBtYXRoLmRlZ3JlZXMoYnBbMV0pICUgMzYwLjAsIFRydWUpCiAgICBhbmcgPSBwdW50X2FpbShzdCwgdSwgbWUpCiAgICBpZiBhbmcgaXMgbm90IE5vbmU6CiAgICAgICAgcHRzLCBndCwgZW5kID0gc2ltX2JhbGwodS54ICsgbWF0aC5jb3MoYW5nKSAqIEtJQ0tfT0ZGLCB1LnkgKyBtYXRoLnNpbihhbmcpICogS0lDS19PRkYsIGFuZywgOTApCiAgICAgICAgYWR2ID0gKHB0c1stMV1bMF0gLSB1LngpICogYXRrKG1lKSBpZiBwdHMgZWxzZSAwLjAKICAgICAgICBpZiBob2xkID49IDE4IG9yIGFkdiA+IDYuMDoKICAgICAgICAgICAgcmV0dXJuICgnTicsIG1hdGguZGVncmVlcyhhbmcpICUgMzYwLjAsIFRydWUpCiAgICBpZiBicCBpcyBub3QgTm9uZToKICAgICAgICByZXR1cm4gKCdOJywgbWF0aC5kZWdyZWVzKGJwWzFdKSAlIDM2MC4wLCBUcnVlKQogICAgIyBub3RoaW5nIGF0IGFsbDogc2h1ZmZsZSB0byB0aGUgb3BlbiBib3ggZWRnZSB0byBvcGVuIGFuIGFuZ2xlCiAgICBscCA9IG91dGxldF9zcG90KG1lLCBwbGFuLmdldCgnc2lkZScsIFNJREVfQk9UKSwgc3QpCiAgICByZXR1cm4gKG1vdmVfZGlyKHUsIGxwWzBdLCBscFsxXSwgbWUsIGFsbG93X2JveD1UcnVlKSwgTm9uZSwgRmFsc2UpCgoKZGVmIG91dGxldF9zcG90KG1lLCBzaWRlLCBzdD1Ob25lKToKICAgICIiIlByb3RlY3RlZCBsYXVuY2ggcGxhdGZvcm0gaW5zaWRlIG91ciBvd24gYm94LiIiIgogICAgZ3ggPSBvd25fZ3gobWUpCiAgICBhID0gYXRrKG1lKQogICAgeSA9IDQuMyBpZiBzaWRlID09IFNJREVfVE9QIGVsc2UgMjEuNwogICAgcmV0dXJuIGd4ICsgYSAqIDguNiwgeQoKCmRlZiBrZWVwZXJfY21kKHN0LCB1LCBtZSwgb3BwKToKICAgIGlmIHN0Lm93bmVyIDwgMDoKICAgICAgICBkID0gbWF0aC5oeXBvdChzdC5ieCAtIHUueCwgc3QuYnkgLSB1LnkpCiAgICAgICAgc3AgPSBtYXRoLmh5cG90KHN0LmJ2eCwgc3QuYnZ5KQogICAgICAgIGluX293biA9IGluX2JveChPV05CT1hbbWVdLCBzdC5ieCwgc3QuYnkpCiAgICAgICAgb3BwX2Nsb3NlciA9IGFueShtYXRoLmh5cG90KG8ueCAtIHN0LmJ4LCBvLnkgLSBzdC5ieSkgPCBkIC0gMC4zNSBmb3IgbyBpbiBvcHApCiAgICAgICAgaWYgKGQgPCAxLjYgb3IgKGluX293biBhbmQgc3AgPCA2LjAgYW5kIGQgPCA0LjUgYW5kIG5vdCBvcHBfY2xvc2VyKSk6CiAgICAgICAgICAgIHJldHVybiAobW92ZV9kaXIodSwgc3QuYngsIHN0LmJ5LCBtZSwgYWxsb3dfYm94PVRydWUpLCBOb25lLCBGYWxzZSkKICAgIHR4LCB0eSA9IGtlZXBlcl9yZXN0X3Nwb3Qoc3QsIG1lKQogICAgcmV0dXJuIChtb3ZlX2Rpcih1LCB0eCwgdHksIG1lLCBhbGxvd19ib3g9VHJ1ZSksIE5vbmUsIEZhbHNlKQoKCiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBleGVjCmRlZiBtb3ZlX2Rpcl9hdm9pZCh1LCB0eCwgdHksIG1lLCBvcHAsIGFsbG93X2JveD1GYWxzZSwgbT1TQUZFX00sIHNwZWVkPU1PViwgYXZvaWRfcj0yLjYpOgogICAgZHgsIGR5ID0gdHggLSB1LngsIHR5IC0gdS55CiAgICBkID0gbWF0aC5oeXBvdChkeCwgZHkpCiAgICBpZiBkIDwgMC4wNjoKICAgICAgICByZXR1cm4gJ04nCiAgICB1eCwgdXkgPSBkeCAvIGQsIGR5IC8gZAogICAgYmVzdCwgYmVzdHYgPSBOb25lLCAtMWUxOAogICAgZm9yIG5hbWUgaW4gRElSX0tFWVM6CiAgICAgICAgdngsIHZ5ID0gRElSU1tuYW1lXQogICAgICAgIGlmIHZ4ID09IDAuMCBhbmQgdnkgPT0gMC4wOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIGlmIG5vdCBhbGxvd19ib3ggYW5kIG5vdCBzdGVwX29rKG1lLCB1LngsIHUueSwgdngsIHZ5LCA1LCBtLCBzcGVlZCk6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgdiA9IHZ4ICogdXggKyB2eSAqIHV5CiAgICAgICAgZm9yIG8gaW4gb3BwOgogICAgICAgICAgICBveCwgb3kgPSBvLnggLSB1LngsIG8ueSAtIHUueQogICAgICAgICAgICBvZCA9IG1hdGguaHlwb3Qob3gsIG95KQogICAgICAgICAgICBpZiBvZCA8IGF2b2lkX3IgYW5kIG9kID4gMWUtNjoKICAgICAgICAgICAgICAgIGRvdCA9ICh2eCAqIG94ICsgdnkgKiBveSkgLyBvZAogICAgICAgICAgICAgICAgaWYgZG90ID4gMC4wOgogICAgICAgICAgICAgICAgICAgIHYgLT0gZG90ICogKGF2b2lkX3IgLSBvZCkgLyBhdm9pZF9yICogMS41CiAgICAgICAgaWYgdiA+IGJlc3R2OgogICAgICAgICAgICBiZXN0diwgYmVzdCA9IHYsIG5hbWUKICAgIHJldHVybiBiZXN0IG9yICdOJwoKCmRlZiBjaGFzZV9iYWxsKHN0LCB1LCBtZSwgYWxsb3dfYm94PVRydWUsIG1heGY9NjApOgogICAgcHRzID0gYmFsbF9mdXR1cmUoc3QsIG1heGYpCiAgICBpZHggPSA5OTkKICAgIGZvciBraywgcHQgaW4gZW51bWVyYXRlKHB0cyk6CiAgICAgICAgaWYgbWF0aC5oeXBvdChwdFswXSAtIHUueCwgcHRbMV0gLSB1LnkpIDw9IE1PViAqIChrayArIDEpICogRFQgKyBDUiAqIDAuOToKICAgICAgICAgICAgaWR4ID0ga2sKICAgICAgICAgICAgYnJlYWsKICAgIHRndCA9IHB0c1ttaW4oaWR4LCBsZW4ocHRzKSAtIDEpXSBpZiBwdHMgZWxzZSAoc3QuYngsIHN0LmJ5KQogICAgcmV0dXJuIChtb3ZlX2Rpcih1LCB0Z3RbMF0sIHRndFsxXSwgbWUsIGFsbG93X2JveD1hbGxvd19ib3gpLCBOb25lLCBGYWxzZSkKCgpkZWYgc3RyaWtlcl9tb3ZlKHUsIHNwLCBvcHAsIG1lKToKICAgICIiIlJvdXRlIHRocm91Z2ggdGhlIHRvdWNobGluZSBjb3JyaWRvciB3aGVuIHRoZSBkaXJlY3QgbGFuZSBpcyBibG9ja2VkLiIiIgogICAgYSA9IGF0ayhtZSkKICAgIGNvcnJpZG9yID0gMi42IGlmIHNwWzFdIDwgMTMuMCBlbHNlIDIzLjQKICAgICMgaWYgd2UgYXJlIGluc2lkZSB0aGUgbWlkZGxlIGJhbmQgYW5kIHN0aWxsIG5lZWQgdG8gZ2FpbiBncm91bmQsIGh1ZyB0aGUgbGluZQogICAgbmVlZF9ncm91bmQgPSAoc3BbMF0gLSB1LngpICogYSA+IDMuMAogICAgaW5fYmFuZCA9IDUuNSA8IHUueSA8IDIwLjUKICAgIGlmIG5lZWRfZ3JvdW5kIGFuZCBpbl9iYW5kIGFuZCBhYnModS55IC0gY29ycmlkb3IpID4gMS42OgogICAgICAgICMgY2hlY2sgd2hldGhlciBhbiBvcHBvbmVudCBibG9ja3MgdGhlIHZlcnRpY2FsIHNsaWRlCiAgICAgICAgYmxvY2tlZCA9IGFueShtYXRoLmh5cG90KG8ueCAtIHUueCwgby55IC0gY29ycmlkb3IpIDwgMS42IGZvciBvIGluIG9wcCkKICAgICAgICBpZiBub3QgYmxvY2tlZDoKICAgICAgICAgICAgcmV0dXJuIG1vdmVfZGlyX2F2b2lkKHUsIHUueCwgY29ycmlkb3IsIG1lLCBvcHAsIGFsbG93X2JveD1GYWxzZSkKICAgIGlmIG5lZWRfZ3JvdW5kIGFuZCBub3QgaW5fYmFuZDoKICAgICAgICB0eSA9IGNvcnJpZG9yCiAgICBlbHNlOgogICAgICAgIHR5ID0gc3BbMV0KICAgIHJldHVybiBtb3ZlX2Rpcl9hdm9pZCh1LCBzcFswXSwgdHksIG1lLCBvcHAsIGFsbG93X2JveD1GYWxzZSkKCgpkZWYgZXhlY19wbGFuKHN0LCBtZSwgbiwgcGxhbiwgQSk6CiAgICBteSA9IFt1IGZvciB1IGluIHN0LnVuaXRzIGlmIHUudGVhbSA9PSBtZV0KICAgIG9wcCA9IFt1IGZvciB1IGluIHN0LnVuaXRzIGlmIHUudGVhbSAhPSBtZV0KICAgIGlmIG5vdCBteToKICAgICAgICByZXR1cm4ge30KICAgIGNtZHMgPSB7fQogICAgb3duZXIgPSBzdC51bml0c1tzdC5vd25lcl0gaWYgMCA8PSBzdC5vd25lciA8IGxlbihzdC51bml0cykgZWxzZSBOb25lCiAgICBtb2RlID0gcGxhblsnbW9kZSddCgogICAgaWYgbiA9PSAxOgogICAgICAgIHUgPSBteVswXQogICAgICAgIGlmIG1vZGUgPT0gJ3NvbG9fb2ZmJyBhbmQgb3duZXIgaXMgdToKICAgICAgICAgICAgY21kc1swXSA9IGNhcnJpZXJfY21kKHN0LCB1LCBtZSwgW10sIHN0LnVuaXRzLCB7fSwgTm9uZSkKICAgICAgICBlbGlmIG1vZGUgPT0gJ3NvbG9fZGVmJyBvciAobW9kZSA9PSAnc29sb19vZmYnIGFuZCBvd25lciBpcyBub3QgdSk6CiAgICAgICAgICAgIGR4LCBkeSA9IG93bl9neChtZSkgLSBzdC5ieCwgMTMuMCAtIHN0LmJ5CiAgICAgICAgICAgIGRkID0gbWF0aC5oeXBvdChkeCwgZHkpIG9yIDEuMAogICAgICAgICAgICBrID0gY2xhbXAoMC4zMCAqIG1hdGguaHlwb3Qoc3QuYnggLSBvd25fZ3gobWUpLCBzdC5ieSAtIDEzLjApLCAwLjcsIDUuMCkKICAgICAgICAgICAgdHgsIHR5ID0gc3QuYnggKyBkeCAvIGRkICogaywgc3QuYnkgKyBkeSAvIGRkICogawogICAgICAgICAgICBjbWRzWzBdID0gKG1vdmVfZGlyKHUsIHR4LCB0eSwgbWUsIGFsbG93X2JveD1UcnVlKSwgTm9uZSwgRmFsc2UpCiAgICAgICAgZWxzZToKICAgICAgICAgICAgY21kc1swXSA9IGNoYXNlX2JhbGwoc3QsIHUsIG1lLCBUcnVlLCA4MCkKICAgICAgICByZXR1cm4gY21kcwoKICAgIGtlZXBlciA9IG15WzBdCiAgICBmaWVsZGVycyA9IFt1IGZvciB1IGluIG15IGlmIHUuaW5kZXggIT0gMF0KICAgIHJvbGVzID0gcGxhblsncm9sZXMnXQogICAgY2FycmllciA9IG93bmVyIGlmIChvd25lciBpcyBub3QgTm9uZSBhbmQgb3duZXIudGVhbSA9PSBtZSkgZWxzZSBOb25lCgogICAgaWYga2VlcGVyIGlzIGNhcnJpZXI6CiAgICAgICAgY21kc1swXSA9IGtlZXBlcl9ob2xkX2NtZChzdCwga2VlcGVyLCBtZSwgZmllbGRlcnMsIG9wcCwgcGxhbikKICAgIGVsaWYgY2FycmllciBpcyBub3QgTm9uZToKICAgICAgICBpZHggPSBjYXJyaWVyLmluZGV4CiAgICAgICAgcm9sZSA9IHJvbGVzLmdldChpZHgsICdzdHJpa2VyJykKICAgICAgICBtYXRlcyA9IFt1IGZvciB1IGluIGZpZWxkZXJzIGlmIHUgaXMgbm90IGNhcnJpZXJdICsgW2tlZXBlcl0KICAgICAgICBjbWRzW2NhcnJpZXIuaW5kZXhdID0gY2Fycmllcl9jbWQoc3QsIGNhcnJpZXIsIG1lLCBtYXRlcywgc3QudW5pdHMsIHBsYW5bJ3Nwb3RzJ10sIE5vbmUpCiAgICBmb3IgdSBpbiBmaWVsZGVyczoKICAgICAgICBpZiB1LmluZGV4IGluIGNtZHM6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgcm9sZSA9IHJvbGVzLmdldCh1LmluZGV4LCAnc3RyaWtlcicpCiAgICAgICAgaWYgb3duZXIgaXMgdToKICAgICAgICAgICAgY29udGludWUKICAgICAgICBpZiBtb2RlID09ICdrZWVwZXInIGFuZCBwbGFuLmdldCgnb3V0bGV0JykgPT0gdS5pbmRleDoKICAgICAgICAgICAgbHAgPSBwbGFuWydzcG90cyddLmdldCh1LmluZGV4KSBvciBvdXRsZXRfc3BvdChtZSwgcGxhbi5nZXQoJ3NpZGUnLCBTSURFX0JPVCkpCiAgICAgICAgICAgIGNtZHNbdS5pbmRleF0gPSAobW92ZV9kaXJfYXZvaWQodSwgbHBbMF0sIGxwWzFdLCBtZSwgb3BwLCBhbGxvd19ib3g9VHJ1ZSwKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhdm9pZF9yPTEuNiksIE5vbmUsIEZhbHNlKQogICAgICAgICAgICBjb250aW51ZQogICAgICAgIGlmIHJvbGUgaW4gKCdwb3N0MCcsICdwb3N0MScpOgogICAgICAgICAgICB3aGljaCA9IDAgaWYgcm9sZSA9PSAncG9zdDAnIGVsc2UgMQogICAgICAgICAgICBwID0gcGxhblsnc3BvdHMnXS5nZXQodS5pbmRleCkKICAgICAgICAgICAgaWYgcCBpcyBOb25lOgogICAgICAgICAgICAgICAgcCA9IHBvc3Rfc3BvdChtZSwgd2hpY2gsIHN0LmJ5KQogICAgICAgICAgICBpZiBwbGFuLmdldCgncnVzaCcpIGFuZCByb2xlID09ICdwb3N0MCc6CiAgICAgICAgICAgICAgICBwID0gc2FmZV9wdChtZSwgKndpbmdlcl9zcG90KG1lLCBzdC5ieCwgcGxhbi5nZXQoJ3NpZGUnLCBTSURFX0JPVCksIDApLCBtPTAuOTUpCiAgICAgICAgICAgIGlmIG93bmVyIGlzIE5vbmUgYW5kIG1vZGUgPT0gJ2xvb3NlJzoKICAgICAgICAgICAgICAgICMgbG9vc2UgYmFsbCByb2xsaW5nIGludG8gb3VyIG93biBib3g6IGNvbWUgYW5kIGNvbGxlY3QgaXQKICAgICAgICAgICAgICAgIGRfYmFsbCA9IG1hdGguaHlwb3Qoc3QuYnggLSB1LngsIHN0LmJ5IC0gdS55KQogICAgICAgICAgICAgICAgaWYgZF9iYWxsIDwgNy4wIGFuZCAoc3QuYnggLSBvd25fZ3gobWUpKSAqIGF0ayhtZSkgPCAxNS4wOgogICAgICAgICAgICAgICAgICAgIGNtZHNbdS5pbmRleF0gPSBjaGFzZV9iYWxsKHN0LCB1LCBtZSwgVHJ1ZSwgNjApCiAgICAgICAgICAgICAgICAgICAgY29udGludWUKICAgICAgICAgICAgY21kc1t1LmluZGV4XSA9IChtb3ZlX2Rpcih1LCBwWzBdLCBwWzFdLCBtZSwgYWxsb3dfYm94PVRydWUpLCBOb25lLCBGYWxzZSkKICAgICAgICBlbHNlOgogICAgICAgICAgICBzcCA9IHBsYW5bJ3Nwb3RzJ10uZ2V0KHUuaW5kZXgpCiAgICAgICAgICAgIGlmIHNwIGlzIE5vbmU6CiAgICAgICAgICAgICAgICBzcCA9IHdpbmdlcl9zcG90KG1lLCBzdC5ieCwgcGxhbi5nZXQoJ3NpZGUnLCBTSURFX0JPVCksIDApCiAgICAgICAgICAgIGlmIG93bmVyIGlzIG5vdCBOb25lIGFuZCBvd25lci50ZWFtICE9IG1lIGFuZCBtYXRoLmh5cG90KG93bmVyLnggLSB1LngsIG93bmVyLnkgLSB1LnkpIDwgOS4wOgogICAgICAgICAgICAgICAgdHgsIHR5ID0gcHJlc3NfdGFyZ2V0KHN0LCB1LCBtZSwgb3duZXIpCiAgICAgICAgICAgICAgICBjbWRzW3UuaW5kZXhdID0gKG1vdmVfZGlyKHUsIHR4LCB0eSwgbWUsIGFsbG93X2JveD1GYWxzZSksIE5vbmUsIEZhbHNlKQogICAgICAgICAgICBlbHNlOgogICAgICAgICAgICAgICAgY21kc1t1LmluZGV4XSA9IChzdHJpa2VyX21vdmUodSwgc3AsIG9wcCwgbWUpLAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRoLmRlZ3JlZXMobWF0aC5hdGFuMigxMy4wIC0gdS55LCBvcHBfZ3gobWUpIC0gdS54KSkgJSAzNjAuMCwgRmFsc2UpCiAgICBpZiAwIG5vdCBpbiBjbWRzOgogICAgICAgIGNtZHNbMF0gPSBrZWVwZXJfY21kKHN0LCBrZWVwZXIsIG1lLCBvcHApCiAgICBpZiBvd25lciBpcyBOb25lIGFuZCBtb2RlID09ICdsb29zZScgYW5kIHBsYW4uZ2V0KCdjaGFzZXInKSBpcyBub3QgTm9uZToKICAgICAgICBjaWR4ID0gcGxhblsnY2hhc2VyJ10KICAgICAgICBjID0gbmV4dCgodSBmb3IgdSBpbiBteSBpZiB1LmluZGV4ID09IGNpZHgpLCBOb25lKQogICAgICAgIGlmIGMgaXMgbm90IE5vbmUgYW5kIGMuaW5kZXggIT0gMDoKICAgICAgICAgICAgY21kc1tjLmluZGV4XSA9IGNoYXNlX2JhbGwoc3QsIGMsIG1lLCBGYWxzZSwgNjApCiAgICByZXR1cm4gY21kcwoKCmRlZiBvcHBfbW9kZWwoc3QsIG8sIG1lKToKICAgIHB0cyA9IGJhbGxfZnV0dXJlKHN0LCA0MCkKICAgIHR4LCB0eSA9IChwdHNbbWluKGxlbihwdHMpIC0gMSwgMTApXSBpZiBwdHMgZWxzZSAoc3QuYngsIHN0LmJ5KSkKICAgIHJldHVybiAobW92ZV9kaXIobywgdHgsIHR5LCAxIC0gbWUpLCBOb25lLCBGYWxzZSkKCgpkZWYgZGVjaWRlKHMwLCBtZSwgbiwgQSk6CiAgICBmcmFtZXMgPSBbXQogICAgc3QgPSBzMC5jbG9uZSgpCiAgICBvd25lcjAgPSBzdC51bml0c1tzdC5vd25lcl0gaWYgMCA8PSBzdC5vd25lciA8IGxlbihzdC51bml0cykgZWxzZSBOb25lCiAgICBpZiBvd25lcjAgaXMgbm90IE5vbmUgYW5kIG93bmVyMC50ZWFtID09IG1lIGFuZCBvd25lcjAuaW5kZXggPT0gMCBhbmQgbm90IHN0LmdvbGRlbjoKICAgICAgICBpZiBfS0hbJ21lJ10gIT0gbWUgb3Igc3QuZnJhbWUgLSBfS0hbJ2ZyYW1lJ10gPiAyNToKICAgICAgICAgICAgX0tIWydtZSddID0gbWUKICAgICAgICAgICAgX0tIWydzdGFydCddID0gc3QuZnJhbWUKICAgICAgICBfS0hbJ2ZyYW1lJ10gPSBzdC5mcmFtZQogICAgICAgIF9IT0xEWyd2J10gPSBtYXgoMCwgc3QuZnJhbWUgLSBfS0hbJ3N0YXJ0J10pCiAgICBlbHNlOgogICAgICAgIF9IT0xEWyd2J10gPSAwCiAgICAgICAgX0tIWydmcmFtZSddID0gLTk5OQogICAgcGxhbiA9IGJ1aWxkX3BsYW4oc3QsIG1lLCBuKQogICAgcHJldl9vd25lciA9IHN0Lm93bmVyCiAgICBmb3IgZiBpbiByYW5nZSgyMCk6CiAgICAgICAgaWYgc3Quc3RhdHVzICE9ICdwbGF5aW5nJzoKICAgICAgICAgICAgYnJlYWsKICAgICAgICBjbWRzID0gZXhlY19wbGFuKHN0LCBtZSwgbiwgcGxhbiwgQSkKICAgICAgICBpbnAgPSBbXQogICAgICAgIGZvciB1IGluIHN0LnVuaXRzOgogICAgICAgICAgICBpZiB1LnRlYW0gPT0gbWU6CiAgICAgICAgICAgICAgICBjID0gY21kcy5nZXQodS5pbmRleCwgKCdOJywgTm9uZSwgRmFsc2UpKQogICAgICAgICAgICAgICAgYWltID0gTm9uZQogICAgICAgICAgICAgICAgaWYgY1sxXSBpcyBub3QgTm9uZToKICAgICAgICAgICAgICAgICAgICBhID0gbWF0aC5yYWRpYW5zKGNbMV0gJSAzNjAuMCkKICAgICAgICAgICAgICAgICAgICBhaW0gPSAobWF0aC5jb3MoYSksIG1hdGguc2luKGEpKQogICAgICAgICAgICAgICAgaW5wLmFwcGVuZCgoY1swXSwgYWltLCBib29sKGNbMl0pKSkKICAgICAgICAgICAgZWxzZToKICAgICAgICAgICAgICAgIGlucC5hcHBlbmQob3BwX21vZGVsKHN0LCB1LCBtZSkpCiAgICAgICAgZnJhbWVzLmFwcGVuZChkaWN0KCgodS50ZWFtLCB1LmluZGV4KSwgaW5wW2ldKSBmb3IgaSwgdSBpbiBlbnVtZXJhdGUoc3QudW5pdHMpKSkKICAgICAgICBnID0gQS5zdGVwKHN0LCBpbnAsIHN0LmtpY2tvZmZUZWFtKQogICAgICAgIGlmIGcgPj0gMDoKICAgICAgICAgICAgc3Quc2NvcmVbZ10gKz0gMQogICAgICAgICAgICBpZiBzdC5nb2xkZW46CiAgICAgICAgICAgICAgICBzdC5zdGF0dXMgPSAnZmluaXNoZWQnCiAgICAgICAgICAgICAgICBicmVhawogICAgICAgICAgICBBLmtpY2tvZmYoc3QsIDEgLSBnKQogICAgICAgICAgICBwbGFuID0gYnVpbGRfcGxhbihzdCwgbWUsIG4pCiAgICAgICAgICAgIHByZXZfb3duZXIgPSBzdC5vd25lcgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIGlmIHN0Lm93bmVyICE9IHByZXZfb3duZXI6CiAgICAgICAgICAgICMgYSBraWNrIC8gdGFja2xlIGp1c3QgY2hhbmdlZCBwb3NzZXNzaW9uOiByZXBsYW4gYXQgb25jZSBzbyB0aGUKICAgICAgICAgICAgIyBpbnRlbmRlZCByZWNlaXZlciBzdGFydHMgY2hhc2luZyB0aGUgbG9vc2UgYmFsbCBpbnNpZGUgdGhlIHdpbmRvdwogICAgICAgICAgICBwbGFuID0gYnVpbGRfcGxhbihzdCwgbWUsIG4pCiAgICAgICAgICAgIHByZXZfb3duZXIgPSBzdC5vd25lcgogICAgd2hpbGUgbGVuKGZyYW1lcykgPCAyMDoKICAgICAgICBmcmFtZXMuYXBwZW5kKHt9KQogICAgcmV0dXJuIGZyYW1lcwo='
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

