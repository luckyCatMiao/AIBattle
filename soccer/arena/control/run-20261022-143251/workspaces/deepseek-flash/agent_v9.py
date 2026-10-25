#!/usr/bin/env python3
"""3v3 football agent.

Reads one JSON observation per decision window on stdin and prints one JSON
window (20 frames x teamSize unit inputs) per line on stdout.

Design
------
* A compact copy of the public physics lets the agent predict the coming 20
  frames: ball flight after a kick (friction, wall bounces, goals), its own
  movement, and possession changes.  Actions are scheduled frame-by-frame
  inside the window (e.g. kick on frame 0, then chase the predicted rebound).
* Kicks are always 11 cells/s, so every kick is a long ball.  The agent only
  kicks to shoot on goal, to pass to an open team-mate, or to push the ball
  into open space; otherwise it dribbles.
* Defending uses the penalty-box rule: opponents may not enter our box, so a
  ball inside our own box is safe and is collected by the keeper/defenders.
  Our team never steps into the opponent box by accident.
"""
import sys, json, math, os

# ---------------------------------------------------------------- constants
W, H = 44, 26
DT = 1.0 / 20.0
UNIT_R = 0.34
BALL_R = 0.22
MOVE_SPEED = 3.15
DRIBBLE_FACTOR = 0.58
DRIBBLE_SPEED = MOVE_SPEED * DRIBBLE_FACTOR
CONTROL_R = 0.82
TACKLE_MARGIN = 0.12
DRIBBLE_DIST = 0.62
KICK_POWER = 11.0
KICK_CD_FRAMES = 7
CONTROL_LOCK_FRAMES = 6
BALL_FRICTION = 0.978
WALL_REST = 0.72
GOAL_MOUTH_LO, GOAL_MOUTH_HI = 10.5, 15.5
FOUL_FREEZE_FRAMES = 12
FOUL_LOCK_FRAMES = 20
BOX_MARGIN = 1.6          # stay this far from the opponent penalty box

DIRS = {
    'N': (0.0, 0.0), 'U': (0.0, -1.0), 'D': (0.0, 1.0), 'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-math.sqrt(0.5), -math.sqrt(0.5)), 'UR': (math.sqrt(0.5), -math.sqrt(0.5)),
    'DL': (-math.sqrt(0.5), math.sqrt(0.5)), 'DR': (math.sqrt(0.5), math.sqrt(0.5)),
}
DIR_NAMES = list(DIRS.keys())


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


def normxy(x, y):
    l = math.hypot(x, y)
    if l < 1e-12:
        return 0.0, 0.0
    return x / l, y / l


# ---------------------------------------------------------------- physics clone
class World:
    __slots__ = ('tiles', 'units', 'ball', 'freeze', 'frame', 'goal_scored')

    def __init__(self, tiles):
        self.tiles = tiles
        self.units = []
        self.ball = {'x': W / 2, 'y': H / 2, 'vx': 0.0, 'vy': 0.0, 'owner': None}
        self.freeze = 0
        self.frame = 0
        self.goal_scored = None

    def tile_at(self, x, y):
        tx, ty = int(math.floor(x)), int(math.floor(y))
        if tx < 0 or ty < 0 or tx >= W or ty >= H:
            return 1
        return self.tiles[ty * W + tx]

    def hits_wall(self, x, y, r):
        k = r * math.sqrt(0.5)
        pts = ((x - r, y), (x + r, y), (x, y - r), (x, y + r),
               (x - k, y - k), (x + k, y - k), (x - k, y + k), (x + k, y + k))
        for px, py in pts:
            if self.tile_at(px, py) == 1:
                return True
        return False


def move_unit(w, u, dx, dy):
    r = UNIT_R
    nx = u['x'] + dx
    if not w.hits_wall(nx, u['y'], r):
        u['x'] = nx
    else:
        slide = math.copysign(r * 0.5, dx) if dx != 0 else 0.0
        if not w.hits_wall(u['x'] + slide, u['y'], r):
            u['x'] += slide
    ny = u['y'] + dy
    if not w.hits_wall(u['x'], ny, r):
        u['y'] = ny
    else:
        slide = math.copysign(r * 0.5, dy) if dy != 0 else 0.0
        if not w.hits_wall(u['x'], u['y'] + slide, r):
            u['y'] += slide
    u['x'] = clamp(u['x'], r, W - r)
    u['y'] = clamp(u['y'], r, H - r)


