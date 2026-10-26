# -*- coding: utf-8 -*-
"""New decision core for deepseek-g1 soccer agent.

Doctrine:
  * keeper stays 2.2-2.8 from its goal line, tracks the ball's projected
    crossing point, collects loose balls near/inside its own box;
  * field players: nearest one chases the ball, others hold zones; forwards
    live in the two corridors (y<5 / y>21) next to the opponent box and in the
    box-edge band x=32.6 ;
  * carrier shoots whenever a lane to the mouth exists from <= 13.5 units;
    otherwise passes to a better-placed mate or clears up-field;
  * never enter the opponent box + 1.25 margin.

The module only relies on the physics helpers exposed by agent.py.
"""

import math
import os

KEEPMODE = os.environ.get('SOC2_KEEPMODE', 'center')

W, H = 44.0, 26.0
DT = 0.05
MOV = 3.15
DRIB = 0.58 * MOV
CR = 0.82
R_B = 0.22
KICK_OFF = 0.69
GOAL_LO, GOAL_HI = 10.5, 15.5

MY_GOAL = {0: 1.0, 1: 43.0}
OPP_GOAL = {0: 43.0, 1: 1.0}
ATK = {0: 1.0, 1: -1.0}
# opponent box (we may not enter)
OBOX = {0: (34.0, 6.0, 43.0, 20.0), 1: (1.0, 6.0, 10.0, 20.0)}
SAFE = 1.25

SQ2 = 0.7071067811865476
DIRS = {
    'N': (0.0, 0.0), 'U': (0.0, -1.0), 'D': (0.0, 1.0),
    'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-SQ2, -SQ2), 'UR': (SQ2, -SQ2), 'DL': (-SQ2, SQ2), 'DR': (SQ2, SQ2),
}
DIR_KEYS = tuple(DIRS.keys())

_WALL = bytearray(int(W) * int(H))
for _y in range(int(H)):
    for _x in range(int(W)):
        if _x == 0 or _y == 0 or _x == int(W) - 1 or _y == int(H) - 1:
            if (_x == 0 or _x == int(W) - 1) and 10 <= _y < 16:
                continue
            _WALL[_y * int(W) + _x] = 1


def tile_at(x, y):
    tx = int(math.floor(x))
    ty = int(math.floor(y))
    if tx < 0 or ty < 0 or tx >= W or ty >= H:
        return 1
    return _WALL[ty * int(W) + tx]


def hits_wall(x, y, r):
    k = r * SQ2
    for px, py in ((x - r, y), (x + r, y), (x, y - r), (x, y + r),
                   (x - k, y - k), (x + k, y - k), (x - k, y + k), (x + k, y + k)):
        if tile_at(px, py):
            return True
    return False


def in_box(team_box, x, y):
    b = OBOX[team_box]
    return b[0] <= x <= b[2] and b[1] <= y <= b[3]


def in_danger(me, x, y, m=SAFE):
    b = OBOX[me]
    return b[0] - m <= x <= b[2] + m and b[1] - m <= y <= b[3] + m


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


def safe_pt(me, x, y, m=SAFE):
    x = clamp(x, 0.55, W - 0.55)
    y = clamp(y, 0.55, H - 0.55)
    if not in_danger(me, x, y, m):
        return x, y
    b = OBOX[me]
    cands = [
        (b[0] - m, clamp(y, b[1], b[3])),
        (b[2] + m, clamp(y, b[1], b[3])),
        (clamp(x, b[0], b[2]), b[1] - m),
        (clamp(x, b[0], b[2]), b[3] + m),
    ]
    best, bd = None, 1e9
    for cx, cy in cands:
        if not (0.55 <= cx <= W - 0.55 and 0.55 <= cy <= H - 0.55):
            continue
        d = math.hypot(cx - x, cy - y)
        if d < bd:
            bd, best = d, (cx, cy)
    return best if best else (clamp(x, 0.55, W - 0.55), clamp(y, 0.55, H - 0.55))


def step_ok(me, x, y, dx, dy, hor=5, m=SAFE):
    for k in range(1, hor + 1):
        if in_danger(me, x + dx * MOV * DT * k, y + dy * MOV * DT * k, m):
            return False
    return True


