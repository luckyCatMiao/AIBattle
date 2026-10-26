#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""deepseek-g1 v2: planner-based soccer agent."""

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
                 'status', 'half', 'n', 'freeKickTeam', 'freeKickFrames',
                 'spawns', 'seed', 'tl')

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
        s.freeKickTeam, s.freeKickFrames = self.freeKickTeam, self.freeKickFrames
        s.spawns, s.seed, s.tl = self.spawns, self.seed, self.tl
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
    gl = obs.get('goldenLeft')
    if s.golden and gl is not None:
        s.goldenEnd = s.frame + int(round(float(gl) * HZ))
    else:
        s.goldenEnd = 0
    s.seed = int(obs.get('seed') or 0)
    s.kickoffTeam = abs(s.seed) % 2
    s.status = 'playing'
    s.half = int(obs.get('half') or 1)
    s.freeKickTeam = -1
    s.freeKickFrames = 0
    s.tl = float(obs.get('timeLeft') or 120.0)
    mp = obs.get('map') or {}
    sp = mp.get('spawns') or {}
    if sp:
        s.spawns = {int(k): [(float(a), float(b)) for a, b in v] for k, v in sp.items()}
    else:
        s.spawns = None
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
    s.freeKickTeam = -1
    s.freeKickFrames = 0
    s.spawns = None
    s.seed = 0
    s.tl = 120.0
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
    fk = (s.freeKickFrames > 0)
    fkt = s.freeKickTeam
    if s.owner >= 0:
        owner = s.units[s.owner]
        ownerD = math.hypot(owner.x - s.bx, owner.y - s.by)
        best = None
        bd = 1e18
        for i, u in enumerate(s.units):
            if u.team == owner.team or u.stealLock > 0 or u.controlLock > 0:
                continue
            if fk and u.team != fkt:
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
        if fk and u.team != fkt:
            continue
        d = math.hypot(u.x - s.bx, u.y - s.by)
        if d < bd:
            bd = d
            best = u
    winner = best
    if best is not None:
        for x in s.units:
            if x.team == kickoff_team and x.controlLock <= 0 and x.stealLock <= 0:
                if fk and x.team != fkt:
                    continue
                if math.hypot(x.x - s.bx, x.y - s.by) <= bd + 0.06:
                    winner = x
                    break
    if winner is not None and math.hypot(winner.x - s.bx, winner.y - s.by) < CTRL:
        s.owner = s.units.index(winner)
        s.lastTouch = unit_id(winner)
        s.lastTeam = winner.team
        s.bvx = 0.0
        s.bvy = 0.0
        if fk and winner.team == fkt:
            s.freeKickFrames = 0


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
    s.freeKickTeam = 1 - u.team
    s.freeKickFrames = int(round(2.0 * HZ))
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
            kickoff(s, 1 - s.kickoffTeam)
        if s.frame >= match_frames:
            if s.score[0] == s.score[1]:
                s.golden = True
                s.goldenEnd = s.frame + int(round(20 * HZ))
            else:
                s.status = 'finished'
    elif s.frame >= s.goldenEnd:
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
    if s.freeKickFrames > 0:
        s.freeKickFrames -= 1
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
        if s.spawns:
            sx, sy = s.spawns[u.team][u.index]
            u.x, u.y = sx + 0.5, sy + 0.5
        else:
            u.x = (11 if u.team == 0 else W - 12) + 0.5
            u.y = ys[u.index] + 0.5
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
    s.freeKickTeam = -1
    s.freeKickFrames = 0


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






# ======================================================================
#  v2 strategy: model-based planner
# ======================================================================

FIELD_W = 44.0
FIELD_H = 26.0
MY_GOAL_X = {0: 1.0, 1: 43.0}
OPP_GOAL_X = {0: 43.0, 1: 1.0}
ATK = {0: 1.0, 1: -1.0}
PBOX2 = {0: (1.0, 6.0, 10.0, 20.0), 1: (34.0, 6.0, 43.0, 20.0)}
MOUTH_LO = 10.5
MOUTH_HI = 15.5
CR = 0.82
SPD = 3.15
DRIBF = 0.58
KICKP = 11.0
FRIC = 0.978
WALLR = 0.72
R_B = 0.22
R_U = 0.34
KICK_OFF = 0.59
KEEPER_TRACK = 2.6
BOX_M = 0.62
DIR8 = ('R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR')
S2 = 0.7071067811865476
DIRV8 = {'R': (1, 0), 'DR': (S2, S2), 'D': (0, 1), 'DL': (-S2, S2),
         'L': (-1, 0), 'UL': (-S2, -S2), 'U': (0, -1), 'UR': (S2, -S2)}
DEBUG = bool(os.environ.get('SOC3_DEBUG'))
_LOG = os.environ.get('SOC3_LOG')


def dbg(o):
    if _LOG:
        try:
            with open(_LOG, 'a', encoding='utf-8') as fh:
                fh.write(json.dumps(o, ensure_ascii=False) + '\n')
        except Exception:
            pass


class Cmd(object):
    __slots__ = ('dir', 'aim', 'kick')

    def __init__(self, d='N', aim=None, kick=False):
        self.dir = d
        self.aim = aim
        self.kick = kick


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


def in_box(team, x, y):
    b = PBOX2[team]
    return b[0] <= x <= b[2] and b[1] <= y <= b[3]


def infl_box(me, m=BOX_M):
    b = PBOX2[1 - me]
    return (b[0] - m, b[2] + m, b[1] - m, b[3] + m)


def in_infl(me, x, y, m=BOX_M):
    x1, x2, y1, y2 = infl_box(me, m)
    return x1 <= x <= x2 and y1 <= y <= y2