def separate_units(w):
    r2 = UNIT_R * 2
    us = w.units
    for i in range(len(us)):
        a = us[i]
        for j in range(i + 1, len(us)):
            b = us[j]
            dx = b['x'] - a['x']
            dy = b['y'] - a['y']
            d = math.hypot(dx, dy)
            if d >= r2 or d < 1e-6:
                continue
            push = (r2 - d) / 2
            dx /= d
            dy /= d
            ax, ay = a['x'] - dx * push, a['y'] - dy * push
            bx, by = b['x'] + dx * push, b['y'] + dy * push
            if not w.hits_wall(ax, ay, UNIT_R):
                a['x'], a['y'] = ax, ay
            if not w.hits_wall(bx, by, UNIT_R):
                b['x'], b['y'] = bx, by


def kick_ball(w, u):
    b = w.ball
    fx, fy = normxy(u['fx'], u['fy'])
    off = UNIT_R + BALL_R + 0.03
    b['owner'] = None
    bx = u['x'] + fx * off
    by = u['y'] + fy * off
    if w.hits_wall(bx, by, BALL_R):
        bx, by = u['x'], u['y']
    b['x'], b['y'] = bx, by
    b['vx'], b['vy'] = fx * KICK_POWER, fy * KICK_POWER
    u['kickCd'] = KICK_CD_FRAMES
    u['controlLock'] = CONTROL_LOCK_FRAMES


def update_unit(w, u, held):
    if u['kickCd'] > 0:
        u['kickCd'] -= 1
    if u['controlLock'] > 0:
        u['controlLock'] -= 1
    if u['stealLock'] > 0:
        u['stealLock'] -= 1
    if u['foulLock'] > 0:
        u['foulLock'] -= 1
    dx, dy = DIRS.get(held['dir'], (0.0, 0.0))
    aim = held.get('aim')
    if aim is not None:
        try:
            a = float(aim) * math.pi / 180.0
            u['fx'], u['fy'] = math.cos(a), math.sin(a)
        except (TypeError, ValueError):
            pass
    elif dx or dy:
        u['fx'], u['fy'] = dx, dy
    carrying = w.ball['owner'] == u['id']
    speed = MOVE_SPEED * (DRIBBLE_FACTOR if carrying else 1.0)
    if u['foulLock'] <= 0 and (dx or dy):
        move_unit(w, u, dx * speed * DT, dy * speed * DT)
    if (u['foulLock'] <= 0 and held['kick'] and w.ball['owner'] == u['id']
            and u['kickCd'] <= 0 and u['controlLock'] <= 0):
        kick_ball(w, u)


def nearest_eligible(w, x, y, flt):
    best, bd = None, 1e18
    for u in w.units:
        if flt is not None and not flt(u):
            continue
        d = math.hypot(u['x'] - x, u['y'] - y)
        if d < bd:
            bd, best = d, u
    return best, bd


def try_possession(w):
    b = w.ball
    if b['owner']:
        owner = None
        for u in w.units:
            if u['id'] == b['owner']:
                owner = u
                break
        if owner is None:
            b['owner'] = None
            return
        owner_d = math.hypot(owner['x'] - b['x'], owner['y'] - b['y'])
        thief, d = nearest_eligible(
            w, b['x'], b['y'],
            lambda u: u['team'] != owner['team'] and u['stealLock'] <= 0 and u['controlLock'] <= 0)
        if thief is not None and d < CONTROL_R and d + TACKLE_MARGIN < owner_d:
            b['owner'] = thief['id']
        return
    u, d = nearest_eligible(w, b['x'], b['y'],
                            lambda u: u['controlLock'] <= 0 and u['stealLock'] <= 0)
    if u is not None and d < CONTROL_R:
        b['owner'] = u['id']
        b['vx'] = 0.0
        b['vy'] = 0.0


def in_goal_mouth(x, y):
    return GOAL_MOUTH_LO <= y <= GOAL_MOUTH_HI


