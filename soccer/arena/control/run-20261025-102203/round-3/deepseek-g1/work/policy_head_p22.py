# -*- coding: utf-8 -*-
"""deepseek-g1 · round-3 policy.

Doctrine:
  * Defence: two "post" defenders stand on the goal line at the two mouth
    corners whenever the ball is in our defensive zone; the keeper covers the
    centre at depth ~2.  All three avoid the opponent box.
  * Offence: the carrier drives to the shooting line (1 unit outside the
    opponent box) and shoots at the corner farthest from the enemy keeper.
    Shots are taken on the first frame of a decision window, so the keeper
    only learns about the shot one window later.
  * Team-mates push to the shooting line as passing outlets; the keeper is a
    safe back-pass outlet and distributes long balls.
  * Absolutely no entry into the opponent penalty box (red card).
"""

import math
import os

W, H = 44.0, 26.0
DT = 0.05
HZ = 20
MOV = 3.15
DRIB = 0.58 * MOV
CR = 0.82
R_B = 0.22
KICK_OFF = 0.69
GL_LO, GL_HI = 10.5, 15.5
SAFE_M = 0.85          # stay this far outside the opponent box

SQ2 = 0.7071067811865476
DIRS = {
    'N': (0.0, 0.0), 'U': (0.0, -1.0), 'D': (0.0, 1.0),
    'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-SQ2, -SQ2), 'UR': (SQ2, -SQ2), 'DL': (-SQ2, SQ2), 'DR': (SQ2, SQ2),
}
DIR_KEYS = ('N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR')

_WALL = bytearray(44 * 26)
for _y in range(26):
    for _x in range(44):
        if _x == 0 or _y == 0 or _x == 43 or _y == 25:
            if (_x == 0 or _x == 43) and 10 <= _y < 16:
                continue
            _WALL[_y * 44 + _x] = 1


def tile_at(x, y):
    tx = int(math.floor(x))
    ty = int(math.floor(y))
    if tx < 0 or ty < 0 or tx >= 44 or ty >= 26:
        return 1
    return _WALL[ty * 44 + tx]


def hits_wall(x, y, r):
    k = r * SQ2
    for px, py in ((x - r, y), (x + r, y), (x, y - r), (x, y + r),
                   (x - k, y - k), (x + k, y - k), (x - k, y + k), (x + k, y + k)):
        if tile_at(px, py):
            return True
    return False


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


def own_gx(me):
    return 1.0 if me == 0 else 43.0


def opp_gx(me):
    return 43.0 if me == 0 else 1.0


def atk(me):
    return 1.0 if me == 0 else -1.0


OBOX = {0: (34.0, 6.0, 43.0, 20.0), 1: (1.0, 6.0, 10.0, 20.0)}
OWNBOX = {0: (1.0, 6.0, 10.0, 20.0), 1: (34.0, 6.0, 43.0, 20.0)}


def in_box(b, x, y):
    return b[0] <= x <= b[2] and b[1] <= y <= b[3]


def in_obox(me, x, y, m=0.0):
    b = OBOX[me]
    return b[0] - m <= x <= b[2] + m and b[1] - m <= y <= b[3] + m


def safe_pt(me, x, y, m=SAFE_M):
    """clamp a desired standing point out of the opponent box (+margin)."""
    x = clamp(x, 0.6, W - 0.6)
    y = clamp(y, 0.6, H - 0.6)
    b = OBOX[me]
    if not in_box(b, x, y):
        # still enforce margin only when close to the box band
        if b[1] - m <= y <= b[3] + m:
            if b[0] - m <= x <= b[2] + m:
                if x < (b[0] + b[2]) * 0.5:
                    x = b[0] - m
                else:
                    x = b[2] + m
        return x, y
    # inside: push to the nearest legal face
    cands = []
    if b[0] > 1.0:
        cands.append((b[0] - m, clamp(y, b[1], b[3])))
    if b[2] < W - 1.0:
        cands.append((b[2] + m, clamp(y, b[1], b[3])))
    cands.append((clamp(x, b[0], b[2]), b[1] - m))
    cands.append((clamp(x, b[0], b[2]), b[3] + m))
    best, bd = cands[0], 1e18
    for cx, cy in cands:
        if 0.5 <= cx <= W - 0.5 and 0.5 <= cy <= H - 0.5:
            dd = (cx - x) ** 2 + (cy - y) ** 2
            if dd < bd:
                bd, best = dd, (cx, cy)
    return best


def step_ok(me, x, y, vx, vy, steps=5, m=SAFE_M, speed=MOV):
    for k in range(1, steps + 1):
        if in_obox(me, x + vx * speed * DT * k, y + vy * speed * DT * k, m):
            return False
    return True