def push_out(me, x, y, m=BOX_M):
    x = clamp(x, 0.45, FIELD_W - 0.45)
    y = clamp(y, 0.45, FIELD_H - 0.45)
    if not in_infl(me, x, y, m):
        return x, y
    b = PBOX2[1 - me]
    cands = []
    if b[0] > 1.5:
        cands.append((b[0] - m - 0.05, y))
    if b[2] < FIELD_W - 1.5:
        cands.append((b[2] + m + 0.05, y))
    cands.append((x, b[1] - m - 0.05))
    cands.append((x, b[3] + m + 0.05))
    best = None
    for cx, cy in cands:
        cx = clamp(cx, 0.45, FIELD_W - 0.45)
        cy = clamp(cy, 0.45, FIELD_H - 0.45)
        if in_infl(me, cx, cy, m):
            continue
        d = (cx - x) ** 2 + (cy - y) ** 2
        if best is None or d < best[0]:
            best = (d, cx, cy)
    if best is None:
        return x, y
    return best[1], best[2]


def seg_blocked(me, x1, y1, x2, y2, m=BOX_M):
    dx, dy = x2 - x1, y2 - y1
    n = max(4, int(math.hypot(dx, dy) / 0.25))
    for i in range(n + 1):
        t = i / float(n)
        if in_infl(me, x1 + dx * t, y1 + dy * t, m):
            return True
    return False


def gateways(me):
    if ATK[me] > 0:
        xg = 34.0 - BOX_M - 0.05
    else:
        xg = 10.0 + BOX_M + 0.05
    return xg, 5.1, 20.9


def route_point(me, ux, uy, tx, ty):
    tx, ty = push_out(me, tx, ty)
    if not seg_blocked(me, ux, uy, tx, ty):
        return tx, ty
    xg, yt, yb = gateways(me)
    cands = []
    for gy in (yt, yb):
        a = seg_blocked(me, ux, uy, xg, gy)
        b = seg_blocked(me, xg, gy, tx, ty)
        d = math.hypot(xg - ux, gy - uy) + math.hypot(tx - xg, ty - gy)
        cands.append((a + b, d, xg, gy))
    cands.sort()
    if cands[0][0] > 0:
        # fall back: whichever gateway has fewer blocked samples
        return cands[0][2], cands[0][3]
    return cands[0][2], cands[0][3]


def move_dir_to(ux, uy, tx, ty, me, allow_box=False, m=BOX_M):
    if allow_box:
        dx, dy = tx - ux, ty - uy
        d = math.hypot(dx, dy)
        if d < 1e-6:
            return 'N'
        ux2, uy2 = dx / d, dy / d
        best, bv = 'N', -2.0
        for nm in DIR8:
            vx, vy = DIRV8[nm]
            v = vx * ux2 + vy * uy2
            if v > bv:
                bv, best = v, nm
        return best
    wx, wy = route_point(me, ux, uy, tx, ty)
    dx, dy = wx - ux, wy - uy
    d = math.hypot(dx, dy)
    if d < 0.10:
        dx, dy = tx - ux, ty - uy
        d = math.hypot(dx, dy)
        if d < 0.06:
            return 'N'
    ux2, uy2 = dx / d, dy / d
    best, bv = 'N', -2.0
    for nm in DIR8:
        vx, vy = DIRV8[nm]
        v = vx * ux2 + vy * uy2
        nx, ny = ux + vx * SPD * DT * 3.0, uy + vy * SPD * DT * 3.0
        if in_infl(me, nx, ny, m):
            v -= 2.0
        if v > bv:
            bv, best = v, nm
    return best


def ang_to(ux, uy, tx, ty):
    return math.degrees(math.atan2(ty - uy, tx - ux)) % 360.0


def kick_origin(u, ang):
    a = math.radians(ang)
    fx, fy = math.cos(a), math.sin(a)
    ox, oy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
    if ball_hits_wall(ox, oy):
        ox, oy = u.x, u.y
    return ox, oy, fx, fy


def flight(bx, by, ang, maxf=150):
    """Exact ball physics (same as engine); returns (path, goal_frame, goal_team)."""
    a = math.radians(ang)
    vx, vy = KICKP * math.cos(a), KICKP * math.sin(a)
    x, y = bx, by
    path = []
    for f in range(maxf):
        for _ in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if MOUTH_LO <= y <= MOUTH_HI:
                if x <= 1.0:
                    return path, f + 1, 1
                if x >= FIELD_W - 1.0:
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


class WCtx(object):
    __slots__ = ('ball0', 'opps', 'prev', 'frame0', 'me', 'mode', 'passp', 'shot_cache')

    def __init__(self):
        self.ball0 = (FIELD_W / 2.0, FIELD_H / 2.0)
        self.opps = []
        self.prev = {}
        self.frame0 = 0
        self.me = 0
        self.mode = 'normal'
        self.passp = None
        self.shot_cache = {}


def build_wctx(st, prev_obs, me, mode):
    w = WCtx()
    w.ball0 = (st.bx, st.by)
    w.frame0 = st.frame
    w.me = me
    w.mode = mode
    mygx = MY_GOAL_X[me]
    prev_pos = {}
    if prev_obs:
        for u in prev_obs.get('units', []):
            prev_pos[(int(u['team']), int(u['index']))] = (float(u['x']), float(u['y']))
    for u in st.units:
        if u.team == me:
            continue
        o = {'pos': (u.x, u.y), 'keeper': (u.index == 0), 'committed': [],
             'pos20': (u.x, u.y), 'key': (u.team, u.index)}
        vx = vy = 0.0
        pp = prev_pos.get((u.team, u.index))
        if pp is not None:
            dx, dy = u.x - pp[0], u.y - pp[1]
            if math.hypot(dx, dy) < 3.6:
                vx, vy = dx, dy
        ln = math.hypot(vx, vy)
        if ln > SPD:
            vx *= SPD / ln
            vy *= SPD / ln
        if u.index == 0 and not (st.owner >= 0 and st.units[st.owner] is u):
            # Sol-style goalkeeper: fixed depth on the ball-goal centre line
            dx, dy = w.ball0[0] - mygx, w.ball0[1] - 13.0
            D = math.hypot(dx, dy) or 1.0
            k = min(KEEPER_TRACK, max(0.6, D * 0.6))
            tgt = (mygx + dx / D * k, 13.0 + dy / D * k)
            px, py = u.x, u.y
            for f in range(20):
                ddx, ddy = tgt[0] - px, tgt[1] - py
                dd = math.hypot(ddx, ddy)
                if dd > 1e-6:
                    stp = min(SPD * DT, dd)
                    px += ddx / dd * stp
                    py += ddy / dd * stp
                o['committed'].append((px, py))
            o['pos20'] = (px, py)
        else:
            for f in range(1, 21):
                px = clamp(u.x + vx * f / 20.0, R_U, FIELD_W - R_U)
                py = clamp(u.y + vy * f / 20.0, R_U, FIELD_H - R_U)
                o['committed'].append((px, py))
            o['pos20'] = o['committed'][-1]
        w.opps.append(o)
    return w