def move_dir(st, u, tx, ty, me, allow_box=False, speed=None):
    """8-direction choice towards (tx,ty); hard filter against opponent box."""
    dx, dy = tx - u.x, ty - u.y
    d = math.hypot(dx, dy)
    if d < 0.08:
        return 'N'
    ux, uy = dx / d, dy / d
    best, bv = 'N', -1e9
    for name in DIR_KEYS:
        vx, vy = DIRS[name]
        v = vx * ux + vy * uy
        if not allow_box:
            hard = False
            soft = 0
            for k in range(1, 6):
                nx = u.x + vx * MOV * DT * k
                ny = u.y + vy * MOV * DT * k
                if in_box(me, nx, ny):
                    hard = True
                    break
                if in_danger(me, nx, ny, SAFE):
                    soft += 1
            if hard:
                v -= 1000.0
            elif soft:
                v -= 3.0 * soft
        if v > bv:
            bv, best = v, name
    return best


# ------------------------------------------------------------------ ball sim
def sim_ball(bx, by, ang, maxf=200, stop_at_goal=True):
    """Faithful ball flight. Returns (points, goal_team_or_None, end_xy)."""
    vx, vy = 11.0 * math.cos(ang), 11.0 * math.sin(ang)
    x, y = bx, by
    pts = []
    for f in range(maxf):
        for s in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if GOAL_LO <= y <= GOAL_HI:
                if x <= 1.0:
                    return pts, 1, (x, y)
                if x >= W - 1.0:
                    return pts, 0, (x, y)
            if hits_wall(x, y, R_B):
                px = x - vx * DT / 4.0
                py = y - vy * DT / 4.0
                if hits_wall(x, py, R_B):
                    x = px
                    vx = -vx * 0.72
                if hits_wall(px, y, R_B):
                    y = py
                    vy = -vy * 0.72
                if hits_wall(x, y, R_B):
                    x, y = px, py
                    vx = -vx * 0.72
                    vy = -vy * 0.72
        vx *= 0.978
        vy *= 0.978
        if math.hypot(vx, vy) < 0.02:
            vx = vy = 0.0
            pts.append((x, y))
            break
        pts.append((x, y))
    return pts, None, (x, y)


def ball_future(st, maxf=90):
    """Existing ball flight from the current state (uses current velocity)."""
    vx, vy = st.bvx, st.bvy
    x, y = st.bx, st.by
    out = []
    for f in range(maxf):
        for s in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if GOAL_LO <= y <= GOAL_HI:
                if x <= 1.0 or x >= W - 1.0:
                    out.append((x, y))
                    return out
            if hits_wall(x, y, R_B):
                px = x - vx * DT / 4.0
                py = y - vy * DT / 4.0
                if hits_wall(x, py, R_B):
                    x = px
                    vx = -vx * 0.72
                if hits_wall(px, y, R_B):
                    y = py
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
    if d <= 0:
        return 0
    r = 1.0 - d * _FFC
    if r <= 1e-6:
        return 400
    return int(math.ceil(math.log(r) / math.log(0.978)))


def predict_to(x, y, tx, ty, secs, speed=MOV):
    d = math.hypot(tx - x, ty - y)
    if d < 0.05:
        return x, y
    k = min(d, speed * secs) / d
    return x + (tx - x) * k, y + (ty - y) * k


def lane_risk(pts, opps, k_move=0.75):
    """min over opponents of (dist to ball path - CR - MOV*t*k). >0 means clear."""
    if not opps:
        return 9.0
    worst = 9.0
    for o in opps:
        m = 9.0
        for t, (x, y) in enumerate(pts):
            tt = (t + 1) * DT
            d = math.hypot(x - o.x, y - o.y) - CR - MOV * tt * k_move
            if d < m:
                m = d
                if m < worst - 3.0:
                    break
        if m < worst:
            worst = m
    return worst


def shot_aims(st, u, me, step=0.35):
    """candidate aim angles that reach the opponent mouth."""
    gx = OPP_GOAL[me]
    out = []
    y = 10.65
    while y <= 15.35:
        ang = math.atan2(y - u.y, gx - u.x)
        fx, fy = math.cos(ang), math.sin(ang)
        sx, sy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
        pts, gt, end = sim_ball(sx, sy, ang)
        if gt is not None and gt == me:
            out.append((ang, pts, end))
        y += step
    return out