def update_ball(w):
    b = w.ball
    if b['owner']:
        u = None
        for x in w.units:
            if x['id'] == b['owner']:
                u = x
                break
        if u is None:
            b['owner'] = None
            return
        b['x'] = u['x'] + u['fx'] * DRIBBLE_DIST
        b['y'] = u['y'] + u['fy'] * DRIBBLE_DIST
        if w.hits_wall(b['x'], b['y'], BALL_R):
            b['x'], b['y'] = u['x'], u['y']
        b['vx'] = 0.0
        b['vy'] = 0.0
        try_possession(w)
        return
    steps = 4
    for _ in range(steps):
        b['x'] += b['vx'] * DT / steps
        b['y'] += b['vy'] * DT / steps
        if in_goal_mouth(b['x'], b['y']):
            if b['x'] <= 1.0:
                w.goal_scored = 1
                return
            if b['x'] >= W - 1.0:
                w.goal_scored = 0
                return
        if w.hits_wall(b['x'], b['y'], BALL_R):
            px = b['x'] - b['vx'] * DT / steps
            py = b['y'] - b['vy'] * DT / steps
            if w.hits_wall(b['x'], py, BALL_R):
                b['x'] = px
                b['vx'] = -b['vx'] * WALL_REST
            if w.hits_wall(px, b['y'], BALL_R):
                b['y'] = py
                b['vy'] = -b['vy'] * WALL_REST
            if w.hits_wall(b['x'], b['y'], BALL_R):
                b['x'], b['y'] = px, py
                b['vx'] = -b['vx'] * WALL_REST
                b['vy'] = -b['vy'] * WALL_REST
    b['vx'] *= BALL_FRICTION
    b['vy'] *= BALL_FRICTION
    if math.hypot(b['vx'], b['vy']) < 0.02:
        b['vx'] = b['vy'] = 0.0
    try_possession(w)


def box_of(boxes, team):
    return boxes[str(team)] if str(team) in boxes else boxes.get(team)


def in_penalty_box(team, x, y, boxes):
    bx = box_of(boxes, team)
    return bx['x1'] <= x <= bx['x2'] and bx['y1'] <= y <= bx['y2']


def nearest_outside_box(box, x, y, margin=0.9):
    cy = clamp(y, box['y1'], box['y2'])
    cx = clamp(x, box['x1'], box['x2'])
    cands = []
    if box['x1'] > 1:
        cands.append((box['x1'] - margin, cy))
    if box['x2'] < W - 1:
        cands.append((box['x2'] + margin, cy))
    cands.append((cx, box['y1'] - margin))
    cands.append((cx, box['y2'] + margin))
    best, bd = cands[0], 1e18
    for c in cands:
        d = math.hypot(c[0] - x, c[1] - y)
        if d < bd:
            bd, best = d, c
    return clamp(best[0], UNIT_R, W - UNIT_R), clamp(best[1], UNIT_R, H - UNIT_R)


def commit_foul(w, u, box_team, boxes):
    box = box_of(boxes, box_team)
    sx, sy = nearest_outside_box(box, u['x'], u['y'], 0.9)
    cx, cy = (box['x1'] + box['x2']) / 2, (box['y1'] + box['y2']) / 2
    dx, dy = sx - cx, sy - cy
    l = math.hypot(dx, dy) or 1.0
    u['x'] = clamp(sx + dx / l * 1.3, UNIT_R, W - UNIT_R)
    u['y'] = clamp(sy + dy / l * 1.3, UNIT_R, H - UNIT_R)
    u['foulLock'] = FOUL_LOCK_FRAMES
    u['stealLock'] = max(u['stealLock'], FOUL_LOCK_FRAMES)
    u['kickCd'] = max(u['kickCd'], FOUL_LOCK_FRAMES)
    b = w.ball
    b['owner'] = None
    b['x'], b['y'] = sx, sy
    b['vx'] = b['vy'] = 0.0
    w.freeze = max(w.freeze, FOUL_FREEZE_FRAMES)


def step(w, boxes):
    w.frame += 1
    if w.freeze > 0:
        w.freeze -= 1
        return
    for u in w.units:
        update_unit(w, u, u['held'])
    separate_units(w)
    for u in w.units:
        if u['foulLock'] > 0:
            continue
        if in_penalty_box(1 - u['team'], u['x'], u['y'], boxes):
            commit_foul(w, u, 1 - u['team'], boxes)
            return
    update_ball(w)


# ---------------------------------------------------------------- geometry
def seg_point_dist(ax, ay, bx, by, px, py):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    L2 = vx * vx + vy * vy
    if L2 < 1e-12:
        return math.hypot(px - ax, py - ay), 0.0
    t = (wx * vx + wy * vy) / L2
    tc = clamp(t, 0.0, 1.0)
    return math.hypot(px - (ax + vx * tc), py - (ay + vy * tc)), t