def opp_reach_block(path, st, w, me, shooter=None, extra=0.10, include_mates=True):
    """Return (block_frame, worst_margin)."""
    worst = 1e9
    for i, (bx, by) in enumerate(path):
        f = i + 1
        for o in w.opps:
            if f <= 20:
                ox, oy = o['committed'][f - 1]
                reach = 0.0
            else:
                ox, oy = o['pos20']
                reach = SPD * (f - 20) / 20.0
            m = math.hypot(ox - bx, oy - by) - CR - reach - extra
            if m < worst:
                worst = m
            if m <= 0.0:
                return f, worst
        if include_mates:
            for p in st.units:
                if p.team != me or p is shooter:
                    continue
                m = math.hypot(p.x - bx, p.y - by) - CR - extra
                if m < worst:
                    worst = m
                if m <= 0.0:
                    return f, worst
    return None, worst


# ---------------------------------------------------------------- decisions
def choose_shot(st, u, me, w, risky=False):
    ci = _find_uidx(st, u)
    if ci < 0 or st.owner != ci or u.kickCd > 0 or u.controlLock > 0:
        return None
    key = (u.index, int(round(u.x * 2.0)), int(round(u.y * 2.0)))
    if key in w.shot_cache:
        return w.shot_cache[key]
    gx = OPP_GOAL_X[me]
    cx, cy = u.x, u.y
    D = math.hypot(gx - cx, 13.0 - cy)
    if D > 26.5 or D < 1.2:
        w.shot_cache[key] = None
        return None
    base = math.atan2(13.0 - cy, gx - cx)
    spread = math.atan2(3.4, max(2.2, D))
    best = None
    best_risk = None
    N = 30
    for i in range(N + 1):
        t = -1.14 + 2.28 * i / N
        ang = (math.degrees(base) + math.degrees(spread) * t) % 360.0
        ox, oy, fx, fy = kick_origin(u, ang)
        path, gf, gteam = flight(ox, oy, ang)
        if gf is None:
            continue
        block, margin = opp_reach_block(path, st, w, me, shooter=u, extra=0.12)
        if block is None and margin >= 0.55:
            q = 1000.0 - gf * 2.0 + min(margin, 3.0) * 4.0 - D * 0.25
            if best is None or q > best[1]:
                best = (ang, q, gf, margin)
        elif block is None:
            sc = margin - gf * 0.02
            if best_risk is None or sc > best_risk[1]:
                best_risk = (ang, sc, gf, margin)
        else:
            sc = margin - gf * 0.02
            if best_risk is None or sc > best_risk[1]:
                best_risk = (ang, sc, gf, margin)
    if best is not None:
        w.shot_cache[key] = best
        return best
    if best_risk is not None:
        # near-clear shot: take it when close, when desperate, or when the keeper is far out
        kx, ky = keeper_pred(w)
        keeper_out = (math.hypot(kx - OPP_GOAL_X[me], ky - 13.0) > 4.2) or \
                     (abs(kx - OPP_GOAL_X[me]) > 3.2)
        if best_risk[1] > 0.02 or (D < 12.5 and best_risk[1] > -0.15) or \
                (risky and best_risk[1] > -0.55) or (keeper_out and best_risk[1] > -0.25):
            w.shot_cache[key] = best_risk
            return best_risk
    w.shot_cache[key] = None
    return None


def choose_pass(st, u, me, w, pressure):
    ci = _find_uidx(st, u)
    if ci < 0 or st.owner != ci or u.kickCd > 0 or u.controlLock > 0:
        return None
    mates = [m for m in st.units if m.team == me and m is not u]
    if not mates:
        return None
    gx = OPP_GOAL_X[me]
    best = None
    for m in mates:
        mdx, mdy = gx - m.x, 13.0 - m.y
        ml = math.hypot(mdx, mdy) or 1.0
        for lead in (0.0, 6.0, 12.0, 18.0):
            px = clamp(m.x + mdx / ml * SPD * lead / 20.0, 0.8, FIELD_W - 0.8)
            py = clamp(m.y + mdy / ml * SPD * lead / 20.0, 0.8, FIELD_H - 0.8)
            # do not lead a mate into the opponent box
            if in_infl(me, px, py, 0.25):
                px, py = push_out(me, px, py, 0.25)
            ang = ang_to(u.x, u.y, px, py)
            ox, oy, fx, fy = kick_origin(u, ang)
            path, gf, gteam = flight(ox, oy, ang)
            if gf is not None:
                continue
            # first frame our mate can reach the ball
            catch_f = None
            for f in range(1, min(len(path), 60) + 1):
                bx, by = path[f - 1]
                if math.hypot(bx - m.x, by - m.y) <= CR + SPD * f / 20.0 - 0.05:
                    catch_f = f
                    break
            if catch_f is None:
                continue
            # nobody may intercept before the mate
            bad = False
            for f in range(1, catch_f + 1):
                bx, by = path[f - 1]
                if f <= 20:
                    for o in w.opps:
                        oxx, oyy = o['committed'][f - 1]
                        if math.hypot(oxx - bx, oyy - by) <= CR + 0.05:
                            bad = True
                            break
                else:
                    for o in w.opps:
                        oxx, oyy = o['pos20']
                        if math.hypot(oxx - bx, oyy - by) <= CR + SPD * (f - 20) / 20.0 + 0.05:
                            bad = True
                            break
                if bad:
                    break
            if bad:
                continue
            prog = (px - u.x) * ATK[me]
            if not pressure and prog < 3.0:
                continue
            mate_shot = shot_spot_score(me, px, py, m, st, w)
            sc = prog * 0.22 + mate_shot * 2.2 + (6.0 if pressure else 0.0) - catch_f * 0.02
            if best is None or sc > best[0]:
                best = (sc, ang, m.index, path[catch_f - 1], catch_f, prog)
    return best


