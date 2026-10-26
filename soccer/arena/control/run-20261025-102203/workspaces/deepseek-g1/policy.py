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
_HOLD = {'v': 0}
_KH = {'me': None, 'start': -1, 'frame': -999}


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
SHOT_TARGETS = (10.9, 11.4, 12.0, 12.6, 13.2, 13.8, 14.4, 14.9, 15.1)


def best_shot(st, u, me, units, k=0.45):
    """Pick the goal-mouth target with the safest lane.

    The enemy keeper tracks the ball's y, so at the crossing moment it is close
    to the shooter's own y (a 1 Hz blind window means it cannot react to the
    shot itself).  We therefore score the keeper against a *predicted* lateral
    position, not its current one: shots are aimed at the corner the keeper is
    moving away from.
    """
    gx = opp_gx(me)
    opp = [o for o in units if o.team != me]
    kp = None
    for o in opp:
        if o.index == 0:
            kp = o
            break
    kp_pred = None
    if kp is not None:
        kp_pred = clamp(0.68 * u.y + 0.32 * kp.y, 10.15, 15.85)
    # shoot at the gaps of the goal-line wall as well as the plain corners
    targets = list(SHOT_TARGETS)
    wall = sorted(o.y for o in opp if abs(o.x - gx) < 3.5)
    if wall:
        gaps = [wall[0] - 0.95]
        for i in range(len(wall) - 1):
            gaps.append((wall[i] + wall[i + 1]) * 0.5)
        gaps.append(wall[-1] + 0.95)
        for y in gaps:
            if 10.5 <= y <= 15.5:
                targets.append(y)
    best = None
    for ty in targets:
        ang = math.atan2(ty - u.y, gx - u.x)
        fx, fy = math.cos(ang), math.sin(ang)
        sx, sy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
        pts, gt, end = sim_ball(sx, sy, ang, 160)
        if gt != me or not pts:
            continue
        others = [o for o in opp if o is not kp]
        risk = lane_risk(pts, others, 0.5, skip=(u,), delay=0.9) if others else 9.0
        if kp is not None:
            ci = 0
            bd = 1e9
            for i, p in enumerate(pts):
                dd = abs(p[0] - kp.x)
                if dd < bd:
                    bd = dd
                    ci = i
            crossing = pts[ci]
            dk = math.hypot(crossing[0] - kp.x, crossing[1] - kp_pred) - CR
            # after the first blind window the keeper can react at full speed;
            # long-range shots are therefore eaten alive
            t_cross = ci * DT
            dk -= MOV * max(0.0, t_cross - 1.0) * 0.85
            if dk < risk:
                risk = dk
        if best is None or risk > best[0]:
            best = (risk, ang, ty)
    return best


def should_shoot(st, u, me, shot):
    """Measured: <=13 units converts ~22%, 13-16 ~10% and everything longer is
    0%.  The kill zone against a keeper that tracks the ball is <=12.5, so the
    carrier keeps dribbling until it is really there."""
    dg = abs(opp_gx(me) - u.x)
    risk = shot[0]
    if dg <= 12.3:
        return risk > -0.75
    if dg <= 14.0:
        return risk > 0.60
    if dg <= 16.0:
        return risk > 1.60
    if dg <= 18.0:
        return risk > 2.60
    return False


# ------------------------------------------------------------------ passing
def pass_option(st, u, m, me, units, spot=None, k=0.55, delay=0.9, maxd=25.0):
    """Evaluate a pass to mate m (possibly led toward spot).

    Long passes are allowed (up to 25 units, the ball's full range) and the
    lane risk uses the 1 Hz blind window: opponents cannot react to a kick
    until their next decision window, so only bodies already close to the lane
    matter for short flights.
    """
    d0 = math.hypot(m.x - u.x, m.y - u.y)
    if d0 < 1.2 or d0 > maxd:
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
    if not pts:
        return None
    arrival = min(pts, key=lambda p: (p[0] - tx) ** 2 + (p[1] - ty) ** 2)
    ai = pts.index(arrival)
    # The ball keeps rolling after the reception and can bounce into a goal
    # many seconds later; that must not cancel a good pass.
    if gt is not None and ai >= len(pts) - 3:
        return None
    miss = math.hypot(arrival[0] - tx, arrival[1] - ty)
    if miss > 1.5:
        return None
    opp_only = [x for x in units if x.team != me and x is not u and x is not m]
    # only the flight up to the reception matters
    risk = lane_risk(pts, opp_only, k, skip=(u, m), delay=delay, tmax=ai + 8)
    if risk < -3.2:
        return None
    # who is closest to the point where the ball can actually be caught?
    arr = arrival
    oa = min([math.hypot(o.x - arr[0], o.y - arr[1]) for o in opp_only] or [9.0])
    ma = math.hypot(m.x - arr[0], m.y - arr[1])
    if oa < 1.05 and oa < ma - 0.1:
        return None                      # a defender is standing on the reception point
    prog = (tx - u.x) * atk(me)
    open_ = min([math.hypot(o.x - tx, o.y - ty) for o in units if o.team != me] or [9.0])
    sc = (0.30 * prog + 0.34 * min(risk, 2.5) - 0.012 * d0 - 0.30 * miss
          + 0.10 * min(open_, 4.0) + 0.16 * min(oa, 5.0) - 0.10 * max(0.0, ma - 1.2))
    if prog < -1.0:
        sc -= 1.2
    # passes that put the ball at the shooting line are the money ball
    if abs((opp_gx(me) - tx)) < 12.0:
        sc += 0.55
    return (sc, ang, tx, ty, risk)