def dir_toward(dx, dy):
    if abs(dx) < 1e-9 and abs(dy) < 1e-9:
        return 'N'
    a = math.atan2(dy, dx)
    idx = int(round(a / (math.pi / 4))) % 8
    return ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR'][idx]


def angle_deg(dx, dy):
    return math.degrees(math.atan2(dy, dx))


def travel_time(D):
    if D <= 1e-9:
        return 0.0
    if D >= 24.9:
        return 99.0
    return math.log(1.0 - D / 25.0) / math.log(BALL_FRICTION) / 20.0


# ======================================================================
# v9 tactics
#
# Design notes (all measured with tools/shotlab*.js and offline matches):
#  * A shot fired on frame 0 of a decision window is invisible to the
#    opponent for the whole window; its committed inputs cannot react.
#    Consequently a corner shot from <= ~13 cells out is almost always a
#    goal, no matter where the keeper stands.  Long shots are saved.
#  * Therefore the plan is: get the ball into the attacking third, fire at
#    frame 0 into the corner farthest from the keeper, and on defense deny
#    the opponent that same spot (press the ball, keep a body in the lane).
#  * Dribbling is only 1.83 c/s versus 3.15 for chasers, and any opponent
#    within 0.50 of the ball steals it, so the carrier kicks often instead
#    of holding the ball.  Kicks advance the ball at 11 c/s.
#  * Foul rule: our units must never put their centre inside the opponent
#    penalty box; every movement is probed against that.
# ======================================================================

class Params:
    shot_range = 26.0        # max ball->goal distance worth shooting from
    block_margin = 0.92      # required clearance of the flight line
    keeper_depth = 1.4       # keeper stand-off from its goal line
    press_n = 2              # field players sent to the ball
    chase_n = 2
    pass_advance = 6.0


P = Params()

SHOT_TARGETS = [10.6 + i * (15.4 - 10.6) / 20.0 for i in range(21)]


def goal_x(team):
    return 43.0 if team == 0 else 0.0


def own_goal_x(team):
    return 0.0 if team == 0 else 43.0


def goal_team_of_x(x):
    """Which team scores when the ball crosses the line at this x."""
    return 1 if x <= 1.0 else 0


def flight_path(w, x, y, vx, vy, horizon=90):
    """Ball positions per frame after a kick; also the terminal outcome.

    Mirrors simulation.js updateBall (4 sub-steps, friction, wall bounces).
    outcome: None | ('goal', scoring_team) | ('stop', None)
    """
    path = []
    out = None
    for _ in range(horizon):
        for _s in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if in_goal_mouth(x, y) and (x <= 1.0 or x >= W - 1.0):
                path.append((x, y))
                return path, ('goal', goal_team_of_x(x))
            if w.hits_wall(x, y, BALL_R):
                px = x - vx * DT / 4.0
                py = y - vy * DT / 4.0
                if w.hits_wall(x, py, BALL_R):
                    x = px
                    vx = -vx * WALL_REST
                if w.hits_wall(px, y, BALL_R):
                    y = py
                    vy = -vy * WALL_REST
                if w.hits_wall(x, y, BALL_R):
                    x, y = px, py
                    vx = -vx * WALL_REST
                    vy = -vy * WALL_REST
        vx *= BALL_FRICTION
        vy *= BALL_FRICTION
        if math.hypot(vx, vy) < 0.02:
            vx = vy = 0.0
        path.append((x, y))
        if vx == 0.0 and vy == 0.0:
            out = ('stop', None)
            return path, out
    return path, out


def kick_origin(u, ang):
    """Where the ball sits right after a kick along `ang` (radians)."""
    return (u['x'] + math.cos(ang) * (UNIT_R + BALL_R + 0.03),
            u['y'] + math.sin(ang) * (UNIT_R + BALL_R + 0.03))


def aim_for_target(u, tx, ty):
    """Aim angle such that the kicked ball actually points at (tx,ty)."""
    ang = math.atan2(ty - u['y'], tx - u['x'])
    for _ in range(3):
        ox, oy = kick_origin(u, ang)
        ang = math.atan2(ty - oy, tx - ox)
    return ang


def straight_clearance(x0, y0, path, others):
    """Min distance from any other unit's current spot to the flight path."""
    best = 1e9
    for o in others:
        ox, oy = o['x'], o['y']
        d = 1e9
        for px, py in path:
            dd = (px - ox) * (px - ox) + (py - oy) * (py - oy)
            if dd < d:
                d = dd
                if d < 1e-6:
                    break
        d = math.sqrt(d)
        if d < best:
            best = d
    return best