def shot_spot_score(me, x, y, u, st, w):
    """Cheap estimate of shot quality from a spot (no flight sim)."""
    gx = OPP_GOAL_X[me]
    D = math.hypot(gx - x, 13.0 - y)
    if D < 2.0:
        return 0.0
    kx, ky = keeper_pred(w)
    # best target = mouth corner farther from keeper
    t1 = math.hypot(gx - x, 10.6 - y)
    t2 = math.hypot(gx - x, 15.4 - y)
    # lateral gap of keeper to each shot line at its distance
    def gap(ty):
        dx, dy = gx - x, ty - y
        L = math.hypot(dx, dy) or 1.0
        ux, uy = dx / L, dy / L
        ex, ey = kx - x, ky - y
        perp = abs(ex * uy - ey * ux)
        return perp - CR - SPD * (L / KICKP) * 0.55
    g = max(gap(10.6), gap(15.4))
    # teammates / opponents crowding the lane
    best = g * 1.6 + max(0.0, 18.0 - D) * 0.05 - max(0.0, D - 16.0) * 0.15
    return best


def keeper_pred(w):
    for o in w.opps:
        if o['keeper']:
            return o['pos20']
    return (FIELD_W / 2.0, 13.0)


def _find_uidx(st, u):
    for i, x in enumerate(st.units):
        if x is u:
            return i
    return -1


# ---------------------------------------------------------------- movement
def attack_spots(me):
    gx = OPP_GOAL_X[me]
    a = ATK[me]
    raw = [
        (gx - a * 9.8, 13.0),
        (gx - a * 9.8, 7.4),
        (gx - a * 9.8, 18.6),
        (gx - a * 7.2, 4.9),
        (gx - a * 7.2, 21.1),
        (gx - a * 3.2, 4.6),
        (gx - a * 3.2, 21.4),
        (gx - a * 13.5, 13.0),
        (gx - a * 13.5, 6.5),
        (gx - a * 13.5, 19.5),
        (gx - a * 17.5, 13.0),
    ]
    return [push_out(me, x, y, 0.35) for x, y in raw]


def choose_attack_spot(st, u, me, w, taken, role='support'):
    best = None
    bx, by = st.bx, st.by
    ogx = MY_GOAL_X[me]
    prog = (bx - ogx) * ATK[me]
    cands = []
    if role == 'striker' and prog > 17.0:
        cands = attack_spots(me)
    elif role == 'cover':
        base = max(3.0, prog - 5.0) if prog > 13.0 else prog + 6.0
        cands = [(ogx + ATK[me] * base, 13.0 + (by - 13.0) * 0.5),
                 (ogx + ATK[me] * base, 7.5), (ogx + ATK[me] * base, 18.5)]
    else:
        for dp in (7.0, 10.0, 13.0, 16.0):
            px = ogx + ATK[me] * (prog + dp)
            if px < 0.6 or px > FIELD_W - 0.6:
                continue
            for off in (-8.0, -4.0, 0.0, 4.0, 8.0):
                cands.append((px, by + off))
        if prog > 17.0:
            cands = cands[:12] + attack_spots(me)
    if not cands:
        cands = attack_spots(me)
    for (x, y) in cands:
        x, y = push_out(me, x, y, 0.30)
        d = math.hypot(x - u.x, y - u.y)
        crowd = 0.0
        for tx, ty in taken:
            dd = math.hypot(x - tx, y - ty)
            if dd < 4.5:
                crowd += 4.5 - dd
        if role == 'cover' and (x - ogx) * ATK[me] > prog + 3.0:
            continue
        # pass lane from ball to spot
        lane = 9.0
        for o in w.opps:
            ox, oy = o['pos']
            dx, dy = x - bx, y - by
            L = math.hypot(dx, dy) or 1.0
            ex, ey = ox - bx, oy - by
            proj = ex * dx / L + ey * dy / L
            if proj < 0 or proj > L:
                continue
            perp = abs(ex * dy / L - ey * dx / L)
            lane = min(lane, perp)
        reachable = 1.0 if d < 22.0 else 0.0
        sc = -d * 0.09 + min(lane, 3.0) * 0.60 - crowd * 0.55 + reachable * 0.8
        sc += ((x - bx) * ATK[me]) * 0.035
        if role == 'cover':
            sc += (bx - x) * ATK[me] * 0.02
        if role == 'striker':
            sc += shot_spot_score(me, x, y, u, st, w) * 0.9
        if best is None or sc > best[0]:
            best = (sc, x, y)
    if best is None:
        return push_out(me, OPP_GOAL_X[me] - ATK[me] * 12.0, 13.0, 0.5)
    return best[1], best[2]


def choose_dribble_target(st, u, me, w):
    bx, by = st.bx, st.by
    gx = OPP_GOAL_X[me]
    ogx = MY_GOAL_X[me]
    prog = (bx - ogx) * ATK[me]
    cands = []
    for dp in (8.0, 12.0, 16.0):
        px = ogx + ATK[me] * (prog + dp)
        if px < 0.6 or px > FIELD_W - 0.6:
            continue
        for off in (-9.0, -4.5, 0.0, 4.5, 9.0):
            cands.append((px, by + off))
    if prog > 14.0:
        cands += attack_spots(me)
    best = None
    for (x, y) in cands:
        x, y = push_out(me, x, y, 0.30)
        d = math.hypot(x - u.x, y - u.y)
        if d > 30.0:
            continue
        if seg_blocked(me, u.x, u.y, x, y):
            xg, yt, yb = gateways(me)
            gy = yt if abs(y - yt) < abs(y - yb) else yb
            d = math.hypot(xg - u.x, gy - u.y) + math.hypot(x - xg, y - gy)
        pot = shot_spot_score(me, x, y, u, st, w)
        od = min([math.hypot(o['pos'][0] - x, o['pos'][1] - y) for o in w.opps] or [9.0])
        sc = pot * 1.9 - d * 0.16 + min(od, 3.0) * 0.25
        if best is None or sc > best[0]:
            best = (sc, x, y)
    if best is None:
        return push_out(me, gx - ATK[me] * 10.0, 13.0, 0.4)
    return best[1], best[2]


