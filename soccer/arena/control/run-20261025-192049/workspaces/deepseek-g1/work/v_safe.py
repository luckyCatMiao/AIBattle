# -*- coding: utf-8 -*-
"""deepseek-g1 · round-2 policy.

Doctrine
--------
* The opponent re-plans only once per decision window, so a shot released on
  the first frames of a window is invisible to their keeper for up to 1 s.
* Their defensive line is clamped to x<=36 (attacking coords).  A ball beyond
  that line is defended by the keeper alone.
* Therefore the main weapon is a *corner poacher*: a forward stationed in the
  corridor beside their penalty box (y<5.5 or y>20.5, x~37..40, which is legal
  because only the box itself is forbidden), fed by a short pass, shooting at
  the NEAR corner.  A shooter at (38,4) aiming at (43,10.6) scores even if the
  keeper is already at its charge spot.
* Everything else is lane discipline: never enter the opponent box (red card),
  keep bodies in their shooting lanes, keeper on the goal line.

The window plan is produced by rolling our own exact engine forward against a
port of the opponent policy, and choosing the best of several play styles.
"""

import math

W, H = 44.0, 26.0
DT = 0.05
MOV = 3.15
DRIB = 0.58 * MOV
CR = 0.82
R_B = 0.22
R_U = 0.34
KICKP = 11.0
KICK_OFF = 0.69
GL_LO, GL_HI = 10.5, 15.5

OBOX = {0: (34.0, 6.0, 43.0, 20.0), 1: (1.0, 6.0, 10.0, 20.0)}
OWNBOX = {0: (1.0, 6.0, 10.0, 20.0), 1: (34.0, 6.0, 43.0, 20.0)}

SQ2 = 0.7071067811865476
# Post-match round-2 feature switches (defaults are the tested candidate).
OPT_KEEPER_POS = False
OPT_PRESSER_NEAREST = False
OPT_KEEPER_RELEASE = False
OPT_CENTER_TWO = False
OPT_BOX_GUARD = True
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


def sgn_atk(me):
    return 1.0 if me == 0 else -1.0


def opp_gx(me):
    return 43.0 if me == 0 else 1.0


def own_gx(me):
    return 1.0 if me == 0 else 43.0


def in_box(me, x, y, m=0.0):
    b = OBOX[me]
    return b[0] - m <= x <= b[2] + m and b[1] - m <= y <= b[3] + m


def in_own_box(me, x, y, m=0.0):
    b = OWNBOX[me]
    return b[0] - m <= x <= b[2] + m and b[1] - m <= y <= b[3] + m


def safe_pt(me, x, y, m=0.85):
    """Push a desired point out of the opponent box (red card)."""
    x = clamp(x, 0.6, W - 0.6)
    y = clamp(y, 0.6, H - 0.6)
    b = OBOX[me]
    if b[0] - m <= x <= b[2] + m and b[1] - m <= y <= b[3] + m:
        cands = []
        if b[0] > 1.0:
            cands.append((b[0] - m, clamp(y, b[1], b[3])))
        if b[2] < W - 1.0:
            cands.append((b[2] + m, clamp(y, b[1], b[3])))
        cands.append((clamp(x, b[0], b[2]), b[1] - m))
        cands.append((clamp(x, b[0], b[2]), b[3] + m))
        best, bd = cands[0], 1e18
        for cx, cy in cands:
            if 0.4 <= cx <= W - 0.4 and 0.4 <= cy <= H - 0.4:
                dd = (cx - x) ** 2 + (cy - y) ** 2
                if dd < bd:
                    bd, best = dd, (cx, cy)
        x, y = best
    return x, y


def step_ok(me, x, y, vx, vy, steps=5, m=0.85, speed=MOV):
    for k in range(1, steps + 1):
        if in_box(me, x + vx * speed * DT * k, y + vy * speed * DT * k, m):
            return False
    return True


def move_dir(u, tx, ty, me, allow_box=False, m=0.85, speed=MOV):
    """8-dir greedy toward (tx,ty) that never steps into the opponent box."""
    dx, dy = tx - u.x, ty - u.y
    d = math.hypot(dx, dy)
    if d < 0.05:
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
        if v > bestv:
            bestv, best = v, name
    if best is None:
        # slide along the box face
        b = OBOX[me]
        cy = (b[1] + b[3]) * 0.5
        want = -1.0 if u.y < cy else 1.0
        for name in DIR_KEYS:
            vx, vy = DIRS[name]
            if vx == 0.0 and vy == 0.0:
                continue
            if not step_ok(me, u.x, u.y, vx, vy, 5, m, speed):
                continue
            v = vy * want + vx * (0.3 if abs(vx) > 0 else 0.0)
            if v > bestv:
                bestv, best = v, name
    return best or 'N'


def move_dir_avoid(u, tx, ty, me, opps, allow_box=False, m=0.85, speed=MOV, avoid_r=2.2):
    dx, dy = tx - u.x, ty - u.y
    d = math.hypot(dx, dy)
    if d < 0.05:
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
        for o in opps:
            ox, oy = o.x - u.x, o.y - u.y
            od = math.hypot(ox, oy)
            if 1e-6 < od < avoid_r:
                dot = (vx * ox + vy * oy) / od
                if dot > 0.0:
                    v -= dot * (avoid_r - od) / avoid_r * 1.3
        if v > bestv:
            bestv, best = v, name
    return best or 'N'


def box_retreat_cmd(me, u):
    """Hard escape from the opponent-box margin.

    The 5-frame look-ahead in move_dir is computed inside our own rollout; if
    the real opponent diverges from our model, a unit can arrive at the box
    face lower than predicted and a normal 'D'/'DR' command then steps in.
    This guard uses the *observed* position and commands a direction that
    increases distance from the box, ignoring step_ok.
    """
    b = OBOX[me]
    tx, ty = safe_pt(me, u.x, u.y, 1.0)
    dx, dy = tx - u.x, ty - u.y
    if abs(dx) + abs(dy) < 1e-6:
        # already at a corner: push away from box center
        dx, dy = u.x - (b[0] + b[2]) * 0.5, u.y - (b[1] + b[3]) * 0.5
    best, bestv = None, -1e18
    for name in DIR_KEYS:
        vx, vy = DIRS[name]
        if vx == 0.0 and vy == 0.0:
            continue
        v = vx * dx + vy * dy
        if v > bestv:
            bestv, best = v, name
    return best or 'N'


# ------------------------------------------------------------------ ball model
def flight(x0, y0, ang, maxf=120):
    """Engine-faithful ball flight.  -> (pts, goal_team_or_None)"""
    vx, vy = KICKP * math.cos(ang), KICKP * math.sin(ang)
    x, y = x0, y0
    pts = []
    for _f in range(maxf):
        for _s in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if GL_LO <= y <= GL_HI:
                if x <= 1.0:
                    return pts, 1
                if x >= W - 1.0:
                    return pts, 0
            if x < 1.3 or x > 42.7 or y < 1.3 or y > 24.7:
                pass
            elif 1.3 < x < 42.7 and 1.3 < y < 24.7:
                pass
            if (x < 1.3 or x > 42.7 or y < 1.3 or y > 24.7) and hits_wall(x, y, R_B):
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
            break
        pts.append((x, y))
    return pts, None


