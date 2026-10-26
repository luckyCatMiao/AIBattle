#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""无尽弹墙对决 agent.

读取 stdin 每行一个 JSON 观察, 输出一行 3 帧输入 JSON.
核心:
  * 用与 simulation.js 完全一致的物理做子弹/玩家预测
  * 3(或更多)帧束搜索选移动方向, 躲避对方子弹 + 远离墙/柱
  * 冷却一好就开火; 在 8 个朝向里选一条弹道最接近对手(含反弹)的方向
"""
import sys
import json
import math
import os
import random

# ---------------------------------------------------------------- constants
W, H = 40, 30
SQ = math.sqrt(0.5)

PILLARS = (
    (8, 6, 4, 2), (28, 22, 4, 2),
    (8, 22, 4, 2), (28, 6, 4, 2),
    (19, 4, 2, 3), (19, 23, 2, 3),
    (19, 13, 2, 4),
)

DIRV = {
    'N': (0.0, 0.0),
    'U': (0.0, -1.0), 'D': (0.0, 1.0),
    'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-SQ, -SQ), 'UR': (SQ, -SQ),
    'DL': (-SQ, SQ), 'DR': (SQ, SQ),
}
MOVE_KEYS = ('N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR')
AIM_KEYS = ('U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR')

DT = 1.0 / 20.0
SUB = 3
SUB_DT = DT / SUB
PLAYER_STEP = 13.0 * DT          # 0.65 / frame
BULLET_STEP = 8.5 * DT           # 0.425 / frame
HIT_R = 0.45 + 0.22              # 0.67
SPAWN_OFF = 0.45 + 0.22 + 0.12   # 0.79
HIT_R2 = HIT_R * HIT_R


def _build_field():
    f = [0] * (W * H)
    for y in range(H):
        for x in range(W):
            if x == 0 or y == 0 or x == W - 1 or y == H - 1:
                f[y * W + x] = 1
    for (px, py, pw, ph) in PILLARS:
        for y in range(py, py + ph):
            for x in range(px, px + pw):
                if 0 < x < W - 1 and 0 < y < H - 1:
                    f[y * W + x] = 1
    return f


FIELD = _build_field()
_FLAT = FIELD
_MATH_FLOOR = math.floor


def tile_at(x, y):
    if x < 0 or y < 0 or x >= W or y >= H:
        return 1
    return _FLAT[int(_MATH_FLOOR(y)) * W + int(_MATH_FLOOR(x))]


_UNIT8 = tuple((math.cos(i * math.pi / 4.0), math.sin(i * math.pi / 4.0))
               for i in range(8))

# precomputed circle offsets for the radii we use
_COFF = {}
for _r in (0.45, 0.55, 0.62, 0.9, 1.2, 1.5):
    _COFF[_r] = tuple((ux * _r, uy * _r) for (ux, uy) in _UNIT8)


def circle_hits_wall(x, y, r=0.45):
    if tile_at(x, y):
        return True
    off = _COFF.get(r)
    if off is None:
        off = tuple((ux * r, uy * r) for (ux, uy) in _UNIT8)
        _COFF[r] = off
    for ox, oy in off:
        if tile_at(x + ox, y + oy):
            return True
    return False


# openness: distance from each tile centre to the nearest wall tile centre
def _build_openness():
    walls = [(x, y) for y in range(H) for x in range(W) if FIELD[y * W + x]]
    op = [0.0] * (W * H)
    for y in range(H):
        for x in range(W):
            if FIELD[y * W + x]:
                continue
            cx = x + 0.5
            cy = y + 0.5
            best = 1e9
            for (wx, wy) in walls:
                dx = cx - (wx + 0.5)
                dy = cy - (wy + 0.5)
                d = dx * dx + dy * dy
                if d < best:
                    best = d
            op[y * W + x] = math.sqrt(best)
    return op


OPEN = _build_openness()


def openness(x, y):
    ix = int(_MATH_FLOOR(x))
    iy = int(_MATH_FLOOR(y))
    if ix < 0:
        ix = 0
    elif ix >= W:
        ix = W - 1
    if iy < 0:
        iy = 0
    elif iy >= H:
        iy = H - 1
    return OPEN[iy * W + ix]


def wall_edge(x, y):
    """clearance from the outer arena wall surface (pillars not counted)."""
    e = x - 1.0
    t = (W - 1) - x
    if t < e:
        e = t
    t = y - 1.0
    if t < e:
        e = t
    t = (H - 1) - y
    if t < e:
        e = t
    return e


def advance_bullet(x, y, vx, vy, steps=1):
    """advance a bullet by *steps* frames (1 frame = 3 substeps)."""
    for _ in range(steps):
        for _s in range(SUB):
            nx = x + vx * SUB_DT
            ny = y + vy * SUB_DT
            if tile_at(nx, y):
                vx = -vx
            else:
                x = nx
            if tile_at(x, ny):
                vy = -vy
            else:
                y = ny
    return x, y, vx, vy


def move_player(x, y, dx, dy):
    """dx,dy are unit-ish components of the direction."""
    if dx:
        tx = x + dx * PLAYER_STEP
        if not circle_hits_wall(tx, y):
            x = tx
    if dy:
        ty = y + dy * PLAYER_STEP
        if not circle_hits_wall(x, ty):
            y = ty
    return x, y


def lane_score(x, y, tx, ty):
    """how good a direct (pre-first-bounce) shot from (x,y) is at target (tx,ty)."""
    best = 0.0
    for dk in AIM_KEYS:
        ux, uy = DIRV[dk]
        bx = x + ux * SPAWN_OFF
        by = y + uy * SPAWN_OFF
        if tile_at(bx, by):
            continue
        march = 0.0
        mind = 1e9
        mind_at = 0.0
        while march < 15.0:
            bx += ux * 0.4
            by += uy * 0.4
            march += 0.4
            if tile_at(bx, by):
                break
            d = math.hypot(bx - tx, by - ty)
            if d < mind:
                mind = d
                mind_at = march
        if mind < 3.0:
            val = (3.0 - mind) * 0.4286
            if val > 1.0:
                val = 1.0
            val *= math.exp(-mind_at / 10.0)
            if val > best:
                best = val
    return best


# ---------------------------------------------------------------- tuning
def _envf(name, default):
    try:
        return float(os.environ.get(name, default))
    except Exception:
        return float(default)


def _envi(name, default):
    try:
        return int(os.environ.get(name, default))
    except Exception:
        return int(default)


HORIZON = _envi('DUEL_H', 8)        # beam search frames
FUTURE = _envi('DUEL_F', 22)        # extra static-risk frames added at leaves
BEAM = _envi('DUEL_BEAM', 64)
THREAT_K = _envi('DUEL_K', 26)      # only the K riskiest enemy bullets are simulated
THREAT_RANK = _envi('DUEL_RANK', 0)  # 1: rank by predicted closest approach, 0: by current distance
THREAT_RANK_F = _envi('DUEL_RANKF', 24)
AIM_FRAMES = _envi('DUEL_AIMT', 80)  # 4 s of bullet path for aim scoring
AIM_SIGMA = _envf('DUEL_AIMS', 0.75)  # closeness kernel width (cells)
AIM_TDECAY = _envf('DUEL_AIMTD', 16.0)  # arrival-time decay (frames)

W_THREAT = _envf('DUEL_WT', 4.0)
W_WALL1 = _envf('DUEL_WW1', 6.0)
W_WALL2 = _envf('DUEL_WW2', 40.0)
W_WALL3 = _envf('DUEL_WW3', 20.0)      # soft outer-wall proximity risk
WALL_SOFT_R = _envf('DUEL_WSR', 3.0)
WALL_USE = _envi('DUEL_WALL', 1)
W_OPEN = _envf('DUEL_WO', 0.05)
W_OPPD = _envf('DUEL_WD', 0.02)
# opponent keep-away (round-2 fix): a bullet leaves the muzzle 0.79 cells in
# front of its owner, so once the gap is below 0.79+0.67=1.46 the opponent can
# kill us with a shot in *any* aim direction.  Keep a hard buffer at all times
# and a wider, stronger buffer while their cooldown is about to expire.
OPP_KEEP = _envi('DUEL_KEEP', 1)
OPP_KEEP_R = _envf('DUEL_KFR', 1.75)      # always-avoid radius
OPP_KEEP_R_READY = _envf('DUEL_KFRR', 2.60)  # radius while they can fire soon
OPP_KEEP_W = _envf('DUEL_KFW', 15000.0)   # below the 1e5 hard bullet collision
OPP_SOFT_R = _envf('DUEL_KSR', 3.40)      # soft repulsion radius
OPP_W_READY = _envf('DUEL_OPPW', 1.0)     # soft weight while they can fire soon
OPP_W_IDLE = _envf('DUEL_OPPI', 0.25)     # soft weight while reloading
W_LANE = _envf('DUEL_WL', 5.0)
W_LANE2 = _envf('DUEL_WL2', 0.0)      # leaf full-ricochet shooting-lane quality
SHOT_USE = _envi('DUEL_SHOT', 0)
SHOT_FRAMES = _envi('DUEL_SHT', 36)
W_DIST = _envf('DUEL_WDST', 0.06)
W_STILL = _envf('DUEL_WS', 0.05)
TARGET_D = _envf('DUEL_TD', 8.0)
RUSH_CD = _envi('DUEL_RCD', 12)       # opponent cooldown above this -> rush in
RUSH_D = _envf('DUEL_RD', 4.0)       # standoff distance while rushing
SAFE_OFF = _envf('DUEL_SO', 4.0)     # extra standoff while opponent can fire
SAFE_CD = _envi('DUEL_SCD', 6)       # start backing off this many frames before they can fire
MARGIN = _envf('DUEL_MG', 0.10)      # safety buffer beyond the true hit radius
DISCOUNT = _envf('DUEL_DIS', 0.99)
AIM_WALL = _envi('DUEL_AIMW', 0)
AIM_WALL_BONUS = _envf('DUEL_AWB', 0.8)
AIM_WALL_R = _envf('DUEL_AWR', 2.2)
OPP_COL = _envi('DUEL_OPPCOL', 1)     # opponent path prediction respects pillars
OPP_SMOOTH = _envf('DUEL_OPPSM', 0.0)  # velocity smoothing (0 = raw last-window)
CROSS_USE = _envi('DUEL_CROSS', 0)    # reward shots that cross existing friendly lanes
CROSS_BONUS = _envf('DUEL_CROSSB', 0.35)
CROSS_R = _envf('DUEL_CROSSR', 3.0)
CROSS_DOT = _envf('DUEL_CROSSD', 0.5)

# aim v2: multi-horizon closest-approach scoring.  Prediction of a strong,
# fast opponent is only meaningful for the first second or so; the old
# scorer could fall through to an arbitrary fixed direction (it defaulted
# to 'U') whenever no lane came within its narrow 3.2-cell window.
AIM2 = _envi('DUEL_AIM2', 1)
AIM2_W15 = _envf('DUEL_A2W15', 1.0)   # 0.75 s closeness
AIM2_W30 = _envf('DUEL_A2W30', 1.0)   # 1.5 s closeness
AIM2_W60 = _envf('DUEL_A2W60', 0.45)  # 3 s closeness
AIM2_W80 = _envf('DUEL_A2W80', 0.15)  # 4 s closeness
AIM2_SIG = _envf('DUEL_A2SIG', 0.7)   # closeness kernel (cells)
AIM2_CROSS_R = _envf('DUEL_A2CR', 2.2)  # friendly-bullet proximity for crossfire
AIM2_CROSS_DOT = _envf('DUEL_A2CD', 0.3)  # must come from a different direction

# aim v3: offline replay analysis (dev/bench_rank.py) showed the ricochet-lane
# scorer above deviates from the straight-at-opponent lane in almost every
# shot where that lane would actually pass through them: 0 hits within 3 s in
# 324 recorded shots vs 7.4% for a plain straight shot.  The lane scorer wins
# only on its own *predicted* path, which a 13-cell/s opponent outruns.  Mode:
#   0 = old multi-horizon lane scorer
#   1 = straight at the opponent's current position
#   2 = straight at the constant-velocity intercept point (lead)
#   3 = lead, mixed with the lane score
AIM_MODE = _envi('DUEL_AIM', 0)
AIM_LEAD_ITERS = _envi('DUEL_LEAD', 2)
AIM3_MIX = _envf('DUEL_A3MIX', 0.35)     # lane score weight in mode 3
AIM3_DIRSIG = _envf('DUEL_A3SIG', 0.35)  # angular kernel (radians) for direct term
# Opponent path model used by the lane scorer.  Measured on 2 recorded
# self-play games (dev/replay.py + dev/res/dump_sp.jsonl): predicting the
# opponent's position from the last-window velocity is *worse* than predicting
# "they stay put" at every horizon (0.75 s: 5.9 vs 3.6 cells mean error;
# 1.5 s: 11.7 vs 5.3; 3 s: 23.5 vs 7.2).  A 13 cells/s dodger reverses far
# faster than one decision window resolves, so the velocity ensemble mainly
# injects noise into the lane score.  Scale it down and put more weight on the
# static branch.
OPP_VSCALE = _envf('DUEL_OPPV', 1.0)   # multiplier on opponent velocity
OPP_STATIC_W = _envf('DUEL_STW', 0.25)  # weight of the "stays put" branch
# mode 4: lane scorer normally, but switch to the lead/straight shot when the
# opponent is close enough that bullet travel time (<= ~0.5 s) beats their
# reaction.  At 3 cells a straight shot arrives in 0.26 s and cannot reliably
# be dodged; that is exactly the duel lost in round 2.
AIM_NEAR = _envf('DUEL_AIMNEAR', 3.5)


class Agent(object):
    def __init__(self, params=None):
        self.rng = random.Random(0xC0FFEE)
        self.seed = _envi('DUEL_SEED', 0xC0FFEE)
        self.jit = _envf('DUEL_JIT', 1.0)
        self.prev_id = None
        self.prev_frame = None
        self.prev_now = None
        self.prev_opp = None
        self.opp_vx = 0.0
        self.opp_vy = 0.0
        # per-instance copy of the tunables (so variants can coexist)
        self.H = HORIZON
        self.F = FUTURE
        self.beam = BEAM
        self.k = THREAT_K
        self.threat_rank = THREAT_RANK
        self.threat_rank_f = THREAT_RANK_F
        self.aim_frames = AIM_FRAMES
        self.aim_sigma = AIM_SIGMA
        self.aim_tdecay = AIM_TDECAY
        self.w_threat = W_THREAT
        self.w_wall1 = W_WALL1
        self.w_wall2 = W_WALL2
        self.w_wall3 = W_WALL3
        self.wall_soft_r = WALL_SOFT_R
        self.wall_use = WALL_USE
        self.w_open = W_OPEN
        self.w_oppd = W_OPPD
        self.keep = OPP_KEEP
        self.keep_r = OPP_KEEP_R
        self.keep_r_ready = OPP_KEEP_R_READY
        self.keep_w = OPP_KEEP_W
        self.soft_r = OPP_SOFT_R
        self.opp_w_ready = OPP_W_READY
        self.opp_w_idle = OPP_W_IDLE
        self.w_lane = W_LANE
        self.w_lane2 = W_LANE2
        self.shot_use = SHOT_USE
        self.shot_frames = SHOT_FRAMES
        self.w_dist = W_DIST
        self.w_still = W_STILL
        self.target_d = TARGET_D
        self.rush_cd = RUSH_CD
        self.rush_d = RUSH_D
        self.safe_off = SAFE_OFF
        self.safe_cd = SAFE_CD
        self.margin = MARGIN
        self.discount = DISCOUNT
        self.aim_wall = AIM_WALL
        self.aim_wall_bonus = AIM_WALL_BONUS
        self.aim_wall_r = AIM_WALL_R
        self.cross_use = CROSS_USE
        self.cross_bonus = CROSS_BONUS
        self.cross_r2 = CROSS_R * CROSS_R
        self.cross_dot = CROSS_DOT
        self.opp_col = OPP_COL
        self.opp_smooth = OPP_SMOOTH
        self.aim2 = AIM2
        self.a2w15 = AIM2_W15
        self.a2w30 = AIM2_W30
        self.a2w60 = AIM2_W60
        self.a2w80 = AIM2_W80
        self.a2sig = AIM2_SIG
        self.a2cr2 = AIM2_CROSS_R * AIM2_CROSS_R
        self.a2cdot = AIM2_CROSS_DOT
        self.aim_mode = AIM_MODE
        self.aim_lead_iters = AIM_LEAD_ITERS
        self.a3mix = AIM3_MIX
        self.a3sig = AIM3_DIRSIG
        self.opp_vscale = OPP_VSCALE
        self.opp_static_w = OPP_STATIC_W
        self.aim_near = AIM_NEAR
        if params:
            for k, v in params.items():
                setattr(self, k, v)
        self.rng = random.Random(self.seed)

    # ------------------------------------------------------------ helpers
    def _update_opp_velocity(self, now, ox, oy):
        if self.prev_now is not None and self.prev_opp is not None:
            dt = now - self.prev_now
            if 1e-6 < dt < 1.0:
                vx = (ox - self.prev_opp[0]) / dt
                vy = (oy - self.prev_opp[1]) / dt
                sp = math.hypot(vx, vy)
                if sp > 13.5:
                    k = 13.5 / sp
                    vx *= k
                    vy *= k
                if self.opp_smooth > 0.0 and (self.opp_vx or self.opp_vy):
                    a = self.opp_smooth
                    self.opp_vx = a * self.opp_vx + (1.0 - a) * vx
                    self.opp_vy = a * self.opp_vy + (1.0 - a) * vy
                else:
                    self.opp_vx = vx
                    self.opp_vy = vy
        self.prev_now = now
        self.prev_opp = (ox, oy)

    def _predict_threats(self, bullets, my_idx, nframes):
        cur = [(b['x'], b['y'], b['vx'], b['vy'])
               for b in bullets if b.get('owner') != my_idx]
        out = []
        for _ in range(nframes):
            nxt = []
            for (x, y, vx, vy) in cur:
                x, y, vx, vy = advance_bullet(x, y, vx, vy, 1)
                nxt.append((x, y, vx, vy))
            out.append([(p[0], p[1]) for p in nxt])
            cur = nxt
        return out

    def _predict_friendly(self, bullets, my_idx, nframes):
        """future positions of our own bullets (they cannot hurt us)."""
        cur = [(b['x'], b['y'], b['vx'], b['vy'])
               for b in bullets if b.get('owner') == my_idx]
        out = []
        for _ in range(nframes):
            nxt = []
            for (x, y, vx, vy) in cur:
                x, y, vx, vy = advance_bullet(x, y, vx, vy, 1)
                nxt.append((x, y, vx, vy))
            out.append(nxt)
            cur = nxt
        return out

    def _cross_count(self, traj, idx, opx, opy, ux, uy, r2=None, dotlim=None):
        """how many friendly bullets are near the enemy at that instant,
        travelling from a materially different direction than the candidate."""
        if idx < 0 or idx >= len(traj):
            return 0
        if r2 is None:
            r2 = self.cross_r2
        if dotlim is None:
            dotlim = self.cross_dot
        n = 0
        for (bx, by, bvx, bvy) in traj[idx]:
            dx = bx - opx
            dy = by - opy
            if dx * dx + dy * dy > r2:
                continue
            sp = math.hypot(bvx, bvy)
            if sp < 1e-6:
                continue
            dot = (bvx * ux + bvy * uy) / sp
            if dot < dotlim:
                n += 1
        return n

    def _rank_threats(self, bullets, mx, my, my_idx):
        """Keep the K bullets whose predicted path comes closest soonest.

        Ranking by current distance misses fast bullets that are still far
        away but on a collision course, which is fatal in the late bullet
        soup.  Risk = predicted closest distance + small time penalty.
        """
        nf = self.threat_rank_f
        scored = []
        for b in bullets:
            if b.get('owner') == my_idx:
                continue
            x = float(b['x'])
            y = float(b['y'])
            vx = float(b['vx'])
            vy = float(b['vy'])
            best = 1e9
            best_f = 0
            for f in range(nf):
                x, y, vx, vy = advance_bullet(x, y, vx, vy, 1)
                dx = x - mx
                dy = y - my
                d2 = dx * dx + dy * dy
                if d2 < best:
                    best = d2
                    best_f = f
            risk = math.sqrt(best) + 0.04 * best_f
            scored.append((risk, b))
        scored.sort(key=lambda z: z[0])
        return [b for (_r, b) in scored[:self.k]]

    def _wall_factor(self, x, y):
        e = wall_edge(x, y)
        if e >= self.aim_wall_r:
            return 1.0
        return 1.0 + self.aim_wall_bonus * (self.aim_wall_r - e) / self.aim_wall_r

    def _shot_quality(self, x, y, tx, ty):
        """best full-ricochet lane from (x,y) to a static target (tx,ty)."""
        best = 0.0
        nf = self.shot_frames
        for dk in AIM_KEYS:
            ux, uy = DIRV[dk]
            bx = x + ux * SPAWN_OFF
            by = y + uy * SPAWN_OFF
            if tile_at(bx, by):
                continue
            vx = ux * 8.5
            vy = uy * 8.5
            mind = 1e9
            for _ in range(nf):
                bx, by, vx, vy = advance_bullet(bx, by, vx, vy, 1)
                dx = bx - tx
                dy = by - ty
                d = math.sqrt(dx * dx + dy * dy)
                if d < mind:
                    mind = d
                    if mind < 0.75:
                        break
            if mind < 3.0:
                val = math.exp(-(mind - HIT_R) / 0.8)
                if val > best:
                    best = val
        if best and self.aim_wall:
            best *= self._wall_factor(tx, ty)
        return best

    # ------------------------------------------------------------ aiming
    def _bullet_path(self, px, py, ux, uy, nframes):
        bx = px + ux * SPAWN_OFF
        by = py + uy * SPAWN_OFF
        if tile_at(bx, by):
            return None
        vx = ux * 8.5
        vy = uy * 8.5
        pts = []
        for _ in range(nframes):
            bx, by, vx, vy = advance_bullet(bx, by, vx, vy, 1)
            pts.append((bx, by))
        return pts

    def _opp_paths(self, ox, oy, nframes):
        """a few plausible future paths for the opponent."""
        def sim_path(rx, ry):
            pts = []
            x, y = ox, oy
            for _ in range(nframes):
                if self.opp_col:
                    # same axis-separated collision as the real player:
                    # pillars are solid, so never predict the opponent
                    # standing inside one.
                    nx = x + rx * DT
                    if not circle_hits_wall(nx, y, 0.45):
                        x = nx
                    else:
                        rx = -rx
                    ny = y + ry * DT
                    if not circle_hits_wall(x, ny, 0.45):
                        y = ny
                    else:
                        ry = -ry
                else:
                    x += rx * DT
                    y += ry * DT
                    if x < 0.5:
                        x = 1.0 - x
                        rx = -rx
                    elif x > W - 1 - 0.5:
                        x = 2 * (W - 1 - 0.5) - x
                        rx = -rx
                    if y < 0.5:
                        y = 1.0 - y
                        ry = -ry
                    elif y > H - 1 - 0.5:
                        y = 2 * (H - 1 - 0.5) - y
                        ry = -ry
                pts.append((x, y))
            return pts

        paths = []
        # static
        paths.append(([(ox, oy)] * nframes, self.opp_static_w))
        vx, vy = self.opp_vx * self.opp_vscale, self.opp_vy * self.opp_vscale
        sp = math.hypot(vx, vy)
        if sp > 0.8:
            for rot, w in ((0.0, 0.50), (0.785398, 0.10), (-0.785398, 0.10),
                           (1.570796, 0.08), (-1.570796, 0.08)):
                if rot:
                    c = math.cos(rot)
                    s = math.sin(rot)
                    rx = vx * c - vy * s
                    ry = vx * s + vy * c
                else:
                    rx, ry = vx, vy
                paths.append((sim_path(rx, ry), w))
        else:
            # unknown: assume they may start moving in some direction
            for (mx, my) in ((1.0, 0.0), (-1.0, 0.0), (0.0, 1.0), (0.0, -1.0)):
                paths.append((sim_path(mx * 8.0, my * 8.0), 0.08))
        return paths

    def _choose_aim(self, px, py, ox, oy, fire_frame, cur_frames, my_traj=None):
        # opponent model runs from now; bullet starts at fire_frame
        nf = self.aim_frames
        paths = self._opp_paths(ox, oy, nf + 3)
        off = fire_frame - 1
        best_key = None
        best_dir = 'R'
        for dk in AIM_KEYS:
            ux, uy = DIRV[dk]
            pts = self._bullet_path(px, py, ux, uy, nf)
            if pts is None:
                continue
            score = 0.0
            mind_all = 1e9
            for (opath, w) in paths:
                best = 0.0
                mind = 1e9
                # align indices: bullet index t <-> opponent frame t+off
                for t in range(nf):
                    opx, opy = opath[t + off]
                    bx, by = pts[t]
                    dx = bx - opx
                    dy = by - opy
                    d = math.sqrt(dx * dx + dy * dy)
                    if d < mind:
                        mind = d
                    if d < 3.2:
                        val = math.exp(-(d - HIT_R) / self.aim_sigma if d > HIT_R else 0.0)
                        val *= math.exp(-t / self.aim_tdecay)
                        if self.aim_wall:
                            val *= self._wall_factor(opx, opy)
                        if self.cross_use and my_traj:
                            nc = self._cross_count(my_traj, t + off, opx, opy, ux, uy)
                            if nc:
                                if nc > 3:
                                    nc = 3
                                val *= 1.0 + self.cross_bonus * nc
                        if val > best:
                            best = val
                score += w * best
                if mind < mind_all:
                    mind_all = mind
            # smooth fallback: prefer the lane that comes closest at all
            if mind_all < 6.0:
                score += 0.30 * math.exp(-mind_all / 1.8)
            # prefer shots whose initial lane points roughly at the opponent
            # (small tie-break)
            if score > 1e-9:
                key = score
            else:
                key = 0.0
            if best_key is None or key > best_key:
                best_key = key
                best_dir = dk
        return best_dir

    def _choose_aim2(self, px, py, ox, oy, fire_frame, cur_frames, my_traj=None):
        """Score each of the 8 aim directions by closest approach at several
        time scales against the ensemble of predicted opponent paths.

        Every direction gets a finite score, so we never fall through to an
        arbitrary direction when the opponent is far away or shielded.
        """
        nf = self.aim_frames
        paths = self._opp_paths(ox, oy, nf + 3)
        off = fire_frame - 1
        sig = self.a2sig if self.a2sig > 1e-6 else 0.7

        def q(d):
            if d <= HIT_R:
                return 1.0
            e = (d - HIT_R) / sig
            if e > 12.0:
                return 0.0
            return math.exp(-e)

        best_key = None
        best_dir = 'U'
        for dk in AIM_KEYS:
            ux, uy = DIRV[dk]
            pts = self._bullet_path(px, py, ux, uy, nf)
            if pts is None:
                continue
            score = 0.0
            for (opath, w) in paths:
                m15 = 1e9
                m30 = 1e9
                m60 = 1e9
                m80 = 1e9
                m60_t = 0
                for t in range(nf):
                    opx, opy = opath[t + off]
                    bx, by = pts[t]
                    dx = bx - opx
                    dy = by - opy
                    d = math.sqrt(dx * dx + dy * dy)
                    if d < m80:
                        m80 = d
                    if t < 60:
                        if d < m60:
                            m60 = d
                            m60_t = t
                    if t < 30:
                        if d < m30:
                            m30 = d
                    if t < 15:
                        if d < m15:
                            m15 = d
                val = (self.a2w15 * q(m15) + self.a2w30 * q(m30)
                       + self.a2w60 * q(m60) + self.a2w80 * q(m80))
                # crossfire: this shot becomes much harder to dodge when
                # another friendly bullet is already sweeping the same spot
                # from a different direction at the moment of arrival.
                if self.cross_use and my_traj is not None and m60 < 4.0:
                    opx, opy = opath[m60_t + off]
                    nc = self._cross_count(my_traj, m60_t + off, opx, opy,
                                           ux, uy, self.a2cr2, self.a2cdot)
                    if nc > 3:
                        nc = 3
                    if nc:
                        val *= 1.0 + self.cross_bonus * nc
                score += w * val
            # every direction from _bullet_path is a legal shot (spawn tile is
            # checked there), so `score` is always finite and comparable.
            if best_key is None or score > best_key:
                best_key = score
                best_dir = dk
        return best_dir

    # ------------------------------------------------------------ aiming v3
    def _aim_target(self, ox, oy, fire_frame):
        """predicted opponent position at the firing frame plus intercept lead."""
        t0 = 0.05 * (fire_frame - 1)
        bx = ox + self.opp_vx * t0
        by = oy + self.opp_vy * t0
        tx, ty = bx, by
        for _ in range(self.aim_lead_iters):
            d = math.hypot(tx - bx, ty - by)
            t = max(0.0, (d - SPAWN_OFF) / 8.5)
            tx, ty = bx + self.opp_vx * t, by + self.opp_vy * t
        return tx, ty

    def _aim_dir_score(self, px, py, tx, ty):
        """angular closeness of each legal aim direction to a target point."""
        out = {}
        dx = tx - px
        dy = ty - py
        l = math.hypot(dx, dy)
        for dk in AIM_KEYS:
            ux, uy = DIRV[dk]
            if tile_at(px + ux * SPAWN_OFF, py + uy * SPAWN_OFF):
                continue
            if l < 1e-9:
                out[dk] = 1.0
            else:
                dot = (dx * ux + dy * uy) / l
                if dot > 1.0:
                    dot = 1.0
                elif dot < -1.0:
                    dot = -1.0
                ang = math.acos(dot)
                out[dk] = math.exp(-(ang / self.a3sig) ** 2)
        return out

    def _choose_aim_direct(self, px, py, ox, oy, fire_frame):
        tx, ty = self._aim_target(ox, oy, fire_frame)
        dirs = self._aim_dir_score(px, py, tx, ty)
        if not dirs:
            return 'R'
        return max(dirs, key=lambda k: dirs[k])

    def _choose_aim3(self, px, py, ox, oy, fire_frame, cur_frames, my_traj=None):
        """straight/lead shot at the opponent, optionally blended with the
        ricochet-lane score of _choose_aim2."""
        tx, ty = self._aim_target(ox, oy, fire_frame)
        dirs = self._aim_dir_score(px, py, tx, ty)
        if not dirs:
            return 'R'
        if self.aim_mode == 3:
            lane = self._aim_lane_scores(px, py, ox, oy, fire_frame, my_traj)
            mx = max(lane.values()) if lane else 0.0
            if mx > 1e-12:
                for k in lane:
                    lane[k] /= mx
            mix = self.a3mix
            scored = {}
            for k in dirs:
                scored[k] = (1.0 - mix) * dirs[k] + mix * lane.get(k, 0.0)
            return max(scored, key=lambda k: (scored[k], dirs[k]))
        return max(dirs, key=lambda k: dirs[k])

    def _aim_lane_scores(self, px, py, ox, oy, fire_frame, my_traj=None):
        """raw _choose_aim2 score for every legal direction."""
        nf = self.aim_frames
        paths = self._opp_paths(ox, oy, nf + 3)
        off = fire_frame - 1
        sig = self.a2sig if self.a2sig > 1e-6 else 0.7

        def q(d):
            if d <= HIT_R:
                return 1.0
            e = (d - HIT_R) / sig
            if e > 12.0:
                return 0.0
            return math.exp(-e)

        out = {}
        for dk in AIM_KEYS:
            ux, uy = DIRV[dk]
            pts = self._bullet_path(px, py, ux, uy, nf)
            if pts is None:
                continue
            score = 0.0
            for (opath, w) in paths:
                m15 = m30 = m60 = m80 = 1e9
                for t in range(nf):
                    opx, opy = opath[t + off]
                    bx, by = pts[t]
                    d = math.hypot(bx - opx, by - opy)
                    if d < m80:
                        m80 = d
                    if t < 60 and d < m60:
                        m60 = d
                    if t < 30 and d < m30:
                        m30 = d
                    if t < 15 and d < m15:
                        m15 = d
                score += w * (self.a2w15 * q(m15) + self.a2w30 * q(m30)
                              + self.a2w60 * q(m60) + self.a2w80 * q(m80))
            out[dk] = score
        return out

    # ------------------------------------------------------------ movement
    def _plan(self, mx, my, ox, oy, bpos, h, future, td=None, opp_cd=0):
        """beam search over movement direction sequences."""
        if td is None:
            td = self.target_d
        opp_ready = opp_cd <= 2
        wall_mult = 1.0 if opp_cd <= self.safe_cd else 0.35
        ready_soon = opp_cd <= self.safe_cd
        keep_r = self.keep_r_ready if ready_soon else self.keep_r
        keep_soft_w = self.opp_w_ready if ready_soon else self.opp_w_idle
        nodes = [(0.0, mx, my, ())]
        moves = [(DIRV[k][0], DIRV[k][1]) for k in MOVE_KEYS]
        nbtraj = len(bpos)
        safe_r = HIT_R + self.margin
        safe_r2 = safe_r * safe_r
        soft_r = 3.5 + self.margin
        soft_k = 1.0 / (soft_r - safe_r)
        for f in range(h):
            bf = bpos[f]
            new = []
            for (cost, x, y, path) in nodes:
                for (dx, dy) in moves:
                    nx, ny = x, y
                    if dx:
                        tx = x + dx * PLAYER_STEP
                        if not circle_hits_wall(tx, y):
                            nx = tx
                    if dy:
                        ty = y + dy * PLAYER_STEP
                        if not circle_hits_wall(nx, ty):
                            ny = ty
                    c = cost
                    # enemy bullets
                    for (bx, by) in bf:
                        ddx = nx - bx
                        ddy = ny - by
                        d2 = ddx * ddx + ddy * ddy
                        if d2 < safe_r2:
                            c += 1e5
                        elif d2 < soft_r * soft_r:
                            t = (soft_r - math.sqrt(d2)) * soft_k
                            c += self.w_threat * t * t
                    # walls / pillars
                    if circle_hits_wall(nx, ny, 0.62):
                        c += self.w_wall2
                    elif circle_hits_wall(nx, ny, 0.9):
                        c += self.w_wall1
                    # being pinned against the outer wall is how most
                    # dangerous direct shots land: pay extra when the
                    # opponent may shoot soon.
                    if self.wall_use:
                        e = wall_edge(nx, ny)
                        if e < self.wall_soft_r:
                            t = (self.wall_soft_r - e) / self.wall_soft_r
                            c += self.w_wall3 * t * t * wall_mult
                    # prefer open space
                    c -= self.w_open * min(openness(nx, ny), 4.0)
                    dox = nx - ox
                    doy = ny - oy
                    dop = math.sqrt(dox * dox + doy * doy)
                    if self.keep:
                        # predict where a charging opponent will be at this
                        # frame; take the worse of "now" and "predicted" so a
                        # reversal cannot surprise the keep-away term
                        lead = 0.05 * (f + 1)
                        px = ox + self.opp_vx * lead
                        py = oy + self.opp_vy * lead
                        if px < 1.0:
                            px = 1.0
                        elif px > W - 1.0:
                            px = W - 1.0
                        if py < 1.0:
                            py = 1.0
                        elif py > H - 1.0:
                            py = H - 1.0
                        dp = math.sqrt((nx - px) * (nx - px) + (ny - py) * (ny - py))
                        if dp < dop:
                            dop = dp
                        # never enter muzzle range; extra buffer while the
                        # opponent's cooldown is about to run out.  The term
                        # grows towards the centre instead of being a flat
                        # wall, so escaping is always the best local move.
                        if dop < keep_r:
                            c += self.keep_w * (1.0 + 3.0 * (keep_r - dop) / keep_r)
                        if dop < self.soft_r:
                            t = (self.soft_r - dop) / self.soft_r
                            c += keep_soft_w * t * t
                    elif opp_ready and dop < 3.0:
                        # legacy soft repulsion (DUEL_KEEP=0)
                        c += self.w_oppd * (3.0 - dop) * (3.0 - dop)
                    # seek a good shooting distance
                    dd = (dop - td) * 0.142857
                    if dd < 0:
                        dd = -dd
                    if dd > 3.0:
                        dd = 3.0
                    c += self.w_dist * dd * dd
                    if dx == 0.0 and dy == 0.0:
                        c += self.w_still
                    if self.jit:
                        c += self.rng.random() * self.jit
                    c *= self.discount
                    new.append((c, nx, ny, path + ((dx, dy),)))
            if len(new) > self.beam:
                new.sort(key=lambda n: n[0])
                new = new[:self.beam]
            nodes = new
        # opponent position at leaf time (simple constant velocity lead)
        lead = h * 0.05
        tx = ox + self.opp_vx * lead
        ty = oy + self.opp_vy * lead
        tx = min(max(tx, 1.0), W - 2.0)
        ty = min(max(ty, 1.0), H - 2.0)
        # leaf evaluation: pretend to stand still for a while
        best = None
        end = min(nbtraj, h + future)
        for (cost, x, y, path) in nodes:
            c = cost
            for f in range(h, end):
                bf = bpos[f]
                decay = 0.94 ** (f - h)
                for (bx, by) in bf:
                    ddx = x - bx
                    ddy = y - by
                    d2 = ddx * ddx + ddy * ddy
                    if d2 < safe_r2:
                        c += 1e5 * decay
                    elif d2 < 9.0:
                        t = (3.0 - math.sqrt(d2)) * 0.42857
                        c += 0.6 * self.w_threat * t * t * decay
            if self.wall_use:
                e = wall_edge(x, y)
                if e < self.wall_soft_r:
                    t = (self.wall_soft_r - e) / self.wall_soft_r
                    c += 3.0 * self.w_wall3 * t * t * wall_mult
            if self.keep:
                # the leaf is 0.4-1.5 s ahead and the opponent is held static,
                # so only a discounted keep-away term is applied here
                dop = math.hypot(x - ox, y - oy)
                if dop < keep_r:
                    c += 0.5 * self.keep_w
                if dop < self.soft_r:
                    t = (self.soft_r - dop) / self.soft_r
                    c += 0.5 * keep_soft_w * t * t
            if self.w_lane:
                c -= self.w_lane * lane_score(x, y, tx, ty)
            if self.shot_use:
                c -= self.w_lane2 * self._shot_quality(x, y, tx, ty)
            if best is None or c < best[0]:
                best = (c, x, y, path)
        return best[3]

    # ------------------------------------------------------------ main
    def decide(self, obs):
        players = obs.get('players') or []
        mi = obs.get('yourPlayer')
        if mi is None or len(players) < 2:
            return self._neutral()
        try:
            mi = int(mi)
        except (TypeError, ValueError):
            return self._neutral()
        me = None
        opp = None
        for p in players:
            try:
                pidx = int(p.get('index', -1))
            except (TypeError, ValueError):
                pidx = -1
            if pidx == mi:
                me = p
            elif opp is None:
                opp = p
        if me is None or opp is None:
            # fall back to positional order
            if len(players) < 2 or not (0 <= mi < len(players)):
                return self._neutral()
            me = players[mi]
            opp = players[1 - mi]
        if obs.get('status') != 'playing':
            return self._neutral()

        mx = float(me.get('x', 5.0))
        my = float(me.get('y', 14.5))
        ox = float(opp.get('x', 34.0))
        oy = float(opp.get('y', 14.5))
        now = float(obs.get('now', 0.0))

        # new match / restarted match -> forget stale tracking
        mid = obs.get('id')
        fr = obs.get('frame')
        try:
            fr = int(fr)
        except (TypeError, ValueError):
            fr = None
        if mid != self.prev_id or (fr is not None and self.prev_frame is not None and fr < self.prev_frame):
            self.prev_now = None
            self.prev_opp = None
            self.opp_vx = 0.0
            self.opp_vy = 0.0
        self.prev_id = mid
        if fr is not None:
            self.prev_frame = fr

        self._update_opp_velocity(now, ox, oy)
        opp_cd = int(opp.get('cooldown') or 0)

        # ---------------- threat list (nearest K enemy bullets)
        bullets = obs.get('bullets') or []
        threats = []
        for b in bullets:
            if b.get('owner') == mi:
                continue
            dx = float(b['x']) - mx
            dy = float(b['y']) - my
            d2 = dx * dx + dy * dy
            threats.append((d2, b))
        # if the opponent is able to fire in this window, model the most
        # likely shot: aimed straight at us from their current position.
        if opp_cd <= 4:
            dvx = mx - ox
            dvy = my - oy
            dd = math.hypot(dvx, dvy)
            if dd > 0.3:
                ux = dvx / dd
                uy = dvy / dd
                threats.append((dd * dd, {
                    'owner': 1 - mi,
                    'x': ox + ux * SPAWN_OFF, 'y': oy + uy * SPAWN_OFF,
                    'vx': ux * 8.5, 'vy': uy * 8.5}))
        threats.sort(key=lambda t: t[0])
        if self.threat_rank:
            threats = self._rank_threats([b for (_d, b) in threats], mx, my, mi)
        else:
            threats = [b for (_d, b) in threats[:self.k]]

        nframes = self.H + self.F
        bpos = self._predict_threats(threats, mi, nframes)

        # ---------------- movement plan
        if opp_cd <= self.safe_cd:
            td = self.target_d + self.safe_off
        elif opp_cd >= self.rush_cd:
            td = self.rush_d
        else:
            td = self.target_d
        path = self._plan(mx, my, ox, oy, bpos, self.H, self.F, td, opp_cd)
        moves = []
        for i in range(3):
            if i < len(path):
                dx, dy = path[i]
                # map back to a key
                name = 'N'
                if abs(dx) < 1e-9 and abs(dy) < 1e-9:
                    name = 'N'
                elif abs(dx) < 1e-9:
                    name = 'D' if dy > 0 else 'U'
                elif abs(dy) < 1e-9:
                    name = 'R' if dx > 0 else 'L'
                elif dx > 0 and dy < 0:
                    name = 'UR'
                elif dx > 0 and dy > 0:
                    name = 'DR'
                elif dx < 0 and dy < 0:
                    name = 'UL'
                else:
                    name = 'DL'
                moves.append((name, dx, dy))
            else:
                moves.append(('N', 0.0, 0.0))

        # ---------------- fire timing
        cd = int(me.get('cooldown') or 0)
        fire_frame = None
        for f in range(1, 4):
            if cd > 0:
                cd -= 1
            else:
                fire_frame = f
                break

        aim = None
        if fire_frame is not None:
            # our position at the firing frame
            fx, fy = mx, my
            for i in range(fire_frame):
                _n, dx, dy = moves[i]
                fx, fy = move_player(fx, fy, dx, dy)
            my_traj = None
            if self.cross_use:
                my_traj = self._predict_friendly(bullets, mi, self.aim_frames + 4)
            if self.aim2:
                if self.aim_mode == 4:
                    sep = math.hypot(ox - fx, oy - fy)
                    if sep < self.aim_near:
                        aim = self._choose_aim_direct(fx, fy, ox, oy, fire_frame)
                    else:
                        aim = self._choose_aim2(fx, fy, ox, oy, fire_frame, 3, my_traj)
                elif self.aim_mode:
                    aim = self._choose_aim3(fx, fy, ox, oy, fire_frame, 3, my_traj)
                else:
                    aim = self._choose_aim2(fx, fy, ox, oy, fire_frame, 3, my_traj)
            else:
                aim = self._choose_aim(fx, fy, ox, oy, fire_frame, 3, my_traj)

        inputs = []
        for i in range(3):
            dk = moves[i][0]
            inputs.append({'dir': dk, 'aim': aim, 'fire': True})
        return {'inputs': inputs}

    def _neutral(self):
        return {'inputs': [
            {'dir': 'N', 'aim': None, 'fire': False},
            {'dir': 'N', 'aim': None, 'fire': False},
            {'dir': 'N', 'aim': None, 'fire': False},
        ]}


def main():
    ag = Agent()
    out = sys.stdout
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
            resp = ag.decide(obs)
        except Exception as exc:  # never crash: neutral input is legal
            import traceback
            sys.stderr.write('agent error: %r\n' % (exc,))
            traceback.print_exc(file=sys.stderr)
            resp = ag._neutral()
        out.write(json.dumps(resp, separators=(',', ':')))
        out.write('\n')
        out.flush()


if __name__ == '__main__':
    main()