def ball_pred(st, frames):
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
        out.append((x, y))
        if vx == 0.0 and vy == 0.0:
            break
    return out


def chase_target(st, u, ahead=0.0):
    path = ball_pred(st, 50)
    if not path:
        return st.bx, st.by
    for k, (px, py) in enumerate(path):
        t = (k + 1) / 20.0
        if math.hypot(px - u.x, py - u.y) <= CR + SPD * t + ahead:
            return px, py
    return path[-1]


def keeper_cmd(st, u, me, w):
    bx, by = st.bx, st.by
    gx = MY_GOAL_X[me]
    owner = st.units[st.owner] if st.owner >= 0 else None
    ci = _find_uidx(st, u)
    # loose ball inside our box: go get it
    if st.owner < 0 and in_box(me, bx, by):
        d = math.hypot(bx - u.x, by - u.y)
        if d < 9.0:
            tx, ty = chase_target(st, u)
            return Cmd(move_dir_to(u.x, u.y, tx, ty, me, allow_box=True), ang_to(u.x, u.y, bx, by), False)
    if ci >= 0 and st.owner == ci:
        # keeper with the ball: pass / clear
        return keeper_distribute(st, u, me, w)
    dx, dy = bx - gx, by - 13.0
    D = math.hypot(dx, dy) or 1.0
    k = min(KEEPER_TRACK, max(0.7, 0.55 * D))
    tx, ty = gx + dx / D * k, 13.0 + dy / D * k
    # lead fast incoming balls a little
    sp = math.hypot(st.bvx, st.bvy)
    if sp > 3.0 and D < 22.0:
        tx += st.bvx * 0.06
        ty += st.bvy * 0.06
    tx = clamp(tx, 0.6, FIELD_W - 0.6)
    ty = clamp(ty, 1.0, FIELD_H - 1.0)
    d = move_dir_to(u.x, u.y, tx, ty, me, allow_box=True)
    return Cmd(d, ang_to(u.x, u.y, bx, by), False)


def keeper_distribute(st, u, me, w):
    ps = choose_pass(st, u, me, w, pressure=True)
    if ps is not None and ps[5] > -4.0:
        return Cmd('N', ps[1], True)
    # clear towards the far half, away from the nearest opponent
    gx = OPP_GOAL_X[me]
    best = None
    for ang in range(0, 360, 10):
        ox, oy, fx, fy = kick_origin(u, ang)
        path, gf, gt = flight(ox, oy, ang)
        if gf is not None and gt == 1 - me:
            continue
        # avoid kicking toward our own goal
        tx, ty = ox + fx * 14.0, oy + fy * 14.0
        if (tx - MY_GOAL_X[me]) * ATK[me] < 2.0:
            continue
        block, margin = opp_reach_block(path, st, w, me, shooter=u, extra=0.3)
        if block is None and margin > 0.5:
            sc = margin + (tx - u.x) * ATK[me] * 0.1
            if best is None or sc > best[0]:
                best = (sc, ang)
    if best is not None:
        return Cmd('N', best[1], True)
    ang = ang_to(u.x, u.y, gx, 13.0)
    return Cmd('N', ang, True)


# ======================================================================
#  v3: 1 Hz plan execution (robust to opponent model error)
# ======================================================================


def select_mode(st, me):
    sc = st.score
    my, op = sc[me], sc[1 - me]
    tl = st.tl
    if my > op and tl <= 30.0:
        return 'park'
    if my < op and (st.golden or tl <= 50.0):
        return 'desperate'
    return 'normal'


def park_spot(me):
    return MY_GOAL_X[me] + ATK[me] * 4.2, 13.0


def nearest_opp(st, me, x, y):
    best = None
    bd = 1e9
    for o in st.units:
        if o.team == me:
            continue
        d = math.hypot(o.x - x, o.y - y)
        if d < bd:
            bd, best = d, o
    return best, bd