def best_pass(st, u, me, mates, units, spots, k=0.55, delay=0.9, maxd=25.0):
    best = None
    for m in mates:
        if m is u:
            continue
        spot = spots.get(m.index) if spots else None
        po = pass_option(st, u, m, me, units, spot, k, delay=delay, maxd=maxd)
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
def shield_aim(st, u, me, units, prefer=None):
    """Where to point the dribbled ball (0.62 in front of facing).  Keep it as
    far as possible from every opponent: a single chaser can then never be
    within 0.5 of the ball, which is what a steal requires."""
    opp = [o for o in units if o.team != me]
    if not opp:
        return None
    best, bv = None, -1e18
    for deg in range(0, 360, 20):
        a = math.radians(deg)
        fx, fy = math.cos(a), math.sin(a)
        bx, by = u.x + fx * 0.62, u.y + fy * 0.62
        if hits_wall(bx, by, R_B):
            continue
        dmin = 9.0
        for o in opp:
            d = math.hypot(o.x - bx, o.y - by)
            if d < dmin:
                dmin = d
                if dmin < 0.6:
                    break
        v = min(dmin, 3.4)
        if prefer is not None:
            v += 0.28 * (fx * prefer[0] + fy * prefer[1])
        if v > bv:
            bv, best = v, deg
    return best


def carrier_cmd(st, u, me, mates, units, spots, danger):
    gx = opp_gx(me)
    a = atk(me)
    shoot = best_shot(st, u, me, units)
    # in a 1v1 the only defender is also the keeper: when it comes out to
    # tackle, the goal is empty and any clean long shot is worth taking
    solo = not mates
    if shoot is not None and (should_shoot(st, u, me, shoot)
                              or (solo and shoot[0] > 1.2)):
        return (move_dir(u, u.x + math.cos(shoot[1]), u.y + math.sin(shoot[1]),
                         me, allow_box=False),
                math.degrees(shoot[1]) % 360.0, True)
    # pass under pressure or to a better-placed mate
    press = min([math.hypot(o.x - u.x, o.y - u.y) for o in units if o.team != me] or [9.0])
    # A kick always carries ~25 units (fixed power + friction), so there is no
    # such thing as a short pass.  Only fire the long "money ball" to the man
    # already in the shooting band, and only when the lane is really clean.
    if mates:
        tgt = None
        for m in mates:
            if m.index == 0:
                continue
            prog_m = (m.x - own_gx(me)) * a
            if tgt is None or prog_m > (tgt.x - own_gx(me)) * a:
                tgt = m
        if tgt is not None:
            mp = pass_option(st, u, tgt, me, units, spots.get(tgt.index), k=0.55,
                             delay=0.9, maxd=27.0)
            if mp is not None:
                sc, ang, tx, ty, risk = mp
                prog = (tx - u.x) * a
                if risk > 2.0 and prog > 7.0 and abs(opp_gx(me) - tx) < 15.0:
                    return (move_dir(u, u.x + math.cos(ang), u.y + math.sin(ang),
                                     me, allow_box=False),
                            math.degrees(ang) % 360.0, True)
    # protected carrier inside our own box: launch now, never dribble in place
    if in_box(OWNBOX[me], u.x, u.y) and press < 6.0:
        ang = punt_aim(st, u, me)
        if ang is not None:
            return ('N', math.degrees(ang) % 360.0, True)
    # otherwise drive forward: the opponent holds a compact block in front of
    # the ball, so approach the shooting band along the open wing
    dg = abs(gx - u.x)
    opp = [o for o in units if o.team != me]
    band = gx - a * 10.2
    aimx = u.x + a * 6.0
    top_score = sum(1.0 / (1.0 + math.hypot(o.x - aimx, o.y - 4.6)) for o in opp)
    bot_score = sum(1.0 / (1.0 + math.hypot(o.x - aimx, o.y - 21.4)) for o in opp)
    wy = 4.6 if top_score <= bot_score else 21.4
    if dg > 11.0:
        tx0 = u.x + a * 8.0
        if (band - tx0) * a < 0.0:
            tx0 = band
        tty = wy
    else:
        tx0 = band
        tty = clamp(u.y + (13.0 - u.y) * 0.30, 7.0, 19.0)
    tx, tty = safe_pt(me, tx0, tty, 0.95)
    dx, dy = tx - u.x, tty - u.y
    dd = math.hypot(dx, dy) or 1.0
    aim = shield_aim(st, u, me, units, prefer=(dx / dd, dy / dd))
    return (move_dir(u, tx, tty, me, allow_box=False), aim, False)


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