def dynamic_block(path, foes, obs_ball, blind=20):
    """Frame at which a foe could first reach the flight path, honouring the
    fact that their inputs are frozen for this window (they only saw the ball
    at obs_ball) and that they pursue optimally afterwards."""
    n = len(path)
    for f in foes:
        x, y = f['x'], f['y']
        for i in range(n):
            tx, ty = (obs_ball if i < blind else path[i])
            d = math.hypot(tx - x, ty - y)
            if d > 0.30:
                stepv = min(MOVE_SPEED * DT, d)
                x += (tx - x) / d * stepv
                y += (ty - y) / d * stepv
            if math.hypot(path[i][0] - x, path[i][1] - y) <= CONTROL_R + 0.05:
                return i
    return None


def best_shot(w, shooter, team, obs_ball, others_all):
    """Best goal-mouth target whose flight is not interceptable.

    Returns (aim_rad, target_y, margin) or None.
    """
    u = shooter
    gx = goal_x(team)
    dgoal = math.hypot(gx - u['x'], 13.0 - u['y'])
    if dgoal > P.shot_range:
        return None
    foes = [o for o in others_all if o['team'] != team]
    mates = [o for o in others_all if o['team'] == team and o['id'] != u['id']]
    best = None
    for ty in SHOT_TARGETS:
        ang = aim_for_target(u, gx, ty)
        ox, oy = kick_origin(u, ang)
        path, out = flight_path(w, ox, oy, math.cos(ang) * KICK_POWER,
                                math.sin(ang) * KICK_POWER, 70)
        if out is None or out[0] != 'goal' or out[1] != team:
            continue
        static = straight_clearance(ox, oy, path, foes + mates)
        if static < P.block_margin:
            continue
        bf = dynamic_block(path, foes, obs_ball, 20)
        if bf is not None:
            continue
        margin = min(static, 4.0)
        # prefer the corner farther from the keeper's present position
        kp = None
        for o in foes:
            if o['index'] == 0:
                kp = o
        kdist = math.hypot(kp['x'] - gx, kp['y'] - ty) if kp else 9.0
        score = margin + 0.25 * min(kdist, 4.0) + 0.02 * abs(ty - 13.0)
        if best is None or score > best[3]:
            best = (ang, ty, margin, score)
    if best is None:
        return None
    return best[0], best[1], best[2]


def race_eval(w, u, team, ang, mates, foes, obs_ball, horizon=70):
    """Kick along `ang`: who wins the loose ball, and how far upfield does it go.

    Returns (value, frame) where value > 0 means our team gets there first.
    """
    ox, oy = kick_origin(u, ang)
    vx, vy = math.cos(ang) * KICK_POWER, math.sin(ang) * KICK_POWER
    path, out = flight_path(w, ox, oy, vx, vy, horizon)
    if out is not None and out[0] == 'goal':
        return (100.0, 1) if out[1] == team else (-100.0, 1)
    n = len(path)
    best_mine, best_foe = 1e9, 1e9
    for o in mates:
        lead = 6 if o['id'] == u['id'] else 0
        for i in range(0, n, 2):
            px, py = path[i]
            if math.hypot(o['x'] - px, o['y'] - py) <= MOVE_SPEED * max(0, (i + 1 - lead)) * DT + CONTROL_R * 0.9:
                if i < best_mine:
                    best_mine = i
                break
    for o in foes:
        for i in range(0, n, 2):
            px, py = path[i]
            if math.hypot(o['x'] - px, o['y'] - py) <= MOVE_SPEED * (i + 1) * DT + CONTROL_R * 0.9:
                if i < best_foe:
                    best_foe = i
                break
    ex, ey = path[min(n - 1, best_mine if best_mine < 1e9 else n - 1)]
    adv = (ex - u['x']) * (1.0 if team == 0 else -1.0)
    if out is not None and out[0] == 'stop':
        adv += 2.0
    val = 0.0
    if best_mine < 1e9:
        val += 6.0 - 0.10 * best_mine
    if best_foe < 1e9:
        val -= 6.0 - 0.10 * best_foe
    val += 0.16 * adv
    return (val, best_mine)