def best_shot(st, u, me, opp, k_move=0.8, ignore=()):
    """returns (score, angle, end) or None. score>=0 means usable."""
    gx = OPP_GOAL[me]
    dgoal = abs(gx - u.x)
    if dgoal > 24.6:
        return None
    blockers = [o for o in opp if o not in ignore]
    best = None
    for ang, pts, end in shot_aims(st, u, me):
        risk = lane_risk(pts, blockers, k_move)
        # late/close shots are better; near-post cut is fine
        q = risk + max(0.0, 15.0 - dgoal) * 0.05
        if best is None or q > best[0]:
            best = (q, ang, end)
    if best is None:
        return None
    return best


def pass_score(st, u, me, tx, ty, opp, mate=None, mate_target=None):
    """missile-style pass: lead the receiver to where it will be on arrival."""
    d0 = math.hypot(tx - u.x, ty - u.y)
    t_arr = frames_for_dist(d0) / 20.0
    if mate is not None and mate_target is not None:
        # solve the meeting point: receiver runs to its target, ball flies to it
        meet = None
        for ti in (0.6, 1.0, 1.5, 2.0, 2.5, 3.0, 3.6, 4.2, 5.0, 5.8, 6.6):
            px, py = predict_to(mate.x, mate.y, mate_target[0], mate_target[1], ti)
            db = math.hypot(px - u.x, py - u.y) - KICK_OFF
            if db <= 0:
                continue
            if frames_for_dist(db) / 20.0 <= ti + 0.06:
                meet = (px, py)
                break
        if meet is None:
            return None
        tx, ty = meet
    ang = math.atan2(ty - u.y, tx - u.x)
    fx, fy = math.cos(ang), math.sin(ang)
    sx, sy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
    d = math.hypot(tx - sx, ty - sy)
    if d > 26.0:
        return None
    pts, gt, end = sim_ball(sx, sy, ang)
    if not pts:
        return None
    if gt is not None and gt != me:
        return None          # own goal: never pass into our own net
    arrival = min(pts, key=lambda p: math.hypot(p[0] - tx, p[1] - ty))
    miss = math.hypot(arrival[0] - tx, arrival[1] - ty)
    if miss > 1.4:
        return None
    risk = lane_risk(pts, opp, 0.6)
    if risk < -0.9:
        return None
    adv = (tx - u.x) * ATK[me]
    open_ = 9.0
    if mate is not None:
        # openness at the predicted reception point
        open_ = min([math.hypot(o.x - tx, o.y - ty) for o in opp] or [9.0])
    sc = min(risk, 3.0) * 0.7 + adv * 0.14 + min(open_, 4.0) * 0.30 - miss * 0.4
    if adv < 0:
        sc -= 1.1
    return sc, ang, arrival


def clear_score(st, u, me, opp):
    """kick toward opponent half away from nearest opponents"""
    best = None
    for deg in range(0, 360, 12):
        ang = math.radians(deg)
        fx, fy = math.cos(ang), math.sin(ang)
        sx, sy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
        if not (0.3 < sx < W - 0.3 and 0.3 < sy < H - 0.3):
            continue
        pts, gt, end = sim_ball(sx, sy, ang, maxf=120)
        if gt is not None:
            continue  # own goals are avoided by caller (goal team!=me)
        risk = lane_risk(pts, opp, 0.5)
        adv = (end[0] - u.x) * ATK[me]
        sc = adv * 0.06 + min(risk, 3.0) * 0.5
        if best is None or sc > best[0]:
            best = (sc, ang)
    return best


# ------------------------------------------------------------------ keeper
def keeper_spot(st, me):
    gx = MY_GOAL[me]
    sgn = 1.0 if me == 0 else -1.0   # inward direction
    bx, by = st.bx, st.by
    sp = math.hypot(st.bvx, st.bvy)
    # opponent shooting pattern: near post. Pre-position on the ball->near-post line
    plane = gx + sgn * 2.0
    target_y = 13.0
    if KEEPMODE != 'center' and abs(by - 13.0) > 2.5 and abs(gx - bx) > 3.0:
        if KEEPMODE == 'near':
            post = 10.6 if by < 13.0 else 15.4
        else:  # far post
            post = 15.4 if by < 13.0 else 10.6
        frac = clamp((plane - bx) / (gx - bx), 0.0, 1.25)
        target_y = by + (post - by) * frac
    if sp > 1.0:
        pts = ball_future(st, 120)
        for (x, y) in pts:
            if (sgn > 0 and x <= plane) or (sgn < 0 and x >= plane):
                if 0 <= y <= H:
                    target_y = y
                break
    target_y = clamp(target_y, 10.7, 15.3)
    depth = 2.35
    if abs(bx - gx) < 7.0:
        depth = 1.35
    px = gx + sgn * depth
    return px, clamp(target_y, 10.75, 15.25)


