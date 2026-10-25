"""Brain v2: observation-anchored planner.

Design principles (derived from the public engine):
  * Decisions are anchored to the observed state at the window boundary.
    We never let simulated opponent-induced events (fouls/possession changes)
    rewrite our own units' targets.
  * Kicks are scripted at frame k with a precise numeric angle; the shooter's
    own position at frame k is simulated exactly (our own movement is
    deterministic; only opponents are uncertain).
  * Shots are evaluated on the real ball physics with static opponent
    positions at release + a conservative reaction allowance for the keeper.
  * Carrying units face away from the nearest opponent (ball shielding).
  * Targets never approach the opponent penalty box below BOX_MARGIN.
"""
import math, time, os, sys
import soccer

OCT = [('R', 0.0), ('DR', 45.0), ('D', 90.0), ('DL', 135.0),
       ('L', 180.0), ('UL', 225.0), ('U', 270.0), ('UR', 315.0)]
DIR_VEC = soccer.DIRS
BOX_MARGIN = 0.62
HUG_DGO = float(os.environ.get('V2_HUG_DGO', '999'))
SHOT_REACT = float(os.environ.get('PLAN_REACT', '0.42'))
MAX_SHOT_D = float(os.environ.get('PLAN_MAXD', '25'))
ONETOUCH = int(os.environ.get('PLAN_ONETOUCH', '1'))
ONETOUCH_MARGIN = float(os.environ.get('PLAN_OTM', '0.10'))

def ang_of(dx, dy):
    return math.degrees(math.atan2(dy, dx))

def normang(a):
    return a % 360.0

def oct_name(deg):
    best, bd = 'N', 9.0
    for name, a in OCT:
        d = abs(math.atan2(math.sin(math.radians(deg - a)), math.cos(math.radians(deg - a))))
        if d < bd:
            bd, best = d, name
    return best

def box_dist(box, x, y):
    dx = max(box['x1'] - x, 0.0, x - box['x2'])
    dy = max(box['y1'] - y, 0.0, y - box['y2'])
    return math.hypot(dx, dy)

def clamp(v, a, b):
    return a if v < a else (b if v > b else v)

class Action:
    __slots__ = ('kind', 'target', 'k', 'aim', 'move_target', 'post_target', 'still',
                 'hold_from')
    def __init__(self, kind='move', target=None, k=0, aim=None, move_target=None,
                 post_target=None, still=False, hold_from=None):
        self.kind = kind
        self.target = target
        self.k = k
        self.aim = aim
        self.move_target = move_target
        self.post_target = post_target
        self.still = still
        self.hold_from = k if (still and hold_from is None) else hold_from

