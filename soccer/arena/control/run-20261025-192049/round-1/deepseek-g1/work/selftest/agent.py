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
_POLICY_B64 = 'IyAtKi0gY29kaW5nOiB1dGYtOCAtKi0KIiIiTmV3IGRlY2lzaW9uIGNvcmUgZm9yIGRlZXBzZWVrLWcxIHNvY2NlciBhZ2VudC4KCkRvY3RyaW5lOgogICoga2VlcGVyIHN0YXlzIDIuMi0yLjggZnJvbSBpdHMgZ29hbCBsaW5lLCB0cmFja3MgdGhlIGJhbGwncyBwcm9qZWN0ZWQKICAgIGNyb3NzaW5nIHBvaW50LCBjb2xsZWN0cyBsb29zZSBiYWxscyBuZWFyL2luc2lkZSBpdHMgb3duIGJveDsKICAqIGZpZWxkIHBsYXllcnM6IG5lYXJlc3Qgb25lIGNoYXNlcyB0aGUgYmFsbCwgb3RoZXJzIGhvbGQgem9uZXM7IGZvcndhcmRzCiAgICBsaXZlIGluIHRoZSB0d28gY29ycmlkb3JzICh5PDUgLyB5PjIxKSBuZXh0IHRvIHRoZSBvcHBvbmVudCBib3ggYW5kIGluIHRoZQogICAgYm94LWVkZ2UgYmFuZCB4PTMyLjYgOwogICogY2FycmllciBzaG9vdHMgd2hlbmV2ZXIgYSBsYW5lIHRvIHRoZSBtb3V0aCBleGlzdHMgZnJvbSA8PSAxMy41IHVuaXRzOwogICAgb3RoZXJ3aXNlIHBhc3NlcyB0byBhIGJldHRlci1wbGFjZWQgbWF0ZSBvciBjbGVhcnMgdXAtZmllbGQ7CiAgKiBuZXZlciBlbnRlciB0aGUgb3Bwb25lbnQgYm94ICsgMS4yNSBtYXJnaW4uCgpUaGUgbW9kdWxlIG9ubHkgcmVsaWVzIG9uIHRoZSBwaHlzaWNzIGhlbHBlcnMgZXhwb3NlZCBieSBhZ2VudC5weS4KIiIiCgppbXBvcnQgbWF0aAppbXBvcnQgb3MKCktFRVBNT0RFID0gb3MuZW52aXJvbi5nZXQoJ1NPQzJfS0VFUE1PREUnLCAnbmVhcicpCgpXLCBIID0gNDQuMCwgMjYuMApEVCA9IDAuMDUKTU9WID0gMy4xNQpEUklCID0gMC41OCAqIE1PVgpDUiA9IDAuODIKUl9CID0gMC4yMgpLSUNLX09GRiA9IDAuNjkKR09BTF9MTywgR09BTF9ISSA9IDEwLjUsIDE1LjUKCk1ZX0dPQUwgPSB7MDogMS4wLCAxOiA0My4wfQpPUFBfR09BTCA9IHswOiA0My4wLCAxOiAxLjB9CkFUSyA9IHswOiAxLjAsIDE6IC0xLjB9CiMgb3Bwb25lbnQgYm94ICh3ZSBtYXkgbm90IGVudGVyKQpPQk9YID0gezA6ICgzNC4wLCA2LjAsIDQzLjAsIDIwLjApLCAxOiAoMS4wLCA2LjAsIDEwLjAsIDIwLjApfQpTQUZFID0gMS4yNQoKU1EyID0gMC43MDcxMDY3ODExODY1NDc2CkRJUlMgPSB7CiAgICAnTic6ICgwLjAsIDAuMCksICdVJzogKDAuMCwgLTEuMCksICdEJzogKDAuMCwgMS4wKSwKICAgICdMJzogKC0xLjAsIDAuMCksICdSJzogKDEuMCwgMC4wKSwKICAgICdVTCc6ICgtU1EyLCAtU1EyKSwgJ1VSJzogKFNRMiwgLVNRMiksICdETCc6ICgtU1EyLCBTUTIpLCAnRFInOiAoU1EyLCBTUTIpLAp9CkRJUl9LRVlTID0gdHVwbGUoRElSUy5rZXlzKCkpCgpfV0FMTCA9IGJ5dGVhcnJheShpbnQoVykgKiBpbnQoSCkpCmZvciBfeSBpbiByYW5nZShpbnQoSCkpOgogICAgZm9yIF94IGluIHJhbmdlKGludChXKSk6CiAgICAgICAgaWYgX3ggPT0gMCBvciBfeSA9PSAwIG9yIF94ID09IGludChXKSAtIDEgb3IgX3kgPT0gaW50KEgpIC0gMToKICAgICAgICAgICAgaWYgKF94ID09IDAgb3IgX3ggPT0gaW50KFcpIC0gMSkgYW5kIDEwIDw9IF95IDwgMTY6CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICBfV0FMTFtfeSAqIGludChXKSArIF94XSA9IDEKCgpkZWYgdGlsZV9hdCh4LCB5KToKICAgIHR4ID0gaW50KG1hdGguZmxvb3IoeCkpCiAgICB0eSA9IGludChtYXRoLmZsb29yKHkpKQogICAgaWYgdHggPCAwIG9yIHR5IDwgMCBvciB0eCA+PSBXIG9yIHR5ID49IEg6CiAgICAgICAgcmV0dXJuIDEKICAgIHJldHVybiBfV0FMTFt0eSAqIGludChXKSArIHR4XQoKCmRlZiBoaXRzX3dhbGwoeCwgeSwgcik6CiAgICBrID0gciAqIFNRMgogICAgZm9yIHB4LCBweSBpbiAoKHggLSByLCB5KSwgKHggKyByLCB5KSwgKHgsIHkgLSByKSwgKHgsIHkgKyByKSwKICAgICAgICAgICAgICAgICAgICh4IC0gaywgeSAtIGspLCAoeCArIGssIHkgLSBrKSwgKHggLSBrLCB5ICsgayksICh4ICsgaywgeSArIGspKToKICAgICAgICBpZiB0aWxlX2F0KHB4LCBweSk6CiAgICAgICAgICAgIHJldHVybiBUcnVlCiAgICByZXR1cm4gRmFsc2UKCgpkZWYgaW5fYm94KHRlYW1fYm94LCB4LCB5KToKICAgIGIgPSBPQk9YW3RlYW1fYm94XQogICAgcmV0dXJuIGJbMF0gPD0geCA8PSBiWzJdIGFuZCBiWzFdIDw9IHkgPD0gYlszXQoKCmRlZiBpbl9kYW5nZXIobWUsIHgsIHksIG09U0FGRSk6CiAgICBiID0gT0JPWFttZV0KICAgIHJldHVybiBiWzBdIC0gbSA8PSB4IDw9IGJbMl0gKyBtIGFuZCBiWzFdIC0gbSA8PSB5IDw9IGJbM10gKyBtCgoKZGVmIGNsYW1wKHYsIGEsIGIpOgogICAgcmV0dXJuIGEgaWYgdiA8IGEgZWxzZSAoYiBpZiB2ID4gYiBlbHNlIHYpCgoKZGVmIHNhZmVfcHQobWUsIHgsIHksIG09U0FGRSk6CiAgICB4ID0gY2xhbXAoeCwgMC41NSwgVyAtIDAuNTUpCiAgICB5ID0gY2xhbXAoeSwgMC41NSwgSCAtIDAuNTUpCiAgICBpZiBub3QgaW5fZGFuZ2VyKG1lLCB4LCB5LCBtKToKICAgICAgICByZXR1cm4geCwgeQogICAgYiA9IE9CT1hbbWVdCiAgICBjYW5kcyA9IFsKICAgICAgICAoYlswXSAtIG0sIGNsYW1wKHksIGJbMV0sIGJbM10pKSwKICAgICAgICAoYlsyXSArIG0sIGNsYW1wKHksIGJbMV0sIGJbM10pKSwKICAgICAgICAoY2xhbXAoeCwgYlswXSwgYlsyXSksIGJbMV0gLSBtKSwKICAgICAgICAoY2xhbXAoeCwgYlswXSwgYlsyXSksIGJbM10gKyBtKSwKICAgIF0KICAgIGJlc3QsIGJkID0gTm9uZSwgMWU5CiAgICBmb3IgY3gsIGN5IGluIGNhbmRzOgogICAgICAgIGlmIG5vdCAoMC41NSA8PSBjeCA8PSBXIC0gMC41NSBhbmQgMC41NSA8PSBjeSA8PSBIIC0gMC41NSk6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgZCA9IG1hdGguaHlwb3QoY3ggLSB4LCBjeSAtIHkpCiAgICAgICAgaWYgZCA8IGJkOgogICAgICAgICAgICBiZCwgYmVzdCA9IGQsIChjeCwgY3kpCiAgICByZXR1cm4gYmVzdCBpZiBiZXN0IGVsc2UgKGNsYW1wKHgsIDAuNTUsIFcgLSAwLjU1KSwgY2xhbXAoeSwgMC41NSwgSCAtIDAuNTUpKQoKCmRlZiBzdGVwX29rKG1lLCB4LCB5LCBkeCwgZHksIGhvcj01LCBtPVNBRkUpOgogICAgZm9yIGsgaW4gcmFuZ2UoMSwgaG9yICsgMSk6CiAgICAgICAgaWYgaW5fZGFuZ2VyKG1lLCB4ICsgZHggKiBNT1YgKiBEVCAqIGssIHkgKyBkeSAqIE1PViAqIERUICogaywgbSk6CiAgICAgICAgICAgIHJldHVybiBGYWxzZQogICAgcmV0dXJuIFRydWUKCgpkZWYgbW92ZV9kaXIoc3QsIHUsIHR4LCB0eSwgbWUsIGFsbG93X2JveD1GYWxzZSwgc3BlZWQ9Tm9uZSk6CiAgICAiIiI4LWRpcmVjdGlvbiBjaG9pY2UgdG93YXJkcyAodHgsdHkpOyBoYXJkIGZpbHRlciBhZ2FpbnN0IG9wcG9uZW50IGJveC4iIiIKICAgIGR4LCBkeSA9IHR4IC0gdS54LCB0eSAtIHUueQogICAgZCA9IG1hdGguaHlwb3QoZHgsIGR5KQogICAgaWYgZCA8IDAuMDg6CiAgICAgICAgcmV0dXJuICdOJwogICAgdXgsIHV5ID0gZHggLyBkLCBkeSAvIGQKICAgIGJlc3QsIGJ2ID0gJ04nLCAtMWU5CiAgICBmb3IgbmFtZSBpbiBESVJfS0VZUzoKICAgICAgICB2eCwgdnkgPSBESVJTW25hbWVdCiAgICAgICAgdiA9IHZ4ICogdXggKyB2eSAqIHV5CiAgICAgICAgaWYgbm90IGFsbG93X2JveDoKICAgICAgICAgICAgaGFyZCA9IEZhbHNlCiAgICAgICAgICAgIHNvZnQgPSAwCiAgICAgICAgICAgIGZvciBrIGluIHJhbmdlKDEsIDYpOgogICAgICAgICAgICAgICAgbnggPSB1LnggKyB2eCAqIE1PViAqIERUICogawogICAgICAgICAgICAgICAgbnkgPSB1LnkgKyB2eSAqIE1PViAqIERUICogawogICAgICAgICAgICAgICAgaWYgaW5fYm94KG1lLCBueCwgbnkpOgogICAgICAgICAgICAgICAgICAgIGhhcmQgPSBUcnVlCiAgICAgICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgICAgIGlmIGluX2RhbmdlcihtZSwgbngsIG55LCBTQUZFKToKICAgICAgICAgICAgICAgICAgICBzb2Z0ICs9IDEKICAgICAgICAgICAgaWYgaGFyZDoKICAgICAgICAgICAgICAgIHYgLT0gMTAwMC4wCiAgICAgICAgICAgIGVsaWYgc29mdDoKICAgICAgICAgICAgICAgIHYgLT0gMy4wICogc29mdAogICAgICAgIGlmIHYgPiBidjoKICAgICAgICAgICAgYnYsIGJlc3QgPSB2LCBuYW1lCiAgICByZXR1cm4gYmVzdAoKCiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIGJhbGwgc2ltCmRlZiBzaW1fYmFsbChieCwgYnksIGFuZywgbWF4Zj0yMDAsIHN0b3BfYXRfZ29hbD1UcnVlKToKICAgICIiIkZhaXRoZnVsIGJhbGwgZmxpZ2h0LiBSZXR1cm5zIChwb2ludHMsIGdvYWxfdGVhbV9vcl9Ob25lLCBlbmRfeHkpLiIiIgogICAgdngsIHZ5ID0gMTEuMCAqIG1hdGguY29zKGFuZyksIDExLjAgKiBtYXRoLnNpbihhbmcpCiAgICB4LCB5ID0gYngsIGJ5CiAgICBwdHMgPSBbXQogICAgZm9yIGYgaW4gcmFuZ2UobWF4Zik6CiAgICAgICAgZm9yIHMgaW4gcmFuZ2UoNCk6CiAgICAgICAgICAgIHggKz0gdnggKiBEVCAvIDQuMAogICAgICAgICAgICB5ICs9IHZ5ICogRFQgLyA0LjAKICAgICAgICAgICAgaWYgR09BTF9MTyA8PSB5IDw9IEdPQUxfSEk6CiAgICAgICAgICAgICAgICBpZiB4IDw9IDEuMDoKICAgICAgICAgICAgICAgICAgICByZXR1cm4gcHRzLCAxLCAoeCwgeSkKICAgICAgICAgICAgICAgIGlmIHggPj0gVyAtIDEuMDoKICAgICAgICAgICAgICAgICAgICByZXR1cm4gcHRzLCAwLCAoeCwgeSkKICAgICAgICAgICAgaWYgaGl0c193YWxsKHgsIHksIFJfQik6CiAgICAgICAgICAgICAgICBweCA9IHggLSB2eCAqIERUIC8gNC4wCiAgICAgICAgICAgICAgICBweSA9IHkgLSB2eSAqIERUIC8gNC4wCiAgICAgICAgICAgICAgICBpZiBoaXRzX3dhbGwoeCwgcHksIFJfQik6CiAgICAgICAgICAgICAgICAgICAgeCA9IHB4CiAgICAgICAgICAgICAgICAgICAgdnggPSAtdnggKiAwLjcyCiAgICAgICAgICAgICAgICBpZiBoaXRzX3dhbGwocHgsIHksIFJfQik6CiAgICAgICAgICAgICAgICAgICAgeSA9IHB5CiAgICAgICAgICAgICAgICAgICAgdnkgPSAtdnkgKiAwLjcyCiAgICAgICAgICAgICAgICBpZiBoaXRzX3dhbGwoeCwgeSwgUl9CKToKICAgICAgICAgICAgICAgICAgICB4LCB5ID0gcHgsIHB5CiAgICAgICAgICAgICAgICAgICAgdnggPSAtdnggKiAwLjcyCiAgICAgICAgICAgICAgICAgICAgdnkgPSAtdnkgKiAwLjcyCiAgICAgICAgdnggKj0gMC45NzgKICAgICAgICB2eSAqPSAwLjk3OAogICAgICAgIGlmIG1hdGguaHlwb3QodngsIHZ5KSA8IDAuMDI6CiAgICAgICAgICAgIHZ4ID0gdnkgPSAwLjAKICAgICAgICAgICAgcHRzLmFwcGVuZCgoeCwgeSkpCiAgICAgICAgICAgIGJyZWFrCiAgICAgICAgcHRzLmFwcGVuZCgoeCwgeSkpCiAgICByZXR1cm4gcHRzLCBOb25lLCAoeCwgeSkKCgpkZWYgYmFsbF9mdXR1cmUoc3QsIG1heGY9OTApOgogICAgIiIiRXhpc3RpbmcgYmFsbCBmbGlnaHQgZnJvbSB0aGUgY3VycmVudCBzdGF0ZSAodXNlcyBjdXJyZW50IHZlbG9jaXR5KS4iIiIKICAgIHZ4LCB2eSA9IHN0LmJ2eCwgc3QuYnZ5CiAgICB4LCB5ID0gc3QuYngsIHN0LmJ5CiAgICBvdXQgPSBbXQogICAgZm9yIGYgaW4gcmFuZ2UobWF4Zik6CiAgICAgICAgZm9yIHMgaW4gcmFuZ2UoNCk6CiAgICAgICAgICAgIHggKz0gdnggKiBEVCAvIDQuMAogICAgICAgICAgICB5ICs9IHZ5ICogRFQgLyA0LjAKICAgICAgICAgICAgaWYgR09BTF9MTyA8PSB5IDw9IEdPQUxfSEk6CiAgICAgICAgICAgICAgICBpZiB4IDw9IDEuMCBvciB4ID49IFcgLSAxLjA6CiAgICAgICAgICAgICAgICAgICAgb3V0LmFwcGVuZCgoeCwgeSkpCiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG91dAogICAgICAgICAgICBpZiBoaXRzX3dhbGwoeCwgeSwgUl9CKToKICAgICAgICAgICAgICAgIHB4ID0geCAtIHZ4ICogRFQgLyA0LjAKICAgICAgICAgICAgICAgIHB5ID0geSAtIHZ5ICogRFQgLyA0LjAKICAgICAgICAgICAgICAgIGlmIGhpdHNfd2FsbCh4LCBweSwgUl9CKToKICAgICAgICAgICAgICAgICAgICB4ID0gcHgKICAgICAgICAgICAgICAgICAgICB2eCA9IC12eCAqIDAuNzIKICAgICAgICAgICAgICAgIGlmIGhpdHNfd2FsbChweCwgeSwgUl9CKToKICAgICAgICAgICAgICAgICAgICB5ID0gcHkKICAgICAgICAgICAgICAgICAgICB2eSA9IC12eSAqIDAuNzIKICAgICAgICAgICAgICAgIGlmIGhpdHNfd2FsbCh4LCB5LCBSX0IpOgogICAgICAgICAgICAgICAgICAgIHgsIHkgPSBweCwgcHkKICAgICAgICAgICAgICAgICAgICB2eCA9IC12eCAqIDAuNzIKICAgICAgICAgICAgICAgICAgICB2eSA9IC12eSAqIDAuNzIKICAgICAgICB2eCAqPSAwLjk3OAogICAgICAgIHZ5ICo9IDAuOTc4CiAgICAgICAgaWYgbWF0aC5oeXBvdCh2eCwgdnkpIDwgMC4wMjoKICAgICAgICAgICAgdnggPSB2eSA9IDAuMAogICAgICAgIG91dC5hcHBlbmQoKHgsIHkpKQogICAgcmV0dXJuIG91dAoKCl9GRkMgPSAwLjAyMiAvIDAuNTUKCgpkZWYgZnJhbWVzX2Zvcl9kaXN0KGQpOgogICAgaWYgZCA8PSAwOgogICAgICAgIHJldHVybiAwCiAgICByID0gMS4wIC0gZCAqIF9GRkMKICAgIGlmIHIgPD0gMWUtNjoKICAgICAgICByZXR1cm4gNDAwCiAgICByZXR1cm4gaW50KG1hdGguY2VpbChtYXRoLmxvZyhyKSAvIG1hdGgubG9nKDAuOTc4KSkpCgoKZGVmIHByZWRpY3RfdG8oeCwgeSwgdHgsIHR5LCBzZWNzLCBzcGVlZD1NT1YpOgogICAgZCA9IG1hdGguaHlwb3QodHggLSB4LCB0eSAtIHkpCiAgICBpZiBkIDwgMC4wNToKICAgICAgICByZXR1cm4geCwgeQogICAgayA9IG1pbihkLCBzcGVlZCAqIHNlY3MpIC8gZAogICAgcmV0dXJuIHggKyAodHggLSB4KSAqIGssIHkgKyAodHkgLSB5KSAqIGsKCgpkZWYgbGFuZV9yaXNrKHB0cywgb3Bwcywga19tb3ZlPTAuNzUpOgogICAgIiIibWluIG92ZXIgb3Bwb25lbnRzIG9mIChkaXN0IHRvIGJhbGwgcGF0aCAtIENSIC0gTU9WKnQqaykuID4wIG1lYW5zIGNsZWFyLiIiIgogICAgaWYgbm90IG9wcHM6CiAgICAgICAgcmV0dXJuIDkuMAogICAgd29yc3QgPSA5LjAKICAgIGZvciBvIGluIG9wcHM6CiAgICAgICAgbSA9IDkuMAogICAgICAgIGZvciB0LCAoeCwgeSkgaW4gZW51bWVyYXRlKHB0cyk6CiAgICAgICAgICAgIHR0ID0gKHQgKyAxKSAqIERUCiAgICAgICAgICAgIGQgPSBtYXRoLmh5cG90KHggLSBvLngsIHkgLSBvLnkpIC0gQ1IgLSBNT1YgKiB0dCAqIGtfbW92ZQogICAgICAgICAgICBpZiBkIDwgbToKICAgICAgICAgICAgICAgIG0gPSBkCiAgICAgICAgICAgICAgICBpZiBtIDwgd29yc3QgLSAzLjA6CiAgICAgICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICBpZiBtIDwgd29yc3Q6CiAgICAgICAgICAgIHdvcnN0ID0gbQogICAgcmV0dXJuIHdvcnN0CgoKZGVmIHNob3RfYWltcyhzdCwgdSwgbWUsIHN0ZXA9MC4zNSk6CiAgICAiIiJjYW5kaWRhdGUgYWltIGFuZ2xlcyB0aGF0IHJlYWNoIHRoZSBvcHBvbmVudCBtb3V0aC4iIiIKICAgIGd4ID0gT1BQX0dPQUxbbWVdCiAgICBvdXQgPSBbXQogICAgeSA9IDEwLjY1CiAgICB3aGlsZSB5IDw9IDE1LjM1OgogICAgICAgIGFuZyA9IG1hdGguYXRhbjIoeSAtIHUueSwgZ3ggLSB1LngpCiAgICAgICAgZngsIGZ5ID0gbWF0aC5jb3MoYW5nKSwgbWF0aC5zaW4oYW5nKQogICAgICAgIHN4LCBzeSA9IHUueCArIGZ4ICogS0lDS19PRkYsIHUueSArIGZ5ICogS0lDS19PRkYKICAgICAgICBwdHMsIGd0LCBlbmQgPSBzaW1fYmFsbChzeCwgc3ksIGFuZykKICAgICAgICBpZiBndCBpcyBub3QgTm9uZSBhbmQgZ3QgPT0gbWU6CiAgICAgICAgICAgIG91dC5hcHBlbmQoKGFuZywgcHRzLCBlbmQpKQogICAgICAgIHkgKz0gc3RlcAogICAgcmV0dXJuIG91dAoKCmRlZiBiZXN0X3Nob3Qoc3QsIHUsIG1lLCBvcHAsIGtfbW92ZT0wLjgsIGlnbm9yZT0oKSk6CiAgICAiIiJyZXR1cm5zIChzY29yZSwgYW5nbGUsIGVuZCkgb3IgTm9uZS4gc2NvcmU+PTAgbWVhbnMgdXNhYmxlLiIiIgogICAgZ3ggPSBPUFBfR09BTFttZV0KICAgIGRnb2FsID0gYWJzKGd4IC0gdS54KQogICAgaWYgZGdvYWwgPiAyNC42OgogICAgICAgIHJldHVybiBOb25lCiAgICBibG9ja2VycyA9IFtvIGZvciBvIGluIG9wcCBpZiBvIG5vdCBpbiBpZ25vcmVdCiAgICBiZXN0ID0gTm9uZQogICAgZm9yIGFuZywgcHRzLCBlbmQgaW4gc2hvdF9haW1zKHN0LCB1LCBtZSk6CiAgICAgICAgcmlzayA9IGxhbmVfcmlzayhwdHMsIGJsb2NrZXJzLCBrX21vdmUpCiAgICAgICAgIyBsYXRlL2Nsb3NlIHNob3RzIGFyZSBiZXR0ZXI7IG5lYXItcG9zdCBjdXQgaXMgZmluZQogICAgICAgIHEgPSByaXNrICsgbWF4KDAuMCwgMTUuMCAtIGRnb2FsKSAqIDAuMDUKICAgICAgICBpZiBiZXN0IGlzIE5vbmUgb3IgcSA+IGJlc3RbMF06CiAgICAgICAgICAgIGJlc3QgPSAocSwgYW5nLCBlbmQpCiAgICBpZiBiZXN0IGlzIE5vbmU6CiAgICAgICAgcmV0dXJuIE5vbmUKICAgIHJldHVybiBiZXN0CgoKZGVmIHBhc3Nfc2NvcmUoc3QsIHUsIG1lLCB0eCwgdHksIG9wcCwgbWF0ZT1Ob25lLCBtYXRlX3RhcmdldD1Ob25lKToKICAgICIiIm1pc3NpbGUtc3R5bGUgcGFzczogbGVhZCB0aGUgcmVjZWl2ZXIgdG8gd2hlcmUgaXQgd2lsbCBiZSBvbiBhcnJpdmFsLiIiIgogICAgZDAgPSBtYXRoLmh5cG90KHR4IC0gdS54LCB0eSAtIHUueSkKICAgIHRfYXJyID0gZnJhbWVzX2Zvcl9kaXN0KGQwKSAvIDIwLjAKICAgIGlmIG1hdGUgaXMgbm90IE5vbmUgYW5kIG1hdGVfdGFyZ2V0IGlzIG5vdCBOb25lOgogICAgICAgICMgc29sdmUgdGhlIG1lZXRpbmcgcG9pbnQ6IHJlY2VpdmVyIHJ1bnMgdG8gaXRzIHRhcmdldCwgYmFsbCBmbGllcyB0byBpdAogICAgICAgIG1lZXQgPSBOb25lCiAgICAgICAgZm9yIHRpIGluICgwLjYsIDEuMCwgMS41LCAyLjAsIDIuNSwgMy4wLCAzLjYsIDQuMiwgNS4wLCA1LjgsIDYuNik6CiAgICAgICAgICAgIHB4LCBweSA9IHByZWRpY3RfdG8obWF0ZS54LCBtYXRlLnksIG1hdGVfdGFyZ2V0WzBdLCBtYXRlX3RhcmdldFsxXSwgdGkpCiAgICAgICAgICAgIGRiID0gbWF0aC5oeXBvdChweCAtIHUueCwgcHkgLSB1LnkpIC0gS0lDS19PRkYKICAgICAgICAgICAgaWYgZGIgPD0gMDoKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAgIGlmIGZyYW1lc19mb3JfZGlzdChkYikgLyAyMC4wIDw9IHRpICsgMC4wNjoKICAgICAgICAgICAgICAgIG1lZXQgPSAocHgsIHB5KQogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICBpZiBtZWV0IGlzIE5vbmU6CiAgICAgICAgICAgIHJldHVybiBOb25lCiAgICAgICAgdHgsIHR5ID0gbWVldAogICAgYW5nID0gbWF0aC5hdGFuMih0eSAtIHUueSwgdHggLSB1LngpCiAgICBmeCwgZnkgPSBtYXRoLmNvcyhhbmcpLCBtYXRoLnNpbihhbmcpCiAgICBzeCwgc3kgPSB1LnggKyBmeCAqIEtJQ0tfT0ZGLCB1LnkgKyBmeSAqIEtJQ0tfT0ZGCiAgICBkID0gbWF0aC5oeXBvdCh0eCAtIHN4LCB0eSAtIHN5KQogICAgaWYgZCA+IDI2LjA6CiAgICAgICAgcmV0dXJuIE5vbmUKICAgIHB0cywgZ3QsIGVuZCA9IHNpbV9iYWxsKHN4LCBzeSwgYW5nKQogICAgaWYgbm90IHB0czoKICAgICAgICByZXR1cm4gTm9uZQogICAgaWYgZ3QgaXMgbm90IE5vbmUgYW5kIGd0ICE9IG1lOgogICAgICAgIHJldHVybiBOb25lICAgICAgICAgICMgb3duIGdvYWw6IG5ldmVyIHBhc3MgaW50byBvdXIgb3duIG5ldAogICAgYXJyaXZhbCA9IG1pbihwdHMsIGtleT1sYW1iZGEgcDogbWF0aC5oeXBvdChwWzBdIC0gdHgsIHBbMV0gLSB0eSkpCiAgICBtaXNzID0gbWF0aC5oeXBvdChhcnJpdmFsWzBdIC0gdHgsIGFycml2YWxbMV0gLSB0eSkKICAgIGlmIG1pc3MgPiAxLjQ6CiAgICAgICAgcmV0dXJuIE5vbmUKICAgIHJpc2sgPSBsYW5lX3Jpc2socHRzLCBvcHAsIDAuNikKICAgIGlmIHJpc2sgPCAtMC45OgogICAgICAgIHJldHVybiBOb25lCiAgICBhZHYgPSAodHggLSB1LngpICogQVRLW21lXQogICAgb3Blbl8gPSA5LjAKICAgIGlmIG1hdGUgaXMgbm90IE5vbmU6CiAgICAgICAgIyBvcGVubmVzcyBhdCB0aGUgcHJlZGljdGVkIHJlY2VwdGlvbiBwb2ludAogICAgICAgIG9wZW5fID0gbWluKFttYXRoLmh5cG90KG8ueCAtIHR4LCBvLnkgLSB0eSkgZm9yIG8gaW4gb3BwXSBvciBbOS4wXSkKICAgIHNjID0gbWluKHJpc2ssIDMuMCkgKiAwLjcgKyBhZHYgKiAwLjE0ICsgbWluKG9wZW5fLCA0LjApICogMC4zMCAtIG1pc3MgKiAwLjQKICAgIGlmIGFkdiA8IDA6CiAgICAgICAgc2MgLT0gMS4xCiAgICByZXR1cm4gc2MsIGFuZywgYXJyaXZhbAoKCmRlZiBjbGVhcl9zY29yZShzdCwgdSwgbWUsIG9wcCk6CiAgICAiIiJraWNrIHRvd2FyZCBvcHBvbmVudCBoYWxmIGF3YXkgZnJvbSBuZWFyZXN0IG9wcG9uZW50cyIiIgogICAgYmVzdCA9IE5vbmUKICAgIGZvciBkZWcgaW4gcmFuZ2UoMCwgMzYwLCAxMik6CiAgICAgICAgYW5nID0gbWF0aC5yYWRpYW5zKGRlZykKICAgICAgICBmeCwgZnkgPSBtYXRoLmNvcyhhbmcpLCBtYXRoLnNpbihhbmcpCiAgICAgICAgc3gsIHN5ID0gdS54ICsgZnggKiBLSUNLX09GRiwgdS55ICsgZnkgKiBLSUNLX09GRgogICAgICAgIGlmIG5vdCAoMC4zIDwgc3ggPCBXIC0gMC4zIGFuZCAwLjMgPCBzeSA8IEggLSAwLjMpOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIHB0cywgZ3QsIGVuZCA9IHNpbV9iYWxsKHN4LCBzeSwgYW5nLCBtYXhmPTEyMCkKICAgICAgICBpZiBndCBpcyBub3QgTm9uZToKICAgICAgICAgICAgY29udGludWUgICMgb3duIGdvYWxzIGFyZSBhdm9pZGVkIGJ5IGNhbGxlciAoZ29hbCB0ZWFtIT1tZSkKICAgICAgICByaXNrID0gbGFuZV9yaXNrKHB0cywgb3BwLCAwLjUpCiAgICAgICAgYWR2ID0gKGVuZFswXSAtIHUueCkgKiBBVEtbbWVdCiAgICAgICAgc2MgPSBhZHYgKiAwLjA2ICsgbWluKHJpc2ssIDMuMCkgKiAwLjUKICAgICAgICBpZiBiZXN0IGlzIE5vbmUgb3Igc2MgPiBiZXN0WzBdOgogICAgICAgICAgICBiZXN0ID0gKHNjLCBhbmcpCiAgICByZXR1cm4gYmVzdAoKCiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIGtlZXBlcgpkZWYga2VlcGVyX3Nwb3Qoc3QsIG1lKToKICAgIGd4ID0gTVlfR09BTFttZV0KICAgIHNnbiA9IDEuMCBpZiBtZSA9PSAwIGVsc2UgLTEuMCAgICMgaW53YXJkIGRpcmVjdGlvbgogICAgYngsIGJ5ID0gc3QuYngsIHN0LmJ5CiAgICBzcCA9IG1hdGguaHlwb3Qoc3QuYnZ4LCBzdC5idnkpCiAgICAjIG9wcG9uZW50IHNob290aW5nIHBhdHRlcm46IG5lYXIgcG9zdC4gUHJlLXBvc2l0aW9uIG9uIHRoZSBiYWxsLT5uZWFyLXBvc3QgbGluZQogICAgcGxhbmUgPSBneCArIHNnbiAqIDIuMAogICAgdGFyZ2V0X3kgPSAxMy4wCiAgICBpZiBLRUVQTU9ERSAhPSAnY2VudGVyJyBhbmQgYWJzKGJ5IC0gMTMuMCkgPiAyLjUgYW5kIGFicyhneCAtIGJ4KSA+IDMuMDoKICAgICAgICBpZiBLRUVQTU9ERSA9PSAnbmVhcic6CiAgICAgICAgICAgIHBvc3QgPSAxMC42IGlmIGJ5IDwgMTMuMCBlbHNlIDE1LjQKICAgICAgICBlbHNlOiAgIyBmYXIgcG9zdAogICAgICAgICAgICBwb3N0ID0gMTUuNCBpZiBieSA8IDEzLjAgZWxzZSAxMC42CiAgICAgICAgZnJhYyA9IGNsYW1wKChwbGFuZSAtIGJ4KSAvIChneCAtIGJ4KSwgMC4wLCAxLjI1KQogICAgICAgIHRhcmdldF95ID0gYnkgKyAocG9zdCAtIGJ5KSAqIGZyYWMKICAgIGlmIHNwID4gMS4wOgogICAgICAgIHB0cyA9IGJhbGxfZnV0dXJlKHN0LCAxMjApCiAgICAgICAgZm9yICh4LCB5KSBpbiBwdHM6CiAgICAgICAgICAgIGlmIChzZ24gPiAwIGFuZCB4IDw9IHBsYW5lKSBvciAoc2duIDwgMCBhbmQgeCA+PSBwbGFuZSk6CiAgICAgICAgICAgICAgICBpZiAwIDw9IHkgPD0gSDoKICAgICAgICAgICAgICAgICAgICB0YXJnZXRfeSA9IHkKICAgICAgICAgICAgICAgIGJyZWFrCiAgICB0YXJnZXRfeSA9IGNsYW1wKHRhcmdldF95LCAxMC43LCAxNS4zKQogICAgZGVwdGggPSAyLjM1CiAgICBpZiBhYnMoYnggLSBneCkgPCA3LjA6CiAgICAgICAgZGVwdGggPSAxLjM1CiAgICBweCA9IGd4ICsgc2duICogZGVwdGgKICAgIHJldHVybiBweCwgY2xhbXAodGFyZ2V0X3ksIDEwLjc1LCAxNS4yNSkKCgpkZWYga2VlcGVyX2NtZHMoc3QsIGssIG1lLCBvcHAsIG4pOgogICAgYngsIGJ5ID0gc3QuYngsIHN0LmJ5CiAgICBneCA9IE1ZX0dPQUxbbWVdCiAgICBhdGsgPSBBVEtbbWVdCiAgICBkZ29hbCA9IG1hdGguaHlwb3QoYnggLSBneCwgYnkgLSAxMy4wKQogICAgb3duZXIgPSBzdC51bml0c1tzdC5vd25lcl0gaWYgc3Qub3duZXIgPj0gMCBlbHNlIE5vbmUKICAgICMgY29sbGVjdCBhIGxvb3NlIGJhbGwgb25seSBpbnNpZGUgb3VyIG93biBib3ggLyB2ZXJ5IG5lYXIgdGhlIGdvYWwKICAgIGlmIG93bmVyIGlzIE5vbmU6CiAgICAgICAgZCA9IG1hdGguaHlwb3QoYnggLSBrLngsIGJ5IC0gay55KQogICAgICAgIHNsb3cgPSBtYXRoLmh5cG90KHN0LmJ2eCwgc3QuYnZ5KSA8IDUuNQogICAgICAgIG5lYXJfZ29hbCA9IGRnb2FsIDwgOS4wCiAgICAgICAgb3BwX2Nsb3NlciA9IGFueShtYXRoLmh5cG90KG8ueCAtIGJ4LCBvLnkgLSBieSkgPCBkIC0gMC4yIGZvciBvIGluIG9wcCkKICAgICAgICBpZiAoZCA8IDIuNiBvciAobmVhcl9nb2FsIGFuZCBzbG93IGFuZCBkIDwgNS41IGFuZCBub3Qgb3BwX2Nsb3NlcikpOgogICAgICAgICAgICBkbmFtZSA9IG1vdmVfZGlyKHN0LCBrLCBieCwgYnksIG1lLCBhbGxvd19ib3g9VHJ1ZSkKICAgICAgICAgICAgcmV0dXJuIChkbmFtZSwgbWF0aC5kZWdyZWVzKG1hdGguYXRhbjIoMTMuMCAtIGsueSwgZ3ggLSBrLngpKSAlIDM2MC4wLCBGYWxzZSkKICAgIHR4LCB0eSA9IGtlZXBlcl9zcG90KHN0LCBtZSkKICAgIGRuYW1lID0gbW92ZV9kaXIoc3QsIGssIHR4LCB0eSwgbWUsIGFsbG93X2JveD1UcnVlKQogICAgIyBmYWNlIHRoZSBiYWxsIChzbyBhIHNhdmUga2ljayBnb2VzIGZvcndhcmQtaXNoKQogICAgYWltID0gbWF0aC5kZWdyZWVzKG1hdGguYXRhbjIoYnkgLSBrLnksIGJ4IC0gay54KSkgJSAzNjAuMAogICAgcmV0dXJuIChkbmFtZSwgYWltLCBGYWxzZSkKCgojIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBjYXJyaWVyCmRlZiBiZXN0X2tpY2soc3QsIHUsIG1lLCBvcHAsIG1hdGVzLCBtYXRlX3RhcmdldHM9Tm9uZSk6CiAgICAiIiJyZXR1cm5zIChzY29yZSwgYW5nbGUsIGtpbmQpIG9yIE5vbmUuIGtpbmQgaW4gc2hvdC9wYXNzL2xvbmcvY2xlYXIuIiIiCiAgICBneCA9IE9QUF9HT0FMW21lXQogICAgZGdvYWwgPSBhYnMoZ3ggLSB1LngpCiAgICBjYW5kcyA9IFtdCiAgICAjIG9wcG9uZW50cyB0aGF0IGp1c3Qga2lja2VkIGFyZSBpbiBjb250cm9sIGxvY2s6IGEgc2hvdCBjYW4gcGFzcyB0aHJvdWdoIHRoZW0KICAgIGxvY2tlZCA9IFtvIGZvciBvIGluIG9wcCBpZiBvLmNvbnRyb2xMb2NrID4gMCBhbmQKICAgICAgICAgICAgICBtYXRoLmh5cG90KG8ueCAtIHUueCwgby55IC0gdS55KSA8IDMuMl0KICAgIHNoID0gYmVzdF9zaG90KHN0LCB1LCBtZSwgb3BwLCBpZ25vcmU9bG9ja2VkKQogICAgaWYgc2ggaXMgbm90IE5vbmU6CiAgICAgICAgcSwgYW5nLCBlbmRwID0gc2gKICAgICAgICBpZiBxID4gLTAuMTUgb3IgKGxvY2tlZCBhbmQgcSA+IC0xLjIpOgogICAgICAgICAgICBzY29yZSA9IDIuMiArIG1pbihxLCAzLjApICogMS40ICsgbWF4KDAuMCwgMTMuNSAtIGRnb2FsKSAqIDAuMTIKICAgICAgICAgICAgaWYgbG9ja2VkOgogICAgICAgICAgICAgICAgc2NvcmUgKz0gMC42CiAgICAgICAgICAgIGNhbmRzLmFwcGVuZCgoc2NvcmUsIGFuZywgJ3Nob3QnKSkKICAgIGZvciBtIGluIG1hdGVzOgogICAgICAgIHRndG0gPSBtYXRlX3RhcmdldHMuZ2V0KG0uaW5kZXgpIGlmIG1hdGVfdGFyZ2V0cyBlbHNlIE5vbmUKICAgICAgICBwcyA9IHBhc3Nfc2NvcmUoc3QsIHUsIG1lLCBtLngsIG0ueSwgb3BwLCBtYXRlPW0sIG1hdGVfdGFyZ2V0PXRndG0pCiAgICAgICAgaWYgcHMgaXMgbm90IE5vbmUgYW5kIHBzWzBdID4gMC4xOgogICAgICAgICAgICBzYywgYW5nLCBhcnIgPSBwcwogICAgICAgICAgICBtZCA9IGFicyhneCAtIG0ueCkKICAgICAgICAgICAgYm9udXMgPSAwLjU1IGlmIG1kIDwgMTQgZWxzZSAoLTAuMjUgaWYgbWQgPiAyNiBlbHNlIDAuMCkKICAgICAgICAgICAgY2FuZHMuYXBwZW5kKChzYyAqIDAuNiArIGJvbnVzLCBhbmcsICdwYXNzJykpCiAgICAjIHB1bnQgaW50byB0aGUgY29ycmlkb3Igd2hlcmUgb3VyIGZvcndhcmRzIGFscmVhZHkgd2FpdCAocmFjZSBiYWxsKQogICAgZ3hkID0gQVRLW21lXQogICAgZm9yIHh4IGluIChneCAtIGd4ZCAqIDguMCwgZ3ggLSBneGQgKiAxNC4wKToKICAgICAgICBmb3IgeXkgaW4gKDQuMCwgMjEuOCk6CiAgICAgICAgICAgIHNweCwgc3B5ID0gc2FmZV9wdChtZSwgeHgsIHl5LCBTQUZFKQogICAgICAgICAgICBhbmcgPSBtYXRoLmF0YW4yKHNweSAtIHUueSwgc3B4IC0gdS54KQogICAgICAgICAgICBmeCwgZnkgPSBtYXRoLmNvcyhhbmcpLCBtYXRoLnNpbihhbmcpCiAgICAgICAgICAgIHN4LCBzeSA9IHUueCArIGZ4ICogS0lDS19PRkYsIHUueSArIGZ5ICogS0lDS19PRkYKICAgICAgICAgICAgaWYgbWF0aC5oeXBvdChzcHggLSBzeCwgc3B5IC0gc3kpIDwgNC4wOgogICAgICAgICAgICAgICAgY29udGludWUKICAgICAgICAgICAgcHRzMiwgZ3QyLCBlbmRwID0gc2ltX2JhbGwoc3gsIHN5LCBhbmcpCiAgICAgICAgICAgIGlmIGd0MiBpcyBub3QgTm9uZSBhbmQgZ3QyICE9IG1lOgogICAgICAgICAgICAgICAgY29udGludWUKICAgICAgICAgICAgZW5kcCA9IHB0czJbLTFdIGlmIHB0czIgZWxzZSBlbmRwCiAgICAgICAgICAgIGRtZSA9IG1pbihbbWF0aC5oeXBvdChtLnggLSBlbmRwWzBdLCBtLnkgLSBlbmRwWzFdKSBmb3IgbSBpbiBtYXRlc10gb3IgWzk5LjBdKQogICAgICAgICAgICBkb3AgPSBtaW4oW21hdGguaHlwb3Qoby54IC0gZW5kcFswXSwgby55IC0gZW5kcFsxXSkgZm9yIG8gaW4gb3BwXSBvciBbOTkuMF0pCiAgICAgICAgICAgIGlmIGRtZSA8IGRvcCArIDEuMCBhbmQgZG1lIDwgNy4wOgogICAgICAgICAgICAgICAgc2MgPSAwLjkgKyAoZG9wIC0gZG1lKSAqIDAuNTUgLSBkbWUgKiAwLjA1CiAgICAgICAgICAgICAgICBjYW5kcy5hcHBlbmQoKHNjLCBhbmcsICdsb25nJykpCiAgICAjIGxvbmcgYmFsbCB0byBjb3JyaWRvciBzcG90cyBvbmx5IGZyb20gbWlkL3VwIGZpZWxkCiAgICBpZiBhYnMoZ3ggLSB1LngpIDwgMzA6CiAgICAgICAgZm9yIHh4IGluIChneCAtIGd4ZCAqIDYuMCwgZ3ggLSBneGQgKiAxMS4wLCBneCAtIGd4ZCAqIDE3LjApOgogICAgICAgICAgICBmb3IgeXkgaW4gKDQuMiwgMjEuOCk6CiAgICAgICAgICAgICAgICBwcyA9IHBhc3Nfc2NvcmUoc3QsIHUsIG1lLCB4eCwgeXksIG9wcCkKICAgICAgICAgICAgICAgIGlmIHBzIGlzIG5vdCBOb25lIGFuZCBwc1swXSA+IDAuMzoKICAgICAgICAgICAgICAgICAgICBjYW5kcy5hcHBlbmQoKHBzWzBdICogMC40MiArIDAuMSwgcHNbMV0sICdsb25nJykpCiAgICBpZiBub3QgY2FuZHM6CiAgICAgICAgcmV0dXJuIE5vbmUKICAgIGNhbmRzLnNvcnQoa2V5PWxhbWJkYSBjOiAtY1swXSkKICAgIHJldHVybiBjYW5kc1swXQoKCmRlZiBwcmVzc3VyZShzdCwgdSwgb3BwKToKICAgIGQgPSA5LjAKICAgIGZvciBvIGluIG9wcDoKICAgICAgICBkZCA9IG1hdGguaHlwb3Qoby54IC0gdS54LCBvLnkgLSB1LnkpCiAgICAgICAgaWYgZGQgPCBkOgogICAgICAgICAgICBkID0gZGQKICAgIHJldHVybiBkCgoKX1NUID0geydoaXN0JzogW10sICdmb3JjZSc6IEZhbHNlfQoKCmRlZiBjYXJyaWVyX2NtZHMoc3QsIHUsIG1lLCBvcHAsIG1hdGVzLCBzb2xvPUZhbHNlLCBtYXRlX3RhcmdldHM9Tm9uZSwgcHJlZmVyX2tpY2s9RmFsc2UpOgogICAgZ3ggPSBPUFBfR09BTFttZV0KICAgIGJlc3QgPSBiZXN0X2tpY2soc3QsIHUsIG1lLCBvcHAsIG1hdGVzLCBtYXRlX3RhcmdldHMpCiAgICBwcmVzcyA9IHByZXNzdXJlKHN0LCB1LCBvcHApCiAgICBpZiBfU1QuZ2V0KCdmb3JjZScpIGFuZCBub3Qgc29sbzoKICAgICAgICBpZiBiZXN0IGlzIG5vdCBOb25lIGFuZCBiZXN0WzBdID4gLTUuMDoKICAgICAgICAgICAgYW5nID0gYmVzdFsxXQogICAgICAgICAgICByZXR1cm4gKG1vdmVfZGlyKHN0LCB1LCB1LnggKyBtYXRoLmNvcyhhbmcpLCB1LnkgKyBtYXRoLnNpbihhbmcpLCBtZSksCiAgICAgICAgICAgICAgICAgICAgbWF0aC5kZWdyZWVzKGFuZykgJSAzNjAuMCwgVHJ1ZSkKICAgICAgICBjbCA9IGNsZWFyX3Njb3JlKHN0LCB1LCBtZSwgb3BwKQogICAgICAgIGlmIGNsIGlzIG5vdCBOb25lOgogICAgICAgICAgICBhbmcgPSBjbFsxXQogICAgICAgICAgICByZXR1cm4gKG1vdmVfZGlyKHN0LCB1LCB1LnggKyBtYXRoLmNvcyhhbmcpLCB1LnkgKyBtYXRoLnNpbihhbmcpLCBtZSksCiAgICAgICAgICAgICAgICAgICAgbWF0aC5kZWdyZWVzKGFuZykgJSAzNjAuMCwgVHJ1ZSkKICAgIGlmIHByZWZlcl9raWNrIGFuZCBiZXN0IGlzIG5vdCBOb25lIGFuZCBiZXN0WzBdID4gMC4yIGFuZCBwcmVzcyA+IDMuMDoKICAgICAgICBzY29yZSwgYW5nLCBraW5kID0gYmVzdAogICAgICAgIHJldHVybiAobW92ZV9kaXIoc3QsIHUsIHUueCArIG1hdGguY29zKGFuZyksIHUueSArIG1hdGguc2luKGFuZyksIG1lLCBhbGxvd19ib3g9VHJ1ZSksCiAgICAgICAgICAgICAgICBtYXRoLmRlZ3JlZXMoYW5nKSAlIDM2MC4wLCBUcnVlKQogICAgaWYgYmVzdCBpcyBub3QgTm9uZSBhbmQgYmVzdFswXSA+IDAuNzU6CiAgICAgICAgc2NvcmUsIGFuZywga2luZCA9IGJlc3QKICAgICAgICBpZiBraW5kID09ICdzaG90JyBvciBzY29yZSA+IDEuMCBvciBwcmVzcyA8IDIuNjoKICAgICAgICAgICAgcmV0dXJuIChtb3ZlX2RpcihzdCwgdSwgdS54ICsgbWF0aC5jb3MoYW5nKSwgdS55ICsgbWF0aC5zaW4oYW5nKSwgbWUsIGFsbG93X2JveD1GYWxzZSksCiAgICAgICAgICAgICAgICAgICAgbWF0aC5kZWdyZWVzKGFuZykgJSAzNjAuMCwgVHJ1ZSkKICAgICMgdW5kZXIgcmVhbCBwcmVzc3VyZSBhbmQgbm8gZ29vZCBvcHRpb246IGNsZWFyIGF3YXkgZnJvbSBvcHBvbmVudHMKICAgIGlmIHByZXNzIDwgMS45OgogICAgICAgIGNsID0gY2xlYXJfc2NvcmUoc3QsIHUsIG1lLCBvcHApCiAgICAgICAgaWYgY2wgaXMgbm90IE5vbmU6CiAgICAgICAgICAgIGFuZyA9IGNsWzFdCiAgICAgICAgICAgIHJldHVybiAobW92ZV9kaXIoc3QsIHUsIHUueCArIG1hdGguY29zKGFuZyksIHUueSArIG1hdGguc2luKGFuZyksIG1lLCBhbGxvd19ib3g9RmFsc2UpLAogICAgICAgICAgICAgICAgICAgIG1hdGguZGVncmVlcyhhbmcpICUgMzYwLjAsIFRydWUpCiAgICAjIGF0dGFja2luZyB0aGlyZDogZHJpdmUgdG8gdGhlIG5lYXItcG9zdCBjb3JuZXIgY29ycmlkb3IKICAgIGlmIGFicyhneCAtIHUueCkgPCAyNi4wIGFuZCBwcmVzcyA+IDIuMjoKICAgICAgICBjeSA9IDQuMiBpZiB1LnkgPCAxMy4wIGVsc2UgMjEuOAogICAgICAgIHRndCA9IHNhZmVfcHQobWUsIGd4IC0gQVRLW21lXSAqIDIuMCwgY3ksIFNBRkUpCiAgICAgICAgZCA9IG1hdGguaHlwb3QodGd0WzBdIC0gdS54LCB0Z3RbMV0gLSB1LnkpCiAgICAgICAgaWYgZCA+IDAuNjoKICAgICAgICAgICAgbmVhciwgbmQyID0gTm9uZSwgMWU5CiAgICAgICAgICAgIGZvciBvIGluIG9wcDoKICAgICAgICAgICAgICAgIGRkID0gbWF0aC5oeXBvdChvLnggLSB1LngsIG8ueSAtIHUueSkKICAgICAgICAgICAgICAgIGlmIGRkIDwgbmQyOgogICAgICAgICAgICAgICAgICAgIG5kMiwgbmVhciA9IGRkLCBvCiAgICAgICAgICAgIGlmIG5lYXIgaXMgbm90IE5vbmUgYW5kIG5kMiA8IDQuNToKICAgICAgICAgICAgICAgIGFpbSA9IG1hdGguZGVncmVlcyhtYXRoLmF0YW4yKHUueSAtIG5lYXIueSwgdS54IC0gbmVhci54KSkgJSAzNjAuMAogICAgICAgICAgICBlbHNlOgogICAgICAgICAgICAgICAgYWltID0gbWF0aC5kZWdyZWVzKG1hdGguYXRhbjIoMTMuMCAtIHUueSwgZ3ggLSB1LngpKSAlIDM2MC4wCiAgICAgICAgICAgIHJldHVybiAobW92ZV9kaXIoc3QsIHUsIHRndFswXSwgdGd0WzFdLCBtZSksIGFpbSwgRmFsc2UpCiAgICAjIGRyaWJibGU6IHByb2dyZXNzIHRvd2FyZCBnb2FsIHdoaWxlIGtlZXBpbmcgYXdheSBmcm9tIG5lYXJlc3Qgb3Bwb25lbnQKICAgIGJlc3RkID0gTm9uZQogICAgZm9yIGRlZyBpbiByYW5nZSgwLCAzNjAsIDE1KToKICAgICAgICBhID0gbWF0aC5yYWRpYW5zKGRlZykKICAgICAgICBkID0gMy42CiAgICAgICAgdHgsIHR5ID0gdS54ICsgbWF0aC5jb3MoYSkgKiBkLCB1LnkgKyBtYXRoLnNpbihhKSAqIGQKICAgICAgICBpZiBub3QgKDAuNyA8PSB0eCA8PSBXIC0gMC43IGFuZCAwLjcgPD0gdHkgPD0gSCAtIDAuNyk6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgaWYgaW5fZGFuZ2VyKG1lLCB0eCwgdHksIFNBRkUgKiAwLjYpOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIGlmIG5vdCBzdGVwX29rKG1lLCB1LngsIHUueSwgbWF0aC5jb3MoYSksIG1hdGguc2luKGEpLCA4KToKICAgICAgICAgICAgY29udGludWUKICAgICAgICBhZHYgPSAodHggLSB1LngpICogQVRLW21lXQogICAgICAgIG9kID0gbWluKFttYXRoLmh5cG90KG8ueCAtIHR4LCBvLnkgLSB0eSkgZm9yIG8gaW4gb3BwXSBvciBbOS4wXSkKICAgICAgICBnZCA9IGFicyhneCAtIHR4KQogICAgICAgIHNjID0gYWR2ICogMC40MiArIG1pbihvZCwgMy41KSAqIDAuNDAgKyBtYXgoMC4wLCAyMi4wIC0gZ2QpICogMC4wNgogICAgICAgIGlmIGJlc3RkIGlzIE5vbmUgb3Igc2MgPiBiZXN0ZFswXToKICAgICAgICAgICAgYmVzdGQgPSAoc2MsIHR4LCB0eSkKICAgIGlmIGJlc3RkIGlzIE5vbmU6CiAgICAgICAgcmV0dXJuICgnTicsIE5vbmUsIEZhbHNlKQogICAgXywgdHgsIHR5ID0gYmVzdGQKICAgICMgc2hpZWxkIHRoZSBiYWxsOiBmYWNlIGF3YXkgZnJvbSB0aGUgbmVhcmVzdCBvcHBvbmVudCB3aGVuIGl0IGlzIGNsb3NlCiAgICBuZWFyLCBuZCA9IE5vbmUsIDFlOQogICAgZm9yIG8gaW4gb3BwOgogICAgICAgIGRkID0gbWF0aC5oeXBvdChvLnggLSB1LngsIG8ueSAtIHUueSkKICAgICAgICBpZiBkZCA8IG5kOgogICAgICAgICAgICBuZCwgbmVhciA9IGRkLCBvCiAgICBpZiBuZWFyIGlzIG5vdCBOb25lIGFuZCBuZCA8IDUuMDoKICAgICAgICBhaW0gPSBtYXRoLmRlZ3JlZXMobWF0aC5hdGFuMih1LnkgLSBuZWFyLnksIHUueCAtIG5lYXIueCkpICUgMzYwLjAKICAgIGVsc2U6CiAgICAgICAgYWltID0gbWF0aC5kZWdyZWVzKG1hdGguYXRhbjIoMTMuMCAtIHUueSwgZ3ggLSB1LngpKSAlIDM2MC4wCiAgICByZXR1cm4gKG1vdmVfZGlyKHN0LCB1LCB0eCwgdHksIG1lKSwgYWltLCBGYWxzZSkKCgojIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBmb3J3YXJkCmRlZiBmb3J3YXJkX3Nwb3RzKG1lKToKICAgIGd4ID0gT1BQX0dPQUxbbWVdCiAgICBhID0gQVRLW21lXQogICAgcmV0dXJuIFsoZ3ggLSBhICogNS4wLCA0LjMpLCAoZ3ggLSBhICogNS4wLCAyMS43KSwKICAgICAgICAgICAgKGd4IC0gYSAqIDEwLjUsIDQuMCksIChneCAtIGEgKiAxMC41LCAyMi4wKSwKICAgICAgICAgICAgKGd4IC0gYSAqIDEwLjUsIDEzLjApXQoKCmRlZiBsYW5lX2NsZWFyKGJ4LCBieSwgcHgsIHB5LCBvcHBzLCBpZ25vcmU9Tm9uZSk6CiAgICBkeCwgZHkgPSBweCAtIGJ4LCBweSAtIGJ5CiAgICBEID0gbWF0aC5oeXBvdChkeCwgZHkpCiAgICBpZiBEIDwgMWUtNjoKICAgICAgICByZXR1cm4gOS4wCiAgICB1eCwgdXkgPSBkeCAvIEQsIGR5IC8gRAogICAgYmVzdCA9IDkuMAogICAgZm9yIG8gaW4gb3BwczoKICAgICAgICBpZiBvIGlzIGlnbm9yZToKICAgICAgICAgICAgY29udGludWUKICAgICAgICBleCwgZXkgPSBvLnggLSBieCwgby55IC0gYnkKICAgICAgICBwcm9qID0gZXggKiB1eCArIGV5ICogdXkKICAgICAgICBpZiBwcm9qIDwgLTAuMyBvciBwcm9qID4gRCArIDAuNjoKICAgICAgICAgICAgY29udGludWUKICAgICAgICBwZXJwID0gYWJzKGV4ICogdXkgLSBleSAqIHV4KQogICAgICAgIGlmIHBlcnAgLSBDUiA8IGJlc3Q6CiAgICAgICAgICAgIGJlc3QgPSBwZXJwIC0gQ1IKICAgIHJldHVybiBiZXN0CgoKZGVmIHBpY2tfZm9yd2FyZF9zcG90KHN0LCB1LCBtZSwgb3BwLCB0YWtlbiwgc2lkZT0wKToKICAgICIiIkNvcnJpZG9yIGZvcndhcmQgNS0xMyB1bml0cyBmcm9tIHRoZSBlbmVteSBnb2FsIGxpbmUsIHNvIGEgbG9uZyBiYWxsIGNhbgogICAgcmVhY2ggaXQgYW5kIG9uZSBzaG9ydCBkcmliYmxlIGdldHMgaXQgdG8gdGhlIG5lYXItcG9zdCBzaG90IHNwb3QuIiIiCiAgICBneCA9IE9QUF9HT0FMW21lXQogICAgYSA9IEFUS1ttZV0KICAgIGJ4LCBieSA9IHN0LmJ4LCBzdC5ieQogICAgbG8gPSBtaW4oZ3ggLSBhICogMTguMCwgZ3ggLSBhICogNC4wKQogICAgaGkgPSBtYXgoZ3ggLSBhICogMTguMCwgZ3ggLSBhICogNC4wKQogICAgeGJhc2UgPSBjbGFtcChieCArIGEgKiAxNy4wLCBsbywgaGkpCiAgICB5eV9wcmVmID0gKDQuMiwgMjEuNiwgMTMuMClbc2lkZSAlIDNdCiAgICBiZXN0ID0gTm9uZQogICAgYmVzdHNjID0gLTFlOQogICAgZm9yIHIsIHl5IGluIGVudW1lcmF0ZSgoeXlfcHJlZiwgNC4yLCAyMS42LCAxMy4wKSk6CiAgICAgICAgZm9yIGR4IGluICgwLjAsIC0zLjAsIDMuMCwgLTYuMCwgNi4wKToKICAgICAgICAgICAgdHggPSBjbGFtcCh4YmFzZSArIGEgKiBkeCwgbG8sIGhpKQogICAgICAgICAgICB0eCwgdHkgPSBzYWZlX3B0KG1lLCB0eCwgeXksIFNBRkUpCiAgICAgICAgICAgIGNyb3dkID0gc3VtKG1heCgwLjAsIDQuMCAtIG1hdGguaHlwb3QodHggLSBheCwgdHkgLSBheSkpIGZvciBheCwgYXkgaW4gdGFrZW4pCiAgICAgICAgICAgIG9kID0gbWluKFttYXRoLmh5cG90KG8ueCAtIHR4LCBvLnkgLSB0eSkgZm9yIG8gaW4gb3BwXSBvciBbOS4wXSkKICAgICAgICAgICAgYmQgPSBtYXRoLmh5cG90KGJ4IC0gdHgsIGJ5IC0gdHkpCiAgICAgICAgICAgIGxhbmUgPSBsYW5lX2NsZWFyKGJ4LCBieSwgdHgsIHR5LCBvcHApCiAgICAgICAgICAgIHNjID0gbWluKGxhbmUsIDMuMCkgKiAxLjAgKyBtaW4ob2QsIDMuNSkgKiAwLjMgLSBjcm93ZCAqIDAuOCAtIGFicyhiZCAtIDE4LjApICogMC4wNQogICAgICAgICAgICBpZiByID09IDA6CiAgICAgICAgICAgICAgICBzYyArPSAwLjQKICAgICAgICAgICAgaWYgc2MgPiBiZXN0c2M6CiAgICAgICAgICAgICAgICBiZXN0c2MgPSBzYwogICAgICAgICAgICAgICAgYmVzdCA9ICh0eCwgdHkpCiAgICByZXR1cm4gYmVzdAoKCmRlZiBzdXBwb3J0X3Nwb3Qoc3QsIG1lLCBvcHAsIHgsIHksIHRha2VuKToKICAgICIiImRlZmVuc2l2ZS9jb3ZlciBwb3NpdGlvbiBiZXR3ZWVuIGJhbGwgYW5kIG93biBnb2FsIiIiCiAgICBvZ3ggPSBNWV9HT0FMW21lXQogICAgY3gsIGN5ID0gb2d4LCAxMy4wCiAgICBkeCwgZHkgPSB4IC0gY3gsIHkgLSBjeQogICAgZCA9IG1hdGguaHlwb3QoZHgsIGR5KSBvciAxLjAKICAgIGsgPSBjbGFtcCgwLjQ1ICogZCwgNS4wLCAxNS4wKQogICAgdHgsIHR5ID0gY3ggKyBkeCAvIGQgKiBrLCBjeSArIGR5IC8gZCAqIGsKICAgIHJldHVybiBzYWZlX3B0KG1lLCB0eCwgdHksIFNBRkUpCgoKIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gbWFpbgpkZWYgZnJhbWVfY21kcyhzdCwgbWUpOgogICAgbiA9IHN0Lm4KICAgIG15ID0gW3UgZm9yIHUgaW4gc3QudW5pdHMgaWYgdS50ZWFtID09IG1lXQogICAgb3BwID0gW3UgZm9yIHUgaW4gc3QudW5pdHMgaWYgdS50ZWFtICE9IG1lXQogICAgb3duZXIgPSBzdC51bml0c1tzdC5vd25lcl0gaWYgc3Qub3duZXIgPj0gMCBlbHNlIE5vbmUKICAgIGJ4LCBieSA9IHN0LmJ4LCBzdC5ieQogICAgZ3ggPSBPUFBfR09BTFttZV0KICAgIG9neCA9IE1ZX0dPQUxbbWVdCiAgICBjbWRzID0ge30KICAgIGlmIG4gPT0gMToKICAgICAgICB1ID0gbXlbMF0KICAgICAgICBpZiBvd25lciBpcyBub3QgTm9uZSBhbmQgb3duZXIudGVhbSA9PSBtZToKICAgICAgICAgICAgY21kc1t1LmluZGV4XSA9IGNhcnJpZXJfY21kcyhzdCwgdSwgbWUsIG9wcCwgW10sIHNvbG89VHJ1ZSkKICAgICAgICAgICAgcmV0dXJuIGNtZHMKICAgICAgICBvZ3ggPSBNWV9HT0FMW21lXQogICAgICAgIG8gPSBvcHBbMF0gaWYgb3BwIGVsc2UgTm9uZQogICAgICAgIGJkID0gbWF0aC5oeXBvdChieCAtIG9neCwgYnkgLSAxMy4wKQogICAgICAgIHNnbiA9IDEuMCBpZiBtZSA9PSAwIGVsc2UgLTEuMAogICAgICAgIGd4cCA9IG9neCArIHNnbiAqIDIuMAogICAgICAgIGlmIG93bmVyIGlzIG5vdCBOb25lIGFuZCBvIGlzIG5vdCBOb25lOgogICAgICAgICAgICAjIG9wcG9uZW50IGhhcyB0aGUgYmFsbDogc3RhbmQgb24gdGhlIGJhbGwtPmdvYWwgbGluZSwgY2xvc2UgaW4gZnJvbnQKICAgICAgICAgICAgZGR4LCBkZHkgPSBvZ3ggLSBieCwgMTMuMCAtIGJ5CiAgICAgICAgICAgIGRkZCA9IG1hdGguaHlwb3QoZGR4LCBkZHkpIG9yIDEuMAogICAgICAgICAgICBrID0gY2xhbXAoMC4zMCAqIG1hdGguaHlwb3QoYnggLSBvZ3gsIGJ5IC0gMTMuMCksIDAuOCwgNi41KQogICAgICAgICAgICB0eCwgdHkgPSBieCArIGRkeCAvIGRkZCAqIGssIGJ5ICsgZGR5IC8gZGRkICogawogICAgICAgICAgICBkdSA9IG1hdGguaHlwb3QodS54IC0gYngsIHUueSAtIGJ5KQogICAgICAgICAgICBkbyA9IG1hdGguaHlwb3Qoby54IC0gYngsIG8ueSAtIGJ5KQogICAgICAgICAgICBpZiBkdSA8IDAuOTIgYW5kIGR1ICsgMC4xMiA8IGRvOgogICAgICAgICAgICAgICAgdHgsIHR5ID0gYngsIGJ5CiAgICAgICAgICAgIHR4ID0gY2xhbXAodHgsIDAuNTUsIFcgLSAwLjU1KTsgdHkgPSBjbGFtcCh0eSwgMC41NSwgSCAtIDAuNTUpCiAgICAgICAgICAgIGNtZHNbdS5pbmRleF0gPSAobW92ZV9kaXIoc3QsIHUsIHR4LCB0eSwgbWUpLAogICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hdGguZGVncmVlcyhtYXRoLmF0YW4yKGJ5IC0gdS55LCBieCAtIHUueCkpICUgMzYwLjAsIEZhbHNlKQogICAgICAgICAgICByZXR1cm4gY21kcwogICAgICAgICMgbG9vc2UgYmFsbAogICAgICAgIHB0cyA9IGJhbGxfZnV0dXJlKHN0LCAxMDApCiAgICAgICAgZGVmIGl0aW1lKHEpOgogICAgICAgICAgICBpZiBxIGlzIE5vbmU6CiAgICAgICAgICAgICAgICByZXR1cm4gOTk5CiAgICAgICAgICAgIGZvciBraywgcHQgaW4gZW51bWVyYXRlKHB0cyk6CiAgICAgICAgICAgICAgICBpZiBtYXRoLmh5cG90KHB0WzBdIC0gcS54LCBwdFsxXSAtIHEueSkgPD0gTU9WICogKGtrICsgMSkgKiBEVCArIENSICogMC44OgogICAgICAgICAgICAgICAgICAgIHJldHVybiBrawogICAgICAgICAgICByZXR1cm4gOTk5CiAgICAgICAgb3VyX3QgPSBpdGltZSh1KQogICAgICAgIG91X3QgPSBpdGltZShvKQogICAgICAgIG1vdmluZ190b19nb2FsID0gKG1lID09IDAgYW5kIHN0LmJ2eCA8IC0yLjApIG9yIChtZSA9PSAxIGFuZCBzdC5idnggPiAyLjApCiAgICAgICAgaWYgKG91cl90IDwgOTk5IGFuZCBvdXJfdCA8PSBvdV90IC0gMikgb3IgKG91X3QgPj0gOTk5KToKICAgICAgICAgICAgdGd0ID0gcHRzW21pbihvdXJfdCwgbGVuKHB0cykgLSAxKV0gaWYgcHRzIGVsc2UgKGJ4LCBieSkKICAgICAgICAgICAgaWYgbWF0aC5oeXBvdCh1LnggLSBieCwgdS55IC0gYnkpIDwgMi4yOgogICAgICAgICAgICAgICAgdGd0ID0gKGJ4LCBieSkKICAgICAgICBlbGlmIG1vdmluZ190b19nb2FsIGFuZCBwdHM6CiAgICAgICAgICAgIGN5ID0gTm9uZQogICAgICAgICAgICBmb3IgKHB4LCBweSkgaW4gcHRzOgogICAgICAgICAgICAgICAgaWYgKG1lID09IDAgYW5kIHB4IDw9IGd4cCkgb3IgKG1lID09IDEgYW5kIHB4ID49IGd4cCk6CiAgICAgICAgICAgICAgICAgICAgY3kgPSBweQogICAgICAgICAgICAgICAgICAgIGJyZWFrCiAgICAgICAgICAgIGlmIGN5IGlzIG5vdCBOb25lOgogICAgICAgICAgICAgICAgdGd0ID0gKGd4cCwgY2xhbXAoY3ksIDEwLjc1LCAxNS4yNSkpCiAgICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICB0Z3QgPSAocHRzWy0xXVswXSwgcHRzWy0xXVsxXSkKICAgICAgICBlbHNlOgogICAgICAgICAgICBkZHgsIGRkeSA9IG9neCAtIGJ4LCAxMy4wIC0gYnkKICAgICAgICAgICAgZGRkID0gbWF0aC5oeXBvdChkZHgsIGRkeSkgb3IgMS4wCiAgICAgICAgICAgIGsgPSBjbGFtcCgwLjMwICogbWF0aC5oeXBvdChieCAtIG9neCwgYnkgLSAxMy4wKSwgMC44LCA2LjUpCiAgICAgICAgICAgIHRndCA9IChieCArIGRkeCAvIGRkZCAqIGssIGJ5ICsgZGR5IC8gZGRkICogaykKICAgICAgICB0eCA9IGNsYW1wKHRndFswXSwgMC41NSwgVyAtIDAuNTUpOyB0eSA9IGNsYW1wKHRndFsxXSwgMC41NSwgSCAtIDAuNTUpCiAgICAgICAgY21kc1t1LmluZGV4XSA9IChtb3ZlX2RpcihzdCwgdSwgdHgsIHR5LCBtZSksCiAgICAgICAgICAgICAgICAgICAgICAgICBtYXRoLmRlZ3JlZXMobWF0aC5hdGFuMihieSAtIHUueSwgYnggLSB1LngpKSAlIDM2MC4wLCBGYWxzZSkKICAgICAgICByZXR1cm4gY21kcwoKICAgIGtlZXBlciA9IG15WzBdCiAgICBmaWVsZGVycyA9IFt1IGZvciB1IGluIG15IGlmIHUuaW5kZXggIT0gMF0KICAgIG5mID0gbGVuKGZpZWxkZXJzKQogICAgb3duZXJfaXNfbWluZSA9IG93bmVyIGlzIG5vdCBOb25lIGFuZCBvd25lci50ZWFtID09IG1lCiAgICBhc3NpZ25lZCA9IHt9CiAgICB0YWtlbiA9IFtdCiAgICBpZiBvd25lcl9pc19taW5lIGFuZCBvd25lci5pbmRleCAhPSAwOgogICAgICAgIGFzc2lnbmVkW293bmVyLmluZGV4XSA9ICdjYXJyaWVyJwogICAgICAgIHRha2VuLmFwcGVuZCgob3duZXIueCwgb3duZXIueSkpCiAgICBiYWxsX2QgPSB7dS5pbmRleDogbWF0aC5oeXBvdCh1LnggLSBieCwgdS55IC0gYnkpIGZvciB1IGluIGZpZWxkZXJzfQogICAgb3JkZXJlZCA9IHNvcnRlZChmaWVsZGVycywga2V5PWxhbWJkYSB1OiBiYWxsX2RbdS5pbmRleF0pCiAgICBiYWxsX2RlZXAgPSAoYnggLSBvZ3gpICogQVRLW21lXSA8IDE1LjAKICAgIGlmIG5vdCBvd25lcl9pc19taW5lIGFuZCBvcmRlcmVkOgogICAgICAgIGFzc2lnbmVkW29yZGVyZWRbMF0uaW5kZXhdID0gJ2NoYXNlJwogICAgcmVzdCA9IFt1IGZvciB1IGluIG9yZGVyZWQgaWYgdS5pbmRleCBub3QgaW4gYXNzaWduZWRdCiAgICAjIHRpbnkgc3F1YWRzOiB0aGUgbG9uZSBmaWVsZGVyIG11c3Qgbm90IGNoYXNlIGhvcGVsZXNzbHkgdXBmaWVsZAogICAgc29sb19ndWFyZCA9IChuZiA9PSAxIGFuZCBub3Qgb3duZXJfaXNfbWluZSkKICAgIG5fZGVmID0gMAogICAgaWYgbmYgPj0gMjoKICAgICAgICBuX2RlZiA9IDEKICAgIGlmIChvd25lciBpcyBub3QgTm9uZSBhbmQgb3duZXIudGVhbSAhPSBtZSBhbmQgYmFsbF9kZWVwIGFuZCBuZiA+PSAzKToKICAgICAgICBuX2RlZiA9IDIKICAgIGZvciB1IGluIHJlc3RbOm5fZGVmXToKICAgICAgICBhc3NpZ25lZFt1LmluZGV4XSA9ICdjb3ZlcicKICAgIHJlc3QgPSByZXN0W25fZGVmOl0KICAgIGZvciB1IGluIHJlc3Q6CiAgICAgICAgYXNzaWduZWRbdS5pbmRleF0gPSAnZm9yd2FyZCcKCiAgICAjIHByZWRpY3RlZCB0YXJnZXQgZm9yIGV2ZXJ5IG5vbi1jYXJyaWVyIGZpZWxkZXIgKHVzZWQgdG8gbGVhZCBwYXNzZXMpCiAgICBtYXRlX3RhcmdldHMgPSB7fQogICAgcHRzNDAgPSBiYWxsX2Z1dHVyZShzdCwgNDApCiAgICBmeCwgZnkgPSAocHRzNDBbbWluKGxlbihwdHM0MCkgLSAxLCAyMCldIGlmIHB0czQwIGVsc2UgKGJ4LCBieSkpCiAgICBzaWRlID0gMAogICAgZm9yIHUgaW4gZmllbGRlcnM6CiAgICAgICAga2luZCA9IGFzc2lnbmVkLmdldCh1LmluZGV4KQogICAgICAgIGlmIGtpbmQgPT0gJ2NvdmVyJzoKICAgICAgICAgICAgdGd0ID0gc3VwcG9ydF9zcG90KHN0LCBtZSwgb3BwLCBmeCwgZnksIHRha2VuKQogICAgICAgICAgICBtYXRlX3RhcmdldHNbdS5pbmRleF0gPSB0Z3QKICAgICAgICAgICAgdGFrZW4uYXBwZW5kKHRndCkKICAgICAgICBlbGlmIGtpbmQgPT0gJ2ZvcndhcmQnOgogICAgICAgICAgICBzcG90ID0gcGlja19mb3J3YXJkX3Nwb3Qoc3QsIHUsIG1lLCBvcHAsIHRha2VuLCBzaWRlKQogICAgICAgICAgICBzaWRlICs9IDEKICAgICAgICAgICAgbWF0ZV90YXJnZXRzW3UuaW5kZXhdID0gc3BvdAogICAgICAgICAgICB0YWtlbi5hcHBlbmQoc3BvdCkKICAgICAgICBlbGlmIGtpbmQgPT0gJ2NoYXNlJzoKICAgICAgICAgICAgcHRzID0gYmFsbF9mdXR1cmUoc3QsIDYwKQogICAgICAgICAgICBtYXRlX3RhcmdldHNbdS5pbmRleF0gPSAocHRzW21pbihsZW4ocHRzKSAtIDEsIDE4KV0gaWYgcHRzIGVsc2UgKGJ4LCBieSkpCgogICAgIyBjb21tYW5kcwogICAgbWF0ZXNfYWxsID0gbGlzdChmaWVsZGVycykKICAgIGlmIG93bmVyX2lzX21pbmU6CiAgICAgICAgaWYgb3duZXIuaW5kZXggPT0gMDoKICAgICAgICAgICAgY20gPSBjYXJyaWVyX2NtZHMoc3QsIGtlZXBlciwgbWUsIG9wcCwgbWF0ZXNfYWxsLCBtYXRlX3RhcmdldHM9bWF0ZV90YXJnZXRzLCBwcmVmZXJfa2ljaz1UcnVlKQogICAgICAgICAgICBpZiBub3QgY21bMl06CiAgICAgICAgICAgICAgICBjbCA9IGNsZWFyX3Njb3JlKHN0LCBrZWVwZXIsIG1lLCBvcHApCiAgICAgICAgICAgICAgICBpZiBjbCBpcyBub3QgTm9uZToKICAgICAgICAgICAgICAgICAgICBhbmcgPSBjbFsxXQogICAgICAgICAgICAgICAgICAgIGNtID0gKG1vdmVfZGlyKHN0LCBrZWVwZXIsIGtlZXBlci54ICsgbWF0aC5jb3MoYW5nKSwKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBrZWVwZXIueSArIG1hdGguc2luKGFuZyksIG1lLCBhbGxvd19ib3g9VHJ1ZSksCiAgICAgICAgICAgICAgICAgICAgICAgICAgbWF0aC5kZWdyZWVzKGFuZykgJSAzNjAuMCwgVHJ1ZSkKICAgICAgICAgICAgY21kc1swXSA9IGNtCiAgICAgICAgZWxzZToKICAgICAgICAgICAgY21kc1tvd25lci5pbmRleF0gPSBjYXJyaWVyX2NtZHMoc3QsIG93bmVyLCBtZSwgb3BwLCBtYXRlc19hbGwsIG1hdGVfdGFyZ2V0cz1tYXRlX3RhcmdldHMpCiAgICAgICAgICAgIGNtZHNbMF0gPSBrZWVwZXJfY21kcyhzdCwga2VlcGVyLCBtZSwgb3BwLCBuKQogICAgZWxzZToKICAgICAgICBjbWRzWzBdID0ga2VlcGVyX2NtZHMoc3QsIGtlZXBlciwgbWUsIG9wcCwgbikKCiAgICBmb3IgdSBpbiBmaWVsZGVyczoKICAgICAgICBraW5kID0gYXNzaWduZWQuZ2V0KHUuaW5kZXgpCiAgICAgICAgaWYga2luZCA9PSAnY2Fycmllcic6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgdGd0ID0gbWF0ZV90YXJnZXRzLmdldCh1LmluZGV4LCAoYngsIGJ5KSkKICAgICAgICBpZiBvd25lciBpcyBOb25lIGFuZCBtYXRoLmh5cG90KHUueCAtIGJ4LCB1LnkgLSBieSkgPCA5LjAgYW5kIGtpbmQgIT0gJ2NvdmVyJzoKICAgICAgICAgICAgdGd0ID0gc2FmZV9wdChtZSwgYngsIGJ5LCBTQUZFKQogICAgICAgIGlmIGtpbmQgPT0gJ2NoYXNlJyBhbmQgb3duZXIgaXMgbm90IE5vbmUgYW5kIG93bmVyLnRlYW0gIT0gbWU6CiAgICAgICAgICAgIG8gPSBvd25lcgogICAgICAgICAgICBkID0gbWF0aC5oeXBvdCh1LnggLSBvLngsIHUueSAtIG8ueSkKICAgICAgICAgICAgaWYgc29sb19ndWFyZDoKICAgICAgICAgICAgICAgIGRkeCwgZGR5ID0gb2d4IC0gc3QuYngsIDEzLjAgLSBzdC5ieQogICAgICAgICAgICAgICAgZGQgPSBtYXRoLmh5cG90KGRkeCwgZGR5KSBvciAxLjAKICAgICAgICAgICAgICAgIGRnb2FsX2IgPSBtYXRoLmh5cG90KHN0LmJ4IC0gb2d4LCBzdC5ieSAtIDEzLjApCiAgICAgICAgICAgICAgICBrayA9IGNsYW1wKDAuMzAgKiBkZ29hbF9iLCAwLjgsIDYuNSkKICAgICAgICAgICAgICAgIHR4LCB0eSA9IHN0LmJ4ICsgZGR4IC8gZGQgKiBraywgc3QuYnkgKyBkZHkgLyBkZCAqIGtrCiAgICAgICAgICAgICAgICBpZiBkIDwgMC45NSBhbmQgZCArIDAuMTIgPCBtYXRoLmh5cG90KG8ueCAtIHN0LmJ4LCBvLnkgLSBzdC5ieSk6CiAgICAgICAgICAgICAgICAgICAgdHgsIHR5ID0gc3QuYngsIHN0LmJ5CiAgICAgICAgICAgIGVsaWYgZCA8IDEuMDU6CiAgICAgICAgICAgICAgICB0eCwgdHkgPSBvLngsIG8ueQogICAgICAgICAgICBlbHNlOgogICAgICAgICAgICAgICAgdHggPSBvLnggKyAob2d4IC0gby54KSAqIDAuMDQKICAgICAgICAgICAgICAgIHR5ID0gby55ICsgKDEzLjAgLSBvLnkpICogMC4wNAogICAgICAgICAgICBjbWRzW3UuaW5kZXhdID0gKG1vdmVfZGlyKHN0LCB1LCB0eCwgdHksIG1lKSwKICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRoLmRlZ3JlZXMobWF0aC5hdGFuMihvLnkgLSB1LnksIG8ueCAtIHUueCkpICUgMzYwLjAsIEZhbHNlKQogICAgICAgICAgICBjb250aW51ZQogICAgICAgIGlmIGtpbmQgPT0gJ2NoYXNlJyBhbmQgb3duZXIgaXMgTm9uZSBhbmQgc29sb19ndWFyZDoKICAgICAgICAgICAgIyBsb29zZSBiYWxsOiBndWFyZCBpZiB0aGUgb3Bwb25lbnQgd2lucyB0aGUgcmFjZQogICAgICAgICAgICBwdHMgPSBiYWxsX2Z1dHVyZShzdCwgODApCiAgICAgICAgICAgIGRlZiBpdGltZShxKToKICAgICAgICAgICAgICAgIGlmIHEgaXMgTm9uZToKICAgICAgICAgICAgICAgICAgICByZXR1cm4gOTk5CiAgICAgICAgICAgICAgICBmb3Iga2ssIHB0IGluIGVudW1lcmF0ZShwdHMpOgogICAgICAgICAgICAgICAgICAgIGlmIG1hdGguaHlwb3QocHRbMF0gLSBxLngsIHB0WzFdIC0gcS55KSA8PSBNT1YgKiAoa2sgKyAxKSAqIERUICsgQ1IgKiAwLjg6CiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBrawogICAgICAgICAgICAgICAgcmV0dXJuIDk5OQogICAgICAgICAgICBvdSA9IFt4IGZvciB4IGluIG9wcF0KICAgICAgICAgICAgb3VfdCA9IG1pbihbaXRpbWUoeCkgZm9yIHggaW4gb3VdIG9yIFs5OTldKQogICAgICAgICAgICBvdXJfdCA9IGl0aW1lKHUpCiAgICAgICAgICAgIGlmIG5vdCAob3VyX3QgPCA5OTkgYW5kIG91cl90IDw9IG91X3QgLSAyKToKICAgICAgICAgICAgICAgIGRkeCwgZGR5ID0gb2d4IC0gc3QuYngsIDEzLjAgLSBzdC5ieQogICAgICAgICAgICAgICAgZGQgPSBtYXRoLmh5cG90KGRkeCwgZGR5KSBvciAxLjAKICAgICAgICAgICAgICAgIGRnb2FsX2IgPSBtYXRoLmh5cG90KHN0LmJ4IC0gb2d4LCBzdC5ieSAtIDEzLjApCiAgICAgICAgICAgICAgICBrayA9IGNsYW1wKDAuMzAgKiBkZ29hbF9iLCAwLjgsIDYuNSkKICAgICAgICAgICAgICAgIHR4LCB0eSA9IHN0LmJ4ICsgZGR4IC8gZGQgKiBraywgc3QuYnkgKyBkZHkgLyBkZCAqIGtrCiAgICAgICAgICAgICAgICBjbWRzW3UuaW5kZXhdID0gKG1vdmVfZGlyKHN0LCB1LCB0eCwgdHksIG1lKSwKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF0aC5kZWdyZWVzKG1hdGguYXRhbjIoc3QuYnkgLSB1LnksIHN0LmJ4IC0gdS54KSkgJSAzNjAuMCwgRmFsc2UpCiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgIHR4LCB0eSA9IHNhZmVfcHQobWUsIHRndFswXSwgdGd0WzFdLCBTQUZFKQogICAgICAgIGFpbSA9IG1hdGguZGVncmVlcyhtYXRoLmF0YW4yKDEzLjAgLSB1LnksIGd4IC0gdS54KSkgJSAzNjAuMAogICAgICAgIGNtZHNbdS5pbmRleF0gPSAobW92ZV9kaXIoc3QsIHUsIHR4LCB0eSwgbWUpLCBhaW0sIEZhbHNlKQogICAgcmV0dXJuIGNtZHMKCgpkZWYgb3BwX21vZGVsKHN0LCBvLCBtZSk6CiAgICAiIiJzaW1wbGUgZm9yZWNhc3Q6IG9wcG9uZW50cyBjaGFzZSB0aGUgYmFsbCdzIHByZWRpY3RlZCBwb3NpdGlvbi4iIiIKICAgIHB0cyA9IGJhbGxfZnV0dXJlKHN0LCA0MCkKICAgIHR4LCB0eSA9IChwdHNbbWluKGxlbihwdHMpIC0gMSwgMTIpXSBpZiBwdHMgZWxzZSAoc3QuYngsIHN0LmJ5KSkKICAgIHJldHVybiAobW92ZV9kaXIoc3QsIG8sIHR4LCB0eSwgMSAtIG1lKSwgTm9uZSwgRmFsc2UpCgoKZGVmIGRlY2lkZShzMCwgbWUsIG4sIEEpOgogICAgIiIiUmV0dXJuIGxpc3Qgb2YgMjAgZnJhbWVzOiBlYWNoIGZyYW1lIGlzIHsodGVhbSxpbmRleCk6IChkaXIsYWltLGtpY2spfS4iIiIKICAgIF9TVFsnZm9yY2UnXSA9IEZhbHNlCiAgICB0cnk6CiAgICAgICAgb3QgPSBzMC51bml0c1tzMC5vd25lcl0udGVhbSBpZiBzMC5vd25lciA+PSAwIGVsc2UgLTEKICAgICAgICBfU1RbJ2hpc3QnXS5hcHBlbmQoKHMwLmZyYW1lLCBzMC5ieCwgczAuYnksIG90KSkKICAgICAgICBfU1RbJ2hpc3QnXSA9IFtoIGZvciBoIGluIF9TVFsnaGlzdCddIGlmIHMwLmZyYW1lIC0gaFswXSA8PSA0MF0KICAgICAgICBoID0gX1NUWydoaXN0J10KICAgICAgICBpZiBsZW4oaCkgPj0gMyBhbmQgaFstMV1bM10gPT0gbWU6CiAgICAgICAgICAgIHhzID0gW3FbMV0gZm9yIHEgaW4gaF0KICAgICAgICAgICAgeXMgPSBbcVsyXSBmb3IgcSBpbiBoXQogICAgICAgICAgICBpZiBtYXgoeHMpIC0gbWluKHhzKSA8IDEuNiBhbmQgbWF4KHlzKSAtIG1pbih5cykgPCAxLjY6CiAgICAgICAgICAgICAgICBfU1RbJ2ZvcmNlJ10gPSBUcnVlCiAgICBleGNlcHQgRXhjZXB0aW9uOgogICAgICAgIHBhc3MKICAgIHN0ID0gczAuY2xvbmUoKQogICAgZnJhbWVzID0gW10KICAgIGZvciBmIGluIHJhbmdlKDIwKToKICAgICAgICBpZiBzdC5zdGF0dXMgIT0gJ3BsYXlpbmcnOgogICAgICAgICAgICBicmVhawogICAgICAgIGNtZHMgPSBmcmFtZV9jbWRzKHN0LCBtZSkKICAgICAgICBpbnAgPSBbXQogICAgICAgIGZvciB1IGluIHN0LnVuaXRzOgogICAgICAgICAgICBpZiB1LnRlYW0gPT0gbWU6CiAgICAgICAgICAgICAgICBjID0gY21kcy5nZXQodS5pbmRleCkgb3IgKCdOJywgTm9uZSwgRmFsc2UpCiAgICAgICAgICAgICAgICBhaW0gPSBOb25lCiAgICAgICAgICAgICAgICBpZiBjWzFdIGlzIG5vdCBOb25lOgogICAgICAgICAgICAgICAgICAgIGEgPSBtYXRoLnJhZGlhbnMoY1sxXSAlIDM2MC4wKQogICAgICAgICAgICAgICAgICAgIGFpbSA9IChtYXRoLmNvcyhhKSwgbWF0aC5zaW4oYSkpCiAgICAgICAgICAgICAgICBpbnAuYXBwZW5kKChjWzBdLCBhaW0sIGJvb2woY1syXSkpKQogICAgICAgICAgICBlbHNlOgogICAgICAgICAgICAgICAgaW5wLmFwcGVuZChvcHBfbW9kZWwoc3QsIHUsIG1lKSkKICAgICAgICBmcmFtZXMuYXBwZW5kKGRpY3QoKGssIHYpIGZvciBrLCB2IGluCiAgICAgICAgICAgICAgICAgICAgICAgICAgIFsoKHUudGVhbSwgdS5pbmRleCksIGlucFtpXSkgZm9yIGksIHUgaW4gZW51bWVyYXRlKHN0LnVuaXRzKV0pKQogICAgICAgIGcgPSBBLnN0ZXAoc3QsIGlucCkKICAgICAgICBpZiBnID49IDA6CiAgICAgICAgICAgIHN0LnNjb3JlW2ddICs9IDEKICAgICAgICAgICAgaWYgc3QuZ29sZGVuOgogICAgICAgICAgICAgICAgc3Quc3RhdHVzID0gJ2ZpbmlzaGVkJwogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgQS5raWNrb2ZmKHN0LCAxIC0gZykKICAgIHdoaWxlIGxlbihmcmFtZXMpIDwgMjA6CiAgICAgICAgZnJhbWVzLmFwcGVuZCh7fSkKICAgIHJldHVybiBmcmFtZXMK'
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
            if obs.get('freeze', 0) > 0 or obs.get('status') not in (None, 'playing'):
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