# ------------------------------------------------------------------ plan
POST_Y1, POST_Y2 = 10.9, 15.1
SIDE_TOP, SIDE_BOT = 2.6, 23.4


def role_table(n, me):
    rt = {0: 'keeper'}
    if n == 2:
        rt[1] = 'striker'
    elif n == 3:
        rt[1] = 'post0'
        rt[2] = 'striker'
    elif n == 4:
        rt[1] = 'post0'
        rt[2] = 'striker'
        rt[3] = 'striker'
    elif n == 5:
        rt.update({1: 'post0', 2: 'post1', 3: 'striker', 4: 'striker'})
    else:
        rt.update({1: 'post0', 2: 'post1', 3: 'striker', 4: 'striker', 5: 'striker'})
    return rt


def screen_spot(st, me, role, by):
    """Defensive station.

    stopper: stand on the ball -> goal-centre line 2.2 units in front of the
    ball.  From 12 units out the goal subtends only ~23 degrees, so a body at
    2.2 units blocks the whole goal mouth: this is the only reliable way to
    stop close-range corner shots (the keeper cannot reach them).
    cover: sweep just in front of / inside our own box (opponents may not
    follow us in there).
    """
    gx = own_gx(me)
    a = atk(me)
    bx = st.bx
    d_ball = (bx - gx) * a
    if role == 'cover':
        x = gx + a * clamp(4.5 + 0.35 * d_ball, 7.0, 14.0)
        y = clamp(13.0 + (st.by - 13.0) * 0.35, 5.5, 20.5)
    else:
        if d_ball < 20.0:
            dx, dy = gx - bx, 13.0 - st.by
            dd = math.hypot(dx, dy) or 1.0
            k = clamp(0.35 * dd, 1.7, 3.0)
            x, y = bx + dx / dd * k, st.by + dy / dd * k
        else:
            x = gx + a * clamp(6.0 + 0.55 * d_ball, 10.0, 20.0)
            y = clamp(13.0 + (st.by - 13.0) * 0.35, 4.0, 22.0)
    x = clamp(x, 0.8, W - 0.8)
    y = clamp(y, 0.8, H - 0.8)
    return safe_pt(me, x, y, 0.55)


def near_far_y(by):
    if by < 13.0:
        return POST_Y1, POST_Y2
    return POST_Y2, POST_Y1


def post_spot(me, which, by):
    gx = own_gx(me)
    sgn = atk(me)
    near, far = near_far_y(by)
    y = far if which == 0 else 13.0
    return gx + sgn * 0.55, y


def keeper_rest_spot(st, me):
    gx = own_gx(me)
    sgn = atk(me)
    sp = math.hypot(st.bvx, st.bvy)
    near, far = near_far_y(st.by)
    ty = near
    depth = 0.8
    moving_to_goal = (gx - st.bx) * st.bvx > 0.6 and sp > 0.8
    if moving_to_goal:
        pts = ball_future(st, 60)
        cross = None
        for (x, y) in pts:
            if (sgn > 0 and x <= gx + 0.3) or (sgn < 0 and x >= gx - 0.3):
                cross = y
                break
        if cross is not None:
            ty = cross
            depth = 0.5
        else:
            ty = 13.0
    return gx + sgn * depth, clamp(ty, 10.2, 15.8)


_SIDE = {'me': None, 'side': None, 'frame': -999}


