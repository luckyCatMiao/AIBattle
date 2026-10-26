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
THREAT_K = _envi('DUEL_K', 26)      # only nearest K enemy bullets considered
AIM_FRAMES = _envi('DUEL_AIMT', 80)  # 4 s of bullet path for aim scoring

W_THREAT = _envf('DUEL_WT', 4.0)
W_WALL1 = _envf('DUEL_WW1', 6.0)
W_WALL2 = _envf('DUEL_WW2', 40.0)
W_OPEN = _envf('DUEL_WO', 0.05)
W_OPPD = _envf('DUEL_WD', 0.02)
W_LANE = _envf('DUEL_WL', 5.0)
W_DIST = _envf('DUEL_WDST', 0.06)
W_STILL = _envf('DUEL_WS', 0.05)
TARGET_D = _envf('DUEL_TD', 8.0)
RUSH_CD = _envi('DUEL_RCD', 12)       # opponent cooldown above this -> rush in
RUSH_D = _envf('DUEL_RD', 4.0)       # standoff distance while rushing
SAFE_OFF = _envf('DUEL_SO', 4.0)     # extra standoff while opponent can fire
SAFE_CD = _envi('DUEL_SCD', 6)       # start backing off this many frames before they can fire
MARGIN = _envf('DUEL_MG', 0.10)      # safety buffer beyond the true hit radius
DISCOUNT = _envf('DUEL_DIS', 0.99)


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
        self.aim_frames = AIM_FRAMES
        self.w_threat = W_THREAT
        self.w_wall1 = W_WALL1
        self.w_wall2 = W_WALL2
        self.w_open = W_OPEN
        self.w_oppd = W_OPPD
        self.w_lane = W_LANE
        self.w_dist = W_DIST
        self.w_still = W_STILL
        self.target_d = TARGET_D
        self.rush_cd = RUSH_CD
        self.rush_d = RUSH_D
        self.safe_off = SAFE_OFF
        self.safe_cd = SAFE_CD
        self.margin = MARGIN
        self.discount = DISCOUNT
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
        paths = []
        # static
        paths.append(([(ox, oy)] * nframes, 0.25))
        vx, vy = self.opp_vx, self.opp_vy
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
                pts = []
                x, y = ox, oy
                # point particle bouncing off arena bounds
                for _ in range(nframes):
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
                paths.append((pts, w))
        else:
            # unknown: assume they may start moving in some direction
            for (mx, my) in ((1.0, 0.0), (-1.0, 0.0), (0.0, 1.0), (0.0, -1.0)):
                rx, ry = mx * 8.0, my * 8.0
                pts = []
                x, y = ox, oy
                for _ in range(nframes):
                    x += rx * DT
                    y += ry * DT
                    if x < 0.5 or x > W - 1.5:
                        rx = -rx
                    if y < 0.5 or y > H - 1.5:
                        ry = -ry
                    pts.append((x, y))
                paths.append((pts, 0.08))
        return paths

    def _choose_aim(self, px, py, ox, oy, fire_frame, cur_frames):
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
                        val = math.exp(-(d - HIT_R) / 0.75 if d > HIT_R else 0.0)
                        val *= math.exp(-t / 16.0)
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

    # ------------------------------------------------------------ movement
    def _plan(self, mx, my, ox, oy, bpos, h, future, td=None, opp_ready=True):
        """beam search over movement direction sequences."""
        if td is None:
            td = self.target_d
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
                    # prefer open space
                    c -= self.w_open * min(openness(nx, ny), 4.0)
                    dox = nx - ox
                    doy = ny - oy
                    dop = math.sqrt(dox * dox + doy * doy)
                    # do not hug the opponent while they can shoot back
                    if opp_ready and dop < 3.0:
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
            c -= self.w_lane * lane_score(x, y, tx, ty)
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
        path = self._plan(mx, my, ox, oy, bpos, self.H, self.F, td, opp_cd <= 2)
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
            aim = self._choose_aim(fx, fy, ox, oy, fire_frame, 3)

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