class Brain2:
    def __init__(self, team, debug=False):
        self.team = team
        self.opp = 1 - team
        self.s = 1 if team == 0 else -1
        self.debug = debug
        self.metrics = {'shots': 0, 'passes': 0, 'shot_margin': []}
        self.prev_units = {}
        self.prev_frame = None

    # ------------------------------------------------------------------ setup
    def setup(self, w):
        self.W = w.W; self.H = w.H
        self.rules = w.rules
        self.pen = {int(k): v for k, v in w.pen.items()}
        self.box_own = self.pen[self.team]
        self.box_opp = self.pen[self.opp]
        self.gx_att = (self.W - 1.0) if self.s > 0 else 1.0
        self.gx_def = 1.0 if self.s > 0 else (self.W - 1.0)
        self.n = w.teamSize
        self.move_speed = self.rules['moveSpeed']
        self.drib_speed = self.move_speed * self.rules['dribbleSpeedFactor']
        self.cr = self.rules['controlRadius']
        self.kr = self.rules['keeperRadius']
        self.kms = self.rules['keeperMinSpeed']
        self.cl_frames = int(round(self.rules['controlLock'] * self.rules['hz']))
        self.kp = self.rules['kickPower']
        self.br = self.rules['ballRadius']
        self.ur = self.rules['unitRadius']
        self.off = self.ur + self.br + 0.03
        self.fric = self.rules['ballFriction']
        self.refl = self.rules['wallRestitution']
        self.dt = 1.0 / self.rules['hz']

    def own(self, w):
        return [u for u in w.units if u['team'] == self.team]

    def opps(self, w):
        return [u for u in w.units if u['team'] == self.opp]

    def nearest_opp(self, w, x, y, pred=None):
        best, bd = None, 1e18
        for o in self.opps(w):
            if pred is not None and not pred(o):
                continue
            d = math.hypot(o['x'] - x, o['y'] - y)
            if d < bd:
                bd, best = d, o
        return best, bd

    def update_vel(self, w):
        """Estimate opponent velocities from consecutive observations (1 Hz)."""
        hz = float(self.rules['hz'])
        cf = int(w.frame)
        if self.prev_frame is not None and cf > self.prev_frame:
            dt = (cf - self.prev_frame) / hz
            for u in w.units:
                p = self.prev_units.get(u['id'])
                vx = vy = 0.0
                if p is not None and dt > 1e-6:
                    vx = (u['x'] - p[0]) / dt
                    vy = (u['y'] - p[1]) / dt
                    sp = math.hypot(vx, vy)
                    # teleports (kickoff/foul) look like > max speed: discard
                    if sp > self.rules['moveSpeed'] * 1.15:
                        vx = vy = 0.0
                    elif sp > 1e-9:
                        u['vx_true'], u['vy_true'] = vx, vy
                        vx, vy = vx / sp, vy / sp   # unit direction only
                u['vx_est'] = vx
                u['vy_est'] = vy
        else:
            for u in w.units:
                u['vx_est'] = 0.0
                u['vy_est'] = 0.0
        self.prev_units = {u['id']: (u['x'], u['y']) for u in w.units}
        self.prev_frame = cf

    def opp_pos_at(self, o, t, damp=0.75):
        """Predicted opponent centre at frame t (0-indexed within the window)."""
        vx = o.get('vx_true', 0.0); vy = o.get('vy_true', 0.0)
        sp = math.hypot(vx, vy)
        if sp > 1e-9:
            if sp > self.move_speed:
                vx *= self.move_speed / sp; vy *= self.move_speed / sp
            mv = min(t, 20) * self.dt * damp
            return (o['x'] + vx * mv, o['y'] + vy * mv)
        return (o['x'], o['y'])

    def hug_limit(self):
        """Distance-to-goal gate for body pressure.  n=5 (four fielders a
        side) gets overrun by a pure hug; press further out there."""
        return 16.0 if self.n == 5 else HUG_DGO

    def keep_out(self, p, m=0.85):
        """Nearest point at least m outside the opponent penalty box."""
        x, y = p
        bx = self.box_opp
        if box_dist(bx, x, y) >= m:
            return (x, y)
        cands = [(bx['x1'] - m, y), (bx['x2'] + m, y),
                 (x, bx['y1'] - m), (x, bx['y2'] + m)]
        best = min(cands, key=lambda c: math.hypot(c[0] - x, c[1] - y))
        return (clamp(best[0], 0.7, self.W - 0.7), clamp(best[1], 0.7, self.H - 0.7))

    # ------------------------------------------------------------- movement
    def move_dir(self, w, pos, tx, ty, box=None, margin=BOX_MARGIN, speed=None, stop=0.10):
        """8-dir step toward (tx,ty); never step closer to `box` inside margin."""
        d0 = box_dist(box, pos['x'], pos['y']) if box is not None else 1e9
        sp = (speed if speed is not None else self.move_speed) * self.dt
        if math.hypot(tx - pos['x'], ty - pos['y']) <= stop:
            return 'N'
        best, bd = 'N', 1e18
        for name, (vx, vy) in DIR_VEC.items():
            if name == 'N':
                continue
            tmp = {'x': pos['x'], 'y': pos['y']}
            w.move_unit(tmp, vx * sp, vy * sp)
            nx, ny = tmp['x'], tmp['y']
            if box is not None:
                nd = box_dist(box, nx, ny)
                if nd < margin and nd < d0 - 1e-9:
                    continue
            d = math.hypot(tx - nx, ty - ny)
            if d < bd:
                bd, best = d, name
        return best

    def project(self, w, u, target, carrying, k=20, box=None, margin=BOX_MARGIN, stop=0.10):
        """Positions/dirs of unit u for k frames moving toward target (own-only)."""
        pos = {'x': u['x'], 'y': u['y']}
        sp = self.drib_speed if carrying else self.move_speed
        dirs = []
        for f in range(k):
            d = self.move_dir(w, pos, target[0], target[1], box=box, margin=margin,
                              speed=sp, stop=stop)
            dirs.append(d)
            if d != 'N':
                vx, vy = DIR_VEC[d]
                tmp = {'x': pos['x'], 'y': pos['y']}
                w.move_unit(tmp, vx * sp * self.dt, vy * sp * self.dt)
                pos['x'], pos['y'] = tmp['x'], tmp['y']
        return pos, dirs

    # ------------------------------------------------------------- shielding
    def shield_aim(self, w, u):
        """Face away from the nearest opponent so the held ball is on the far side."""
        o, d = self.nearest_opp(w, u['x'], u['y'])
        if o is None or d < 1e-6:
            return None
        return ang_of(u['x'] - o['x'], u['y'] - o['y'])

    # ------------------------------------------------------------- shot model
    def ball_flight(self, w, x, y, tx, ty, maxf=90, track_opps=True):
        """Simulate a kick aimed at (tx,ty). Returns dict with path and outcome.

        path[t] = (bx,by,speed) after frame t+1.
        Opponents are static at their observed positions (the kick is released
        now); the caller adds reaction allowances.
        """
        ang = math.atan2(ty - y, tx - x)
        fx, fy = math.cos(ang), math.sin(ang)
        b = {'x': x + fx * self.off, 'y': y + fy * self.off, 'vx': fx * self.kp, 'vy': fy * self.kp}
        path = []
        goal_t = None
        for t in range(maxf):
            hit = False
            for _ in range(4):
                b['x'] += b['vx'] * self.dt / 4
                b['y'] += b['vy'] * self.dt / 4
                if w.in_goal_mouth(b['x'], b['y']):
                    if ((self.s > 0 and b['x'] >= self.W - 1.0) or
                            (self.s < 0 and b['x'] <= 1.0)):
                        goal_t = t; hit = True; break
                    if ((self.s > 0 and b['x'] <= 1.0) or
                            (self.s < 0 and b['x'] >= self.W - 1.0)):
                        goal_t = -t - 1; hit = True; break
                if w.circle_hits_wall(b['x'], b['y'], self.br):
                    px = b['x'] - b['vx'] * self.dt / 4
                    py = b['y'] - b['vy'] * self.dt / 4
                    if w.circle_hits_wall(b['x'], py, self.br):
                        b['x'] = px; b['vx'] = -b['vx'] * self.refl
                    if w.circle_hits_wall(px, b['y'], self.br):
                        b['y'] = py; b['vy'] = -b['vy'] * self.refl
                    if w.circle_hits_wall(b['x'], b['y'], self.br):
                        b['x'] = px; b['y'] = py
                        b['vx'] = -b['vx'] * self.refl; b['vy'] = -b['vy'] * self.refl
            path.append((b['x'], b['y'], math.hypot(b['vx'], b['vy'])))
            if hit:
                break
            b['vx'] *= self.fric; b['vy'] *= self.fric
            if math.hypot(b['vx'], b['vy']) < 0.02:
                b['vx'] = b['vy'] = 0.0
                break
        return path, goal_t

    def eval_shot(self, w, x, y, ty, react=None, early_extra=0.0, t_offset=0):
        """Score a shot from (x,y) aimed at goal-line y=ty.

        Opponents are extrapolated with their observed velocity inside the
        blind window; after frame 20 the keeper may additionally close at a
        fraction `react` of its max speed.  Returns a clearance margin or None.
        """
        if react is None:
            react = SHOT_REACT
        path, goal_t = self.ball_flight(w, x, y, self.gx_att, ty)
        if goal_t is None or goal_t < 0:
            return None
        T = goal_t
        opps = self.opps(w)
        margin = 1e9
        for o in opps:
            is_keeper = (o['index'] == 0 and o['team'] == self.opp)
            ox0, oy0 = o['x'], o['y']
            for t, (bx, by, sp) in enumerate(path):
                ox, oy = self.opp_pos_at(o, t + t_offset)
                rad = self.cr
                if (is_keeper and sp >= self.kms and w.in_pen(o['team'], bx, by)):
                    rad = self.kr
                d = math.hypot(bx - ox, by - oy)
                extra = 0.0
                if t > 20:
                    if is_keeper:
                        extra = self.move_speed * ((t - 20) / 20.0) * react
                    else:
                        extra = self.move_speed * ((t - 20) / 20.0) * react * 0.8
                elif early_extra > 0:
                    extra = self.move_speed * (t / 20.0) * early_extra
                m = d - rad - extra
                if m < margin:
                    margin = m
                    if margin < -0.03:
                        return None
        return margin

    SHOT_YS = (10.85, 11.25, 11.65, 12.05, 12.45, 12.85, 13.25, 13.65, 14.05, 14.45, 14.85, 15.15)

    def pick_shot(self, w, x, y, min_margin=0.06, t_offset=0):
        """Choose the best goal-line target from (x,y) with a static-opponent model."""
        gd = math.hypot(self.gx_att - x, 13.0 - y)
        if gd > MAX_SHOT_D:
            return None, None
        best = None
        for ty in self.SHOT_YS:
            m = self.eval_shot(w, x, y, ty, t_offset=t_offset)
            if m is None or m < min_margin:
                continue
            pen = 0.0
            if abs(ty - 13.0) > 2.0:
                pen += 0.0   # corners are good
            sc = m - abs(ty - 13.0) * 0.004
            if best is None or sc > best[0]:
                best = (sc, ty, m)
        if best is None:
            return None, None
        return best[1], best[2]

    # ------------------------------------------------------------- approach map
    def approach_points(self, w, u):
        """Candidate dribble destinations near the opponent box / wings."""
        bx = self.box_opp
        pts = []
        # central box-edge band
        edge = bx['x1'] - self.s * 0.85 if self.s > 0 else bx['x2'] - self.s * 0.85
        # edge x for either direction: just outside the box on the attacking side
        if self.s > 0:
            edge = bx['x1'] - 0.85
        else:
            edge = bx['x2'] + 0.85
        for yy in (8.0, 10.0, 11.5, 13.0, 14.5, 16.0, 18.0):
            pts.append((edge, yy))
        for xx in (edge - self.s * 2.0, edge - self.s * 4.5, edge - self.s * 7.0):
            pts.append((xx, 4.6))
            pts.append((xx, 21.4))
        # deeper wing spots (beside the box)
        for xx in (edge + self.s * 2.5, edge + self.s * 4.5):
            pts.append((xx, 4.6))
            pts.append((xx, 21.4))
        out = []
        for (x, y) in pts:
            x = clamp(x, 1.2, self.W - 1.2)
            y = clamp(y, 1.2, self.H - 1.2)
            if box_dist(self.box_opp, x, y) < BOX_MARGIN:
                continue
            out.append((x, y))
        return out

    def dribble_target(self, w, u):
        best, bs = None, -1e9
        near, nd = self.nearest_opp(w, u['x'], u['y'])
        for (x, y) in self.approach_points(w, u):
            d = math.hypot(x - u['x'], y - u['y'])
            if d > 34:
                continue
            # travel time penalty
            tt = d / self.drib_speed
            sc = -tt * 0.55
            # danger from nearest opponent to the destination
            do = math.hypot(x - near['x'], y - near['y']) if near else 99
            sc += min(do, 6.0) * 0.30
            # shot quality from the candidate point
            ty, m = self.pick_shot(w, x, y)
            if m is not None:
                sc += 2.2 + min(m, 1.2) * 1.2
            # progression: prefer deeper
            prog = (x - u['x']) * self.s
            sc += prog * 0.03
            if sc > bs:
                bs, best = sc, (x, y)
        if best is None:
            return (self.gx_att - self.s * 8.0, 13.0)
        return best

    # ------------------------------------------------------------- keeper
    def keeper_target(self, w, u):
        b = w.ball
        box = self.box_own
        # predicted free-ball crossing into our box
        sp = math.hypot(b['vx'], b['vy'])
        if b['owner'] is None and sp >= self.kms:
            kx = self.gx_def + self.s * 2.0
            # find crossing frame using ball_flight-like free motion
            path = self.free_ball_path(w, 60)
            for t, p in enumerate(path):
                if (p['x'] - self.gx_def) * self.s <= 2.0:
                    ty = clamp(p['y'], box['y1'] + 0.7, box['y2'] - 0.7)
                    return (kx, ty)
            # no crossing: stay on line
        # loose ball inside/near our box: go get it if we can win the race
        if b['owner'] is None:
            inb = box_dist(box, b['x'], b['y']) <= 0.1
            d = math.hypot(b['x'] - u['x'], b['y'] - u['y'])
            o, od = self.nearest_opp(w, b['x'], b['y'])
            if (inb or (b['x'] - self.gx_def) * self.s < 12.0):
                if d < 7.0 and (o is None or d <= od + 0.4):
                    return (clamp(b['x'], box['x1'] + 0.5, box['x2'] - 0.5),
                            clamp(b['y'], box['y1'] + 0.5, box['y2'] - 0.5))
        # line position between ball and goal centre
        kx = self.gx_def + self.s * 2.5
        den = (b['x'] - self.gx_def)
        t = (kx - self.gx_def) / den if abs(den) > 0.3 else 0.0
        t = clamp(t, 0.0, 1.0)
        ty = 13.0 + t * (b['y'] - 13.0)
        ty = clamp(ty, box['y1'] + 0.8, box['y2'] - 0.8)
        # if opponent owns the ball and is deep in our half, cheat to shot line
        if b['owner'] is not None and not b['owner'].startswith('t%d' % self.team):
            ty = clamp(13.0 + 0.42 * (b['y'] - 13.0), box['y1'] + 0.8, box['y2'] - 0.8)
        return (kx, ty)

    def free_ball_path(self, w, n):
        b = {'x': w.ball['x'], 'y': w.ball['y'], 'vx': w.ball['vx'], 'vy': w.ball['vy']}
        out = []
        for _ in range(n):
            if not (b['vx'] or b['vy']):
                out.append(dict(b)); continue
            for _ in range(4):
                b['x'] += b['vx'] * self.dt / 4
                b['y'] += b['vy'] * self.dt / 4
                if w.in_goal_mouth(b['x'], b['y']) and (b['x'] <= 1.0 or b['x'] >= self.W - 1.0):
                    out.append(dict(b)); return out
                if w.circle_hits_wall(b['x'], b['y'], self.br):
                    px = b['x'] - b['vx'] * self.dt / 4
                    py = b['y'] - b['vy'] * self.dt / 4
                    if w.circle_hits_wall(b['x'], py, self.br):
                        b['x'] = px; b['vx'] = -b['vx'] * self.refl
                    if w.circle_hits_wall(px, b['y'], self.br):
                        b['y'] = py; b['vy'] = -b['vy'] * self.refl
                    if w.circle_hits_wall(b['x'], b['y'], self.br):
                        b['x'] = px; b['y'] = py
                        b['vx'] = -b['vx'] * self.refl; b['vy'] = -b['vy'] * self.refl
            b['vx'] *= self.fric; b['vy'] *= self.fric
            if math.hypot(b['vx'], b['vy']) < 0.02:
                b['vx'] = b['vy'] = 0.0
            out.append(dict(b))
        return out

    def intercept_point(self, w, u, path, speed=None, maxd=None):
        """First path index the unit can reach (control radius included)."""
        speed = speed or self.move_speed
        step = speed * self.dt
        for t, p in enumerate(path):
            d = math.hypot(p['x'] - u['x'], p['y'] - u['y'])
            if d <= step * (t + 1) + self.cr:
                return t, p
        if not path:
            return 0, {'x': w.ball['x'], 'y': w.ball['y']}
        return len(path) - 1, path[-1]

    # ------------------------------------------------------------- kick search
    def plan_kick(self, w, u, carrying_target):
        """Try to script a shot or pass for ball owner u.

        Returns (k, aim_deg, kind) or None.  Position at frame k is projected
        exactly for our own movement.
        """
        b = w.ball
        # The engine ignores a kick while kickCd/controlLock is positive; the
        # decrement happens on the frame before the check, so frame k is legal
        # iff k >= gate - 1.
        gate = max(int(u.get('kickCd') or 0), int(u.get('controlLock') or 0))
        # project up to k frames toward the dribble target
        best = None
        for k in range(0, 5):
            if k < gate - 1:
                continue
            pos, _ = self.project(w, u, carrying_target, True, k=k, box=self.box_opp)
            x, y = pos['x'], pos['y']
            if box_dist(self.box_opp, x, y) < 0.45:
                break
            ty, m = self.pick_shot(w, x, y)
            if m is not None:
                gd = math.hypot(self.gx_att - x, 13.0 - y)
                sc = m * 2.0 - k * 0.40 - gd * 0.01
                if best is None or sc > best[0]:
                    best = (sc, k, ang_of(self.gx_att - x, ty - y), 'shot', ty, m)
        # passes (only when no good shot)
        if best is None or best[0] < 0.60:
            p = self.pick_pass_script(w, u, carrying_target)
            if p is not None and (best is None or p[0] > best[0]):
                best = p
        if best is None:
            return None
        return best

    def pick_clear(self, w, u, carrying_target):
        """Last-resort clearance toward a lane-clear forward/wing point."""
        near, nd = self.nearest_opp(w, u['x'], u['y'])
        pressured = nd < 3.5
        if not pressured and w.ball['x'] != u['x']:
            # not urgent: only clear if we are stuck behind our own half
            if (u['x'] - self.gx_def) * self.s > 12.0:
                return None
        best = None
        cands = []
        for dd in (12.0, 16.0, 20.0, 23.0):
            for yy in (4.5, 8.0, 13.0, 18.0, 21.5):
                cands.append((u['x'] + self.s * dd, yy))
        for (x, y) in cands:
            x = clamp(x, 1.5, self.W - 1.5); y = clamp(y, 1.5, self.H - 1.5)
            if box_dist(self.box_opp, x, y) < 0.4:
                continue
            lane = self.lane_min(w, u['x'], u['y'], x, y)
            prog = (x - u['x']) * self.s
            sc = min(lane, 6.0) * 0.5 + prog * 0.04
            # prefer landing near a mate (second-ball retention)
            mates = [m for m in self.own(w) if m['id'] != u['id']]
            if mates:
                md = min(math.hypot(x - m['x'], y - m['y']) for m in mates)
                sc += max(0.0, 8.0 - md) * 0.12
            if sc > (best[0] if best else -1e9):
                best = (sc, ang_of(x - u['x'], y - u['y']))
        if best is None:
            return None
        return (best[0] + 0.4, 0, best[1], 'clear', None, 0.0)

    def pick_pass_script(self, w, u, carrying_target):
        b = w.ball
        gate = max(int(u.get('kickCd') or 0), int(u.get('controlLock') or 0))
        best = None
        mates = [m for m in self.own(w) if m['id'] != u['id']]
        for k in (0, 1, 2, 3):
            if k < gate - 1:
                continue
            pos, _ = self.project(w, u, carrying_target, True, k=k, box=self.box_opp)
            x, y = pos['x'], pos['y']
            for mate in mates:
                # receiver's projected position at arrival: iterate distance
                dcur = math.hypot(mate['x'] - x, mate['y'] - y)
                if dcur < 2.0 or dcur > 24:
                    continue
                t_arr = self.ball_travel_frames(dcur)
                tgt, _ = self.project(w, mate, mate.get('_support', (mate['x'], mate['y'])),
                                      False, k=min(20, max(0, t_arr - k)), box=self.box_opp)
                # aim at a point beyond the mate along its motion so the ball meets it
                ax = mate['x'] + (tgt['x'] - mate['x']) * min(1.0, (t_arr - k) / 20.0)
                ay = mate['y'] + (tgt['y'] - mate['y']) * min(1.0, (t_arr - k) / 20.0)
                # lane check
                lane = self.lane_min(w, x, y, ax, ay)
                if lane < self.cr + 0.35:
                    continue
                prog = (mate['x'] - u['x']) * self.s
                openness = self.nearest_opp(w, mate['x'], mate['y'])[1]
                sc = prog * 0.05 + min(openness, 8) * 0.10 + lane * 0.10 - dcur * 0.02 - k * 0.05
                # a pass to the keeper is a safe reset
                if mate['index'] == 0:
                    sc = sc * 0.8 + 0.25
                if sc > 0.35 and (best is None or sc > best[0]):
                    best = (sc, k, ang_of(ax - x, ay - y), 'pass', None, lane,
                            mate['id'], ax, ay)
        return best

    def ball_travel_frames(self, d):
        """Frames for a free kick ball to travel `d` grid units (before stopping)."""
        lo, hi = 1, 90
        def dist(n):
            return self.kp * self.dt * (1 - self.fric ** n) / (1 - self.fric)
        if dist(90) < d:
            return 90
        for _ in range(30):
            mid = (lo + hi) // 2
            if dist(mid) < d:
                lo = mid
            else:
                hi = mid
        return hi

    def lane_min(self, w, x0, y0, x1, y1):
        best = 1e9
        dx, dy = x1 - x0, y1 - y0
        l2 = dx * dx + dy * dy or 1e-12
        for o in self.opps(w):
            t = ((o['x'] - x0) * dx + (o['y'] - y0) * dy) / l2
            t = clamp(t, 0.0, 1.0)
            d = math.hypot(o['x'] - (x0 + t * dx), o['y'] - (y0 + t * dy))
            if d < best:
                best = d
        return best

    # ------------------------------------------------------------- unit policies
    def decide_owner(self, w, u):
        b = w.ball
        tgt = self.dribble_target(w, u)
        # dribble-target obstacle avoidance is handled by move_dir
        kick = self.plan_kick(w, u, tgt)
        if kick is None:
            kick = self.pick_clear(w, u, tgt)
        if kick is not None:
            sc, k, aim, kind, ty, m = kick[:6]
            if kind == 'pass' and len(kick) > 6:
                self._pass_info = (u['id'], k, aim, kick[6])
            self.metrics['shots' if kind == 'shot' else 'passes'] += 1
            return Action('kick', target=tgt, k=k, aim=aim, move_target=tgt,
                          post_target=self.attack_follow_target(w, u))
        return Action('move', target=tgt, move_target=tgt)

    def attack_follow_target(self, w, u):
        return self.dribble_target(w, u)

    def decide_field(self, w, u):
        b = w.ball
        if b['owner'] == u['id']:
            return self.decide_owner(w, u)
        ours = b['owner'] is not None and b['owner'].startswith('t%d' % self.team)
        if ours:
            owner = w.unit_by_id(b['owner'])
            # support: go to a passing outlet / shooting pocket
            tgt = self.support_target(w, u, owner)
            return Action('move', target=tgt, move_target=tgt)
        if b['owner'] is not None:
            # pressing / covering
            tgt = self.defend_target(w, u, is_keeper=False)
            return Action('move', target=tgt, move_target=tgt)
        # loose ball
        tgt = self.loose_target(w, u)
        return Action('move', target=tgt, move_target=tgt)

    def support_target(self, w, u, owner):
        b = w.ball
        bx, by = b['x'], b['y']
        if owner is not None and owner['index'] == 0 and self.n > 1:
            # keeper has it: come to a spot with a clean outlet lane, in range
            cands = []
            for dd in (8.0, 12.0, 16.0, 20.0):
                for yy in (4.6, 8.0, 13.0, 18.0, 21.4):
                    cands.append((bx + self.s * dd, yy))
        else:
            if self.s > 0:
                edge = self.box_opp['x1'] - 0.9
            else:
                edge = self.box_opp['x2'] + 0.9
            cands = []
            for dy in (-8.0, -4.0, 3.0, 8.0, 12.0):
                cands.append((bx + self.s * 7.0, by + dy))
            cands += [(edge, 4.7), (edge, 21.3), (edge, 9.0), (edge, 17.0),
                      (edge, 13.0), (edge - self.s * 4.0, 6.0),
                      (edge - self.s * 4.0, 20.0)]
        best, bs = None, -1e9
        for (x, y) in cands:
            x = clamp(x, 1.2, self.W - 1.2)
            y = clamp(y, 1.2, self.H - 1.2)
            if box_dist(self.box_opp, x, y) < BOX_MARGIN:
                continue
            dball = math.hypot(x - bx, y - by)
            if dball > 24.0 or dball < 2.5:
                continue
            d = math.hypot(x - u['x'], y - u['y'])
            lane = self.lane_min(w, bx, by, x, y)
            openness = self.nearest_opp(w, x, y)[1]
            prog = (x - bx) * self.s
            sc = (0.0 if lane >= self.cr + 0.55 else -6.0)
            sc += min(lane, 5.0) * 0.45
            sc += min(openness, 7.0) * 0.16
            sc += prog * 0.055
            sc -= d * 0.07
            if sc > bs:
                bs, best = sc, (x, y)
        if best is None:
            return (clamp(bx + self.s * 9.0, 2.0, self.W - 2.0),
                    clamp(by, 2.0, self.H - 2.0))
        return best

    def defend_target(self, w, u, is_keeper=False):
        b = w.ball
        own_goal = (self.gx_def, 13.0)
        # Cannot challenge inside the opponent's own box (entering = foul).
        # Hold the outlet lane instead of chasing into the box.
        if (b['owner'] is not None and b['owner'].startswith('t%d' % self.opp)
                and box_dist(self.box_opp, b['x'], b['y']) < 0.2):
            px = b['x'] + (self.gx_def - b['x']) * 0.18
            py = b['y'] + (13.0 - b['y']) * 0.18
            return self.keep_out((px, py), 1.0)
        # nearest own field unit to the ball presses
        fielders = [x for x in self.own(w) if x['index'] != 0 or self.n == 1]
        fielders.sort(key=lambda x: math.hypot(x['x'] - b['x'], x['y'] - b['y']))
        if fielders and fielders[0]['id'] == u['id']:
            if b['owner'] is not None:
                # body-to-body goal-side pressure on the carrier: any shot
                # toward our goal is trapped at release (see decide_solo).
                # Only in shooting range; further out we press to win it back.
                o = w.unit_by_id(b['owner'])
                dgo = (math.hypot(o['x'] - own_goal[0], o['y'] - own_goal[1])
                       if o is not None else 99.0)
                if o is not None and dgo < self.hug_limit():
                    vx = o.get('vx_true', 0.0); vy = o.get('vy_true', 0.0)
                    px = o['x'] + vx * 0.6
                    py = o['y'] + vy * 0.6
                    gdx, gdy = own_goal[0] - px, own_goal[1] - py
                    gl = math.hypot(gdx, gdy) or 1.0
                    return self.keep_out((px + gdx / gl * 0.75,
                                          py + gdy / gl * 0.75), 0.9)
            # loose ball: approach from the goal side
            vx, vy = own_goal[0] - b['x'], own_goal[1] - b['y']
            l = math.hypot(vx, vy) or 1
            gsx, gsy = b['x'] + vx / l * 0.55, b['y'] + vy / l * 0.55
            dot = (u['x'] - b['x']) * vx + (u['y'] - b['y']) * vy
            if dot > 0:
                return (b['x'], b['y'])
            return (gsx, gsy)
        # cover the lane ball -> goal
        frac = 0.20 + 0.10 * min(u['index'], 4)
        px = b['x'] + (self.gx_def - b['x']) * frac
        py = b['y'] + (13.0 - b['y']) * frac + ((u['index'] % 3) - 1) * 1.6
        return (clamp(px, 1.0, self.W - 1.0), clamp(py, 1.0, self.H - 1.0))

    def loose_target(self, w, u):
        b = w.ball
        path = self.free_ball_path(w, 40)
        t, p = self.intercept_point(w, u, path)
        # race with opponents
        o, od = self.nearest_opp(w, p['x'], p['y'])
        du = math.hypot(p['x'] - u['x'], p['y'] - u['y'])
        if od > du - 0.3:
            if box_dist(self.box_opp, p['x'], p['y']) < 0.35:
                return self.keep_out((p['x'], p['y']), 0.75)
            return (p['x'], p['y'])
        # can't win: cover
        return self.defend_target(w, u)

    def decide_keeper(self, w, u):
        b = w.ball
        if b['owner'] == u['id']:
            tgt = self.keeper_with_ball_target(w, u)
            kick = self.plan_kick(w, u, tgt)
            if kick is None:
                kick = self.pick_clear(w, u, tgt)
            if kick is not None:
                sc, k, aim, kind, ty, m = kick[:6]
                if kind == 'pass' and len(kick) > 6:
                    self._pass_info = (u['id'], k, aim, kick[6])
                self.metrics['shots' if kind == 'shot' else 'passes'] += 1
                return Action('kick', target=tgt, k=k, aim=aim, move_target=tgt,
                              post_target=tgt)
            return Action('move', target=tgt, move_target=tgt)
        tgt = self.keeper_target(w, u)
        return Action('move', target=tgt, move_target=tgt)

    def keeper_with_ball_target(self, w, u):
        # remain inside own box: outlet position near the top of the box
        bx = self.box_own
        x = bx['x1'] + 2.8 if self.s > 0 else bx['x2'] - 2.8
        y = clamp(u['y'], bx['y1'] + 1.5, bx['y2'] - 1.5)
        return (x, y)

    def decide_solo(self, w, u):
        b = w.ball
        if b['owner'] == u['id']:
            return self.decide_owner(w, u)
        sp = math.hypot(b['vx'], b['vy'])
        # fast incoming shot: cover predicted crossing
        if b['owner'] is None and sp >= self.kms:
            path = self.free_ball_path(w, 80)
            for t, p in enumerate(path):
                if (p['x'] - self.gx_def) * self.s <= 3.0:
                    ty = clamp(p['y'], self.box_own['y1'] + 0.6, self.box_own['y2'] - 0.6)
                    kx = self.gx_def + self.s * 2.0
                    return Action('move', target=(kx, ty), move_target=(kx, ty))
        if b['owner'] is not None and not b['owner'].startswith('t%d' % self.team):
            # Body-to-body goal-side pressure.  A carrier can only shoot on our
            # goal by facing us; the released ball is then at
            # carrier+0.59*aim, moves 0.55 in the release frame and is free, so
            # any unit within 0.82 of it traps it regardless of speed.  Keeping
            # ~0.75 goal-side of the carrier makes every shot toward our goal
            # land inside that trap radius.  Shielding (facing away) means the
            # ball stays on the far side and cannot go goalward.
            o = w.unit_by_id(b['owner'])
            if o is not None:
                vx = o.get('vx_true', 0.0); vy = o.get('vy_true', 0.0)
                lead = 0.60
                px = o['x'] + vx * lead
                py = o['y'] + vy * lead
                gdx, gdy = self.gx_def - px, 13.0 - py
                gl = math.hypot(gdx, gdy) or 1.0
                hx = px + gdx / gl * 0.75
                hy = py + gdy / gl * 0.75
                hx, hy = self.keep_out((clamp(hx, 0.7, self.W - 0.7),
                                        clamp(hy, 0.7, self.H - 0.7)))
                return Action('move', target=(hx, hy), move_target=(hx, hy))
        # otherwise attack the ball
        tgt = self.loose_target(w, u) if b['owner'] is None else self.defend_target(w, u)
        return Action('move', target=tgt, move_target=tgt)

    # ---------------------------------------------------- one-touch on loose ball
    def _move_frames(self, w, u, target, k=21):
        """Positions at the start of frames 0..k following the action target."""
        pos = {'x': u['x'], 'y': u['y']}
        out = [(pos['x'], pos['y'])]
        sp = self.move_speed
        for _ in range(k):
            d = self.move_dir(w, pos, target[0], target[1], box=self.box_opp,
                              speed=sp, stop=0.10)
            if d != 'N':
                vx, vy = DIR_VEC[d]
                tmp = {'x': pos['x'], 'y': pos['y']}
                w.move_unit(tmp, vx * sp * self.dt, vy * sp * self.dt)
                pos['x'], pos['y'] = tmp['x'], tmp['y']
            out.append((pos['x'], pos['y']))
        return out

    def add_onetouch(self, w, actions):
        """Speculative one-touch kick for a unit that will win a LOOSE ball
        inside this 20-frame window.

        The opponent committed to its plan before seeing this window, so any
        possession won mid-window can be released again before the keeper or
        defenders re-plan.  If the prediction is wrong the kick input is
        simply ignored by the engine (the unit does not own the ball), so the
        downside is one frame of standing still.
        """
        bpath = self.free_ball_path(w, 20)
        if not bpath:
            return
        plans = {}
        for v in self.own(w):
            act = actions[v['id']]
            tgt = act.move_target or act.target or (v['x'], v['y'])
            plans[v['id']] = self._move_frames(w, v, tgt, 21)
        opps = self.opps(w)
        opos = {o['id']: [self.opp_pos_at(o, f + 1) for f in range(20)] for o in opps}
        best = None
        dbg = os.environ.get('PLAN_OTLOG2')
        dbg_reasons = []
        for u in self.own(w):
            if u['index'] == 0 and self.n > 1:
                continue
            if int(u.get('kickCd') or 0) > 0 or int(u.get('controlLock') or 0) > 0:
                continue
            pos = plans[u['id']]
            for f in range(min(19, len(bpath))):
                B = bpath[f]
                Q = pos[f + 1]
                sp = math.hypot(B['vx'], B['vy'])
                # opponent keeper save (fast ball in its own box)
                if sp >= self.kms:
                    saved = False
                    for o in opps:
                        if o['index'] != 0 or o.get('controlLock', 0) > 0 or o.get('stealLock', 0) > 0:
                            continue
                        ox, oy = opos[o['id']][f]
                        if (w.in_pen(o['team'], B['x'], B['y']) and w.in_pen(o['team'], ox, oy)
                                and math.hypot(ox - B['x'], oy - B['y']) < self.kr):
                            saved = True
                    if saved:
                        break
                cand = []
                for v in self.own(w):
                    if int(v.get('controlLock') or 0) > 0 or int(v.get('stealLock') or 0) > 0:
                        continue
                    q = plans[v['id']][f + 1]
                    d = math.hypot(q[0] - B['x'], q[1] - B['y'])
                    if d < self.cr:
                        cand.append((d, v))
                for o in opps:
                    ox, oy = opos[o['id']][f]
                    d = math.hypot(ox - B['x'], oy - B['y'])
                    if d < self.cr:
                        cand.append((d, o))
                if not cand:
                    continue
                cand.sort(key=lambda z: z[0])
                d0, win = cand[0]
                for d, v in cand:
                    if v['team'] == w.kickoffTeam and d <= d0 + 0.06:
                        win = v
                        break
                if win['id'] != u['id']:
                    dbg_reasons.append('lose@%d' % f)
                    break
                x, y = pos[f + 1]
                if (x - 22.0) * self.s <= 0.0:
                    dbg_reasons.append('ownhalf@%d' % f)
                    break
                if box_dist(self.box_opp, x, y) < 0.05:
                    dbg_reasons.append('box@%d' % f)
                    break
                k = f + 1
                if k > 19:
                    dbg_reasons.append('late@%d' % f)
                    break
                ty, m = self.pick_shot(w, x, y, t_offset=k)
                dbg_reasons.append('shot@%d k%d m%s' % (f, k, ('%.2f' % m) if m is not None else 'None'))
                if m is not None and m > ONETOUCH_MARGIN:
                    sc = m * 2.0 - f * 0.03
                    if best is None or sc > best[0]:
                        best = (sc, u['id'], k, ang_of(self.gx_att - x, ty - y), ty, m, f + 1)
                break
        if dbg:
            sys.stderr.write('OTDBG f%d n%d %s\n' % (int(w.frame), len(bpath), ','.join(dbg_reasons)))
        if best is None:
            return
        sc, uid, k, aim, ty, m, hold = best
        if os.environ.get('PLAN_OTLOG'):
            sys.stderr.write('OT f%d k%d m%.2f uid%s\n' % (int(w.frame), k, m, uid))
        old = actions[uid]
        actions[uid] = Action('kick', target=old.target, k=k, aim=aim,
                              move_target=old.move_target,
                              post_target=old.post_target or old.target, still=True,
                              hold_from=hold)

    def add_combo(self, w, actions):
        """Script a one-touch shot for the receiver of an in-window pass.

        Both sides commit to a 20-frame script at the same instant, so a pass
        released at frame k and received at frame f can be shot at f+1 while
        the keeper is still executing a movement chosen before it saw the
        pass.  Only short passes (arrival with a frame to spare) qualify.
        """
        passer_id, k, aim, mate_id = self._pass_info
        act_p = actions.get(passer_id)
        if act_p is None or act_p.kind != 'kick' or act_p.k != k:
            return
        passer = w.unit_by_id(passer_id)
        mate = w.unit_by_id(mate_id)
        if passer is None or mate is None:
            return
        # release pose: after k+1 movement steps toward the carry target
        pos, _ = self.project(w, passer, act_p.move_target, True, k=k + 1,
                              box=self.box_opp)
        bx, by = pos['x'], pos['y']
        ang = math.radians(aim)
        path, _g = self.ball_flight(w, bx, by, bx + math.cos(ang), by + math.sin(ang),
                                    maxf=40, track_opps=False)
        if not path:
            return
        plans = {}
        for v in self.own(w):
            a = actions[v['id']]
            tgt = a.move_target or a.target or (v['x'], v['y'])
            plans[v['id']] = self._move_frames(w, v, tgt, 21)
        opps = self.opps(w)
        opos = {o['id']: [self.opp_pos_at(o, f + 1) for f in range(20)] for o in opps}
        for i, (bx2, by2, sp) in enumerate(path):
            f = k + i
            if f + 1 > 19:
                break
            if sp >= self.kms:
                saved = False
                for o in opps:
                    if o['index'] != 0 or o.get('controlLock', 0) > 0 or o.get('stealLock', 0) > 0:
                        continue
                    ox, oy = opos[o['id']][f]
                    if (w.in_pen(o['team'], bx2, by2) and w.in_pen(o['team'], ox, oy)
                            and math.hypot(ox - bx2, oy - by2) < self.kr):
                        saved = True
                if saved:
                    return
            cand = []
            for v in self.own(w):
                if int(v.get('controlLock') or 0) > 0 or int(v.get('stealLock') or 0) > 0:
                    continue
                q = plans[v['id']][f + 1]
                d = math.hypot(q[0] - bx2, q[1] - by2)
                if d < self.cr:
                    cand.append((d, v))
            for o in opps:
                ox, oy = opos[o['id']][f]
                d = math.hypot(ox - bx2, oy - by2)
                if d < self.cr:
                    cand.append((d, o))
            if not cand:
                continue
            cand.sort(key=lambda z: z[0])
            d0, win = cand[0]
            for d, v in cand:
                if v['team'] == w.kickoffTeam and d <= d0 + 0.06:
                    win = v
                    break
            if win['team'] != self.team or win['id'] == passer_id:
                return
            if win['index'] == 0 and self.n > 1:
                return
            q = plans[win['id']][f + 1]
            if (q[0] - 22.0) * self.s <= 0.0 or box_dist(self.box_opp, q[0], q[1]) < 0.05:
                return
            kk = f + 1
            ty, m = self.pick_shot(w, q[0], q[1], t_offset=kk)
            if m is not None and m > ONETOUCH_MARGIN:
                old = actions[win['id']]
                actions[win['id']] = Action('kick', target=old.target, k=kk,
                                            aim=ang_of(self.gx_att - q[0], ty - q[1]),
                                            move_target=old.move_target,
                                            post_target=old.post_target or old.target,
                                            still=True, hold_from=kk)
                if os.environ.get('PLAN_OTLOG'):
                    sys.stderr.write('COMBO f%d k%d recv%d m%.2f\n'
                                     % (int(w.frame), kk, f, m))
            return

    # ------------------------------------------------------------- frame build
    def build_frames(self, w, actions):
        """Turn per-unit actions into 20 frames of legal inputs."""
        n = self.n
        frames = []
        # per-unit state: current position, dirs
        states = {}
        for u in self.own(w):
            states[u['id']] = {'pos': {'x': u['x'], 'y': u['y']}, 'kicked': False,
                               'target': None, 'dirs': []}
        ball_free = w.ball['owner'] is None
        first_touch_aim = {}
        for u in self.own(w):
            o, od = self.nearest_opp(w, u['x'], u['y'])
            if o is not None:
                first_touch_aim[u['id']] = ang_of(o['x'] - u['x'], o['y'] - u['y']) + 180.0
            else:
                first_touch_aim[u['id']] = None
        for f in range(20):
            row = []
            for i in range(n):
                u = self.unit_by_idx(w, self.team, i)
                st = states[u['id']]
                act = actions[u['id']]
                carrying = (w.ball['owner'] == u['id'])
                # Determine desired movement target
                if act.kind == 'kick' and f == act.k:
                    # kick this frame: no need to move much
                    tgt = act.move_target or act.target or (st['pos']['x'], st['pos']['y'])
                elif act.kind == 'kick' and f > act.k:
                    tgt = act.post_target or (st['pos']['x'], st['pos']['y'])
                else:
                    tgt = act.move_target or act.target or (st['pos']['x'], st['pos']['y'])
                box = None if (u['index'] == 0 and self.n > 1) else self.box_opp
                # keeper may enter own box freely; outfield avoid opponent box
                sp = self.drib_speed if carrying else self.move_speed
                holding = (act.kind == 'kick' and act.hold_from is not None
                           and act.hold_from <= f <= act.k)
                if holding:
                    d = 'N'
                else:
                    d = self.move_dir(w, st['pos'], tgt[0], tgt[1], box=self.box_opp,
                                      speed=sp, stop=0.10)
                # facing
                aim = None
                if act.kind == 'kick' and (f == act.k or holding):
                    aim = act.aim
                elif carrying:
                    aim = self.shield_aim(w, u)
                elif (ball_free and first_touch_aim.get(u['id']) is not None
                      and math.hypot(st['pos']['x'] - w.ball['x'],
                                     st['pos']['y'] - w.ball['y']) < 2.2):
                    # We may gain the ball inside this window.  Face away from
                    # the nearest opponent so the ball is placed on the far
                    # side on the first owned frame and cannot be stolen
                    # instantly (steal needs <0.5 from the ball).
                    aim = first_touch_aim[u['id']]
                inp = {'dir': d, 'aim': aim, 'kick': bool(act.kind == 'kick' and f == act.k)}
                row.append(inp)
                # advance our own projected position
                if d != 'N':
                    vx, vy = DIR_VEC[d]
                    tmp = {'x': st['pos']['x'], 'y': st['pos']['y']}
                    w.move_unit(tmp, vx * sp * self.dt, vy * sp * self.dt)
                    st['pos']['x'], st['pos']['y'] = tmp['x'], tmp['y']
                if inp['kick']:
                    st['kicked'] = True
            frames.append(row)
        return frames

    def unit_by_idx(self, w, team, idx):
        for u in w.units:
            if u['team'] == team and u['index'] == idx:
                return u
        return None

    # ------------------------------------------------------------- top level
    def plan(self, w):
        self.setup(w)
        self.update_vel(w)
        own = w.ball['owner']
        tag = None
        if own:
            tag = 'us' if own.startswith('t%d' % self.team) else 'opp'
        if tag != getattr(self, '_hold_tag', None):
            self._hold_tag = tag
            self._hold_start = w.frame
        self.opp_hold_frames = (w.frame - self._hold_start) if tag == 'opp' else 0
        self._pass_info = None
        actions = {}
        for u in self.own(w):
            # support hints for pass projection
            if u['index'] == 0 and self.n > 1:
                u['_support'] = self.keeper_target(w, u)
            elif self.n > 1:
                u['_support'] = self.support_target(w, u, w.unit_by_id(w.ball['owner']) if w.ball['owner'] else None)
            else:
                u['_support'] = (u['x'], u['y'])
        for u in self.own(w):
            if self.n == 1:
                act = self.decide_solo(w, u)
            elif u['index'] == 0:
                act = self.decide_keeper(w, u)
            else:
                act = self.decide_field(w, u)
            # clamp move targets away from the opponent box
            actions[u['id']] = act
        if ONETOUCH and w.ball['owner'] is None:
            try:
                self.add_onetouch(w, actions)
            except Exception as e:
                if os.environ.get('PLAN_OTLOG'):
                    sys.stderr.write('OTERR %r\n' % (e,))
        elif ONETOUCH and self._pass_info is not None:
            try:
                self.add_combo(w, actions)
            except Exception as e:
                if os.environ.get('PLAN_OTLOG'):
                    sys.stderr.write('CERR %r\n' % (e,))
        return self.build_frames(w, actions)

    # fallback used by agent.py when the planner raises
    def _fallback_frame(self, w):
        b = w.ball
        out = []
        for u in self.own(w):
            d = self.move_dir(w, u, b['x'], b['y'], box=self.box_opp,
                              speed=self.drib_speed if b['owner'] == u['id'] else self.move_speed)
            if b['owner'] == u['id']:
                out.append({'dir': d, 'aim': ang_of(self.gx_att - u['x'], 13.0 - u['y']), 'kick': False})
            else:
                out.append({'dir': d, 'aim': None, 'kick': False})
        return out