def choose_side(me, opp, frame=0):
    """Corridor farther from the opponents, measured at the shooting band.

    Hysteresis: recomputing every second made the open side flip constantly and
    the strikers shuffle sideways instead of getting upfield."""
    gx = opp_gx(me)
    a = atk(me)
    ax = gx - a * 10.0
    score_top = score_bot = 0.0
    for o in opp:
        score_top += 1.0 / (1.0 + math.hypot(o.x - ax, o.y - 4.2))
        score_bot += 1.0 / (1.0 + math.hypot(o.x - ax, o.y - 21.8))
    if (_SIDE['me'] != me or _SIDE['side'] is None
            or frame - _SIDE['frame'] > 300):
        side = SIDE_TOP if score_top <= score_bot else SIDE_BOT
        _SIDE.update(me=me, side=side, frame=frame)
        return side
    cur = _SIDE['side']
    if cur == SIDE_TOP and score_bot * 1.9 < score_top and frame - _SIDE['frame'] > 40:
        _SIDE.update(side=SIDE_BOT, frame=frame)
        return SIDE_BOT
    if cur == SIDE_BOT and score_top * 1.9 < score_bot and frame - _SIDE['frame'] > 40:
        _SIDE.update(side=SIDE_TOP, frame=frame)
        return SIDE_TOP
    return cur


def stage_spot(me, side):
    """Staging point just inside our own box, on the chosen wing."""
    gx = own_gx(me)
    a = atk(me)
    if side == SIDE_TOP:
        y = 6.9
    else:
        y = 19.1
    return gx + a * 8.9, y


def winger_spot(me, bx, side, slot):
    """Absolute attacking stations.  Everything stays outside the opponent box
    (shooting line xsh, 0.9 in front of it) so a receiver never has to step in.
    Slots 0-2 are the box-edge shooting stations, 3-4 the wide outlets."""
    a = atk(me)
    gx = opp_gx(me)
    xsh = gx - a * 9.9
    xw = gx - a * 12.6
    if slot == 0:
        return xsh, 13.0
    if slot == 1:
        return xsh, 10.9
    if slot == 2:
        return xsh, 15.1
    if slot == 3:
        return xw, 4.2
    return xw, 21.8


_GC = {'me': None, 'side': None, 'bx': None, 'frame': -999, 'spots': None, 'near_goal': None}


def attacker_spots(me, opp, striker_list, bx, by, side, frame, near_goal):
    """Staggered attacking shape: one striker holds the shooting line, the
    others offer a link station ~9 units ahead of the ball.  Without the link
    man the ball has to travel 20+ units in one kick, which is exactly the
    pass that gets intercepted."""
    global _GC
    fresh = (_GC['me'] == me and _GC['side'] == side and _GC['spots'] is not None
             and 0 <= frame - _GC['frame'] <= 100
             and math.hypot(bx - _GC['bx'], by - _GC['by']) < 5.0
             and _GC['near_goal'] == near_goal)
    if fresh:
        return dict(_GC['spots'])
    a = atk(me)
    gx = opp_gx(me)
    myprog = (bx - own_gx(me)) * a
    deep = gx - a * 10.1
    wing = 4.6 if side == SIDE_TOP else 21.4
    far = 21.4 if side == SIDE_TOP else 4.6
    link_lo, link_hi = sorted((gx - a * 17.0, gx - a * 10.6))
    link = clamp(bx + a * 9.0, link_lo, link_hi)
    out = {}
    ordered = sorted(striker_list, key=lambda z: z.index)
    for i, u in enumerate(ordered):
        if i == len(ordered) - 1:
            # target man: the long-ball station on the corridor the block is
            # not using, right on the shooting band
            cand = [(deep, wing), (deep, 13.0 + (wing - 13.0) * 0.45),
                    (deep, 13.0), (deep + a * 1.6, wing)]
        elif myprog > 10.0:
            # finisher / far post partner
            cand = [(deep, 13.0), (deep, 13.0 + (far - 13.0) * 0.6),
                    (deep - a * 2.0, 13.0), (deep, 13.0 + (wing - 13.0) * 0.6)]
        else:
            # link man between the build-up and the target
            cand = [(link, wing), (link, 13.0 + (wing - 13.0) * 0.5),
                    (link, 13.0), (link + a * 3.0, wing)]
        sp = pick_spot(me, u, opp, list(out.values()), cand, (bx, by))
        out[u.index] = sp
    _GC = {'me': me, 'side': side, 'bx': bx, 'by': by, 'frame': frame, 'spots': out,
           'near_goal': near_goal}
    return dict(out)


def poacher_spots(me):
    gx = opp_gx(me)
    a = atk(me)
    xsh = gx - a * 9.9
    xw = gx - a * 12.6
    return [(xsh, 13.0), (xsh, 10.9), (xsh, 15.1),
            (xw, 4.2), (xw, 21.8), (xw, 9.0), (xw, 17.0), (xw, 13.0)]


