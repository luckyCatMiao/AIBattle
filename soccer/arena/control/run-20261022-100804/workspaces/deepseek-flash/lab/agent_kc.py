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


# ---------------------------------------------------------------- tactics
class Params:
    shoot_range = 18.0
    shot_reach = 0.9          # reaction delay used in shot clearance model
    pass_reach = 0.8
    shot_clear = -0.35        # allow slight risk
    pass_min_clear = 0.15
    keeper_out_frac = 0.12       # 守门员几乎贴着门线站位
    keeper_out_max = 1.0
    keeper_out_min = 0.45
    loose_chase = 2
    press_count = 2


P = Params()


def attack_goal_x(team):
    return 43.0 if team == 0 else 0.0


def own_goal_x(team):
    return 1.0 if team == 0 else 43.0


def opp_box_edge(team, boxes):
    b = box_of(boxes, 1 - team)
    return b['x1'] if team == 0 else b['x2']


def path_clearance(ax, ay, bx, by, others, reaction=0.8):
    """min over units of (distance to segment - reachable radius at pass time)."""
    D = math.hypot(bx - ax, by - ay)
    best = 1e9
    for o in others:
        d, t = seg_point_dist(ax, ay, bx, by, o['x'], o['y'])
        arr = travel_time(D * t)
        reach = CONTROL_R + MOVE_SPEED * max(0.0, arr - reaction)
        c = d - reach
        if c < best:
            best = c
    return best


def best_shot(w, shooter_id, team, units):
    """Score candidate goal-mouth targets. Returns (tx,ty,clearance).

    The kick launches the ball at shooter + aim*0.59 and it flies along the aim
    direction, so the trajectory passes through the shooter's centre (not the
    pre-kick ball position).  Model and aim from the shooter centre.
    """
    shooter = None
    for u in w.units:
        if u['id'] == shooter_id:
            shooter = u
            break
    if shooter is None:
        shooter = {'x': w.ball['x'], 'y': w.ball['y']}
    bx, by = shooter['x'], shooter['y']
    gx = attack_goal_x(team)
    others = [u for u in units if u['id'] != shooter_id and u['team'] != team]
    best, best_c = None, -1e9
    for i in range(11):
        ty = 10.7 + i * (15.3 - 10.7) / 10.0
        c = path_clearance(bx, by, gx, ty, others, P.shot_reach)
        if c > best_c:
            best_c = c
            best = (gx, ty)
    return best[0], best[1], best_c


def choose_pass(w, carrier_id, team, mates, others):
    """Pick a forward pass target at a team-mate's current spot."""
    b = w.ball
    carrier = None
    for u in w.units:
        if u['id'] == carrier_id:
            carrier = u
            break
    bx, by = (carrier['x'], carrier['y']) if carrier is not None else (b['x'], b['y'])
    att = 1.0 if team == 0 else -1.0
    best, best_val = None, -1e9
    for m in mates:
        if m['id'] == carrier_id or m['foulLock'] > 0:
            continue
        gain = att * (m['x'] - bx)
        if gain < 1.5:
            continue
        tx, ty = m['x'], m['y']
        c = path_clearance(bx, by, tx, ty, others, P.pass_reach)
        if c < P.pass_min_clear:
            continue
        val = c + 0.22 * gain - 0.03 * abs(ty - 13.0)
        if val > best_val:
            best_val = val
            best = (tx, ty, m['id'])
    return best