def safe_target(team, x, y, boxes, margin=1.0):
    """Project a point out of the opponent penalty box."""
    box = box_of(boxes, 1 - team)
    if box['x1'] - margin <= x <= box['x2'] + margin and box['y1'] - margin <= y <= box['y2'] + margin:
        cands = []
        if box['x1'] > 1:
            cands.append((box['x1'] - margin, y))
        if box['x2'] < W - 1:
            cands.append((box['x2'] + margin, y))
        cands.append((x, box['y1'] - margin))
        cands.append((x, box['y2'] + margin))
        best, bd = cands[0], 1e18
        for c in cands:
            d = math.hypot(c[0] - x, c[1] - y)
            if d < bd:
                bd, best = d, c
        x, y = best
    return clamp(x, UNIT_R + 0.06, W - UNIT_R - 0.06), clamp(y, UNIT_R + 0.06, H - UNIT_R - 0.06)


def probe_move(w, u, dx, dy):
    u2 = dict(u)
    move_unit(w, u2, dx, dy)
    return u2['x'], u2['y']


def choose_dir(w, u, tx, ty, my_team, boxes, mg=0.55, avoid_box=True):
    """Best of the 8 directions toward (tx,ty) that never enters the opponent box."""
    carrying = w.ball['owner'] == u['id']
    sp = MOVE_SPEED * (DRIBBLE_FACTOR if carrying else 1.0) * DT
    box = box_of(boxes, 1 - my_team)
    x1, y1, x2, y2 = box['x1'] - mg, box['y1'] - mg, box['x2'] + mg, box['y2'] + mg
    cur_d = math.hypot(tx - u['x'], ty - u['y'])
    best, best_s = 'N', -1e18
    for name in DIR_NAMES:
        dx, dy = DIRS[name]
        if dx == 0.0 and dy == 0.0:
            continue
        nx, ny = probe_move(w, u, dx * sp, dy * sp)
        d = math.hypot(tx - nx, ty - ny)
        s = (cur_d - d) * 10.0
        if avoid_box and x1 <= nx <= x2 and y1 <= ny <= y2:
            s -= 50.0
            # also look two frames ahead
            nx2, ny2 = probe_move(w, u, dx * sp * 2.0, dy * sp * 2.0)
            if x1 <= nx2 <= x2 and y1 <= ny2 <= y2:
                s -= 50.0
        if s > best_s:
            best_s, best = s, name
    return best, best_s / 10.0


def intercept_target(u, path):
    """Earliest point on a loose-ball path this unit can reach."""
    if not path:
        return None
    for i, (px, py) in enumerate(path):
        if math.hypot(u['x'] - px, u['y'] - py) <= MOVE_SPEED * (i + 1) * DT + CONTROL_R * 0.9:
            return px, py
    return path[-1]


def keeper_guard(w, team, ball_x, ball_y):
    ogx = own_goal_x(team)
    d = math.hypot(ball_x - ogx, ball_y - 13.0)
    depth = min(P.keeper_depth + 0.4, max(0.9, d * 0.16))
    if d < 1e-6:
        return ogx, 13.0
    ux, uy = (ball_x - ogx) / d, (ball_y - 13.0) / d
    return ogx + ux * depth, 13.0 + uy * depth


def lane_block_point(team, bx, by, frac=0.35):
    ogx = own_goal_x(team)
    return bx + (ogx - bx) * frac, by + (13.0 - by) * frac