def pick_spot(me, u, opp, taken, spots, ball_xy=None):
    best, bsc = None, -1e18
    for (sx, sy) in spots:
        sx, sy = safe_pt(me, sx, sy, 0.95)
        crowd = sum(max(0.0, 3.5 - math.hypot(sx - t[0], sy - t[1])) for t in taken)
        od = min([math.hypot(o.x - sx, o.y - sy) for o in opp] or [9.0])
        travel = math.hypot(sx - u.x, sy - u.y)
        lead = (sx - u.x) * atk(me)
        sc = min(od, 3.5) * 0.9 + min(5.0, lead) * 0.15 - crowd * 1.1 - travel * 0.02
        if ball_xy is not None:
            bd = math.hypot(sx - ball_xy[0], sy - ball_xy[1])
            if bd > 15.0:
                sc -= (bd - 15.0) * 0.7
            if bd < 4.0:
                sc -= (4.0 - bd) * 0.25
        if best is None or sc > bsc:
            bsc, best = sc, (sx, sy)
    return best


def build_plan(st, me, n):
    my = [u for u in st.units if u.team == me]
    opp = [u for u in st.units if u.team != me]
    rush = bool(st.golden) or (st.frame >= 2100 and st.score[0] == st.score[1])
    plan = {'mode': 'loose', 'carrier': None, 'roles': role_table(n, me),
            'spots': {}, 'chaser': None, 'side': choose_side(me, opp, st.frame), 'rush': rush}
    if not my:
        return plan
    owner = st.units[st.owner] if 0 <= st.owner < len(st.units) else None
    bx, by = st.bx, st.by
    side = plan['side']
    if n == 1:
        if owner is not None and owner.team == me:
            plan['mode'] = 'solo_off'
        elif owner is not None:
            plan['mode'] = 'solo_def'
        else:
            plan['mode'] = 'solo_loose'
        return plan
    fielders = [u for u in my if u.index != 0]
    d_def = (bx - own_gx(me)) * atk(me)
    d_atk = (opp_gx(me) - bx) * atk(me)
    striker_list = [u for u in fielders if plan['roles'].get(u.index) == 'striker']

    if owner is not None and owner.team == me:
        plan['mode'] = 'off'
        plan['carrier'] = owner.index
        near_goal = d_atk < 22.0
        striker_list.sort(key=lambda z: z.index)
        plan['spots'].update(attacker_spots(me, opp, striker_list, bx, by, side,
                                            st.frame, near_goal))
        prog = max(0.0, (bx - own_gx(me)) * atk(me))
        for u in fielders:
            role = plan['roles'].get(u.index)
            if role == 'post0':
                # far-post wall man; when the ball is upfield he steps out to
                # the protected launch platform at the edge of our own box
                if prog > 20.0:
                    lp = (own_gx(me) + atk(me) * 8.6,
                          6.9 if side == SIDE_TOP else 19.1)
                    plan['spots'][u.index] = safe_pt(me, lp[0], lp[1], 0.4)
                else:
                    plan['spots'][u.index] = post_spot(me, 0, by)
            elif role == 'post1':
                plan['spots'][u.index] = post_spot(me, 1, by)
        if owner.index == 0:
            # keeper on the ball: a protected outlet inside our own box takes
            # the first pass, then launches; holding is never an option
            plan['mode'] = 'keeper'
            lp = outlet_spot(me, side)
            cand = [u for u in fielders if plan['roles'].get(u.index) == 'post0']
            cand = cand or fielders
            ou = min(cand, key=lambda z: math.hypot(z.x - lp[0], z.y - lp[1]))
            plan['outlet'] = ou.index
            plan['spots'][ou.index] = lp
        return plan
    if owner is not None:
        plan['mode'] = 'def'
        d_def = (bx - own_gx(me)) * atk(me)
        wing = 4.6 if side == SIDE_TOP else 21.4
        for u in fielders:
            role = plan['roles'].get(u.index)
            if role == 'post0':
                plan['spots'][u.index] = post_spot(me, 0, by)
            elif role == 'post1':
                plan['spots'][u.index] = post_spot(me, 1, by)
            elif n == 2 and d_def < 26.0:
                plan['spots'][u.index] = post_spot(me, 0, by)
            else:
                rs = [(opp_gx(me) - atk(me) * 10.0, wing),
                      (opp_gx(me) - atk(me) * 10.0, 13.0),
                      (opp_gx(me) - atk(me) * 14.0, wing),
                      (opp_gx(me) - atk(me) * 10.0, 13.0 + (wing - 13.0) * 0.6)]
                sp = pick_spot(me, u, opp, [], rs, (bx, by))
                plan['spots'][u.index] = sp
        return plan
    plan['mode'] = 'loose'
    if fielders:
        pts = ball_future(st, 80)

        def itime(unit):
            for kk, pt in enumerate(pts):
                if math.hypot(pt[0] - unit.x, pt[1] - unit.y) <= MOV * (kk + 1) * DT + CR * 0.9:
                    return kk
            return 999
        ranked = sorted(fielders, key=itime)
        mine_t = itime(ranked[0])
        opp_t = min([itime(o) for o in opp] or [999])
        plan['chaser'] = ranked[0].index
        taken = []
        wing = 4.6 if side == SIDE_TOP else 21.4
        for u in fielders:
            role = plan['roles'].get(u.index)
            if role == 'post0':
                plan['spots'][u.index] = post_spot(me, 0, by)
            elif role == 'post1':
                plan['spots'][u.index] = post_spot(me, 1, by)
            else:
                sp = pick_spot(me, u, opp, taken,
                               [(opp_gx(me) - atk(me) * 10.0, wing),
                                (opp_gx(me) - atk(me) * 10.0, 13.0),
                                (opp_gx(me) - atk(me) * 13.0, wing)], (bx, by))
                plan['spots'][u.index] = sp
                taken.append(sp)
        if d_def < 18.0 and opp_t + 2 < mine_t:
            plan['chaser'] = None
    return plan