def kick_to_space(w, carrier, team, mates, foes, boxes):
    """Choose a direction that sends the ball into a useful open area."""
    b = w.ball
    bx, by = b['x'], b['y']
    att = 1.0 if team == 0 else -1.0
    edge = opp_box_edge(team, boxes)
    best_ang, best_score = None, -1e9
    start = (b['x'], b['y'])
    for k in range(24):
        ang = k * 15.0
        rad = math.radians(ang)
        vx, vy = math.cos(rad) * KICK_POWER, math.sin(rad) * KICK_POWER
        # simulate loose flight
        px, py = start
        alive = True
        for _ in range(70):
            moved = False
            for s in range(4):
                px += vx * DT / 4.0
                py += vy * DT / 4.0
                if in_goal_mouth(px, py) and (px >= W - 1.0 or px <= 1.0):
                    alive = False
                    break
                if w.hits_wall(px, py, BALL_R):
                    # crude reflect
                    if w.hits_wall(px - vx * DT / 4.0, py, BALL_R):
                        vx = -vx * WALL_REST
                        px -= vx * DT / 4.0
                    if w.hits_wall(px, py - vy * DT / 4.0, BALL_R):
                        vy = -vy * WALL_REST
                        py -= vy * DT / 4.0
                    moved = True
                    break
            vx *= BALL_FRICTION
            vy *= BALL_FRICTION
            if math.hypot(vx, vy) < 0.05:
                break
            moved = moved
        if not alive:
            continue
        # landing evaluation
        dead = in_penalty_box(1 - team, px, py, boxes)
        if dead:
            continue
        if in_penalty_box(1 - team, px + att * 0.8, py, boxes):
            continue
        score = 0.45 * att * (px - bx) - 0.10 * abs(py - 13.0)
        # prefer landing near one of our forwards
        if mates:
            dm = min(math.hypot(px - m['x'], py - m['y']) for m in mates)
            score -= 0.10 * dm
        # avoid opponents along the path
        blockers = 0.0
        if foes:
            dmin = min(seg_point_dist(bx, by, px, py, f['x'], f['y'])[0] for f in foes)
            blockers = max(0.0, 2.0 - dmin)
        score -= 0.8 * blockers
        if score > best_score:
            best_score = score
            best_ang = ang
    return best_ang


def kick_to_space_simple(w, carrier, team, mates, foes, boxes):
    """Fallback: aim at the most open forward lane, clamped outside the box."""
    b = w.ball
    bx, by = b['x'], b['y']
    att = 1.0 if team == 0 else -1.0
    edge = opp_box_edge(team, boxes)
    best, best_c = None, -1e9
    for y in (3.0, 6.0, 9.5, 13.0, 16.5, 20.0, 23.0):
        tx = clamp(bx + att * 20.0, 2.0, edge - att * 1.0)
        c = path_clearance(bx, by, tx, y, foes, 0.8)
        if c > best_c:
            best_c = c
            best = (tx, y)
    return best


def solo_kick_aim(w, team, bx, by, foes, boxes):
    """1v1: kick the ball past the opponent and towards their half.

    Evaluates 36 aim directions with the real ball physics: prefer directions
    that score, never ones the opponent can capture on the way, and land the
    ball as far towards the attacking goal (and away from the opponent) as
    possible, so that we win the following chase goal-side.
    """
    b = w.ball
    old = (b['owner'], b['vx'], b['vy'], b['x'], b['y'])
    gx = attack_goal_x(team)
    att = 1.0 if team == 0 else -1.0
    best_ang, best_val = None, -1e9
    b['owner'] = None
    b['x'], b['y'] = bx, by
    for k in range(36):
        ang = k * 10.0
        rad = math.radians(ang)
        b['vx'] = math.cos(rad) * KICK_POWER
        b['vy'] = math.sin(rad) * KICK_POWER
        path = ball_path(w, 55)
        if not path:
            continue
        minfoe = 1e9
        for px, py in path[:45]:
            for f in foes:
                d = math.hypot(px - f['x'], py - f['y'])
                if d < minfoe:
                    minfoe = d
        scored = any(in_goal_mouth(px, py) and
                     ((gx >= W - 1 and px >= W - 1.0) or (gx <= 1 and px <= 1.0))
                     for px, py in path)
        ex, ey = path[-1]
        val = 0.45 * att * (ex - bx) - 0.05 * abs(ey - 13.0)
        if scored and minfoe > 0.95:
            val += 30.0
        val -= 1.5 * max(0.0, 1.2 - minfoe)
        if not scored and in_penalty_box(1 - team, ex, ey, boxes):
            val -= 4.0
        if foes:
            val -= 0.10 * min(math.hypot(ex - f['x'], ey - f['y']) for f in foes)
        if val > best_val:
            best_val, best_ang = val, ang
    b['owner'], b['vx'], b['vy'], b['x'], b['y'] = old
    return best_ang