def shot_quality(x0, y0, ang, me, opps, blind_shift=0.0, maxf=80):
    """(p_goal, goal_team, clearance) for a kick from (x0,y0) along ang.

    opps: list of units with .x/.y/.index.  Conservative reach model: each
    opponent may move at full speed after its reaction delay."""
    pts, gt = flight(x0, y0, ang, maxf)
    if not pts:
        return 0.0, gt, -9.0
    if gt != me:
        return 0.0, gt, -9.0
    worst = 9.0
    npts = len(pts)
    for o in opps:
        delay = 0.55
        if getattr(o, 'index', 99) == 0 and len(opps) > 0:
            delay = 0.95
        delay = max(0.05, delay - blind_shift)
        ox, oy = o.x, o.y
        m = 9.0
        for t in range(npts):
            bx, by = pts[t]
            dd = math.hypot(bx - ox, by - oy) - CR - MOV * max(0.0, (t + 1) * DT - delay)
            if dd < m:
                m = dd
        if m < worst:
            worst = m
    return clamp((worst + 0.25) / 1.1, 0.0, 1.0), gt, worst


SHOT_YS = (10.62, 11.35, 12.2, 13.0, 13.8, 14.65, 15.38)


def best_shot(st, me, u, opps, max_ang_off=math.pi):
    """Best (p, ang, ty) shot for unit u."""
    gx = opp_gx(me)
    best = (0.0, None, None)
    # kick originates slightly ahead of the unit
    for ty in SHOT_YS:
        ang = math.atan2(ty - u.y, gx - u.x)
        if abs(((ang - math.atan2(u.fy, u.fx) + math.pi) % (2 * math.pi)) - math.pi) > max_ang_off:
            continue
        fx, fy = math.cos(ang), math.sin(ang)
        sx, sy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
        p, gt, clr = shot_quality(sx, sy, ang, me, opps)
        if p > best[0]:
            best = (p, ang, ty)
    return best


# ------------------------------------------------------------- opponent model
S2 = math.sqrt(0.5)
_OD = [('N', 0, 0), ('U', 0, -1), ('D', 0, 1), ('L', -1, 0), ('R', 1, 0),
       ('UL', -S2, -S2), ('UR', S2, -S2), ('DL', -S2, S2), ('DR', S2, S2)]
_ODMAP = {d[0]: (d[1], d[2]) for d in _OD}
_MIR = {'L': 'R', 'R': 'L', 'UL': 'UR', 'UR': 'UL', 'DL': 'DR', 'DR': 'DL'}


def _osafe(x, y):
    return (x >= 1.4 and x <= 42.6 and y >= 1.4 and y <= 24.6
            and not (x >= 33.0 and y >= 5.0 and y <= 21.0))


class _OU(object):
    __slots__ = ('id', 'team', 'index', 'x', 'y', 'fx', 'fy')

    def __init__(self, uid, team, index, x, y, fx, fy):
        self.id, self.team, self.index = uid, team, index
        self.x, self.y, self.fx, self.fy = x, y, fx, fy


def _olocal(st, team):
    us = []
    for u in st.units:
        if team:
            us.append(_OU('t%du%d' % (u.team, u.index), 0 if u.team == team else 1,
                          u.index, 44.0 - u.x, u.y, -u.fx, u.fy))
        else:
            us.append(_OU('t%du%d' % (u.team, u.index), 0 if u.team == team else 1,
                          u.index, u.x, u.y, u.fx, u.fy))
    owner = None
    if st.owner >= 0:
        o = st.units[st.owner]
        owner = 't%du%d' % (o.team, o.index)
    b = {'x': (44.0 - st.bx) if team else st.bx, 'y': st.by,
         'vx': (-st.bvx) if team else st.bvx, 'vy': st.bvy, 'owner': owner}
    return {'units': us, 'us': [u for u in us if u.team == 0],
            'them': [u for u in us if u.team == 1], 'ball': b, 'n': st.n}


def _omove(u, t):
    best, bv = 'N', 1e9
    for name, dx, dy in _OD:
        x, y = u.x + dx * 0.1575, u.y + dy * 0.1575
        if not _osafe(x, y):
            continue
        v = math.hypot(t[0] - x, t[1] - y)
        if name == 'N':
            v += 0.025
        if u.x > 33.5 and t[0] < 33.5 and u.y < 6 and t[1] > 6:
            v += max(0.0, x - 33.45) * 0.3
        if v < bv:
            bv, best = v, name
    return best


def _oshot(u, s):
    best = {'score': -100.0, 'aim': 0.0}
    gy = 10.65
    while gy <= 15.36:
        dx, dy = 43.0 - u.x, gy - u.y
        ln = math.hypot(dx, dy)
        if ln <= 24.7 and dx >= 0:
            ux, uy = dx / ln, dy / ln
            x, y = u.x + ux * 0.59, u.y + uy * 0.59
            v, mn, blocked, t = 11.0, 10.0, False, 0.0
            for _ in range(145):
                x += ux * v * 0.05
                y += uy * v * 0.05
                t += 0.05
                v *= 0.978
                if x >= 43:
                    break
                if x < 1.2 or y < 1.23 or y > 24.77:
                    blocked = True
                    break
                for e in s['them']:
                    dd = math.hypot(x - e.x, y - e.y) - 0.82 - 3.15 * max(0.0, t - 0.72)
                    if dd < mn:
                        mn = dd
                for a in s['us']:
                    if a.id != u.id and t < 0.65:
                        dd = math.hypot(x - a.x, y - a.y) - 0.86
                        if dd < mn:
                            mn = dd
            if x >= 43 and not blocked:
                sc = mn - 0.035 * t
                if sc > best['score']:
                    best = {'score': sc, 'aim': math.degrees(math.atan2(dy, dx))}
        gy += 0.47
    return best


def _opath(s, steps=85):
    path = []
    x, y = s['ball']['x'], s['ball']['y']
    vx, vy = s['ball']['vx'], s['ball']['vy']
    for i in range(steps):
        path.append({'x': x, 'y': y, 't': i * 0.05})
        x += vx * 0.05
        y += vy * 0.05
        if y < 1.23:
            y, vy = 2.46 - y, -vy * 0.72
        if y > 24.77:
            y, vy = 49.54 - y, -vy * 0.72
        if x < 1.23:
            x, vx = 2.46 - x, -vx * 0.72
        if x > 42.77:
            x, vx = 85.54 - x, -vx * 0.72
        vx *= 0.978
        vy *= 0.978
    return path


def _ointercept(u, path):
    for p in path:
        if _osafe(p['x'], p['y']) and math.hypot(u.x - p['x'], u.y - p['y']) <= 3.15 * p['t'] + 0.65:
            return (p['x'], p['y'])
    p = path[-1]
    if not _osafe(p['x'], p['y']):
        p = {'x': min(33.35, p['x']), 'y': clamp(p['y'], 1.5, 24.5)}
    return (p['x'], p['y'])