def make_plan_inner(st, me, w):
    """Return plan dict for next 20 frames, based on the observed state."""
    my = [u for u in st.units if u.team == me]
    owner = st.units[st.owner] if st.owner >= 0 else None
    plan = {'act': None, 'targets': {}, 'carrier': -1, 'pass': None, 'mode': w.mode, 'aims': {}}
    if not my:
        return plan
    n = st.n
    bx, by = st.bx, st.by
    if n == 1:
        u = my[0]
        if owner is not None and owner.team == me:
            plan['carrier'] = u.index
            plan['act'] = carrier_action(st, u, me, w)
        elif owner is not None:
            # jockey goal-side
            ogx = MY_GOAL_X[me]
            dx, dy = ogx - bx, 13.0 - by
            dl = math.hypot(dx, dy) or 1.0
            db = math.hypot(u.x - bx, u.y - by)
            if db < 2.6:
                tx, ty = bx, by
            else:
                tx, ty = bx + dx / dl * 2.0, by + dy / dl * 2.0
            plan['targets'][u.index] = (clamp(tx, 0.7, FIELD_W - 0.7), clamp(ty, 0.9, FIELD_H - 0.9))
        else:
            plan['targets'][u.index] = chase_target(st, u)
        return plan

    # keeper
    plan['targets'][0] = keeper_target_v3(st, my[0], me)
    fielders = [u for u in my if u.index != 0]

    if owner is not None and owner.team == me:
        plan['carrier'] = owner.index
        plan['act'] = carrier_action(st, owner, me, w)
        if plan['act'].get('pass'):
            plan['pass'] = plan['act']['pass']
        elif plan['act']['kind'] == 'kick':
            # follow the kick: move toward the box edge / rebound area
            gx = OPP_GOAL_X[me]
            fx = clamp(gx - ATK[me] * 8.0, 2.0, FIELD_W - 2.0)
            fy = clamp(13.0 + (owner.y - 13.0) * 0.4, 2.5, FIELD_H - 2.5)
            plan['targets'][owner.index] = (fx, fy)
        others = [u for u in fielders if u is not owner]
        if w.mode == 'park' and owner.index != 0:
            gx = MY_GOAL_X[me]
            spots = [(gx + ATK[me] * 1.8, 10.8), (gx + ATK[me] * 1.8, 15.2),
                     (gx + ATK[me] * 5.5, 8.0), (gx + ATK[me] * 5.5, 18.0)]
            for i, u in enumerate(others):
                plan['targets'][u.index] = spots[i % len(spots)]
        else:
            taken = []
            osrt = sorted(others, key=lambda z: (z.x - MY_GOAL_X[me]) * ATK[me])
            if len(osrt) == 1:
                roles = ['support']
            elif len(osrt) == 2:
                roles = ['cover', 'support']
            else:
                roles = ['cover', 'support'] + ['striker'] * (len(osrt) - 2)
            for u, role in zip(osrt, roles):
                if plan['pass'] is not None and plan['pass'][0] == u.index:
                    tx, ty = plan['pass'][1]
                else:
                    tx, ty = choose_attack_spot(st, u, me, w, taken, role)
                taken.append((tx, ty))
                plan['targets'][u.index] = (tx, ty)
        return plan

    if owner is not None and owner.team != me:
        defend_targets(st, me, fielders, w, plan['targets'])
        return plan

    # loose ball
    if fielders:
        sf = sorted(fielders, key=lambda u: math.hypot(u.x - bx, u.y - by))
        plan['targets'][sf[0].index] = chase_target(st, sf[0])
        if len(sf) >= 2 and math.hypot(sf[1].x - bx, sf[1].y - by) < 12.0:
            plan['targets'][sf[1].index] = chase_target(st, sf[1])
        taken = []
        for u in fielders:
            if u.index in plan['targets']:
                continue
            tx, ty = choose_attack_spot(st, u, me, w, taken, 'support')
            taken.append((tx, ty))
            plan['targets'][u.index] = (tx, ty)
    return plan


def keeper_target_v3(st, u, me):
    bx, by = st.bx, st.by
    gx = MY_GOAL_X[me]
    ci = _find_uidx(st, u)
    if st.owner < 0 and in_box(me, bx, by):
        d = math.hypot(bx - u.x, by - u.y)
        if d < 9.0:
            return chase_target(st, u)
    if ci >= 0 and st.owner == ci:
        return (gx + ATK[me] * 3.0, 13.0)
    dx, dy = bx - gx, by - 13.0
    D = math.hypot(dx, dy) or 1.0
    k = min(KEEPER_TRACK, max(0.8, 0.55 * D))
    tx, ty = gx + dx / D * k, 13.0 + dy / D * k
    sp = math.hypot(st.bvx, st.bvy)
    if sp > 3.0 and D < 22.0:
        tx += st.bvx * 0.05
        ty += st.bvy * 0.05
    return (clamp(tx, 0.7, FIELD_W - 0.7), clamp(ty, 1.0, FIELD_H - 1.0))


def defend_targets(st, me, fielders, w, targets):
    bx, by = st.bx, st.by
    ogx = MY_GOAL_X[me]
    cx, cy = ogx, 13.0
    dx, dy = bx - cx, by - cy
    D = math.hypot(dx, dy) or 1.0
    ux, uy = dx / D, dy / D
    sf = sorted(fielders, key=lambda u: math.hypot(u.x - bx, u.y - by))
    presser = sf[0]
    ddx, ddy = cx - bx, cy - by
    dl = math.hypot(ddx, ddy) or 1.0
    db = math.hypot(presser.x - bx, presser.y - by)
    if db < 2.7:
        px, py = bx, by
    else:
        px, py = bx + ddx / dl * 2.0, by + ddy / dl * 2.0
    targets[presser.index] = (clamp(px, 0.6, FIELD_W - 0.6), clamp(py, 0.9, FIELD_H - 0.9))
    rest = [u for u in sf if u is not presser]
    if w.mode == 'desperate':
        n_block = 1 if rest else 0
    elif D > 28.0:
        n_block = 0
    elif D > 18.0:
        n_block = 1 if len(rest) >= 2 else 0
    else:
        n_block = min(len(rest), 2)
    kbase = clamp(0.55 * D, 3.2, 7.6)
    for i in range(n_block):
        u = rest[i]
        k = kbase - 1.7 * i
        off = 1.45 if (i % 2 == 0) else -1.45
        tx = cx + ux * k - uy * off
        ty = cy + uy * k + ux * off
        targets[u.index] = (clamp(tx, 0.7, FIELD_W - 0.7), clamp(ty, 0.8, FIELD_H - 0.8))
    marked = []
    for u in rest[n_block:]:
        tgt = None
        bd = 1e9
        for o in st.units:
            if o.team == me or o.index == 0:
                continue
            d = math.hypot(o.x - u.x, o.y - u.y)
            if d < bd and o.index not in marked:
                bd, tgt = d, o
        if tgt is not None:
            marked.append(tgt.index)
            ddx, ddy = ogx - tgt.x, 13.0 - tgt.y
            dl = math.hypot(ddx, ddy) or 1.0
            tx = tgt.x + ddx / dl * 1.5
            ty = tgt.y + ddy / dl * 1.5
            tx, ty = push_out(me, tx, ty, 0.5)
            targets[u.index] = (tx, ty)
        else:
            targets[u.index] = (clamp(bx - ATK[me] * 6.0, 2.0, FIELD_W - 2.0),
                                clamp(13.0 + (by - 13.0) * 0.6, 2.0, FIELD_H - 2.0))