def lane_clear_short(bx, by, px, py, opps):
    dx, dy = px - bx, py - by
    D = math.hypot(dx, dy)
    if D < 1e-6:
        return 9.0
    ux, uy = dx / D, dy / D
    best = 9.0
    for o in opps:
        ex, ey = o.x - bx, o.y - by
        proj = ex * ux + ey * uy
        if proj < -0.3 or proj > D + 0.6:
            continue
        perp = abs(ex * uy - ey * ux)
        if perp - 0.82 < best:
            best = perp - 0.82
    return best


def punt_aim(st, u, me):
    """Clear the ball to space: max forward gain with a lane no opponent can
    reach inside the 1 Hz blind window.  Landing inside the opponent box is
    penalised (their keeper collects it)."""
    a = atk(me)
    opp = [o for o in st.units if o.team != me]
    mates = [m for m in st.units if m.team == me and m is not u]
    best, bsc = None, -1e18
    for deg in range(-85, 86, 5):
        base = 0.0 if a > 0 else 180.0
        ang = math.radians(base + deg)
        fx, fy = math.cos(ang), math.sin(ang)
        sx, sy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
        if not (0.3 < sx < W - 0.3 and 0.3 < sy < H - 0.3):
            continue
        pts, gt, end = sim_ball(sx, sy, ang, 90)
        if gt is not None or not pts:
            continue
        ex, ey = pts[-1]
        adv = (ex - u.x) * a
        risk = lane_risk(pts, opp, 0.7, skip=(u,), delay=1.0)
        mate_d = min([math.hypot(m.x - ex, m.y - ey) for m in mates] or [12.0])
        opp_d = min([math.hypot(o.x - ex, o.y - ey) for o in opp] or [12.0])
        sc = adv * 0.10 + min(risk, 3.0) * 0.60
        sc -= 0.10 * min(mate_d, 10.0) + 0.12 * min(opp_d, 10.0)
        if in_box(OBOX[me], ex, ey):
            sc -= 1.6
        if best is None or sc > bsc:
            bsc, best = sc, ang
    return best


def keeper_hold_cmd(st, u, me, mates, opp, plan):
    """The keeper must never sit on the ball: pass to the free outlet inside our
    own box, else launch long, else clear.  Holding is a 0:0 machine."""
    spots = plan.get('spots', {})
    hold = _HOLD.get('v', 0)
    bp = best_pass(st, u, me, mates, st.units, spots, k=0.5, delay=0.85, maxd=24.0)
    if bp is not None and bp[0] > 0.7:
        return ('N', math.degrees(bp[1]) % 360.0, True)
    if bp is not None and hold >= 6 and bp[0] > -0.6:
        return ('N', math.degrees(bp[1]) % 360.0, True)
    ang = punt_aim(st, u, me)
    if ang is not None:
        pts, gt, end = sim_ball(u.x + math.cos(ang) * KICK_OFF, u.y + math.sin(ang) * KICK_OFF, ang, 90)
        adv = (pts[-1][0] - u.x) * atk(me) if pts else 0.0
        if hold >= 18 or adv > 6.0:
            return ('N', math.degrees(ang) % 360.0, True)
    if bp is not None:
        return ('N', math.degrees(bp[1]) % 360.0, True)
    # nothing at all: shuffle to the open box edge to open an angle
    lp = outlet_spot(me, plan.get('side', SIDE_BOT), st)
    return (move_dir(u, lp[0], lp[1], me, allow_box=True), None, False)