def keeper_cmds(st, k, me, opp, n):
    bx, by = st.bx, st.by
    gx = MY_GOAL[me]
    atk = ATK[me]
    dgoal = math.hypot(bx - gx, by - 13.0)
    owner = st.units[st.owner] if st.owner >= 0 else None
    # collect a loose ball only inside our own box / very near the goal
    if owner is None:
        d = math.hypot(bx - k.x, by - k.y)
        slow = math.hypot(st.bvx, st.bvy) < 5.5
        near_goal = dgoal < 9.0
        opp_closer = any(math.hypot(o.x - bx, o.y - by) < d - 0.2 for o in opp)
        if (d < 2.6 or (near_goal and slow and d < 5.5 and not opp_closer)):
            dname = move_dir(st, k, bx, by, me, allow_box=True)
            return (dname, math.degrees(math.atan2(13.0 - k.y, gx - k.x)) % 360.0, False)
    tx, ty = keeper_spot(st, me)
    dname = move_dir(st, k, tx, ty, me, allow_box=True)
    # face the ball (so a save kick goes forward-ish)
    aim = math.degrees(math.atan2(by - k.y, bx - k.x)) % 360.0
    return (dname, aim, False)


# ------------------------------------------------------------------ carrier
def best_kick(st, u, me, opp, mates, mate_targets=None):
    """returns (score, angle, kind) or None. kind in shot/pass/long/clear."""
    gx = OPP_GOAL[me]
    dgoal = abs(gx - u.x)
    cands = []
    # opponents that just kicked are in control lock: a shot can pass through them
    locked = [o for o in opp if o.controlLock > 0 and
              math.hypot(o.x - u.x, o.y - u.y) < 3.2]
    sh = best_shot(st, u, me, opp, ignore=locked)
    if sh is not None:
        q, ang, endp = sh
        if q > -0.15 or (locked and q > -1.2):
            score = 2.2 + min(q, 3.0) * 1.4 + max(0.0, 13.5 - dgoal) * 0.12
            if locked:
                score += 0.6
            cands.append((score, ang, 'shot'))
    for m in mates:
        tgtm = mate_targets.get(m.index) if mate_targets else None
        ps = pass_score(st, u, me, m.x, m.y, opp, mate=m, mate_target=tgtm)
        if ps is not None and ps[0] > 0.1:
            sc, ang, arr = ps
            md = abs(gx - m.x)
            bonus = 0.55 if md < 14 else (-0.25 if md > 26 else 0.0)
            cands.append((sc * 0.6 + bonus, ang, 'pass'))
    # punt into the corridor where our forwards already wait (race ball)
    gxd = ATK[me]
    for xx in (gx - gxd * 8.0, gx - gxd * 14.0):
        for yy in (4.0, 21.8):
            spx, spy = safe_pt(me, xx, yy, SAFE)
            ang = math.atan2(spy - u.y, spx - u.x)
            fx, fy = math.cos(ang), math.sin(ang)
            sx, sy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
            if math.hypot(spx - sx, spy - sy) < 4.0:
                continue
            pts2, gt2, endp = sim_ball(sx, sy, ang)
            if gt2 is not None and gt2 != me:
                continue
            endp = pts2[-1] if pts2 else endp
            dme = min([math.hypot(m.x - endp[0], m.y - endp[1]) for m in mates] or [99.0])
            dop = min([math.hypot(o.x - endp[0], o.y - endp[1]) for o in opp] or [99.0])
            if dme < dop + 1.0 and dme < 7.0:
                sc = 0.9 + (dop - dme) * 0.55 - dme * 0.05
                cands.append((sc, ang, 'long'))
    # long ball to corridor spots only from mid/up field
    if abs(gx - u.x) < 30:
        for xx in (gx - gxd * 6.0, gx - gxd * 11.0, gx - gxd * 17.0):
            for yy in (4.2, 21.8):
                ps = pass_score(st, u, me, xx, yy, opp)
                if ps is not None and ps[0] > 0.3:
                    cands.append((ps[0] * 0.42 + 0.1, ps[1], 'long'))
    if not cands:
        return None
    cands.sort(key=lambda c: -c[0])
    return cands[0]


def pressure(st, u, opp):
    d = 9.0
    for o in opp:
        dd = math.hypot(o.x - u.x, o.y - u.y)
        if dd < d:
            d = dd
    return d