def move_dir(u, tx, ty, me, allow_box=False, m=SAFE_M, speed=MOV, extra=None):
    """8-direction move toward (tx,ty); hard filter against opponent box."""
    dx, dy = tx - u.x, ty - u.y
    d = math.hypot(dx, dy)
    if d < 0.06:
        return 'N'
    ux, uy = dx / d, dy / d
    best, bestv = None, -1e18
    for name in DIR_KEYS:
        vx, vy = DIRS[name]
        if vx == 0.0 and vy == 0.0:
            continue
        if not allow_box and not step_ok(me, u.x, u.y, vx, vy, 5, m, speed):
            continue
        v = vx * ux + vy * uy
        if extra is not None:
            v += extra(vx, vy)
        if v > bestv:
            bestv, best = v, name
    if best is None:
        # blocked: slide along the box edge
        bb = OBOX[me]
        cy = (bb[1] + bb[3]) * 0.5
        ty2 = bb[1] - m if u.y < cy else bb[3] + m
        for name in DIR_KEYS:
            vx, vy = DIRS[name]
            if vx == 0.0 and vy == 0.0:
                continue
            if step_ok(me, u.x, u.y, vx, vy, 5, m, speed):
                v = vx * ux + vy * (1.0 if ty2 > u.y else -1.0)
                if v > bestv:
                    bestv, best = v, name
    return best or 'N'


# ------------------------------------------------------------------ ball sim
def sim_ball(bx, by, ang, maxf=160):
    """Faithful ball flight (JS port). Returns (pts, goal_team_or_None, end)."""
    vx, vy = 11.0 * math.cos(ang), 11.0 * math.sin(ang)
    x, y = bx, by
    pts = []
    for f in range(maxf):
        for s in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if GL_LO <= y <= GL_HI:
                if x <= 1.0:
                    return pts, 1, (x, y)
                if x >= W - 1.0:
                    return pts, 0, (x, y)
            if hits_wall(x, y, R_B):
                px = x - vx * DT / 4.0
                py = y - vy * DT / 4.0
                if hits_wall(x, py, R_B):
                    x, y = px, y
                    vx = -vx * 0.72
                if hits_wall(px, y, R_B):
                    x, y = x, py
                    vy = -vy * 0.72
                if hits_wall(x, y, R_B):
                    x, y = px, py
                    vx = -vx * 0.72
                    vy = -vy * 0.72
        vx *= 0.978
        vy *= 0.978
        if math.hypot(vx, vy) < 0.02:
            pts.append((x, y))
            break
        pts.append((x, y))
    return pts, None, (x, y)


def ball_future(st, maxf=120):
    vx, vy = st.bvx, st.bvy
    x, y = st.bx, st.by
    out = []
    for f in range(maxf):
        for s in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if GL_LO <= y <= GL_HI:
                if x <= 1.0 or x >= W - 1.0:
                    out.append((x, y))
                    return out
            if hits_wall(x, y, R_B):
                px = x - vx * DT / 4.0
                py = y - vy * DT / 4.0
                if hits_wall(x, py, R_B):
                    x, y = px, y
                    vx = -vx * 0.72
                if hits_wall(px, y, R_B):
                    x, y = x, py
                    vy = -vy * 0.72
                if hits_wall(x, y, R_B):
                    x, y = px, py
                    vx = -vx * 0.72
                    vy = -vy * 0.72
        vx *= 0.978
        vy *= 0.978
        if math.hypot(vx, vy) < 0.02:
            vx = vy = 0.0
        out.append((x, y))
    return out


_FFC = 0.022 / 0.55


def frames_for_dist(d):
    if d <= 0.0:
        return 0
    r = 1.0 - d * _FFC
    if r <= 1e-6:
        return 400
    return int(math.ceil(math.log(r) / math.log(0.978)))


def lane_risk(pts, units, k=0.5, skip=(), tmax=None, delay=0.0, keeper_delay=None):
    """min over units of (distance to ball path - CR - MOV*max(0,t-delay)*k).

    delay models the 1 Hz blind window: an opponent cannot react to a kick
    until its next decision window, so it only covers distance after `delay`.
    """
    if not units:
        return 9.0
    worst = 9.0
    n = len(pts) if tmax is None else min(len(pts), tmax)
    for o in units:
        if o in skip:
            continue
        m = 9.0
        ox, oy = o.x, o.y
        dly = delay
        kk = k
        if keeper_delay is not None and getattr(o, 'index', 99) == 0:
            dly = keeper_delay
        for t in range(n):
            x, y = pts[t]
            dd = math.hypot(x - ox, y - oy) - CR - MOV * max(0.0, (t + 1) * DT - dly) * kk
            if dd < m:
                m = dd
                if m < worst - 3.0:
                    break
        if m < worst:
            worst = m
            if worst < -1.5:
                break
    return worst


def dist(a, b):
    return math.hypot(a.x - b.x, a.y - b.y)