def outlet_spot(me, side, st=None):
    """Protected launch platform inside our own box."""
    gx = own_gx(me)
    a = atk(me)
    y = 4.3 if side == SIDE_TOP else 21.7
    return gx + a * 8.6, y


def keeper_cmd(st, u, me, opp):
    if st.owner < 0:
        d = math.hypot(st.bx - u.x, st.by - u.y)
        sp = math.hypot(st.bvx, st.bvy)
        in_own = in_box(OWNBOX[me], st.bx, st.by)
        opp_closer = any(math.hypot(o.x - st.bx, o.y - st.by) < d - 0.35 for o in opp)
        if (d < 1.6 or (in_own and sp < 6.0 and d < 4.5 and not opp_closer)):
            return (move_dir(u, st.bx, st.by, me, allow_box=True), None, False)
    tx, ty = keeper_rest_spot(st, me)
    return (move_dir(u, tx, ty, me, allow_box=True), None, False)


# ------------------------------------------------------------- exec
def move_dir_avoid(u, tx, ty, me, opp, allow_box=False, m=SAFE_M, speed=MOV, avoid_r=2.6):
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
        for o in opp:
            ox, oy = o.x - u.x, o.y - u.y
            od = math.hypot(ox, oy)
            if od < avoid_r and od > 1e-6:
                dot = (vx * ox + vy * oy) / od
                if dot > 0.0:
                    v -= dot * (avoid_r - od) / avoid_r * 1.5
        if v > bestv:
            bestv, best = v, name
    return best or 'N'


def chase_ball(st, u, me, allow_box=True, maxf=60):
    pts = ball_future(st, maxf)
    idx = 999
    for kk, pt in enumerate(pts):
        if math.hypot(pt[0] - u.x, pt[1] - u.y) <= MOV * (kk + 1) * DT + CR * 0.9:
            idx = kk
            break
    tgt = pts[min(idx, len(pts) - 1)] if pts else (st.bx, st.by)
    return (move_dir(u, tgt[0], tgt[1], me, allow_box=allow_box), None, False)


def striker_move(u, sp, opp, me):
    """Route through the touchline corridor when the direct lane is blocked."""
    a = atk(me)
    corridor = 2.6 if sp[1] < 13.0 else 23.4
    # if we are inside the middle band and still need to gain ground, hug the line
    need_ground = (sp[0] - u.x) * a > 3.0
    in_band = 5.5 < u.y < 20.5
    if need_ground and in_band and abs(u.y - corridor) > 1.6:
        # check whether an opponent blocks the vertical slide
        blocked = any(math.hypot(o.x - u.x, o.y - corridor) < 1.6 for o in opp)
        if not blocked:
            return move_dir_avoid(u, u.x, corridor, me, opp, allow_box=False)
    if need_ground and not in_band:
        ty = corridor
    else:
        ty = sp[1]
    return move_dir_avoid(u, sp[0], ty, me, opp, allow_box=False)