# ---------------------------------------------------------------- decisions
def decide_frame(w, my_team, n, boxes, allow_shot=True, obs_ball=None, plan=None):
    mine = [u for u in w.units if u['team'] == my_team]
    foes = [u for u in w.units if u['team'] != my_team]
    b = w.ball
    out = [{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)]
    if obs_ball is None:
        obs_ball = (b['x'], b['y'])
    owner = b['owner']
    carrier = None
    for u in mine:
        if u['id'] == owner:
            carrier = u
    keeper = mine[0] if n >= 2 else None
    field = [u for u in mine if u is not keeper]
    att = 1.0 if my_team == 0 else -1.0

    def dist_ball(u):
        return math.hypot(u['x'] - b['x'], u['y'] - b['y'])

    # ---------- our carrier
    if carrier is not None:
        acted = False
        if allow_shot:
            sh = best_shot(w, carrier, my_team, obs_ball, w.units)
            if sh is not None:
                out[carrier['index']] = {'dir': 'N',
                                         'aim': round(math.degrees(sh[0]) % 360.0, 2),
                                         'kick': True}
                acted = True
                if plan is not None:
                    plan['action'] = 'shoot'
        if not acted:
            pressure = min((math.hypot(f['x'] - b['x'], f['y'] - b['y']) for f in foes), default=99.0)
            mates = [m for m in mine if m['id'] != carrier['id'] and m['foulLock'] <= 0]
            kick = None
            if pressure < 4.5 or math.hypot(goal_x(my_team) - b['x'], 13.0 - b['y']) > 17.0:
                bestv, besta = -1e9, None
                for k in range(24):
                    ang = k * math.pi / 12.0
                    # never kick backwards into our own goal mouth
                    if (math.cos(ang) * att) < -0.55:
                        continue
                    v, _fr = race_eval(w, carrier, my_team, ang, mates, foes, obs_ball)
                    if v > bestv:
                        bestv, besta = v, ang
                if besta is not None and bestv > (0.4 if pressure < 2.2 else 1.6):
                    kick = besta
            if kick is not None:
                out[carrier['index']] = {'dir': 'N',
                                         'aim': round(math.degrees(kick) % 360.0, 2),
                                         'kick': True}
                if plan is not None:
                    plan['action'] = 'clear'
                acted = True
        if not acted:
            # dribble toward a shooting spot outside the box, away from the keeper
            kp = None
            for o in foes:
                if o['index'] == 0:
                    kp = o
            lane_y = 13.0
            if kp is not None:
                lane_y = 15.0 if kp['y'] < 13.0 else 11.0
            if abs(b['y'] - 13.0) > 5.5:
                lane_y = b['y']
            tx = goal_x(my_team) - att * 9.0
            ty = lane_y
            tx, ty = safe_target(my_team, tx, ty, boxes, 0.8)
            d, _s = choose_dir(w, carrier, tx, ty, my_team, boxes, mg=0.5)
            out[carrier['index']] = {'dir': d, 'aim': None, 'kick': False}

    # ---------- keeper
    if keeper is not None and keeper is not carrier:
        ogx = own_goal_x(my_team)
        dgoal = math.hypot(b['x'] - ogx, b['y'] - 13.0)
        loose = w.ball['owner'] is None
        tgt = None
        if loose and dgoal < 26.0:
            path, out2 = flight_path(w, b['x'], b['y'], b['vx'], b['vy'], 60)
            moving_to_us = (b['vx'] * (ogx - b['x']) + b['vy'] * (13.0 - b['y'])) > 0.0
            if moving_to_us or dgoal < 9.0:
                tgt = intercept_target(keeper, path)
                if tgt is not None and math.hypot(tgt[0] - ogx, tgt[1] - 13.0) > 13.0:
                    tgt = None
        if tgt is None:
            tgt = keeper_guard(w, my_team, b['x'], b['y'])
        tgt = safe_target(my_team, tgt[0], tgt[1], boxes, 0.4)
        d, _s = choose_dir(w, keeper, tgt[0], tgt[1], my_team, boxes, mg=0.4)
        out[keeper['index']] = {'dir': d, 'aim': None, 'kick': False}

    # ---------- other field players
    rest = [u for u in field if u is not carrier]
    if rest:
        if carrier is not None:
            # attacking support: spread ahead / wide, stay out of the shot lane
            for i, u in enumerate(rest):
                side = 1.0 if ((i + u['index']) % 2 == 0) else -1.0
                tx = b['x'] + att * 8.0
                ty = clamp(b['y'] + side * 5.5, 3.0, 23.0)
                tx, ty = safe_target(my_team, tx, ty, boxes, 1.0)
                d, _s = choose_dir(w, u, tx, ty, my_team, boxes, mg=0.7)
                out[u['index']] = {'dir': d, 'aim': None, 'kick': False}
        elif owner is not None:
            # opponent carries: press with the closest, the rest block the lane
            ranked = sorted(rest, key=dist_ball)
            for i, u in enumerate(ranked):
                if i < P.press_n:
                    tx, ty = b['x'], b['y']
                else:
                    tx, ty = lane_block_point(my_team, b['x'], b['y'], 0.42)
                    side = 1.0 if (i % 2 == 0) else -1.0
                    ty = clamp(ty + side * 1.8, 2.5, 23.5)
                tx, ty = safe_target(my_team, tx, ty, boxes, 0.8)
                d, _s = choose_dir(w, u, tx, ty, my_team, boxes, mg=0.6)
                out[u['index']] = {'dir': d, 'aim': None, 'kick': False}
        else:
            # loose ball: race for it, others cover
            path, _o = flight_path(w, b['x'], b['y'], b['vx'], b['vy'], 60)
            path = [(b['x'], b['y'])] + path
            ranked = sorted(rest, key=dist_ball)
            for i, u in enumerate(ranked):
                if i < P.chase_n:
                    tgt = intercept_target(u, path)
                    if tgt is None:
                        tgt = (b['x'], b['y'])
                else:
                    tgt = lane_block_point(my_team, b['x'], b['y'], 0.45)
                tgt = safe_target(my_team, tgt[0], tgt[1], boxes, 0.7)
                d, _s = choose_dir(w, u, tgt[0], tgt[1], my_team, boxes, mg=0.6)
                out[u['index']] = {'dir': d, 'aim': None, 'kick': False}

    return out