def carrier_action(st, u, me, w):
    """Decide the carrier's action at the window start."""
    bx, by = st.bx, st.by
    if u.index == 0:
        ps = choose_pass(st, u, me, w, pressure=True)
        if ps is not None and ps[5] > -6.0:
            return {'kind': 'kick', 'ang': ps[1], 'pass': (ps[2], ps[3])}
        gx = OPP_GOAL_X[me]
        best = None
        for ang in range(0, 360, 8):
            ox, oy, fx, fy = kick_origin(u, ang)
            path, gf, gt = flight(ox, oy, ang)
            if gf is not None and gt == 1 - me:
                continue
            tx, ty = ox + fx * 13.0, oy + fy * 13.0
            if (tx - MY_GOAL_X[me]) * ATK[me] < 4.0:
                continue
            if in_infl(me, tx, ty, 0.0):
                continue
            block, margin = opp_reach_block(path, st, w, me, shooter=u, extra=0.25)
            if block is None:
                sc = margin + (tx - u.x) * ATK[me] * 0.12
                if best is None or sc > best[0]:
                    best = (sc, ang)
        if best is not None:
            return {'kind': 'kick', 'ang': best[1]}
        return {'kind': 'kick', 'ang': ang_to(u.x, u.y, OPP_GOAL_X[me], 13.0)}
    nd_owner, nd = nearest_opp(st, me, bx, by)
    pressured = nd < 1.7
    if w.mode == 'park':
        return {'kind': 'dribble', 'target': park_spot(me), 'park': True}
    risky = (w.mode == 'desperate')
    sh = choose_shot(st, u, me, w, risky)
    if sh is not None:
        return {'kind': 'kick', 'ang': sh[0]}
    ps = choose_pass(st, u, me, w, pressured)
    if ps is not None and (pressured or ps[0] > 2.6 or ps[5] > 10.0):
        return {'kind': 'kick', 'ang': ps[1], 'pass': (ps[2], ps[3])}
    # dribble
    tx, ty = choose_dribble_target(st, u, me, w)
    return {'kind': 'dribble', 'target': (tx, ty)}


def plan_frames(st0, me, plan):
    """Generate 20 frames following plan; only our units are tracked."""
    units = {}
    for u in st0.units:
        if u.team == me:
            units[u.index] = [u.x, u.y, u.index]
    opp_pos = [(o.x, o.y) for o in st0.units if o.team != me]
    frames = []
    carrier = plan.get('carrier', -1)
    act = plan.get('act')
    for f in range(20):
        row = []
        for u in st0.units:
            if u.team != me:
                continue
            idx = u.index
            pos = units[idx]
            tx, ty = plan['targets'].get(idx, (pos[0], pos[1]))
            aim = None
            kick = False
            if idx == carrier and act is not None:
                kind = act['kind']
                if f == 0 and kind == 'kick':
                    d = 'N'
                    aim = act['ang']
                    kick = True
                else:
                    if kind == 'dribble':
                        tx, ty = act['target']
                    else:
                        # after kicking, follow toward the goal / loose ball
                        tx, ty = plan['targets'].get(idx, (pos[0], pos[1]))
                    d = move_dir_to(pos[0], pos[1], tx, ty, me)
                    if act.get('park'):
                        aim = ang_to(pos[0], pos[1], OPP_GOAL_X[me], 13.0)
                        if opp_pos:
                            no = min(opp_pos, key=lambda q: (q[0] - pos[0]) ** 2 + (q[1] - pos[1]) ** 2)
                            if math.hypot(no[0] - pos[0], no[1] - pos[1]) < 1.7:
                                aim = ang_to(pos[0], pos[1], pos[0] * 2 - no[0], pos[1] * 2 - no[1])
                    else:
                        no = min(opp_pos, key=lambda q: (q[0] - pos[0]) ** 2 + (q[1] - pos[1]) ** 2) if opp_pos else None
                        if no is not None and math.hypot(no[0] - pos[0], no[1] - pos[1]) < 1.5:
                            aim = ang_to(pos[0], pos[1], pos[0] * 2 - no[0], pos[1] * 2 - no[1])
                        else:
                            aim = ang_to(pos[0], pos[1], OPP_GOAL_X[me], 13.0)
            else:
                d = move_dir_to(pos[0], pos[1], tx, ty, me, allow_box=(idx == 0))
            # advance our own unit position
            if d != 'N':
                dv = DIRV8[d]
                if idx == carrier and act is not None and act['kind'] == 'dribble':
                    speed = SPD * DRIBF
                else:
                    speed = SPD
                # wall-aware move
                nx = pos[0] + dv[0] * speed * DT
                ny = pos[1] + dv[1] * speed * DT
                if not circle_hits_wall(nx, pos[1], R_U):
                    pos[0] = nx
                if not circle_hits_wall(pos[0], ny, R_U):
                    pos[1] = ny
                pos[0] = clamp(pos[0], R_U, FIELD_W - R_U)
                pos[1] = clamp(pos[1], R_U, FIELD_H - R_U)
            row.append((d, aim, kick))
        frames.append(row)
    return frames


def make_plan(st, me, w):
    plan = make_plan_inner(st, me, w)
    for u in st.units:
        if u.team == me:
            plan['aims'][u.index] = best_kick_aim(st, u, me, w)
    return plan


def decide_window_v3(st0, me, prev_obs):
    mode = select_mode(st0, me)
    w = build_wctx(st0, prev_obs, me, mode)
    plan = make_plan(st0, me, w)
    return plan_frames_kick(st0, me, plan), plan