_ST = {'hist': [], 'force': False}


def carrier_cmds(st, u, me, opp, mates, solo=False, mate_targets=None, prefer_kick=False):
    gx = OPP_GOAL[me]
    best = best_kick(st, u, me, opp, mates, mate_targets)
    press = pressure(st, u, opp)
    if _ST.get('force') and not solo:
        if best is not None and best[0] > -5.0:
            ang = best[1]
            return (move_dir(st, u, u.x + math.cos(ang), u.y + math.sin(ang), me),
                    math.degrees(ang) % 360.0, True)
        cl = clear_score(st, u, me, opp)
        if cl is not None:
            ang = cl[1]
            return (move_dir(st, u, u.x + math.cos(ang), u.y + math.sin(ang), me),
                    math.degrees(ang) % 360.0, True)
    if prefer_kick and best is not None and best[0] > 0.2 and press > 3.0:
        score, ang, kind = best
        return (move_dir(st, u, u.x + math.cos(ang), u.y + math.sin(ang), me, allow_box=True),
                math.degrees(ang) % 360.0, True)
    if best is not None and best[0] > 0.75:
        score, ang, kind = best
        if kind == 'shot' or score > 1.0 or press < 2.6:
            return (move_dir(st, u, u.x + math.cos(ang), u.y + math.sin(ang), me, allow_box=False),
                    math.degrees(ang) % 360.0, True)
    # under real pressure and no good option: clear away from opponents
    if press < 1.9:
        cl = clear_score(st, u, me, opp)
        if cl is not None:
            ang = cl[1]
            return (move_dir(st, u, u.x + math.cos(ang), u.y + math.sin(ang), me, allow_box=False),
                    math.degrees(ang) % 360.0, True)
    # attacking third: drive to the near-post corner corridor
    if abs(gx - u.x) < 26.0 and press > 2.2:
        cy = 4.2 if u.y < 13.0 else 21.8
        tgt = safe_pt(me, gx - ATK[me] * 2.0, cy, SAFE)
        d = math.hypot(tgt[0] - u.x, tgt[1] - u.y)
        if d > 0.6:
            near, nd2 = None, 1e9
            for o in opp:
                dd = math.hypot(o.x - u.x, o.y - u.y)
                if dd < nd2:
                    nd2, near = dd, o
            if near is not None and nd2 < 4.5:
                aim = math.degrees(math.atan2(u.y - near.y, u.x - near.x)) % 360.0
            else:
                aim = math.degrees(math.atan2(13.0 - u.y, gx - u.x)) % 360.0
            return (move_dir(st, u, tgt[0], tgt[1], me), aim, False)
    # dribble: progress toward goal while keeping away from nearest opponent
    bestd = None
    for deg in range(0, 360, 15):
        a = math.radians(deg)
        d = 3.6
        tx, ty = u.x + math.cos(a) * d, u.y + math.sin(a) * d
        if not (0.7 <= tx <= W - 0.7 and 0.7 <= ty <= H - 0.7):
            continue
        if in_danger(me, tx, ty, SAFE * 0.6):
            continue
        if not step_ok(me, u.x, u.y, math.cos(a), math.sin(a), 8):
            continue
        adv = (tx - u.x) * ATK[me]
        od = min([math.hypot(o.x - tx, o.y - ty) for o in opp] or [9.0])
        gd = abs(gx - tx)
        sc = adv * 0.42 + min(od, 3.5) * 0.40 + max(0.0, 22.0 - gd) * 0.06
        if bestd is None or sc > bestd[0]:
            bestd = (sc, tx, ty)
    if bestd is None:
        return ('N', None, False)
    _, tx, ty = bestd
    # shield the ball: face away from the nearest opponent when it is close
    near, nd = None, 1e9
    for o in opp:
        dd = math.hypot(o.x - u.x, o.y - u.y)
        if dd < nd:
            nd, near = dd, o
    if near is not None and nd < 5.0:
        aim = math.degrees(math.atan2(u.y - near.y, u.x - near.x)) % 360.0
    else:
        aim = math.degrees(math.atan2(13.0 - u.y, gx - u.x)) % 360.0
    return (move_dir(st, u, tx, ty, me), aim, False)


