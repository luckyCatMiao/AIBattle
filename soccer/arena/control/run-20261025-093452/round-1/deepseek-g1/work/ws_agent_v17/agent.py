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


def safe_spot(my_team, x, y, margin=0.75):
    """把目标点推出对方禁区（留 margin）。"""
    b = opp_box_of(my_team)
    x = clamp(x, 0.45, FIELD_W - 0.45)
    y = clamp(y, 0.45, FIELD_H - 0.45)
    if not in_box(1 - my_team, x, y):
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
    bt = 1 - my_team
    best, bestv = 'N', -3.0
    for name in DIR8:
        vx, vy = DIR_VEC[name]
        v = vx * ux + vy * uy
        if forbid_box:
            # look 4 frames ahead; a hard penalty keeps us out of the opponent box
            nx, ny = u.x + vx * SPD * DT * 4.0, u.y + vy * SPD * DT * 4.0
            if in_box(bt, nx, ny):
                v -= 3.0
            nx2, ny2 = u.x + vx * SPD * DT * 8.0, u.y + vy * SPD * DT * 8.0
            if in_box(bt, nx2, ny2):
                v -= 1.2
            # if currently hugging the edge, push away
            if in_box(bt, u.x + vx * SPD * DT * 6.0, u.y + vy * SPD * DT * 6.0):
                v -= 0.6
        if v > bestv:
            bestv, best = v, name
    if bestv < -2.0:
        # every direction enters the box: step away from the box centre
        b = PBOX2[bt]
        cx, cy = (b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0
        ax, ay = u.x - cx, u.y - cy
        al = hyp(ax, ay) or 1.0
        best, bv = 'N', -9.0
        for name in DIR8:
            vx, vy = DIR_VEC[name]
            v = vx * ax / al + vy * ay / al
            if v > bv:
                bv, best = v, name
    return best


def sim_pos(x, y, dname, frames, speed, my_team):
    vx, vy = DIR_VEC[dname]
    for _ in range(frames):
        nx, ny = x + vx * speed * DT, y + vy * speed * DT
        nx = clamp(nx, R_U, FIELD_W - R_U)
        ny = clamp(ny, R_U, FIELD_H - R_U)
        if in_box(1 - my_team, nx, ny):
            if not in_box(1 - my_team, nx, y):
                x = nx
            elif not in_box(1 - my_team, x, ny):
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
        if sh is not None and sh[1] > SHOT_TH:
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
        cands.sort(reverse=True)
        if cands and cands[0][0] >= KICK_MIN:
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


def frame_commands(st, me):
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


def decide_window(s0, me, n):
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
            fr = decide_window(st, me, n)
            out = []
            for f in fr:
                if f is None:
                    out.append(neutral_frame(n))
                else:
                    row = []
                    for u in st.units:
                        if u.team != me:
                            continue
                        d, aim, kick = f[st.units.index(u)]
                        deg = None
                        if aim is not None:
                            deg = round(math.degrees(math.atan2(aim[1], aim[0])) % 360.0, 2)
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