def safe_target(team, x, y, boxes, margin=BOX_MARGIN):
    """Project a point out of the opponent penalty box (nearest open side)."""
    box = box_of(boxes, 1 - team)
    if box['x1'] <= x <= box['x2'] and box['y1'] <= y <= box['y2']:
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
    return clamp(x, UNIT_R + 0.05, W - UNIT_R - 0.05), clamp(y, UNIT_R + 0.05, H - UNIT_R - 0.05)


def seg_hits_rect(ax, ay, bx, by, x1, y1, x2, y2):
    """Liang-Barsky: does segment a-b intersect the axis-aligned rect?"""
    dx, dy = bx - ax, by - ay
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, ax - x1), (dx, x2 - ax), (-dy, ay - y1), (dy, y2 - ay)):
        if abs(p) < 1e-12:
            if q < 0:
                return False
        else:
            r = q / p
            if p < 0:
                if r > t1:
                    return False
                if r > t0:
                    t0 = r
            else:
                if r < t0:
                    return False
                if r < t1:
                    t1 = r
    return t0 <= t1


def go_to_dir(w, u, target, team, boxes, safe_mg=0.85):
    """Direction towards target, routed around the opponent penalty box."""
    tx, ty = target
    box = box_of(boxes, 1 - team)
    # never target a point inside the box
    if box['x1'] <= tx <= box['x2'] and box['y1'] <= ty <= box['y2']:
        tx, ty = safe_target(team, tx, ty, boxes, 0.8)
    m = 1.2
    x1, y1, x2, y2 = box['x1'] - m, box['y1'] - m, box['x2'] + m, box['y2'] + m
    if (abs(tx - u['x']) > 1e-9 or abs(ty - u['y']) > 1e-9) and \
            seg_hits_rect(u['x'], u['y'], tx, ty, x1, y1, x2, y2):
        # the open side of the box is the one that is not a field wall
        open_x = box['x1'] - m if box['x1'] > 1 else box['x2'] + m
        gates = [(open_x, y1 - 0.15), (open_x, y2 + 0.15)]
        reachable = [g for g in gates
                     if not seg_hits_rect(u['x'], u['y'], g[0], g[1], x1, y1, x2, y2)]
        pool = reachable if reachable else gates
        g = min(pool, key=lambda g: math.hypot(g[0] - u['x'], g[1] - u['y']) +
                math.hypot(tx - g[0], ty - g[1]))
        tx, ty = g
    return move_safe_dir(w, u, dir_toward(tx - u['x'], ty - u['y']), team, boxes, safe_mg)


def move_safe_dir(w, u, desired, team, boxes, mg=0.85):
    """Pick the desired direction unless it would step into the opponent box.

    A small safety margin absorbs the pushes from separateUnits(): a unit
    shoved 0.3 cells can otherwise cross the line and concede a foul.
    """
    dx, dy = DIRS[desired]
    if dx == 0 and dy == 0:
        return 'N'
    sp = MOVE_SPEED * (DRIBBLE_FACTOR if w.ball['owner'] == u['id'] else 1.0)
    box = box_of(boxes, 1 - team)
    x1, y1, x2, y2 = box['x1'] - mg, box['y1'] - mg, box['x2'] + mg, box['y2'] + mg

    def danger(x, y):
        return x1 <= x <= x2 and y1 <= y <= y2

    # look a few frames ahead for safety
    for ahead in (1.0, 2.0, 3.0, 4.0):
        nx = u['x'] + dx * sp * DT * ahead
        ny = u['y'] + dy * sp * DT * ahead
        if danger(nx, ny):
            alts = []
            if dx:
                alts.append('R' if dx > 0 else 'L')
            if dy:
                alts.append('D' if dy > 0 else 'U')
            alts.append('N')
            for a in alts:
                ax, ay = DIRS[a]
                ok = True
                for ahead2 in (1.0, 2.0, 3.0, 4.0):
                    if danger(u['x'] + ax * sp * DT * ahead2,
                              u['y'] + ay * sp * DT * ahead2):
                        ok = False
                        break
                if ok:
                    return a
            return 'N'
    return desired