# ------------------------------------------------------------------ forward
def forward_spots(me):
    gx = OPP_GOAL[me]
    a = ATK[me]
    return [(gx - a * 5.0, 4.3), (gx - a * 5.0, 21.7),
            (gx - a * 10.5, 4.0), (gx - a * 10.5, 22.0),
            (gx - a * 10.5, 13.0)]


def lane_clear(bx, by, px, py, opps, ignore=None):
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


def pick_forward_spot(st, u, me, opp, taken, side=0):
    """Corridor forward 5-13 units from the enemy goal line, so a long ball can
    reach it and one short dribble gets it to the near-post shot spot."""
    gx = OPP_GOAL[me]
    a = ATK[me]
    bx, by = st.bx, st.by
    lo = min(gx - a * 18.0, gx - a * 4.0)
    hi = max(gx - a * 18.0, gx - a * 4.0)
    xbase = clamp(bx + a * 17.0, lo, hi)
    yy_pref = (4.2, 21.6, 13.0)[side % 3]
    best = None
    bestsc = -1e9
    for r, yy in enumerate((yy_pref, 4.2, 21.6, 13.0)):
        for dx in (0.0, -3.0, 3.0, -6.0, 6.0):
            tx = clamp(xbase + a * dx, lo, hi)
            tx, ty = safe_pt(me, tx, yy, SAFE)
            crowd = sum(max(0.0, 4.0 - math.hypot(tx - ax, ty - ay)) for ax, ay in taken)
            od = min([math.hypot(o.x - tx, o.y - ty) for o in opp] or [9.0])
            bd = math.hypot(bx - tx, by - ty)
            lane = lane_clear(bx, by, tx, ty, opp)
            sc = min(lane, 3.0) * 1.0 + min(od, 3.5) * 0.3 - crowd * 0.8 - abs(bd - 18.0) * 0.05
            if r == 0:
                sc += 0.4
            if sc > bestsc:
                bestsc = sc
                best = (tx, ty)
    return best


def support_spot(st, me, opp, x, y, taken):
    """defensive/cover position between ball and own goal"""
    ogx = MY_GOAL[me]
    cx, cy = ogx, 13.0
    dx, dy = x - cx, y - cy
    d = math.hypot(dx, dy) or 1.0
    k = clamp(0.45 * d, 5.0, 15.0)
    tx, ty = cx + dx / d * k, cy + dy / d * k
    return safe_pt(me, tx, ty, SAFE)