def exec_plan(st, me, n, plan, A):
    my = [u for u in st.units if u.team == me]
    opp = [u for u in st.units if u.team != me]
    if not my:
        return {}
    cmds = {}
    owner = st.units[st.owner] if 0 <= st.owner < len(st.units) else None
    mode = plan['mode']

    if n == 1:
        u = my[0]
        if mode == 'solo_off' and owner is u:
            cmds[0] = carrier_cmd(st, u, me, [], st.units, {}, None)
        elif mode == 'solo_def' or (mode == 'solo_off' and owner is not u):
            dx, dy = own_gx(me) - st.bx, 13.0 - st.by
            dd = math.hypot(dx, dy) or 1.0
            k = clamp(0.30 * math.hypot(st.bx - own_gx(me), st.by - 13.0), 0.7, 5.0)
            tx, ty = st.bx + dx / dd * k, st.by + dy / dd * k
            cmds[0] = (move_dir(u, tx, ty, me, allow_box=True), None, False)
        else:
            cmds[0] = chase_ball(st, u, me, True, 80)
        return cmds

    keeper = my[0]
    fielders = [u for u in my if u.index != 0]
    roles = plan['roles']
    carrier = owner if (owner is not None and owner.team == me) else None

    if keeper is carrier:
        cmds[0] = keeper_hold_cmd(st, keeper, me, fielders, opp, plan)
    elif carrier is not None:
        idx = carrier.index
        role = roles.get(idx, 'striker')
        mates = [u for u in fielders if u is not carrier] + [keeper]
        cmds[carrier.index] = carrier_cmd(st, carrier, me, mates, st.units, plan['spots'], None)
    for u in fielders:
        if u.index in cmds:
            continue
        role = roles.get(u.index, 'striker')
        if owner is u:
            continue
        if mode == 'keeper' and plan.get('outlet') == u.index:
            lp = plan['spots'].get(u.index) or outlet_spot(me, plan.get('side', SIDE_BOT))
            cmds[u.index] = (move_dir_avoid(u, lp[0], lp[1], me, opp, allow_box=True,
                                            avoid_r=1.6), None, False)
            continue
        if role in ('post0', 'post1'):
            which = 0 if role == 'post0' else 1
            p = plan['spots'].get(u.index)
            if p is None:
                p = post_spot(me, which, st.by)
            if plan.get('rush') and role == 'post0':
                p = safe_pt(me, *winger_spot(me, st.bx, plan.get('side', SIDE_BOT), 0), m=0.95)
            if owner is None and mode == 'loose':
                # loose ball rolling into our own box: come and collect it
                d_ball = math.hypot(st.bx - u.x, st.by - u.y)
                if d_ball < 7.0 and (st.bx - own_gx(me)) * atk(me) < 15.0:
                    cmds[u.index] = chase_ball(st, u, me, True, 60)
                    continue
            cmds[u.index] = (move_dir(u, p[0], p[1], me, allow_box=True), None, False)
        else:
            sp = plan['spots'].get(u.index)
            if sp is None:
                sp = winger_spot(me, st.bx, plan.get('side', SIDE_BOT), 0)
            if owner is not None and owner.team != me and math.hypot(owner.x - u.x, owner.y - u.y) < 9.0:
                tx, ty = press_target(st, u, me, owner)
                cmds[u.index] = (move_dir(u, tx, ty, me, allow_box=False), None, False)
            else:
                cmds[u.index] = (striker_move(u, sp, opp, me),
                                 math.degrees(math.atan2(13.0 - u.y, opp_gx(me) - u.x)) % 360.0, False)
    if 0 not in cmds:
        cmds[0] = keeper_cmd(st, keeper, me, opp)
    if owner is None and mode == 'loose' and plan.get('chaser') is not None:
        cidx = plan['chaser']
        c = next((u for u in my if u.index == cidx), None)
        if c is not None and c.index != 0:
            cmds[c.index] = chase_ball(st, c, me, False, 60)
    return cmds


def opp_model(st, o, me):
    pts = ball_future(st, 40)
    tx, ty = (pts[min(len(pts) - 1, 10)] if pts else (st.bx, st.by))
    return (move_dir(o, tx, ty, 1 - me), None, False)


def decide(s0, me, n, A):
    frames = []
    st = s0.clone()
    owner0 = st.units[st.owner] if 0 <= st.owner < len(st.units) else None
    if owner0 is not None and owner0.team == me and owner0.index == 0 and not st.golden:
        if _KH['me'] != me or st.frame - _KH['frame'] > 25:
            _KH['me'] = me
            _KH['start'] = st.frame
        _KH['frame'] = st.frame
        _HOLD['v'] = max(0, st.frame - _KH['start'])
    else:
        _HOLD['v'] = 0
        _KH['frame'] = -999
    plan = build_plan(st, me, n)
    prev_owner = st.owner
    for f in range(20):
        if st.status != 'playing':
            break
        cmds = exec_plan(st, me, n, plan, A)
        inp = []
        for u in st.units:
            if u.team == me:
                c = cmds.get(u.index, ('N', None, False))
                aim = None
                if c[1] is not None:
                    a = math.radians(c[1] % 360.0)
                    aim = (math.cos(a), math.sin(a))
                inp.append((c[0], aim, bool(c[2])))
            else:
                inp.append(opp_model(st, u, me))
        frames.append(dict(((u.team, u.index), inp[i]) for i, u in enumerate(st.units)))
        g = A.step(st, inp, st.kickoffTeam)
        if g >= 0:
            st.score[g] += 1
            if st.golden:
                st.status = 'finished'
                break
            A.kickoff(st, 1 - g)
            plan = build_plan(st, me, n)
            prev_owner = st.owner
            continue
        if st.owner != prev_owner:
            # a kick / tackle just changed possession: replan at once so the
            # intended receiver starts chasing the loose ball inside the window
            plan = build_plan(st, me, n)
            prev_owner = st.owner
    while len(frames) < 20:
        frames.append({})
    return frames