def ball_path(w, horizon=80):
    """Predict a loose ball's future positions (list of (x,y) per frame)."""
    b = dict(w.ball)
    out = []
    if b['owner']:
        return out
    vx, vy = b['vx'], b['vy']
    for _ in range(horizon):
        for s in range(4):
            b['x'] += vx * DT / 4.0
            b['y'] += vy * DT / 4.0
            if in_goal_mouth(b['x'], b['y']) and (b['x'] >= W - 1.0 or b['x'] <= 1.0):
                out.append((b['x'], b['y']))
                return out
            if w.hits_wall(b['x'], b['y'], BALL_R):
                px = b['x'] - vx * DT / 4.0
                py = b['y'] - vy * DT / 4.0
                if w.hits_wall(b['x'], py, BALL_R):
                    b['x'] = px
                    vx = -vx * WALL_REST
                if w.hits_wall(px, b['y'], BALL_R):
                    b['y'] = py
                    vy = -vy * WALL_REST
                if w.hits_wall(b['x'], b['y'], BALL_R):
                    b['x'], b['y'] = px, py
                    vx = -vx * WALL_REST
                    vy = -vy * WALL_REST
        vx *= BALL_FRICTION
        vy *= BALL_FRICTION
        if math.hypot(vx, vy) < 0.02:
            vx = vy = 0.0
        out.append((b['x'], b['y']))
        if vx == 0 and vy == 0:
            # ball at rest: fill the rest
            out.extend([(b['x'], b['y'])] * (horizon - len(out)))
            break
    return out


def intercept_point(u, path):
    """Where a player should run to meet a loose ball."""
    if not path:
        return None
    for i, (x, y) in enumerate(path):
        t = (i + 1) / 20.0
        if math.hypot(u['x'] - x, u['y'] - y) <= MOVE_SPEED * t + CONTROL_R * 0.9:
            return x, y
    return path[-1]


def keeper_guard_point(w, team):
    b = w.ball
    gcx, gcy = own_goal_x(team), 13.0
    d = math.hypot(b['x'] - gcx, b['y'] - gcy)
    if d > 1e-6:
        ux, uy = (b['x'] - gcx) / d, (b['y'] - gcy) / d
    else:
        ux, uy = (1.0 if team == 0 else -1.0), 0.0
    out = clamp(d * P.keeper_out_frac, P.keeper_out_min, P.keeper_out_max)
    return gcx + ux * out, gcy + uy * out


# ---------------------------------------------------------------- decisions
def support_target(w, team, b, boxes, f, cands_x, cands_y, used, foes):
    att = 1.0 if team == 0 else -1.0
    bestp, bestv = None, -1e9
    for cx in cands_x:
        for cy in cands_y:
            px, py = safe_target(team, cx, cy, boxes, BOX_MARGIN)
            c = path_clearance(b['x'], b['y'], px, py, foes, P.pass_reach)
            v = c + 0.10 * att * (px - b['x']) - 0.05 * abs(py - 13.0)
            if used:
                v -= 0.6 * max(0.0, 6.0 - min(math.hypot(px - ux, py - uy) for ux, uy in used))
            if v > bestv:
                bestv, bestp = v, (px, py)
    return bestp