# ------------------------------------------------------------------ main
def frame_cmds(st, me):
    n = st.n
    my = [u for u in st.units if u.team == me]
    opp = [u for u in st.units if u.team != me]
    owner = st.units[st.owner] if st.owner >= 0 else None
    bx, by = st.bx, st.by
    gx = OPP_GOAL[me]
    ogx = MY_GOAL[me]
    cmds = {}
    if n == 1:
        u = my[0]
        if owner is not None and owner.team == me:
            cmds[u.index] = carrier_cmds(st, u, me, opp, [], solo=True)
            return cmds
        ogx = MY_GOAL[me]
        o = opp[0] if opp else None
        bd = math.hypot(bx - ogx, by - 13.0)
        sgn = 1.0 if me == 0 else -1.0
        gxp = ogx + sgn * 2.0
        if owner is not None and o is not None:
            # opponent has the ball: stand on the ball->goal line, close in front
            ddx, ddy = ogx - bx, 13.0 - by
            ddd = math.hypot(ddx, ddy) or 1.0
            k = clamp(0.30 * math.hypot(bx - ogx, by - 13.0), 0.8, 6.5)
            tx, ty = bx + ddx / ddd * k, by + ddy / ddd * k
            du = math.hypot(u.x - bx, u.y - by)
            do = math.hypot(o.x - bx, o.y - by)
            if du < 0.92 and du + 0.12 < do:
                tx, ty = bx, by
            tx = clamp(tx, 0.55, W - 0.55); ty = clamp(ty, 0.55, H - 0.55)
            cmds[u.index] = (move_dir(st, u, tx, ty, me),
                             math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0, False)
            return cmds
        # loose ball
        pts = ball_future(st, 100)
        def itime(q):
            if q is None:
                return 999
            for kk, pt in enumerate(pts):
                if math.hypot(pt[0] - q.x, pt[1] - q.y) <= MOV * (kk + 1) * DT + CR * 0.8:
                    return kk
            return 999
        our_t = itime(u)
        ou_t = itime(o)
        moving_to_goal = (me == 0 and st.bvx < -2.0) or (me == 1 and st.bvx > 2.0)
        if (our_t < 999 and our_t <= ou_t - 2) or (ou_t >= 999):
            tgt = pts[min(our_t, len(pts) - 1)] if pts else (bx, by)
            if math.hypot(u.x - bx, u.y - by) < 2.2:
                tgt = (bx, by)
        elif moving_to_goal and pts:
            cy = None
            for (px, py) in pts:
                if (me == 0 and px <= gxp) or (me == 1 and px >= gxp):
                    cy = py
                    break
            if cy is not None:
                tgt = (gxp, clamp(cy, 10.75, 15.25))
            else:
                tgt = (pts[-1][0], pts[-1][1])
        else:
            ddx, ddy = ogx - bx, 13.0 - by
            ddd = math.hypot(ddx, ddy) or 1.0
            k = clamp(0.30 * math.hypot(bx - ogx, by - 13.0), 0.8, 6.5)
            tgt = (bx + ddx / ddd * k, by + ddy / ddd * k)
        tx = clamp(tgt[0], 0.55, W - 0.55); ty = clamp(tgt[1], 0.55, H - 0.55)
        cmds[u.index] = (move_dir(st, u, tx, ty, me),
                         math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0, False)
        return cmds

    keeper = my[0]
    fielders = [u for u in my if u.index != 0]
    nf = len(fielders)
    owner_is_mine = owner is not None and owner.team == me
    assigned = {}
    taken = []
    if owner_is_mine and owner.index != 0:
        assigned[owner.index] = 'carrier'
        taken.append((owner.x, owner.y))
    ball_d = {u.index: math.hypot(u.x - bx, u.y - by) for u in fielders}
    ordered = sorted(fielders, key=lambda u: ball_d[u.index])
    ball_deep = (bx - ogx) * ATK[me] < 15.0
    if not owner_is_mine and ordered:
        assigned[ordered[0].index] = 'chase'
    rest = [u for u in ordered if u.index not in assigned]
    # tiny squads: the lone fielder must not chase hopelessly upfield
    solo_guard = (nf == 1 and not owner_is_mine)
    n_def = 0
    if nf >= 2:
        n_def = 1
    if (owner is not None and owner.team != me and ball_deep and nf >= 3):
        n_def = 2
    for u in rest[:n_def]:
        assigned[u.index] = 'cover'
    rest = rest[n_def:]
    for u in rest:
        assigned[u.index] = 'forward'

    # predicted target for every non-carrier fielder (used to lead passes)
    mate_targets = {}
    pts40 = ball_future(st, 40)
    fx, fy = (pts40[min(len(pts40) - 1, 20)] if pts40 else (bx, by))
    side = 0
    for u in fielders:
        kind = assigned.get(u.index)
        if kind == 'cover':
            tgt = support_spot(st, me, opp, fx, fy, taken)
            mate_targets[u.index] = tgt
            taken.append(tgt)
        elif kind == 'forward':
            spot = pick_forward_spot(st, u, me, opp, taken, side)
            side += 1
            mate_targets[u.index] = spot
            taken.append(spot)
        elif kind == 'chase':
            pts = ball_future(st, 60)
            mate_targets[u.index] = (pts[min(len(pts) - 1, 18)] if pts else (bx, by))

    # commands
    mates_all = list(fielders)
    if owner_is_mine:
        if owner.index == 0:
            cm = carrier_cmds(st, keeper, me, opp, mates_all, mate_targets=mate_targets, prefer_kick=True)
            if not cm[2]:
                cl = clear_score(st, keeper, me, opp)
                if cl is not None:
                    ang = cl[1]
                    cm = (move_dir(st, keeper, keeper.x + math.cos(ang),
                                   keeper.y + math.sin(ang), me, allow_box=True),
                          math.degrees(ang) % 360.0, True)
            cmds[0] = cm
        else:
            cmds[owner.index] = carrier_cmds(st, owner, me, opp, mates_all, mate_targets=mate_targets)
            cmds[0] = keeper_cmds(st, keeper, me, opp, n)
    else:
        cmds[0] = keeper_cmds(st, keeper, me, opp, n)

    for u in fielders:
        kind = assigned.get(u.index)
        if kind == 'carrier':
            continue
        tgt = mate_targets.get(u.index, (bx, by))
        if owner is None and math.hypot(u.x - bx, u.y - by) < 9.0 and kind != 'cover':
            tgt = safe_pt(me, bx, by, SAFE)
        if kind == 'chase' and owner is not None and owner.team != me:
            o = owner
            d = math.hypot(u.x - o.x, u.y - o.y)
            if solo_guard:
                ddx, ddy = ogx - st.bx, 13.0 - st.by
                dd = math.hypot(ddx, ddy) or 1.0
                dgoal_b = math.hypot(st.bx - ogx, st.by - 13.0)
                kk = clamp(0.30 * dgoal_b, 0.8, 6.5)
                tx, ty = st.bx + ddx / dd * kk, st.by + ddy / dd * kk
                if d < 0.95 and d + 0.12 < math.hypot(o.x - st.bx, o.y - st.by):
                    tx, ty = st.bx, st.by
            elif d < 1.05:
                tx, ty = o.x, o.y
            else:
                tx = o.x + (ogx - o.x) * 0.04
                ty = o.y + (13.0 - o.y) * 0.04
            cmds[u.index] = (move_dir(st, u, tx, ty, me),
                             math.degrees(math.atan2(o.y - u.y, o.x - u.x)) % 360.0, False)
            continue
        if kind == 'chase' and owner is None and solo_guard:
            # loose ball: guard if the opponent wins the race
            pts = ball_future(st, 80)
            def itime(q):
                if q is None:
                    return 999
                for kk, pt in enumerate(pts):
                    if math.hypot(pt[0] - q.x, pt[1] - q.y) <= MOV * (kk + 1) * DT + CR * 0.8:
                        return kk
                return 999
            ou = [x for x in opp]
            ou_t = min([itime(x) for x in ou] or [999])
            our_t = itime(u)
            if not (our_t < 999 and our_t <= ou_t - 2):
                ddx, ddy = ogx - st.bx, 13.0 - st.by
                dd = math.hypot(ddx, ddy) or 1.0
                dgoal_b = math.hypot(st.bx - ogx, st.by - 13.0)
                kk = clamp(0.30 * dgoal_b, 0.8, 6.5)
                tx, ty = st.bx + ddx / dd * kk, st.by + ddy / dd * kk
                cmds[u.index] = (move_dir(st, u, tx, ty, me),
                                 math.degrees(math.atan2(st.by - u.y, st.bx - u.x)) % 360.0, False)
                continue
        tx, ty = safe_pt(me, tgt[0], tgt[1], SAFE)
        aim = math.degrees(math.atan2(13.0 - u.y, gx - u.x)) % 360.0
        cmds[u.index] = (move_dir(st, u, tx, ty, me), aim, False)
    return cmds