# ------------------------------------------------------------------ shooting
SHOT_TARGETS = (10.55, 11.1, 11.7, 12.3, 13.0, 13.7, 14.3, 14.9, 15.45)


def best_shot(st, u, me, units, k=0.45):
    """Return (score, angle, ty) for the best shot, or None."""
    gx = opp_gx(me)
    best = None
    for ty in SHOT_TARGETS:
        ang = math.atan2(ty - u.y, gx - u.x)
        fx, fy = math.cos(ang), math.sin(ang)
        sx, sy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
        pts, gt, end = sim_ball(sx, sy, ang, 160)
        if gt != me:
            continue
        risk = lane_risk(pts, units, 0.5, skip=(u,), delay=0.9, keeper_delay=1.0)
        if best is None or risk > best[0]:
            best = (risk, ang, ty)
    return best


def should_shoot(st, u, me, shot):
    dg = abs(opp_gx(me) - u.x)
    risk = shot[0]
    if dg <= 10.5 and risk > -0.8:
        return True
    if dg <= 14.5 and risk > -0.35:
        return True
    if dg <= 18.5 and risk > 0.25:
        return True
    if dg <= 22.0 and risk > 1.2:
        return True
    return False


# ------------------------------------------------------------------ passing
def pass_option(st, u, m, me, units, spot=None, k=0.55):
    """Evaluate a pass to mate m (possibly led toward spot)."""
    d0 = math.hypot(m.x - u.x, m.y - u.y)
    if d0 < 1.2 or d0 > 17.5:
        return None
    tx, ty = m.x, m.y
    if spot is not None:
        dx, dy = spot[0] - m.x, spot[1] - m.y
        dd = math.hypot(dx, dy)
        if dd > 0.15:
            # fixed point: meet where the ball and the runner arrive together
            for _ in range(6):
                db = math.hypot(tx - u.x, ty - u.y)
                tt = frames_for_dist(max(0.0, db - KICK_OFF)) / 20.0
                kk = min(dd, MOV * tt) / dd
                ntx, nty = m.x + dx * kk, m.y + dy * kk
                if math.hypot(ntx - tx, nty - ty) < 0.04:
                    tx, ty = ntx, nty
                    break
                tx, ty = ntx, nty
    # keep the lead point legal
    tx, ty = safe_pt(me, tx, ty, 0.6)
    ang = math.atan2(ty - u.y, tx - u.x)
    fx, fy = math.cos(ang), math.sin(ang)
    sx, sy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
    pts, gt, end = sim_ball(sx, sy, ang, 150)
    if gt is not None:
        return None
    if not pts:
        return None
    arrival = min(pts, key=lambda p: (p[0] - tx) ** 2 + (p[1] - ty) ** 2)
    miss = math.hypot(arrival[0] - tx, arrival[1] - ty)
    if miss > 1.5:
        return None
    opp_only = [x for x in units if x.team != me and x is not u and x is not m]
    risk = lane_risk(pts, opp_only, k, skip=(u, m))
    if risk < -0.8:
        return None
    prog = (tx - u.x) * atk(me)
    open_ = min([math.hypot(o.x - tx, o.y - ty) for o in units if o.team != me] or [9.0])
    sc = 0.22 * prog + 0.38 * min(risk, 2.5) - 0.02 * d0 - 0.30 * miss + 0.10 * min(open_, 4.0)
    if prog < -1.0:
        sc -= 0.9
    return (sc, ang, tx, ty, risk)


def best_pass(st, u, me, mates, units, spots, k=0.55):
    best = None
    for m in mates:
        if m is u:
            continue
        spot = spots.get(m.index) if spots else None
        po = pass_option(st, u, m, me, units, spot, k)
        if po is None:
            continue
        if best is None or po[0] > best[0]:
            best = (po[0], po[1], m.index, po[2], po[3])
    return best


# ------------------------------------------------------------------ keeper
def keeper_spot(st, me):
    gx = own_gx(me)
    sgn = atk(me)
    sp = math.hypot(st.bvx, st.bvy)
    depth = 2.0
    ty = 13.0
    moving_to_goal = (gx - st.bx) * st.bvx > 0.5 and sp > 0.8
    if moving_to_goal:
        pts = ball_future(st, 60)
        cross = None
        for (x, y) in pts:
            if (sgn > 0 and x <= gx + 0.2) or (sgn < 0 and x >= gx - 0.2):
                cross = y
                break
        if cross is not None:
            ty = cross
            depth = 0.9
    else:
        # shade slightly to the ball side
        ty = 13.0 + clamp((st.by - 13.0) * 0.25, -1.6, 1.6)
    return gx + sgn * depth, clamp(ty, 10.2, 15.8)