def _opolicy(st, team, variant='main'):
    """Port of the opponent policy; returns list of (dir, aim_deg, kick)."""
    s = _olocal(st, team)
    b = s['ball']
    owner = None
    for u in s['units']:
        if u.id == b['owner']:
            owner = u
    our = owner is not None and owner.team == 0
    path = _opath(s)
    targets = {}
    eligible = [u for u in s['us'] if s['n'] == 1 or u.index != 0]
    picks = sorted(((u, _ocost(u, path)) for u in eligible), key=lambda z: z[1])
    chaser = picks[0][0] if picks else None
    if owner is not None and not our and eligible:
        chaser = sorted(eligible, key=lambda a: math.hypot(a.x - b['x'], a.y - b['y']))[0]
    for u in s['us']:
        if our and owner is not None and u.id == owner.id:
            continue
        if s['n'] > 1 and u.index == 0:
            gx, gy = 3.3, 13.0
            if b['vx'] < -0.1:
                hit = None
                for p in path:
                    if p['x'] <= gx + 0.25:
                        hit = p
                        break
                gy = clamp(hit['y'], 10.65, 15.35) if hit else clamp(13 + (b['y'] - 13) * 0.36, 10.65, 15.35)
            else:
                gy = clamp(13 + (b['y'] - 13) * min(0.6, 3.2 / max(4, b['x'] - 1)), 10.65, 15.35)
            if b['x'] < 10:
                gx = clamp(b['x'] - 1.2, 2, 5)
                gy = clamp(b['y'], 9.8, 16.2)
            if owner is None:
                p = _ointercept(u, path)
                if math.hypot(u.x - p[0], u.y - p[1]) / 3.15 < 1.25 and p[0] < 12:
                    gx, gy = p[0], p[1]
            targets[u.id] = (gx, gy)
            continue
        if chaser is not None and u.id == chaser.id and not our:
            if owner is not None:
                targets[u.id] = (min(33.3, b['x']), b['y'])
            else:
                targets[u.id] = _ointercept(u, path)
            continue
        try:
            rank = next(i for i, v in enumerate(eligible) if v.id == u.id)
        except StopIteration:
            rank = 0
        r = max(1, len(eligible))
        if our:
            x = clamp(b['x'] + 5 + (rank % 2) * 2, 13, 32.5)
            y = clamp(5.5 + rank * (15.0 / max(1, r - 1)), 3, 23)
            if variant == 'link':
                x = clamp(b['x'] + 7 + (rank % 2) * 2, 10, 32.4)
                y = clamp(b['y'] + (1 if rank % 2 else -1) * (4 + (rank // 2) * 3), 3.5, 22.5)
        else:
            x = clamp(b['x'] - 3.2, 8, 29)
            y = clamp(b['y'] + (rank - (r - 1) / 2.0) * 3.1, 3, 23)
            if owner is not None and rank % 2 == 0:
                x = clamp(owner.x - 2.5, 9, 30)
                y = clamp(owner.y + (rank % 3 - 1) * 2.4, 3, 23)
        if s['n'] >= 4 and u.index == s['n'] - 1:
            x = clamp(b['x'] - 8, 8, 24)
            y = clamp(13 + (b['y'] - 13) * 0.5, 7, 19)
        targets[u.id] = (x, y)
    out = []
    for u in s['us']:
        if our and owner is not None and u.id == owner.id:
            a = _ocarry(u, s, variant)
        else:
            t = targets.get(u.id) or (b['x'], b['y'])
            aim = math.degrees(math.atan2(13 - u.y, 43 - u.x)) % 360.0
            sh = _oshot(u, s) if math.hypot(u.x - b['x'], u.y - b['y']) < 1.5 else None
            kick = bool(sh and sh['score'] > 0)
            if sh is not None and sh['score'] > -0.1:
                aim = sh['aim']
            if u.index == 0 and s['n'] > 1 and u.x < 10:
                aim = math.degrees(math.atan2(-6 if u.y < 13 else 6, 15)) % 360.0
                kick = True
            a = {'dir': _omove(u, t), 'aim': aim, 'kick': kick}
        if team:
            a['aim'] = (180 - a['aim'] + 360) % 360
            a['dir'] = _MIR.get(a['dir'], a['dir'])
        out.append((a['dir'], a['aim'], a['kick']))
    return out


def _ocost(u, path):
    for p in path:
        if _osafe(p['x'], p['y']) and math.hypot(u.x - p['x'], u.y - p['y']) <= 3.15 * p['t'] + 0.65:
            return p['t']
    p = path[-1]
    return math.hypot(u.x - p['x'], u.y - p['y']) / 3.15


def _ocarry(u, s, variant='main'):
    sh = _oshot(u, s)
    pressure = min([math.hypot(e.x - u.x, e.y - u.y) for e in s['them']] or [9.0])
    thr = {'attack': -2.0, 'wide': 0.25, 'link': -0.45}.get(variant, -0.12)
    if sh['score'] > thr or (u.x > 30.5 and sh['score'] > -0.85 and pressure < 2):
        return {'dir': 'N', 'aim': sh['aim'], 'kick': True}
    target = (33.25, clamp(u.y, 9, 17))
    if u.x > 31.5:
        if u.y < 12.8:
            side = 4.6
        elif u.y > 13.2:
            side = 21.4
        else:
            kp = [e for e in s['them'] if e.index == 0]
            side = 4.6 if (kp and kp[0].y > 13) else 21.4
        target = (39.7 if (u.y < 4.9 or u.y > 21.1) else 32.75, side)
    pas = None
    if pressure < 2.4 or (u.index == 0 and s['n'] > 1 and u.x < 12) or (variant == 'link' and s['n'] > 1):
        bv = -1e9
        options = [{'x': a.x, 'y': a.y, 'receiver': a}
                   for a in s['us'] if a.id != u.id and a.x > u.x + 2]
        if u.x < 28:
            for dy in (-10, -5, 0, 5, 10):
                options.append({'x': min(33.0, u.x + (6 if abs(dy) == 10 else 12)),
                                'y': clamp(u.y + dy, 2, 24)})
        for p in options:
            ln = math.hypot(p['x'] - u.x, p['y'] - u.y)
            if ln < 3 or ln > 20:
                continue
            ux, uy = (p['x'] - u.x) / ln, (p['y'] - u.y) / ln
            margin, t, v = 10.0, 0.0, 11.0
            x, y = u.x + ux * 0.6, u.y + uy * 0.6
            k = 0
            while k < 100 and math.hypot(x - u.x, y - u.y) < ln - 0.5:
                x += ux * v * 0.05
                y += uy * v * 0.05
                v *= 0.978
                t += 0.05
                for e in s['them']:
                    dd = math.hypot(x - e.x, y - e.y) - 0.82 - 3.15 * max(0.0, t - 0.35)
                    if dd < margin:
                        margin = dd
                k += 1
            val = 3 * min(margin, 2) + (p['x'] - u.x) * 0.16 + (1.5 if p.get('receiver') else 0) - abs(p['y'] - 13) * 0.02
            if val > bv:
                bv = val
                pas = {'dir': 'N', 'aim': math.degrees(math.atan2(p['y'] - u.y, p['x'] - u.x)) % 360,
                       'kick': True, 'margin': margin}
        if pas is not None and (pas['margin'] > -0.2 or pressure < 1.2 or u.x < 10):
            return pas
    best, bv = None, -1e9
    for name, dx, dy in _OD:
        x, y = u.x + dx * 0.09135, u.y + dy * 0.09135
        if not _osafe(x, y):
            continue
        value = -math.hypot(target[0] - x, target[1] - y)
        for e in s['them']:
            dd = math.hypot(x - e.x, y - e.y)
            if dd < 2.5:
                value -= 1.4 * (2.5 - dd) ** 2
        if value > bv:
            bv, best = value, name
    e = min(s['them'], key=lambda z: math.hypot(z.x - u.x, z.y - u.y)) if s['them'] else None
    if pressure < 3 and e is not None:
        aim = math.degrees(math.atan2(u.y - e.y, u.x - e.x)) % 360
    else:
        aim = math.degrees(math.atan2(target[1] - u.y, target[0] - u.x)) % 360
    return {'dir': best or 'N', 'aim': aim, 'kick': False}


def opp_plan(st, me, horizon=20):
    """20-frame plan for the opponent, from the true state at window start."""
    rows = []
    sim = st.clone()
    other = 1 - me
    for f in range(horizon):
        acts = _opolicy(sim, other, 'main')
        inp = []
        row = {}
        for u in sim.units:
            if u.team == other:
                d, aim, kick = acts[u.index]
                aa = math.radians(aim)
                inp.append((d, (math.cos(aa), math.sin(aa)), kick))
                row[u.index] = inp[-1]
            else:
                inp.append(('N', None, False))
        rows.append(row)
        g = A_step(sim, inp)
        if g >= 0 or sim.status != 'playing':
            break
    while len(rows) < horizon:
        rows.append({})
    return rows


A_step = None


def set_engine(fn):
    global A_step
    A_step = fn


# ================================================================ our play
def team_units(st, me):
    return [u for u in st.units if u.team == me]


def roles_for(n):
    if n <= 1:
        return {0: 'solo'}
    if n == 2:
        return {0: 'keeper', 1: 'striker'}
    if n == 3:
        return {0: 'keeper', 1: 'post0', 2: 'striker'}
    if n == 4:
        return {0: 'keeper', 1: 'post0', 2: 'post1', 3: 'striker'}
    if n == 5:
        return {0: 'keeper', 1: 'post0', 2: 'post1', 3: 'striker', 4: 'striker'}
    return {0: 'keeper', 1: 'post0', 2: 'post1', 3: 'striker', 4: 'striker', 5: 'striker'}


def nearest(units, x, y):
    if not units:
        return None
    return min(units, key=lambda o: (o.x - x) ** 2 + (o.y - y) ** 2)


def corner_spots(me):
    a = sgn_atk(me)
    gx = opp_gx(me)
    return [(gx - a * 4.4, 4.1), (gx - a * 4.4, 21.9)]


def poacher_spot(st, me, opps, ball_xy, prefer=None):
    """Choose the corridor side. Same side as the ball is a shorter pass;
    the side with fewer opponents is safer."""
    bx, by = ball_xy
    best, bv = None, -1e18
    for i, (sx, sy) in enumerate(corner_spots(me)):
        crowd = 0.0
        for o in opps:
            d = math.hypot(o.x - sx, o.y - sy)
            if d < 6.0:
                crowd += (6.0 - d)
        side_want = 1.0 if (i == 0) == (by < 13.0) else 0.0
        v = -crowd * 0.35 + side_want * 2.2
        if prefer is not None and prefer == i:
            v += 3.0
        if v > bv:
            bv, best = v, (sx, sy)
    return best


def box_edge(me, y):
    a = sgn_atk(me)
    return opp_gx(me) - a * 9.4, clamp(y, 3.2, 22.8)


class _P(object):
    __slots__ = ('x', 'y', 'index')

    def __init__(self, x, y, index):
        self.x, self.y, self.index = x, y, index


KEEP_TGT = {'y': None, 'me': None, 'frame': -999}


def best_shot_from(me, ox, oy, obstacles, aims=None):
    """Best shot pgo for a hypothetical shooter at (ox,oy) (used for their side)."""
    gx = 43.0 if me == 0 else 1.0
    best = 0.0
    for ty in (aims or SHOT_YS):
        ang = math.atan2(ty - oy, gx - ox)
        fx, fy = math.cos(ang), math.sin(ang)
        p, gt, clr = shot_quality(ox + fx * KICK_OFF, oy + fy * KICK_OFF, ang, me, obstacles)
        if p > best:
            best = p
    return best


def keeper_best_y(st, me):
    """Pick the goal-line y that minimises the opponent's best shot."""
    gx = own_gx(me)
    a = sgn_atk(me)
    my = [u for u in st.units if u.team == me]
    opps = [u for u in st.units if u.team != me]
    if not opps:
        return 13.0
    owner = st.units[st.owner] if 0 <= st.owner < len(st.units) else None
    if owner is not None and owner.team != me:
        ox, oy = owner.x, owner.y
    else:
        ox, oy = st.bx, st.by
    if (abs(ox - gx) > 30.0):
        return clamp(13.0 + (oy - 13.0) * 0.45, 10.8, 15.2)
    best, bestv = 13.0, 1e9
    for dy in (10.75, 11.35, 11.95, 12.5, 13.1, 13.7, 14.3, 14.9, 15.35):
        obs = []
        for u in st.units:
            if u.team == me and u.index == 0:
                obs.append(_P(gx + a * 0.8, dy, 0))
            else:
                obs.append(_P(u.x, u.y, u.index if u.team == me else 250))
        p = best_shot_from(1 - me, ox, oy, obs)
        if p < bestv:
            bestv, best = p, dy
    return best


def keeper_spot(st, me):
    gx = own_gx(me)
    a = sgn_atk(me)
    by = st.by
    near = 10.95 if by < 13.0 else 15.05
    return gx + a * 0.85, near


def keeper_cmd(st, me, u, opps):
    gx = own_gx(me)
    a = sgn_atk(me)
    if st.owner < 0:
        d = math.hypot(st.bx - u.x, st.by - u.y)
        sp = math.hypot(st.bvx, st.bvy)
        own = in_own_box(me, st.bx, st.by, 0.5)
        closer = any(math.hypot(o.x - st.bx, o.y - st.by) < d - 0.3 for o in opps)
        if d < 1.6 or (own and sp < 7.0 and d < 5.0 and not closer):
            return (move_dir(u, st.bx, st.by, me, allow_box=False), None, False)
    d_ball = (st.bx - gx) * a
    tx = gx + a * 0.75
    # Base station: shade toward the ball side, but stay near the middle.
    # KEEP_TGT['y'] is the goal-line y that minimises the opponent's best
    # shot; it was computed but previously never used.
    if OPT_KEEPER_POS:
        ty = 13.0 + (st.by - 13.0) * 0.30
        if KEEP_TGT.get('me') == me and KEEP_TGT.get('y') is not None:
            ty = 0.72 * KEEP_TGT['y'] + 0.28 * ty
        ty = clamp(ty, 10.3, 15.7)
    else:
        ty = 10.95 if st.by < 13.0 else 15.05
    sp = math.hypot(st.bvx, st.bvy)
    moving_in = (gx - st.bx) * st.bvx > 0.4 and sp > 0.8
    if moving_in:
        pts, gt = flight(st.bx, st.by, math.atan2(st.bvy, st.bvx), 60)
        cross = None
        for (px, py) in pts:
            if (a > 0 and px <= gx + 0.3) or (a < 0 and px >= gx - 0.3):
                cross = py
                break
        if cross is not None:
            ty = clamp(cross, 10.2, 15.8)
            tx = gx + a * 0.5
        else:
            ty = 13.0
    if d_ball < 8.0:
        tx = gx + a * 1.6
    return (move_dir(u, tx, ty, me, allow_box=False), None, False)


def post_target(st, me, role, rank=0, nline=2):
    """Two posts on the goal line: one on the far post, one in the middle,
    with the keeper on the near post.  Together they cover the whole mouth."""
    gx = own_gx(me)
    a = sgn_atk(me)
    if st.by < 13.0:
        near_y, far_y = 10.95, 15.05
    else:
        near_y, far_y = 15.05, 10.95
    y = far_y if role == 'post0' else 13.0
    return gx + a * 0.6, y


def press_target(st, me, u, opp_owner):
    gx = own_gx(me)
    if opp_owner is not None:
        px, py = opp_owner.x + opp_owner.fx * 0.62, opp_owner.y + opp_owner.fy * 0.62
    else:
        px, py = st.bx + st.bvx * 0.15, st.by + st.bvy * 0.15
    # If we are already goal-side of the ball and close enough to arrive
    # before their next touch, attack the ball instead of merely standing in
    # the lane: a 2.6-unit block never tackles and let their carrier walk in.
    du = math.hypot(u.x - gx, u.y - 13.0)
    db = math.hypot(px - gx, py - 13.0)
    if du + 0.2 < db and math.hypot(u.x - px, u.y - py) < 5.5:
        return clamp(px, 0.6, W - 0.6), clamp(py, 0.6, H - 0.6)
    dx, dy = gx - px, 13.0 - py
    dd = math.hypot(dx, dy) or 1.0
    # stand ~2.6 units goal-side of the ball: a 0.82 disc there covers the whole
    # shot cone, so their shot() sees no lane.  Still close enough to tackle.
    k = clamp(0.22 * dd, 1.7, 3.0)
    return clamp(px + dx / dd * k, 0.6, W - 0.6), clamp(py + dy / dd * k, 0.6, H - 0.6)


def punt_eval(st, me, u, opps, mates, tmax=95):
    """Long ball into space; good when one of our runners wins the race."""
    a = sgn_atk(me)
    gx = opp_gx(me)
    my = [m for m in mates if m.index != 0 or st.n == 1] + [u]
    best = None
    targets = []
    for d in (12.0, 17.0, 22.0):
        targets.append((gx - a * d, 4.1))
        targets.append((gx - a * d, 21.9))
    for m in mates:
        if m.index == 0 and st.n > 1:
            continue
        targets.append((m.x + a * 2.0, m.y))
    for (tx, ty) in targets:
        tx, ty = safe_pt(me, tx, ty, 0.5)
        ang = math.atan2(ty - u.y, tx - u.x)
        d0 = math.hypot(tx - u.x, ty - u.y)
        if d0 < 9.0:
            continue
        fx, fy = math.cos(ang), math.sin(ang)
        sx, sy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
        pts, gt = flight(sx, sy, ang, tmax + 12)
        if gt is not None or not pts:
            continue
        ours_t = None
        for t in range(len(pts)):
            if t > tmax:
                break
            bx, by = pts[t]
            if math.hypot(bx - sx, by - sy) < 7.0:
                continue
            el = (t + 1) * DT
            if any(math.hypot(bx - m.x, by - m.y) <= MOV * el + CR * 0.9 for m in my):
                ours_t = t
                break
        if ours_t is None:
            continue
        bx, by = pts[ours_t]
        theirs_t = 9.0
        for o in opps:
            for t in range(ours_t, min(len(pts), tmax)):
                px, py = pts[t]
                if math.hypot(px - o.x, py - o.y) <= MOV * (t + 1) * DT + CR * 0.9:
                    theirs_t = min(theirs_t, (t + 1) * DT)
                    break
            else:
                theirs_t = min(theirs_t, math.hypot(bx - o.x, by - o.y) / MOV)
        ours_sec = (ours_t + 1) * DT
        if ours_sec + 0.35 > theirs_t:
            continue
        corridor = (by < 6.2 or by > 19.8)
        bonus = 0.30 if corridor else 0.0
        d_goal = abs(gx - bx)
        if d_goal < 26.0:
            bonus += 0.20
        if d_goal < 15.0:
            bonus += 0.25
        p_after = receiver_shot_value(st, me, (bx, by), opps, blind_shift=ours_sec)
        adv = (bx - u.x) * a
        val = 0.60 * p_after + 0.020 * adv + bonus + 0.08 * min(2.0, theirs_t - ours_sec) - 0.010 * d0
        if best is None or val > best[0]:
            best = (val, ang, (bx, by), ours_t)
    return best


def pass_eval(st, me, u, mate, opps, lead_toward_goal=1.5, tmax=90):
    """(value, ang, recv_xy, recv_t) for a pass u -> mate."""
    a = sgn_atk(me)
    tx = mate.x + a * lead_toward_goal
    ty = mate.y + (13.0 - mate.y) * 0.15
    tx, ty = safe_pt(me, tx, ty, 0.5)
    ang = math.atan2(ty - u.y, tx - u.x)
    d0 = math.hypot(mate.x - u.x, mate.y - u.y)
    if d0 < 1.4:
        return None
    fx, fy = math.cos(ang), math.sin(ang)
    sx, sy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
    pts, gt = flight(sx, sy, ang, tmax + 6)
    if gt is not None or not pts:
        return None
    # receiver chase
    recv_t = None
    rx, ry = mate.x, mate.y
    for t in range(len(pts)):
        bx, by = pts[t]
        if math.hypot(bx - rx, by - ry) <= MOV * (t + 1) * DT + CR * 0.85:
            recv_t = t
            break
    if recv_t is None:
        return None
    if recv_t > tmax:
        return None
    if recv_t > 26 and math.hypot(mate.x - u.x, mate.y - u.y) < 14.0:
        return None
    # lane clearance: the pass is slow, opponents react after 0.45 s
    worst = 9.0
    for o in opps:
        if o is mate:
            continue
        m = 9.0
        for t in range(0, recv_t + 1):
            bx, by = pts[t]
            dd = math.hypot(bx - o.x, by - o.y) - CR - MOV * max(0.0, (t + 1) * DT - 0.70) * 0.85
            if dd < m:
                m = dd
        if m < worst:
            worst = m
    if worst < -0.35:
        return None
    bx, by = pts[recv_t]
    return (worst, ang, (bx, by), recv_t)


def receiver_shot_value(st, me, pos, opps, blind_shift=0.0):
    """Best shot pgo for a hypothetical unit standing at pos."""
    gx = opp_gx(me)
    best = 0.0
    for ty in (10.7, 13.0, 15.3):
        ang = math.atan2(ty - pos[1], gx - pos[0])
        fx, fy = math.cos(ang), math.sin(ang)
        sx, sy = pos[0] + fx * KICK_OFF, pos[1] + fy * KICK_OFF
        p, gt, clr = shot_quality(sx, sy, ang, me, opps, blind_shift=blind_shift)
        if p > best:
            best = p
    return best


def mate_potential(st, me, m, mates, opps, depth=1):
    """How dangerous is giving the ball to m: shoot now, or one more pass."""
    best = receiver_shot_value(st, me, (m.x, m.y), opps)
    if depth > 0:
        for o in mates:
            if o is m:
                continue
            if o.index == 0 and st.n > 1:
                continue
            r = pass_eval(st, me, m, o, opps, lead_toward_goal=1.0)
            if r is None:
                continue
            lane, ang, pos, rt = r
            if rt > 34:
                continue
            ps = receiver_shot_value(st, me, pos, opps, blind_shift=rt * DT)
            if 0.88 * ps > best:
                best = 0.88 * ps
    return best


def dribble_target(st, me, u, opps):
    """Where the carrier should drive: the corridor corner route or the box edge."""
    a = sgn_atk(me)
    gx = opp_gx(me)
    # if already in the corridor band, drive along it toward the goal line
    if u.y < 6.2 or u.y > 19.8:
        side = 3.9 if u.y < 13.0 else 22.1
        # the line of defenders cannot follow beyond x=36 (attacking frame),
        # so the shooting spot is 6.5 units from the goal line, in the corridor
        tx = gx - a * 6.5
        return safe_pt(me, tx, side, 0.45)
    # otherwise head for the closest corridor mouth
    side = 4.0 if u.y < 13.0 else 22.0
    if (gx - u.x) * a < 9.0:
        return safe_pt(me, u.x + a * 3.0, side, 0.45)
    return safe_pt(me, gx - a * 9.6, clamp(u.y + (13.0 - u.y) * 0.2, 6.5, 19.5), 0.5)


def clear_ahead(st, me, u, opps):
    """Punt toward the corridor corner of the far side (a real clearance)."""
    a = sgn_atk(me)
    best, bv = None, -1e18
    for cand in (corner_spots(me)[0], corner_spots(me)[1],
                 (u.x + a * 14, clamp(u.y, 4.0, 22.0)),
                 (u.x + a * 10, 13.0)):
        ang = math.atan2(cand[1] - u.y, cand[0] - u.x)
        fx, fy = math.cos(ang), math.sin(ang)
        sx, sy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
        pts, gt = flight(sx, sy, ang, 90)
        if not pts:
            continue
        worst = 9.0
        for o in opps:
            for t in range(0, len(pts), 2):
                bx, by = pts[t]
                dd = math.hypot(bx - o.x, by - o.y) - CR - MOV * max(0.0, (t + 1) * DT - 0.5)
                if dd < worst:
                    worst = dd
        if worst > bv:
            bv, best = worst, ang
    return best


# ------------------------------------------------------------ carrier action
TRACE = None


def carrier_action(st, me, u, mates, opps, style, ctx):
    cache = None
    key = None
    if ctx is not None and 'cache' in ctx:
        cache = ctx['cache']
        key = (u.index, st.frame >> 2)
        hit = cache.get(key)
        if hit is not None:
            return hit
    cmd = _carrier_action(st, me, u, mates, opps, style, ctx)
    if cache is not None:
        cache[key] = cmd
    return cmd


def _carrier_action(st, me, u, mates, opps, style, ctx):
    a = sgn_atk(me)
    gx = opp_gx(me)
    dg = abs(gx - u.x)
    shot = best_shot(st, me, u, opps)
    p = shot[0]
    # ---- passes
    best = None
    for m in mates:
        r = pass_eval(st, me, u, m, opps, lead_toward_goal=style.get('lead', 1.2))
        if r is None:
            continue
        lane, ang, pos, rt = r
        ps = receiver_shot_value(st, me, pos, opps, blind_shift=rt * DT)
        chain = mate_potential(st, me, m, mates, opps, depth=1)
        if 0.80 * chain > ps:
            ps = 0.80 * chain
        prog = (pos[0] - u.x) * a
        val = 1.30 * ps + 0.030 * prog + 0.10 * min(lane, 1.0)             - 0.020 * math.hypot(pos[0] - u.x, pos[1] - u.y)
        if pos[1] < 6.2 or pos[1] > 19.8:
            val += 0.12          # corridor receivers are gold
        if (pos[0] - own_gx(me)) * a > 26.0:
            val += 0.10          # lands in the attacking third
        if rt > 30:
            val -= 0.10 * ((rt - 30) / 20.0)
        if ps < 0.05 and prog < 8.0:
            val -= 0.35          # pointless square pass
        if best is None or val > best[0]:
            best = (val, ang, m, pos, rt, ps)
    pe = punt_eval(st, me, u, opps, mates)
    if pe is not None:
        val_p, ang_p = pe[0], pe[1]
        if TRACE:
            TRACE[-1]['punt'] = (round(val_p, 2), round(pe[2][0], 1), round(pe[2][1], 1), pe[3])
    else:
        val_p, ang_p = -9.0, None
    thr_s = style.get('shoot_thr', 0.5)
    thr_p = style.get('pass_thr', 0.5)
    thr_u = style.get('punt_thr', 0.40)
    mode = style.get('carrier', 'auto')
    if TRACE is not None:
        TRACE.append({'f': st.frame, 'idx': u.index, 'x': round(u.x, 1), 'y': round(u.y, 1),
                      'shot': round(p, 2), 'ty': shot[2],
                      'pass': None if best is None else (round(best[0], 2), best[2].index,
                                                         round(best[3][0], 1), round(best[3][1], 1), best[4]),
                      'style': mode, 'thr': (thr_s, thr_p)})
    if mode == 'shoot' and p > 0.02:
        return ('N', shot[1], True)
    if mode == 'pass' and best is not None and best[0] > 0.02:
        return ('N', best[1], True)
    if p >= thr_s:
        return ('N', shot[1], True)
    if best is not None and best[0] >= thr_p:
        return ('N', best[1], True)
    deep = (u.x - own_gx(me)) * sgn_atk(me) < 26.0
    if ang_p is not None and val_p >= thr_u and (deep or best is None):
        return ('N', ang_p, True)
    # ---- pressure?  clear if deep and pressed
    press = min([math.hypot(o.x - u.x, o.y - u.y) for o in opps] or [9.0])
    if style.get('clear') and press < 1.4 and dg > 24.0:
        ang = clear_ahead(st, me, u, opps)
        if ang is not None:
            return ('N', ang, True)
    if u.index == 0 and st.n > 1:
        if style.get('keeper_release'):
            # Deadlock breaker: the opponent refuses to enter our box, so a
            # keeper who holds the ball can freeze the match for 30-50 s.
            # When we are not ahead, any forward outlet is worth more than
            # another second of sterile possession.
            if best is not None and best[0] > -0.35:
                return ('N', best[1], True)
            if ang_p is not None:
                return ('N', ang_p, True)
            ang = clear_ahead(st, me, u, opps)
            if ang is None:
                ang = math.atan2(13.0 - u.y, opp_gx(me) - u.x)
            return ('N', ang, True)
        near = nearest(opps, u.x, u.y)
        if near is not None:
            ang = math.atan2(u.y - near.y, u.x - near.x)
        else:
            ang = math.atan2(13.0 - u.y, opp_gx(me) - u.x)
        return ('N', ang, False)
    tx, ty = dribble_target(st, me, u, opps)
    # shield: face away from the closest opponent while moving
    near = nearest([o for o in opps], u.x, u.y)
    if near is not None and math.hypot(near.x - u.x, near.y - u.y) < 3.0:
        ang = math.atan2(u.y - near.y, u.x - near.x)
    else:
        ang = math.atan2(ty - u.y, tx - u.x)
    return (move_dir_avoid(u, tx, ty, me, opps, False, 0.85, DRIB), ang, False)


def solo_action(st, me, u, opps, style, ctx):
    a = sgn_atk(me)
    owner = st.units[st.owner] if 0 <= st.owner < len(st.units) else None
    if owner is not None and owner.team == me:
        shot = best_shot(st, me, u, opps)
        if shot[0] > 0.03:
            return ('N', shot[1], True)
        tx, ty = dribble_target(st, me, u, opps)
        near = nearest(opps, u.x, u.y)
        if near is not None and math.hypot(near.x - u.x, near.y - u.y) < 3.2:
            ang = math.atan2(u.y - near.y, u.x - near.x)
        else:
            ang = math.atan2(ty - u.y, tx - u.x)
        return (move_dir_avoid(u, tx, ty, me, opps, False, 0.85, DRIB), ang, False)
    if owner is not None:
        # interpose on the ball -> own goal line, close to the ball
        ox, oy = owner.x + owner.fx * 0.62, owner.y + owner.fy * 0.62
        dx, dy = own_gx(me) - ox, 13.0 - oy
        dd = math.hypot(dx, dy) or 1.0
        k = 1.1
        tx, ty = ox + dx / dd * k, oy + dy / dd * k
        tx = clamp(tx, 0.6, W - 0.6)
        ty = clamp(ty, 0.6, H - 0.6)
        return (move_dir(u, tx, ty, me, allow_box=False), None, False)
    # loose ball: chase predicted position
    pts, gt = flight(st.bx, st.by, math.atan2(st.bvy, st.bvx), 40) if (st.bvx or st.bvy) else ([], None)
    tgt = (st.bx, st.by)
    for t, p in enumerate(pts):
        if math.hypot(p[0] - u.x, p[1] - u.y) <= MOV * (t + 1) * DT + CR * 0.9:
            tgt = p
            break
    return (move_dir(u, tgt[0], tgt[1], me, allow_box=False), None, False)


def pivot_spot(st, me, opps, owner):
    """Outlet 10-12 units upfield of the ball, in the least crowded lane."""
    a = sgn_atk(me)
    bx, by = st.bx, st.by
    tx = bx + a * 11.0
    best, bv = None, -1e18
    for dy in (-7.0, -3.5, 0.0, 3.5, 7.0):
        ty = clamp(by + dy, 2.5, 23.5)
        px, py = safe_pt(me, tx, ty, 0.9)
        crowd = 0.0
        for o in opps:
            d = math.hypot(o.x - px, o.y - py)
            if d < 5.0:
                crowd += (5.0 - d)
        v = -crowd + (0.6 if abs(dy) > 2.0 else 0.0)
        if v > bv:
            bv, best = v, (px, py)
    return best


def roles_positions(st, me, n, roles, opps, ball_side):
    """Base targets for off-ball units."""
    my = team_units(st, me)
    a = sgn_atk(me)
    out = {}
    owner = st.units[st.owner] if 0 <= st.owner < len(st.units) else None
    we_own = owner is not None and owner.team == me
    d_def = (st.bx - own_gx(me)) * a
    d_opp = (opp_gx(me) - st.bx) * a
    striker_idx = sorted(i for i in roles if roles[i] == 'striker')
    top_striker = striker_idx[-1] if striker_idx else None
    post_ids = sorted(i for i in roles if roles[i] in ('post0', 'post1'))
    post_rank = {ix: k for k, ix in enumerate(post_ids)}
    post_n = max(1, len(post_ids))
    for u in my:
        role = roles.get(u.index, 'striker')
        if role == 'keeper':
            continue
        if role in ('post0', 'post1'):
            out[u.index] = post_target(st, me, role, post_rank.get(u.index, 0), post_n)
        elif role == 'striker':
            if we_own or st.owner < 0:
                if u.index == top_striker or n == 2:
                    # the deepest striker is always the long-ball target
                    out[u.index] = poacher_spot(st, me, opps, (st.bx, st.by))
                else:
                    out[u.index] = pivot_spot(st, me, opps, owner)
            else:
                if d_def > 22.0:
                    out[u.index] = poacher_spot(st, me, opps, (st.bx, st.by))
                else:
                    ty = clamp(st.by, 6.0, 20.0)
                    out[u.index] = (clamp(st.bx - a * 6.0, 8.0, 36.0),
                                    clamp(13.0 + (ty - 13.0) * 0.5, 6.5, 19.5))
    return out


def frame_cmds(st, me, n, style, ctx):
    my = team_units(st, me)
    opps = [u for u in st.units if u.team != me]
    if not my:
        return {}
    roles = roles_for(n)
    owner = st.units[st.owner] if 0 <= st.owner < len(st.units) else None
    we_own = owner is not None and owner.team == me
    they_own = owner is not None and owner.team != me
    cmds = {}
    if n == 1:
        cmds[0] = solo_action(st, me, my[0], opps, style, ctx)
        return cmds
    keeper = my[0]
    fielders = [u for u in my if u.index != 0]
    ball_side = 'top' if st.by < 13.0 else 'bot'
    base = roles_positions(st, me, n, roles, opps, ball_side)
    if we_own:
        mates = [u for u in fielders if u is not owner]
        if style.get('backpass', True):
            mates = mates + [keeper]
        cmds[owner.index] = carrier_action(st, me, owner, mates, opps, style, ctx)
    chasers = []
    if st.owner < 0 and fielders:
        pts, gt = flight(st.bx, st.by, math.atan2(st.bvy, st.bvx), 45) if (st.bvx or st.bvy) else ([], None)
        # At a kickoff/restart the ball sits still near the centre spot.  With
        # no predicted path the old code always picked fielders[0], which is
        # often not the nearest unit, and Sol's nearest runner won every race.
        center_loose = (abs(st.bx - W * 0.5) < 3.5 and abs(st.by - H * 0.5) < 3.5
                        and math.hypot(st.bvx, st.bvy) < 1.0)
        ranked = []
        for u in fielders:
            tt = 999
            for t, p in enumerate(pts):
                if math.hypot(p[0] - u.x, p[1] - u.y) <= MOV * (t + 1) * DT + CR * 0.9:
                    tt = t
                    break
            if tt >= 999:
                tt = 100.0 + math.hypot(u.x - st.bx, u.y - st.by) / MOV / DT
            ranked.append((tt, u))
        ranked.sort(key=lambda z: z[0])
        chasers = [u for tt, u in ranked[:(2 if (center_loose and OPT_CENTER_TWO) else 1)]]
    presser = None
    if they_own and fielders:
        # nearest fielder jockeys the ball; everyone else forms a line 3.2
        # goal-side of the ball, spread across the pitch.  The old code only
        # considered strikers, so with one striker far upfield nobody pressed
        # the carrier at all.
        if OPT_PRESSER_NEAREST:
            presser = min(fielders, key=lambda u: math.hypot(u.x - owner.x, u.y - owner.y))
        else:
            cand = [u for u in fielders if roles.get(u.index) == 'striker']
            if not cand:
                cand = fielders
            presser = min(cand, key=lambda u: math.hypot(u.x - owner.x, u.y - owner.y))
        line_units = [u for u in fielders if u is not presser]
        aa = sgn_atk(me)
        d_ball = (st.bx - own_gx(me)) * aa
        line_d = clamp(d_ball - 3.2, 8.0, 29.0)
        line_units.sort(key=lambda z: z.index)
        for k, lu in enumerate(line_units):
            off = (k - (len(line_units) - 1) / 2.0) * 3.1
            base[lu.index] = (own_gx(me) + aa * line_d,
                              clamp(st.by + off, 3.0, 23.0))
    for u in fielders:
        if OPT_BOX_GUARD and in_box(me, u.x, u.y, 0.7):
            # Observed position is already in the danger margin.  Retreat in
            # the observed frame, before any target/rollout can pull us in.
            cmds[u.index] = (box_retreat_cmd(me, u), None, False)
            continue
        if u.index in cmds:
            continue
        role = roles.get(u.index, 'striker')
        tgt = base.get(u.index)
        if they_own and u is presser:
            tx, ty = press_target(st, me, u, owner)
            cmds[u.index] = (move_dir_avoid(u, tx, ty, me, opps, False, 0.85, MOV), None, False)
            continue
        if st.owner < 0 and u in chasers:
            pts, gt = flight(st.bx, st.by, math.atan2(st.bvy, st.bvx), 60) if (st.bvx or st.bvy) else ([], None)
            tgt2 = (st.bx, st.by)
            tgt_t = 999
            for t, p in enumerate(pts):
                if math.hypot(p[0] - u.x, p[1] - u.y) <= MOV * (t + 1) * DT + CR * 0.9:
                    tgt2 = p
                    tgt_t = t
                    break
            # if an opponent wins the race, take the goal-side blocking spot instead
            opp_t = 999
            for o in opps:
                for t, p in enumerate(pts):
                    if math.hypot(p[0] - o.x, p[1] - o.y) <= MOV * (t + 1) * DT + CR * 0.9:
                        opp_t = min(opp_t, t)
                        break
                else:
                    opp_t = min(opp_t, int(math.hypot(st.bx - o.x, st.by - o.y) / MOV * 20) + 1)
            if opp_t + 1 < tgt_t:
                dx, dy = own_gx(me) - tgt2[0], 13.0 - tgt2[1]
                dd = math.hypot(dx, dy) or 1.0
                tgt2 = (clamp(tgt2[0] + dx / dd * 2.0, 0.6, W - 0.6),
                        clamp(tgt2[1] + dy / dd * 2.0, 0.6, H - 0.6))
            cmds[u.index] = (move_dir(u, tgt2[0], tgt2[1], me, allow_box=False), None, False)
            continue
        if tgt is None:
            tgt = (st.bx, st.by)
        if in_box(me, u.x, u.y, 0.95):
            tgt = safe_pt(me, u.x, u.y, 1.6)
        cmds[u.index] = (move_dir_avoid(u, tgt[0], tgt[1], me, opps, False, 0.9, MOV), None, False)
    if 0 not in cmds:
        cmds[0] = keeper_cmd(st, me, keeper, opps)
    return cmds


# ------------------------------------------------------------------ evaluate
def chance_value(st, me):
    if st.owner < 0 or st.units[st.owner].team != me:
        return 0.0
    u = st.units[st.owner]
    o = [x for x in st.units if x.team != me]
    p, ang, ty = best_shot(st, me, u, o)
    return p


def evaluate_rollout(sim, me, n, goal, style, frames_left):
    v = 0.0
    if goal == me:
        v += 1000.0
    elif goal is not None:
        v -= 1000.0
    v += 55.0 * chance_value(sim, me)
    if sim.owner >= 0 and sim.units[sim.owner].team != me:
        ou = sim.units[sim.owner]
        p, ang, ty = best_shot(sim, 1 - me, ou, [x for x in sim.units if x.team == me])
        v -= 45.0 * p
    if sim.owner >= 0:
        if sim.units[sim.owner].team == me:
            v += 10.0
            v += 0.25 * ((sim.bx - own_gx(me)) * sgn_atk(me))
        else:
            v -= 6.0
            v -= 0.25 * ((sim.bx - own_gx(me)) * sgn_atk(me))
    else:
        v += 0.15 * ((sim.bx - own_gx(me)) * sgn_atk(me))
    return v


def decide(st0, me, n, A, debug=False):
    set_engine(A.step)
    if n > 1 and any(u.team == me and u.index == 0 for u in st0.units):
        KEEP_TGT['me'] = me
        KEEP_TGT['y'] = keeper_best_y(st0, me)
        KEEP_TGT['frame'] = st0.frame
    else:
        KEEP_TGT['me'] = None
    opp_rows = opp_plan(st0, me, 20)
    styles = [
        {'carrier': 'auto', 'shoot_thr': 0.5, 'pass_thr': 0.45, 'lead': 1.2, 'clear': True},
        {'carrier': 'shoot', 'shoot_thr': 0.05, 'pass_thr': 0.55, 'lead': 1.2, 'clear': True},
        {'carrier': 'pass', 'shoot_thr': 0.75, 'pass_thr': 0.02, 'lead': 1.6, 'clear': True},
        {'carrier': 'dribble', 'shoot_thr': 0.85, 'pass_thr': 9.0, 'lead': 1.2, 'clear': True},
        {'carrier': 'auto', 'shoot_thr': 0.30, 'pass_thr': 0.30, 'lead': 0.6, 'clear': True},
    ]
    # Keeper holding is a useful clock-killer only when we are ahead.  Tied or
    # behind, it produced 25-50 s possessions that never left our own third.
    release = OPT_KEEPER_RELEASE and n > 1 and st0.score[me] <= st0.score[1 - me]
    for style in styles:
        style['keeper_release'] = release
    best_rows, best_v = None, -1e18
    for style in styles:
        sim = st0.clone()
        rows = []
        goal = None
        ctx = {'cache': {}}
        for f in range(20):
            if sim.status != 'playing':
                break
            cmds = frame_cmds(sim, me, n, style, ctx)
            inp = []
            for u in sim.units:
                if u.team == me:
                    c = cmds.get(u.index) or ('N', None, False)
                    if c[1] is not None and not isinstance(c[1], tuple):
                        c = (c[0], (math.cos(c[1]), math.sin(c[1])), c[2])
                    inp.append(c)
                else:
                    c = opp_rows[f].get(u.index) if f < len(opp_rows) else None
                    inp.append(c or ('N', None, False))
            rows.append({(u.team, u.index): inp[i] for i, u in enumerate(sim.units)})
            g = A.step(sim, inp, sim.kickoffTeam)
            if g >= 0:
                goal = g
                break
        v = evaluate_rollout(sim, me, n, goal, style, 20 - len(rows))
        if debug:
            import sys as _s
            _s.stderr.write('style %s v %.2f goal %s frames %d\n' % (style.get('carrier'), v, goal, len(rows)))
        if v > best_v:
            best_v, best_rows = v, rows
    out = list(best_rows)
    while len(out) < 20:
        out.append({(u.team, u.index): ('N', None, False) for u in st0.units})
    return out