def decide_frame(w, my_team, n, boxes, allow_shot=True):
    mine = [u for u in w.units if u['team'] == my_team]
    foes = [u for u in w.units if u['team'] != my_team]
    b = w.ball
    out = [{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)]
    owner = b['owner']
    my_owner = None
    opp_owner = None
    for u in mine:
        if u['id'] == owner:
            my_owner = u
    for u in foes:
        if u['id'] == owner:
            opp_owner = u

    att = 1.0 if my_team == 0 else -1.0
    edge = opp_box_edge(my_team, boxes)
    keeper = mine[0] if n >= 2 else None
    field = [u for u in mine if not (u['index'] == 0 and n >= 2)]
    owner_is_my_field = my_owner is not None and my_owner in field

    # ---------------- 1v1: one unit does everything
    if n == 1:
        u = mine[0]
        bx, by = b['x'], b['y']
        gx = own_goal_x(my_team)
        ax = attack_goal_x(my_team)
        if u is my_owner:
            dgoal = math.hypot(ax - bx, 13.0 - by)
            sx, sy, sc = best_shot(w, u['id'], my_team, w.units)
            if dgoal < 23.0 and sc > -0.5:
                ang = angle_deg(sx - u['x'], sy - u['y'])
                out[0] = {'dir': 'N', 'aim': ang, 'kick': True}
            else:
                nf = None
                dfoe = 99.0
                if foes:
                    nf = min(foes, key=lambda o: math.hypot(o['x'] - bx, o['y'] - by))
                    dfoe = math.hypot(nf['x'] - bx, nf['y'] - by)
                if nf is not None and dfoe < 5.5:
                    # 对手堵在身前：把球踢过对方、逼其回追，我们跟在球与自家球门之间
                    ang = solo_kick_aim(w, my_team, bx, by, foes, boxes)
                    if ang is not None:
                        out[0] = {'dir': 'N', 'aim': ang, 'kick': True}
                    else:
                        aim = angle_deg(u['y'] - nf['y'], u['x'] - nf['x'])
                        out[0] = {'dir': 'N', 'aim': aim, 'kick': True}
                else:
                    side = 1.0 if u['y'] >= 13.0 else -1.0
                    ty = clamp(13.0 + side * 6.0, 3.0, 23.0)
                    aim = None
                    if nf is not None and dfoe < 4.5:
                        aim = angle_deg(u['y'] - nf['y'], u['x'] - nf['x'])
                    tx = edge - att * (BOX_MARGIN + 0.2)
                    tx, ty = safe_target(my_team, tx, ty, boxes, BOX_MARGIN)
                    out[0] = {'dir': go_to_dir(w, u, (tx, ty), my_team, boxes), 'aim': aim, 'kick': False}
        elif opp_owner is not None:
            # 站在对手与自家球门之间：1.9 格外的射门线路上，
            # 对方一踢球就会撞到我们；近门则直接上抢。
            d_home = math.hypot(gx - bx, 13.0 - by)
            if d_home < 7.0:
                target = (bx, by)
            else:
                ux, uy = normxy(gx - bx, 13.0 - by)
                target = (bx + ux * 1.9, by + uy * 1.9)
            target = safe_target(my_team, target[0], target[1], boxes, 0.6)
            out[0] = {'dir': go_to_dir(w, u, target, my_team, boxes), 'aim': None, 'kick': False}
        else:
            path = ball_path(w, 80)
            speed = math.hypot(b['vx'], b['vy'])
            attv = 1.0 if my_team == 0 else -1.0
            to_goal = b['vx'] * attv < -1.0
            if path and (to_goal or speed > 1.0):
                ipt = intercept_point(u, path) if path else (bx, by)
                target = ipt if ipt is not None else (bx, by)
            else:
                # 静止/慢速松球：对手还能争到时不越过球，先卡住球门线路
                if foes:
                    nf = min(foes, key=lambda o: math.hypot(o['x'] - bx, o['y'] - by))
                    myd = math.hypot(u['x'] - bx, u['y'] - by)
                    fxd = math.hypot(nf['x'] - bx, nf['y'] - by)
                    contested = fxd < 6.0 and not (myd + 2.2 < fxd)
                    if contested:
                        ux, uy = normxy(gx - bx, 13.0 - by)
                        target = (bx + ux * 1.9, by + uy * 1.9)
                    else:
                        target = (bx, by)
                else:
                    target = (bx, by)
            target = safe_target(my_team, target[0], target[1], boxes, 0.6)
            out[0] = {'dir': go_to_dir(w, u, target, my_team, boxes), 'aim': None, 'kick': False}
        return out

    # ---------------- keeper without ball: guard / collect
    if keeper is not None and keeper is not my_owner:
        bx, by = b['x'], b['y']
        gx0 = own_goal_x(my_team)
        dgoal = math.hypot(bx - gx0, by - 13.0)
        in_own_box = in_penalty_box(my_team, bx, by, boxes)
        loose = owner is None
        target = None
        attv = 1.0 if my_team == 0 else -1.0
        # a loose ball flying towards our goal must be met on its path
        incoming = loose and b['vx'] * attv < -1.2 and dgoal < 30.0
        if loose and (in_own_box or dgoal < 7.0 or incoming):
            path = ball_path(w, 45)
            ipt = intercept_point(keeper, path) if path else (bx, by)
            if ipt is not None and (incoming or
                                    math.hypot(ipt[0] - gx0, ipt[1] - 13.0) < 11.0):
                target = safe_target(my_team, ipt[0], ipt[1], boxes, 0.7)
        if target is None:
            gx, gy = keeper_guard_point(w, my_team)
            target = safe_target(my_team, gx, gy, boxes, 0.5)
        out[keeper['index']] = {'dir': go_to_dir(w, keeper, target, my_team, boxes),
                                'aim': None, 'kick': False}

    # ---------------- our keeper has the ball
    keeper_pass_receiver = None
    if keeper is not None and keeper is my_owner:
        mates = [m for m in mine if m['id'] != keeper['id'] and m['foulLock'] <= 0]
        others = foes + [m for m in mine if m['id'] != keeper['id']]
        pg = choose_pass(w, keeper['id'], my_team, mates, others)
        acted = False
        if pg is not None:
            ang = angle_deg(pg[0] - keeper['x'], pg[1] - keeper['y'])
            out[keeper['index']] = {'dir': 'N', 'aim': ang, 'kick': True}
            acted = True
            keeper_pass_receiver = pg[2]
        if not acted:
            tgt = kick_to_space_simple(w, keeper, my_team, mates, foes, boxes)
            if tgt is not None:
                ang = angle_deg(tgt[0] - keeper['x'], tgt[1] - keeper['y'])
                out[keeper['index']] = {'dir': 'N', 'aim': ang, 'kick': True}
            else:
                ang = angle_deg(att * 1.0, 0.0)
                out[keeper['index']] = {'dir': 'N', 'aim': ang, 'kick': True}

    # ---------------- field players
    def dist_ball(u):
        return math.hypot(u['x'] - b['x'], u['y'] - b['y'])

    field_sorted = sorted(field, key=dist_ball)

    if owner_is_my_field:
        carrier = my_owner
        # ---- carrier action
        dgoal = math.hypot(attack_goal_x(my_team) - b['x'], 13.0 - b['y'])
        acted = False
        pass_receiver_id = None
        action = 'dribble'
        if allow_shot and dgoal < P.shoot_range:
            sx, sy, sc = best_shot(w, carrier['id'], my_team, w.units)
            if sc > P.shot_clear:
                ang = angle_deg(sx - carrier['x'], sy - carrier['y'])
                out[carrier['index']] = {'dir': 'N', 'aim': ang, 'kick': True}
                acted = True
                action = 'shoot'
        if not acted:
            mates = [m for m in mine if m['id'] != carrier['id'] and m['foulLock'] <= 0]
            others = foes + [m for m in mine if m['id'] != carrier['id']]
            pg = choose_pass(w, carrier['id'], my_team, mates, others)
            nearest_foe = min((math.hypot(f['x'] - b['x'], f['y'] - b['y']) for f in foes), default=99.0)
            if pg is not None and (nearest_foe < 2.6 or dgoal > 21.0):
                ang = angle_deg(pg[0] - carrier['x'], pg[1] - carrier['y'])
                out[carrier['index']] = {'dir': 'N', 'aim': ang, 'kick': True}
                acted = True
                action = 'pass'
                pass_receiver_id = pg[2]
        if not acted:
            # pressure release: kick to open space
            nearest_foe = min((math.hypot(f['x'] - b['x'], f['y'] - b['y']) for f in foes), default=99.0)
            behind = att * (b['x'] - 21.5) < 0.0
            if nearest_foe < 1.7 and behind:
                tgt = kick_to_space(w, carrier, my_team, mates, foes, boxes)
                if tgt is None:
                    tgt = kick_to_space_simple(w, carrier, my_team, mates, foes, boxes)
                if tgt is not None:
                    if isinstance(tgt, tuple):
                        ang = angle_deg(tgt[0] - carrier['x'], tgt[1] - carrier['y'])
                    else:
                        ang = float(tgt)
                    out[carrier['index']] = {'dir': 'N', 'aim': ang, 'kick': True}
                    acted = True
                    action = 'clear'
        if not acted:
            # dribble toward the attacking box edge, away from the nearest foe
            lane = 13.0
            if foes:
                nf = min(foes, key=lambda o: math.hypot(o['x'] - b['x'], o['y'] - b['y']))
                side = 1.0 if b['y'] >= nf['y'] else -1.0
                lane = clamp(b['y'] + side * 3.0, 3.0, 23.0)
            if abs(b['y'] - 13.0) > 7.0:
                lane = b['y']  # keep running down an open flank
            tx = edge - att * (BOX_MARGIN + 0.4)
            ty = lane
            deep = att * (b['x'] - 21.5) > 6.0
            shoot_mg = 0.85
            if deep:
                # stop just outside the box: shorter flight and a wider angle
                tx = edge - att * 0.9
                shoot_mg = 0.5
                okp = None
                for o in foes:
                    if o['index'] == 0:
                        okp = o
                ky = okp['y'] if okp else 13.0
                ty = 16.8 if ky < 13.0 else 9.2
                ty = clamp(ty, 3.0, 23.0)
            tx, ty = safe_target(my_team, tx, ty, boxes, BOX_MARGIN)
            aim = None
            if foes:
                nf = min(foes, key=lambda o: math.hypot(o['x'] - carrier['x'], o['y'] - carrier['y']))
                if math.hypot(nf['x'] - carrier['x'], nf['y'] - carrier['y']) < 3.5:
                    aim = angle_deg(carrier['y'] - nf['y'], carrier['x'] - nf['x'])
            out[carrier['index']] = {'dir': go_to_dir(w, carrier, (tx, ty), my_team, boxes, safe_mg=shoot_mg),
                                     'aim': aim, 'kick': False}

        # ---- support players
        rest = [f for f in field if f['id'] != carrier['id']]
        if my_team == 0:
            cands_x = [clamp(b['x'] + d, 6.0, edge - (BOX_MARGIN + 0.5)) for d in (7.0, 12.0, 17.0)]
        else:
            cands_x = [clamp(b['x'] - d, edge + (BOX_MARGIN + 0.5), W - 7.0) for d in (7.0, 12.0, 17.0)]
        cands_y = [3.0, 6.0, 9.0, 13.0, 17.0, 20.0, 23.0]
        used = []
        for f in rest:
            if f['id'] == pass_receiver_id:
                out[f['index']] = {'dir': 'N', 'aim': None, 'kick': False}
                used.append((f['x'], f['y']))
                continue
            bestp = support_target(w, my_team, b, boxes, f, cands_x, cands_y, used, foes)
            used.append(bestp)
            out[f['index']] = {'dir': go_to_dir(w, f, bestp, my_team, boxes), 'aim': None, 'kick': False}

    elif keeper is not None and keeper is my_owner:
        # ---------------- our keeper has the ball: field players take up
        # receiving positions up the pitch, the pass receiver holds.
        rest = field
        if my_team == 0:
            cands_x = [clamp(b['x'] + d, 8.0, edge - (BOX_MARGIN + 0.5)) for d in (10.0, 16.0, 22.0)]
        else:
            cands_x = [clamp(b['x'] - d, edge + (BOX_MARGIN + 0.5), W - 8.0) for d in (10.0, 16.0, 22.0)]
        cands_y = [3.0, 6.0, 9.5, 13.0, 16.5, 20.0, 23.0]
        used = []
        for f in rest:
            if f['id'] == keeper_pass_receiver:
                out[f['index']] = {'dir': 'N', 'aim': None, 'kick': False}
                used.append((f['x'], f['y']))
                continue
            bestp = support_target(w, my_team, b, boxes, f, cands_x, cands_y, used, foes)
            used.append(bestp)
            out[f['index']] = {'dir': go_to_dir(w, f, bestp, my_team, boxes), 'aim': None, 'kick': False}

    else:
        # ---------------- opponent owns or ball is loose
        loose = owner is None
        if loose:
            path = ball_path(w, 80)
            # rank field players by time-to-ball
            def tti(u):
                if not path:
                    return math.hypot(u['x'] - b['x'], u['y'] - b['y'])
                return math.hypot(u['x'] - path[-1][0], u['y'] - path[-1][1])
            ranked = sorted(field, key=tti)
            in_our_box = in_penalty_box(my_team, b['x'], b['y'], boxes)
            nchase = len(ranked) if in_our_box else max(1, min(P.loose_chase, len(ranked)))
            chasers = ranked[:nchase]
            chaser_ids = set(c['id'] for c in chasers)
            for f in field:
                if f['id'] in chaser_ids:
                    ipt = intercept_point(f, path) if path else (b['x'], b['y'])
                    if ipt is None:
                        ipt = (b['x'], b['y'])
                    ipt = safe_target(my_team, ipt[0], ipt[1], boxes, 0.7)
                    out[f['index']] = {'dir': go_to_dir(w, f, ipt, my_team, boxes),
                                       'aim': None, 'kick': False}
                else:
                    # cover: between ball and our goal
                    ogx = own_goal_x(my_team)
                    px = ogx + (b['x'] - ogx) * 0.40
                    py = 13.0 + (b['y'] - 13.0) * 0.40
                    px, py = safe_target(my_team, px, py, boxes, BOX_MARGIN)
                    out[f['index']] = {'dir': go_to_dir(w, f, (px, py), my_team, boxes),
                                       'aim': None, 'kick': False}
        else:
            # opponent carries
            ranked = sorted(field, key=dist_ball)
            pressers = ranked[:max(1, min(P.press_count, len(ranked) - 1))]
            pids = set(p['id'] for p in pressers)
            ogx = own_goal_x(my_team)
            for f in field:
                if f['id'] in pids:
                    # attack the ball from the goal side
                    vx, vy = ogx - b['x'], 13.0 - b['y']
                    l = math.hypot(vx, vy) or 1.0
                    tx, ty = b['x'] + vx / l * 0.30, b['y'] + vy / l * 0.30
                    tx, ty = safe_target(my_team, tx, ty, boxes, 0.7)
                    out[f['index']] = {'dir': go_to_dir(w, f, (tx, ty), my_team, boxes),
                                       'aim': None, 'kick': False}
                else:
                    px = ogx + (b['x'] - ogx) * 0.45
                    py = 13.0 + (b['y'] - 13.0) * 0.45
                    px, py = safe_target(my_team, px, py, boxes, BOX_MARGIN)
                    out[f['index']] = {'dir': go_to_dir(w, f, (px, py), my_team, boxes),
                                       'aim': None, 'kick': False}

    return out