def keeper_cmd(st, u, me, opp):
    gx = own_gx(me)
    # collect loose balls inside our own box
    if st.owner < 0:
        d = math.hypot(st.bx - u.x, st.by - u.y)
        sp = math.hypot(st.bvx, st.bvy)
        in_own = in_box(OWNBOX[me], st.bx, st.by)
        opp_closer = any(math.hypot(o.x - st.bx, o.y - st.by) < d - 0.35 for o in opp)
        if (d < 1.8 or (in_own and sp < 6.0 and d < 4.5 and not opp_closer)):
            return (move_dir(u, st.bx, st.by, me, allow_box=True), None, False)
    tx, ty = keeper_spot(st, me)
    return (move_dir(u, tx, ty, me, allow_box=True), None, False)


# ------------------------------------------------------------------ carrier
def carrier_cmd(st, u, me, mates, units, spots, danger):
    gx = opp_gx(me)
    a = atk(me)
    shoot = best_shot(st, u, me, units)
    if shoot is not None and should_shoot(st, u, me, shoot):
        return (move_dir(u, u.x + math.cos(shoot[1]), u.y + math.sin(shoot[1]),
                         me, allow_box=False),
                math.degrees(shoot[1]) % 360.0, True)
    # pass under pressure or to a better-placed mate
    press = min([math.hypot(o.x - u.x, o.y - u.y) for o in units if o.team != me] or [9.0])
    bp = best_pass(st, u, me, mates, units, spots)
    if bp is not None:
        sc, ang, midx, tx, ty = bp
        if sc > (0.35 if press < 3.2 else 0.9):
            return (move_dir(u, u.x + math.cos(ang), u.y + math.sin(ang), me, allow_box=False),
                    math.degrees(ang) % 360.0, True)
    # otherwise drive forward: up the open touchline when far from goal
    dg = abs(gx - u.x)
    if dg > 20.0:
        wy = 4.6 if u.y < 13.0 else 21.4
        tx0 = u.x + a * 7.0
        tty = wy
    else:
        tx0 = gx - a * 9.6
        tty = clamp(u.y + (13.0 - u.y) * 0.25, 5.0, 21.0)
    tx, tty = safe_pt(me, tx0, tty, 0.95)
    # if very deep and heavily pressured, look for the keeper as a reset outlet
    return (move_dir(u, tx, tty, me, allow_box=False), None, False)


# ------------------------------------------------------------------ runners
def runner_spots(me, bx, by):
    gx = opp_gx(me)
    a = atk(me)
    xline = gx - a * 9.4
    xmid = gx - a * 12.0
    return [(xline, 5.4), (xline, 20.6), (xline, 13.0),
            (xmid, 7.5), (xmid, 18.5), (xmid, 13.0)]


def pick_spot(me, u, opp, taken, spots):
    best, bsc = None, -1e18
    for (sx, sy) in spots:
        sx, sy = safe_pt(me, sx, sy, 0.95)
        crowd = sum(max(0.0, 3.5 - math.hypot(sx - t[0], sy - t[1])) for t in taken)
        od = min([math.hypot(o.x - sx, o.y - sy) for o in opp] or [9.0])
        travel = math.hypot(sx - u.x, sy - u.y)
        bd = math.hypot(u.x - sx, u.y - sy)
        if bd < 0.4:
            bd = 0.0
        sc = min(od, 3.0) * 0.9 + min(3.0, bd) * 0.15 - crowd * 1.2 - travel * 0.02
        if best is None or sc > bsc:
            bsc, best = sc, (sx, sy)
    return best


# ------------------------------------------------------------------ defence
POST_Y1, POST_Y2 = 10.9, 15.1
KEEP_DEPTH = 2.0


def post_spot(me, which):
    gx = own_gx(me)
    sgn = atk(me)          # inward
    y = POST_Y1 if which == 0 else POST_Y2
    return gx + sgn * 0.55, y


def press_target(st, u, me, owner):
    """go for the ball, but from the goal side."""
    gx = own_gx(me)
    bx, by = st.bx, st.by
    # predicted ball position shortly ahead
    px, py = bx + st.bvx * 0.15, by + st.bvy * 0.15
    if owner is not None:
        px, py = owner.x + owner.fx * 0.62, owner.y + owner.fy * 0.62
    dx, dy = gx - px, 13.0 - py
    dd = math.hypot(dx, dy) or 1.0
    k = 0.45
    tx, ty = px + dx / dd * k, py + dy / dd * k
    return clamp(tx, 0.6, W - 0.6), clamp(ty, 0.6, H - 0.6)


def cover_target(st, me, opp, taken):
    gx = own_gx(me)
    bx, by = st.bx, st.by
    dx, dy = gx - bx, 13.0 - by
    dd = math.hypot(dx, dy) or 1.0
    k = clamp(0.42 * dd, 3.5, 10.0)
    tx, ty = bx + dx / dd * k, by + dy / dd * k
    return safe_pt(me, tx, ty, 0.9)