# ---------------------------------------------------------------------
#  one-touch kick engine: every unit kicks on first touch, aim precomputed
# ---------------------------------------------------------------------
def kick_eval(st, u, me, w, ang):
    ox, oy, fx, fy = kick_origin(u, ang)
    path, gf, gteam = flight(ox, oy, ang)
    if gf is not None:
        if gteam == me:
            return 900.0 - gf * 0.5
        return -900.0
    if not path:
        return -100.0
    gx = OPP_GOAL_X[me]
    mates = [m for m in st.units if m.team == me and m is not u]
    first_opp = None
    first_mate = None
    for i, (bx, by) in enumerate(path):
        f = i + 1
        if first_opp is None:
            for o in w.opps:
                if f <= 20:
                    qx, qy = o['committed'][f - 1]
                    reach = 0.0
                else:
                    qx, qy = o['pos20']
                    reach = SPD * (f - 20) / 20.0
                if math.hypot(qx - bx, qy - by) <= CR + reach + 0.05:
                    first_opp = (f, bx, by)
                    break
        if first_mate is None:
            for m in mates:
                if math.hypot(m.x - bx, m.y - by) <= CR + SPD * f / 20.0 - 0.05:
                    first_mate = (f, bx, by)
                    break
        if first_opp is not None and first_mate is not None:
            break
    atk = ATK[me]
    ogx = MY_GOAL_X[me]
    if first_mate is not None and (first_opp is None or first_mate[0] <= first_opp[0]):
        f, bx, by = first_mate
        prog = (bx - ogx) * atk
        return 28.0 + prog * 0.32 + (30.0 - f) * 0.15
    if first_opp is not None:
        f, bx, by = first_opp
        prog = (bx - ogx) * atk
        return prog * 0.12 - 4.0 + (20.0 - f) * 0.05
    bx, by = path[-1]
    prog = (bx - ogx) * atk
    od = min([math.hypot(o['pos'][0] - bx, o['pos'][1] - by) for o in w.opps] or [9.0])
    md = min([math.hypot(m.x - bx, m.y - by) for m in mates] or [9.0])
    return prog * 0.24 + min(od, 4.0) * 0.8 + (0.0 if md < 2 else 1.0)


def best_kick_aim(st, u, me, w):
    gx = OPP_GOAL_X[me]
    D = math.hypot(gx - u.x, 13.0 - u.y)
    if D < 26.5:
        sh = choose_shot(st, u, me, w, risky=False)
        if sh is not None:
            return sh[0]
        sh = choose_shot(st, u, me, w, risky=True)
        if sh is not None and sh[1] > -0.30:
            return sh[0]
    # candidate directions: toward the opponent goal half + a spread
    base = math.atan2(13.0 - u.y, gx - u.x)
    best = None
    for i in range(36):
        ang = (math.degrees(base) + (i - 18) * 9.0) % 360.0
        sc = kick_eval(st, u, me, w, ang)
        if best is None or sc > best[0]:
            best = (sc, ang)
    # also consider straightforward upfield clears
    for ang in (0.0, 45.0, 315.0, 90.0, 270.0, 180.0):
        sc = kick_eval(st, u, me, w, ang)
        if best is None or sc > best[0]:
            best = (sc, ang)
    return best[1] if best is not None else ang_to(u.x, u.y, gx, 13.0)


def plan_frames_kick(st0, me, plan):
    """Every unit kicks on first touch; movement per plan targets."""
    units = {}
    for u in st0.units:
        if u.team == me:
            units[u.index] = [u.x, u.y]
    opp_pos = [(o.x, o.y) for o in st0.units if o.team != me]
    frames = []
    carrier = plan.get('carrier', -1)
    act = plan.get('act')
    kick_all = (plan.get('mode') != 'park')
    for f in range(20):
        row = []
        for u in st0.units:
            if u.team != me:
                continue
            idx = u.index
            pos = units[idx]
            tx, ty = plan['targets'].get(idx, (pos[0], pos[1]))
            if idx == carrier and act is not None and act['kind'] == 'dribble':
                tx, ty = act['target']
            d = move_dir_to(pos[0], pos[1], tx, ty, me, allow_box=(idx == 0))
            aim = plan['aims'].get(idx)
            kick = bool(kick_all and aim is not None)
            if d != 'N':
                dv = DIRV8[d]
                speed = SPD * (DRIBF if (idx == carrier and act is not None and act['kind'] == 'dribble') else 1.0)
                nx = pos[0] + dv[0] * speed * DT
                ny = pos[1] + dv[1] * speed * DT
                if not circle_hits_wall(nx, pos[1], R_U):
                    pos[0] = nx
                if not circle_hits_wall(pos[0], ny, R_U):
                    pos[1] = ny
                pos[0] = clamp(pos[0], R_U, FIELD_W - R_U)
                pos[1] = clamp(pos[1], R_U, FIELD_H - R_U)
            row.append((d, aim, kick))
        frames.append(row)
    return frames


def neutral_frame(n):
    return [{"dir": "N", "aim": None, "kick": False} for _ in range(n)]


LAST = {'obs': None}


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
            if obs.get('status') not in (None, 'playing', 'live'):
                print(json.dumps({"inputs": [neutral_frame(n) for _ in range(20)]}), flush=True)
                LAST['obs'] = None
                continue
            st = state_from_obs(obs)
            if not math.isfinite(st.tl):
                st.tl = 120.0
            prev = LAST['obs']
            if prev is not None:
                pf = int(prev.get('frame') or -100)
                if abs(st.frame - pf) > 60:
                    prev = None
            frames, plan = decide_window_v3(st, me, prev)
            our_units = [u for u in st.units if u.team == me]
            out = []
            for fr in frames:
                row = []
                for k, u in enumerate(our_units):
                    d, aim, kick = fr[u.index]
                    deg = None
                    if aim is not None:
                        deg = round(aim % 360.0, 2)
                        if deg >= 360.0:
                            deg = 0.0
                    row.append({"dir": d, "aim": deg, "kick": bool(kick)})
                out.append(row)
            LAST['obs'] = obs
            dbg({'f': st.frame, 'mode': plan.get('mode'), 'act': plan.get('act'),
                 'carrier': plan.get('carrier')})
            print(json.dumps({"inputs": out}), flush=True)
        except Exception as e:
            if DEBUG:
                import traceback
                traceback.print_exc()
            else:
                sys.stderr.write('ERR %r\n' % (e,))
            print(json.dumps({"inputs": [neutral_frame(n) for _ in range(20)]}), flush=True)


if __name__ == '__main__':
    main()