# ---------------------------------------------------------------- build / main
def build_world(obs):
    global np_world
    w = World(obs['map']['tiles'])
    raw = obs['units']
    for u in raw:
        w.units.append({
            'id': u['id'], 'team': int(u['team']), 'index': int(u['index']),
            'name': u.get('name', ''),
            'x': float(u['x']), 'y': float(u['y']),
            'fx': float(u['facing']['x']), 'fy': float(u['facing']['y']),
            'kickCd': int(round(float(u.get('kickCd', 0)) * 20)),
            'controlLock': int(round(float(u.get('controlLock', 0)) * 20)),
            'stealLock': 0, 'foulLock': 0,
            'held': {'dir': 'N', 'aim': None, 'kick': False},
        })
    w.units.sort(key=lambda u: (u['team'], u['index']))
    b = obs['ball']
    w.ball = {'x': float(b['x']), 'y': float(b['y']), 'vx': float(b['vx']), 'vy': float(b['vy']),
              'owner': b.get('owner')}
    w.freeze = int(round(float(obs.get('freeze', 0)) * 20))
    w.goal_scored = None
    np_world = w
    return w, obs['map']['penaltyBoxes']


def neutral_window(n):
    return [[{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)] for _ in range(20)]


DEBUG = os.environ.get('AGENT_DEBUG') == '1'


def compute_window(obs):
    global np_world
    n = int(obs.get('teamSize', 3))
    my_team = int(obs.get('yourTeam', 0))
    if obs.get('status') != 'playing':
        return neutral_window(n)
    try:
        w, boxes = build_world(obs)
        np_world = w
    except Exception:
        return neutral_window(n)
    obs_ball = (w.ball['x'], w.ball['y'])
    frames = []
    goal_hit = False
    for fi in range(20):
        if goal_hit:
            frames.append([{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)])
            continue
        try:
            our = decide_frame(w, my_team, n, boxes, allow_shot=(fi == 0), obs_ball=obs_ball)
        except Exception as e:
            if DEBUG:
                sys.stderr.write('decide error f%d: %r\n' % (fi, e))
            our = [{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)]
        for u in w.units:
            if u['team'] == my_team:
                u['held'] = our[u['index']]
            else:
                u['held'] = model_foe_input(w, u, obs_ball)
        step(w, boxes)
        if w.goal_scored is not None:
            goal_hit = True
        frames.append(our)
    for fr in frames:
        for inp in fr:
            a = inp.get('aim')
            if isinstance(a, (int, float)) and math.isfinite(a):
                inp['aim'] = round(float(a) % 360.0, 2)
            elif a is not None:
                inp['aim'] = None
            if inp.get('dir') not in DIRS:
                inp['dir'] = 'N'
            inp['kick'] = bool(inp.get('kick', False))
    return frames


def model_foe_input(w, u, obs_ball):
    """Predict an opponent's committed input: chase the ball it saw at the
    window start, keepers hold their line.  Only used for our own prediction."""
    b = w.ball
    if u['index'] == 0:
        tx, ty = keeper_guard(w, 1 - u['team'], obs_ball[0], obs_ball[1])
    else:
        tx, ty = obs_ball
    dx, dy = tx - u['x'], ty - u['y']
    if math.hypot(dx, dy) < 0.45:
        return {'dir': 'N', 'aim': None, 'kick': False}
    return {'dir': dir_toward(dx, dy), 'aim': None, 'kick': False}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
        except Exception:
            continue
        try:
            win = compute_window(obs)
        except Exception:
            win = neutral_window(int(obs.get('teamSize', 3)) if isinstance(obs, dict) else 3)
        sys.stdout.write(json.dumps({'inputs': win}, separators=(',', ':')) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