def opp_model(st, o, me):
    """simple forecast: opponents chase the ball's predicted position."""
    pts = ball_future(st, 40)
    tx, ty = (pts[min(len(pts) - 1, 12)] if pts else (st.bx, st.by))
    return (move_dir(st, o, tx, ty, 1 - me), None, False)


def decide(s0, me, n, A):
    """Return list of 20 frames: each frame is {(team,index): (dir,aim,kick)}."""
    _ST['force'] = False
    try:
        ot = s0.units[s0.owner].team if s0.owner >= 0 else -1
        _ST['hist'].append((s0.frame, s0.bx, s0.by, ot))
        _ST['hist'] = [h for h in _ST['hist'] if s0.frame - h[0] <= 40]
        h = _ST['hist']
        if len(h) >= 3 and h[-1][3] == me:
            xs = [q[1] for q in h]
            ys = [q[2] for q in h]
            if max(xs) - min(xs) < 1.6 and max(ys) - min(ys) < 1.6:
                _ST['force'] = True
    except Exception:
        pass
    st = s0.clone()
    frames = []
    for f in range(20):
        if st.status != 'playing':
            break
        cmds = frame_cmds(st, me)
        inp = []
        for u in st.units:
            if u.team == me:
                c = cmds.get(u.index) or ('N', None, False)
                aim = None
                if c[1] is not None:
                    a = math.radians(c[1] % 360.0)
                    aim = (math.cos(a), math.sin(a))
                inp.append((c[0], aim, bool(c[2])))
            else:
                inp.append(opp_model(st, u, me))
        frames.append(dict((k, v) for k, v in
                           [((u.team, u.index), inp[i]) for i, u in enumerate(st.units)]))
        g = A.step(st, inp)
        if g >= 0:
            st.score[g] += 1
            if st.golden:
                st.status = 'finished'
                break
            A.kickoff(st, 1 - g)
    while len(frames) < 20:
        frames.append({})
    return frames