# ---------------------------------------------------------------- build / main
def build_world(obs):
    w = World(obs['map']['tiles'])
    raw = obs['units']
    for u in raw:
        w.units.append({
            'id': u['id'], 'team': u['team'], 'index': u['index'],
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
    return w, obs['map']['penaltyBoxes']


def neutral_window(n):
    return [[{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)] for _ in range(20)]


DEBUG = os.environ.get('AGENT_DEBUG') == '1'


def compute_window(obs):
    n = int(obs.get('teamSize', 3))
    my_team = int(obs.get('yourTeam', 0))
    if obs.get('status') != 'playing':
        return neutral_window(n)
    try:
        w, boxes = build_world(obs)
    except Exception:
        return neutral_window(n)
    frames = []
    goal_hit = False
    for fi in range(20):
        if goal_hit:
            frames.append([{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)])
            continue
        try:
            our = decide_frame(w, my_team, n, boxes, allow_shot=(fi == 0))
        except Exception as e:
            if DEBUG:
                sys.stderr.write('decide error f%d: %r\n' % (fi, e))
            our = [{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)]
        for u in w.units:
            if u['team'] == my_team:
                u['held'] = our[u['index']]
            else:
                u['held'] = {'dir': 'N', 'aim': None, 'kick': False}
        step(w, boxes)
        if w.goal_scored is not None:
            goal_hit = True
        frames.append(our)
    # sanitize: aim must be 0..359 degrees, dir a legal name, kick a bool
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
