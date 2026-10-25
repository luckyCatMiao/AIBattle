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

import sys, os, json, math

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
