"""Soccer agent brain: 1 Hz macro-action planner.

Every decision window we receive the full state once and must emit 20 physics
frames for all our units.  The brain therefore plans an open-loop 20-frame
script using an internal clone of the rules engine (soccer.py), with a simple
model of the opponent (whose 20 frames are equally blind).

Key mechanics exploited:
  * within a window nobody can react, so shots are timed for frame 1..3;
  * the opponent penalty box is lava for attackers (fouls) but safe for our
    keeper, and holding the ball inside our own box makes it unstealable;
  * a shot only travels ~25 grid before friction stops it;
  * the keeper's 1.35 auto-save only covers balls inside its own box.
"""
import math
import time
import soccer

OCT = [('R', 0.0), ('DR', 45.0), ('D', 90.0), ('DL', 135.0),
       ('L', 180.0), ('UL', 225.0), ('U', 270.0), ('UR', 315.0)]
DIR_VEC = soccer.DIRS


def ang_of(dx, dy):
    return math.degrees(math.atan2(dy, dx))


def ang_diff(a, b):
    return abs(math.atan2(math.sin(math.radians(a - b)), math.cos(math.radians(a - b))))


def oct_name(deg):
    best, bd = 'N', 9.0
    for name, a in OCT:
        d = ang_diff(deg, a)
        if d < bd:
            bd, best = d, name
    return best


def dir_to_point(w, u, tx, ty):
    return oct_name(ang_of(tx - u['x'], ty - u['y']))


def inside(box, x, y, m=0.0):
    return (box['x1'] - m) <= x <= (box['x2'] + m) and (box['y1'] - m) <= y <= (box['y2'] + m)


def box_dist(box, x, y):
    """Euclidean distance from (x,y) to the box; 0 when inside."""
    dx = max(box['x1'] - x, 0.0, x - box['x2'])
    dy = max(box['y1'] - y, 0.0, y - box['y2'])
    return math.hypot(dx, dy)


# Keep this much clearance from the opponent penalty box.  Our open-loop
# prediction drifts (possession changes alter speed), and a unit shoved or
# walking 0.1 into the box concedes a foul + 1 s stun.
BOX_MARGIN = 0.55


def clamp_outside(box, x, y, m=0.25):
    """nearest point at clearance m from the box (outside)"""
    if box_dist(box, x, y) >= m:
        return x, y
    cands = []
    if box['x1'] > 1.5:
        cands.append((box['x1'] - m, y))
    if box['x2'] < w_global - 1.5:
        cands.append((box['x2'] + m, y))
    cands.append((x, box['y1'] - m))
    cands.append((x, box['y2'] + m))
    best, bd = cands[0], 1e18
    for c in cands:
        d = math.hypot(c[0] - x, c[1] - y)
        if d < bd:
            bd, best = d, c
    return best


w_global = 44.0


class Brain:
    def __init__(self, team, debug=False):
        self.team = team
        self.opp = 1 - team
        self.s = 1 if team == 0 else -1      # attack direction along x
        self.debug = debug
        self.stats = {'shots': 0, 'passes': 0}

    # ---------------------------------------------------------------- contexts
    def setup(self, w):
        self.W = w.W
        self.H = w.H
        self.rules = w.rules
        self.pen = {int(k): v for k, v in
                    ({int(kk): vv for kk, vv in w.pen.items()}.items())}
        self.box_own = self.pen[self.team]
        self.box_opp = self.pen[self.opp]
        self.gx_att = (self.W - 1.0) if self.s > 0 else 1.0
        self.gx_def = 1.0 if self.s > 0 else (self.W - 1.0)
        self.n = w.teamSize
        self.margin = 0.30

    # ---------------------------------------------------------------- history
    def apply_history(self, obs, w):
        """Recover hidden per-unit counters (foulLock/stealLock/kickoff team)
        that the public observation does not expose, from the event log."""
        try:
            hz = float(w.rules.get('hz') or 20)
            foul_frames = int(round(float(w.rules.get('foulLock') or 1.0) * hz))
            steal_frames = int(round(float(w.rules.get('stealLock') or 0.18) * hz))
        except Exception:
            hz, foul_frames, steal_frames = 20.0, 20, 4
        by_id = {u['id']: u for u in w.units}
        cur = int(w.frame)
        evs = obs.get('events') or []
        for e in evs:
            f = e.get('frame')
            if f is None:
                continue
            age = cur - int(f)
            if age < 0:
                continue
            typ = e.get('type')
            if typ == 'foul' and e.get('team') is not None and int(e.get('team')) == self.team:
                u = by_id.get(e.get('unit'))
                rem = foul_frames - age
                if u is not None and rem > 0:
                    u['foulLock'] = max(u.get('foulLock') or 0, rem)
                    u['stealLock'] = max(u.get('stealLock') or 0, rem)
                    u['kickCd'] = max(u.get('kickCd') or 0, rem)
            elif typ == 'tackle':
                u = by_id.get(e.get('from'))
                rem = steal_frames - age
                if u is not None and u['team'] == self.team and rem > 0:
                    u['stealLock'] = max(u.get('stealLock') or 0, rem)
        # kickoff team: |seed|%2, then conceding team after a goal, flipped at half
        k = abs(int(obs.get('seed') or 0)) % 2
        for e in evs:
            typ = e.get('type')
            if typ == 'goal':
                try:
                    k = 1 - int(e.get('team'))
                except Exception:
                    pass
            elif typ == 'half':
                k = 1 - k
        w.kickoffTeam = k

    # ---------------------------------------------------------------- helpers
    def own_units(self, w):
        return [u for u in w.units if u['team'] == self.team]

    def opp_units(self, w):
        return [u for u in w.units if u['team'] == self.opp]

    def unit(self, w, team, index):
        for u in w.units:
            if u['team'] == team and u['index'] == index:
                return u
        return None

    def ball_path(self, w, n):
        """Free ball future (no possession); list of dicts per frame end."""
        b = {'x': w.ball['x'], 'y': w.ball['y'], 'vx': w.ball['vx'], 'vy': w.ball['vy']}
        out = []
        br = self.rules['ballRadius']
        dt = 0.05
        refl = self.rules['wallRestitution']
        end = False
        for _ in range(n):
            if b['vx'] or b['vy']:
                for _ in range(4):
                    b['x'] += b['vx'] * dt / 4
                    b['y'] += b['vy'] * dt / 4
                    if w.in_goal_mouth(b['x'], b['y']) and (b['x'] <= 1.0 or b['x'] >= self.W - 1.0):
                        end = True
                        break
                    if w.circle_hits_wall(b['x'], b['y'], br):
                        px = b['x'] - b['vx'] * dt / 4
                        py = b['y'] - b['vy'] * dt / 4
                        if w.circle_hits_wall(b['x'], py, br):
                            b['x'] = px; b['vx'] = -b['vx'] * refl
                        if w.circle_hits_wall(px, b['y'], br):
                            b['y'] = py; b['vy'] = -b['vy'] * refl
                        if w.circle_hits_wall(b['x'], b['y'], br):
                            b['x'] = px; b['y'] = py
                            b['vx'] = -b['vx'] * refl; b['vy'] = -b['vy'] * refl
                b['vx'] *= self.rules['ballFriction']
                b['vy'] *= self.rules['ballFriction']
                if math.hypot(b['vx'], b['vy']) < 0.02:
                    b['vx'] = b['vy'] = 0.0
            out.append({'x': b['x'], 'y': b['y'], 'vx': b['vx'], 'vy': b['vy'], 'end': end})
            if end:
                break
        while len(out) < n:
            out.append(dict(out[-1]) if out else {'x': b['x'], 'y': b['y'], 'vx': 0, 'vy': 0, 'end': end})
        return out

    def intercept(self, w, u, path, speed=None):
        """First frame index at which unit u can reach the ball position."""
        if speed is None:
            speed = self.rules['moveSpeed']
        step = speed * 0.05
        for t, p in enumerate(path):
            d = math.hypot(p['x'] - u['x'], p['y'] - u['y'])
            if d <= step * (t + 1) + self.rules['controlRadius']:
                return t, p
        return len(path) - 1, path[-1]

    # ---------------------------------------------------------------- movement
    def choose_dir(self, w, u, target, avoid_box=None, stop=0.0):
        tx, ty = target
        ddx, ddy = tx - u['x'], ty - u['y']
        if math.hypot(ddx, ddy) <= stop:
            return 'N'
        carrying = w.ball['owner'] == u['id']
        sp = self.rules['moveSpeed'] * (self.rules['dribbleSpeedFactor'] if carrying else 1.0) * 0.05
        cur_box_d = box_dist(avoid_box, u['x'], u['y']) if avoid_box is not None else None
        best, bd = 'N', 1e18
        for name, (vx, vy) in DIR_VEC.items():
            if name == 'N':
                continue
            tmp = {'x': u['x'], 'y': u['y']}
            w.move_unit(tmp, vx * sp, vy * sp)
            nx, ny = tmp['x'], tmp['y']
            if avoid_box is not None:
                nd = box_dist(avoid_box, nx, ny)
                # never move closer to the box while already near it; escaping
                # (or moving parallel) stays allowed so a shoved unit can leave
                if nd < BOX_MARGIN and nd < cur_box_d - 1e-9:
                    continue
            d = math.hypot(tx - nx, ty - ny)
            if d < bd:
                bd, best = d, name
        return best

    def safe_target(self, tx, ty):
        """clamp a target that would otherwise sit too close to the opponent box"""
        if box_dist(self.box_opp, tx, ty) < BOX_MARGIN:
            tx, ty = clamp_outside(self.box_opp, tx, ty, BOX_MARGIN)
        return tx, ty

    # ---------------------------------------------------------------- shots
    def shot_path(self, w, ox, oy, tx, ty, nframes=60):
        """Simulate a kick from (ox,oy) aimed at (tx,ty). Returns (outcome, frames)."""
        ang = math.atan2(ty - oy, tx - ox)
        fx, fy = math.cos(ang), math.sin(ang)
        off = self.rules['unitRadius'] + self.rules['ballRadius'] + 0.03
        bx = ox + fx * off
        by = oy + fy * off
        kp = self.rules['kickPower']
        b = {'x': bx, 'y': by, 'vx': fx * kp, 'vy': fy * kp}
        br = self.rules['ballRadius']
        dt = 0.05
        refl = self.rules['wallRestitution']
        pos = []
        for _ in range(nframes):
            for _ in range(4):
                b['x'] += b['vx'] * dt / 4
                b['y'] += b['vy'] * dt / 4
                if w.in_goal_mouth(b['x'], b['y']):
                    if b['x'] >= self.W - 1.0 or b['x'] <= 1.0:
                        return 'goal', pos
                if w.circle_hits_wall(b['x'], b['y'], br):
                    px = b['x'] - b['vx'] * dt / 4
                    py = b['y'] - b['vy'] * dt / 4
                    if w.circle_hits_wall(b['x'], py, br):
                        b['x'] = px; b['vx'] = -b['vx'] * refl
                    if w.circle_hits_wall(px, b['y'], br):
                        b['y'] = py; b['vy'] = -b['vy'] * refl
                    if w.circle_hits_wall(b['x'], b['y'], br):
                        b['x'] = px; b['y'] = py
                        b['vx'] = -b['vx'] * refl; b['vy'] = -b['vy'] * refl
            b['vx'] *= self.rules['ballFriction']
            b['vy'] *= self.rules['ballFriction']
            if math.hypot(b['vx'], b['vy']) < 0.02:
                b['vx'] = b['vy'] = 0.0
            pos.append((b['x'], b['y'], math.hypot(b['vx'], b['vy'])))
            if b['vx'] == 0 and b['vy'] == 0:
                break
        return 'stuck', pos


    def keeper_line_target(self, ku, bx, by):
        gx = self.gx_def if ku['team'] == self.team else self.gx_att
        box = self.pen[ku['team']]
        s = 1 if ku['team'] == 0 else -1
        kx = gx + s * 2.6
        den = (bx - gx)
        t = (kx - gx) / den if abs(den) > 0.2 else 0.0
        t = max(-0.6, min(1.6, t))
        ty = 13.0 + t * (by - 13.0)
        ty = max(box['y1'] + 0.5, min(box['y2'] - 0.5, ty))
        return (kx, ty)

    def keeper_goal_target(self, ku, w, path, f):
        """Velocity-aware cover point: stand just off the goal line and move to
        where the ball is predicted to cross, not to the ball-to-goal-centre
        line (which under-covers the posts on angled shots)."""
        gx = self.gx_def if ku['team'] == self.team else self.gx_att
        box = self.pen[ku['team']]
        s = 1 if ku['team'] == 0 else -1
        kx = gx + s * 1.9
        ycross = None
        for p in path[f:]:
            if (p['x'] - gx) * s <= 1.9:
                ycross = p['y']
                break
        if ycross is None:
            src = path[min(f, len(path) - 1)] if path else {'y': w.ball['y']}
            ycross = 13.0 + 0.35 * (src['y'] - 13.0)
        ycross = max(box['y1'] + 0.6, min(box['y2'] - 0.6, ycross))
        return (kx, ycross)

    def opponent_future(self, w, traj, nframes):
        """Opponent positions if they re-plan at 1 Hz boundaries (20,40,...)."""
        out = []
        ball0 = (traj[0][0], traj[0][1]) if traj else (w.ball['x'], w.ball['y'])
        sp = self.rules['moveSpeed'] * 0.05
        for o in self.opp_units(w):
            x, y = o['x'], o['y']
            tgt = self.opp_chase_target(o, ball0)
            pos = []
            for t in range(nframes):
                if t > 0 and t % 20 == 0:
                    b = traj[min(t - 1, len(traj) - 1)]
                    tgt = self.opp_chase_target(o, (b[0], b[1]))
                dx, dy = tgt[0] - x, tgt[1] - y
                d = math.hypot(dx, dy)
                if d > 0.12:
                    mv = min(sp, d)
                    x += dx / d * mv
                    y += dy / d * mv
                x = max(0.34, min(self.W - 0.34, x))
                y = max(0.34, min(self.H - 0.34, y))
                pos.append((x, y))
            out.append((o, pos))
        return out

    def opp_chase_target(self, o, bpos):
        if o['index'] == 0:
            return self.keeper_line_target(o, bpos[0], bpos[1])
        return bpos

    def shot_eval(self, w, u, gy, maxf=90):
        """Returns (clearance, flight_frames, target_y) or None if it cannot score."""
        gx = self.gx_att
        out, traj = self.shot_path(w, u['x'], u['y'], gx, gy, maxf)
        if out != 'goal':
            return None
        opps = self.opponent_future(w, traj, len(traj))
        minclear = 1e9
        for o, pos in opps:
            pen_o = self.pen[o['team']]
            for t, (bx, by, bs) in enumerate(traj):
                ox, oy = pos[t]
                r = self.rules['controlRadius']
                if (o['index'] == 0 and bs >= self.rules['keeperMinSpeed']
                        and inside(pen_o, bx, by) and inside(pen_o, ox, oy)):
                    r = self.rules['keeperRadius']
                c = math.hypot(bx - ox, by - oy) - r
                if c < minclear:
                    minclear = c
                    if c < 0.08:
                        return None
        return minclear, len(traj), gy

    SHOT_YS = (10.70, 11.25, 11.90, 12.50, 13.00, 13.50, 14.10, 14.75, 15.30)

    def pick_shot_target(self, w, u, min_clear=0.18):
        if math.hypot(self.gx_att - u['x'], 13.0 - u['y']) > 23.5:
            return None
        dl = getattr(self, 'deadline', None)
        if dl is not None and time.monotonic() > dl:
            return None
        best = None
        for gy in self.SHOT_YS:
            if dl is not None and time.monotonic() > dl:
                break
            r = self.shot_eval(w, u, gy)
            if r is None:
                continue
            clear, nf, ty = r
            score = clear - nf * 0.005 - abs(ty - 13.0) * 0.02
            if best is None or score > best[0]:
                best = (score, ty, clear)
        if best is None or best[2] < min_clear:
            return None
        return best[1]

    # ---------------------------------------------------------------- keeper
    def keeper_decide(self, w, u, f, path):
        b = w.ball
        if b['owner'] == u['id']:
            if not inside(self.box_own, u['x'], u['y']):
                # pushed up as a second outfield player: normal attacking logic
                return self.owner_decide(w, u, f, path)
            return self.keeper_with_ball(w, u)
        # predicted ball position this frame (free-ball model)
        pi = min(f, len(path) - 1)
        px, py = path[pi]['x'], path[pi]['y']
        kx, ky = self.keeper_line_target(u, px, py)
        # if the ball is loose and close, go grab it inside our box / near it
        loose = not b['owner']
        if loose:
            d = math.hypot(px - u['x'], py - u['y'])
            in_ours = inside(self.box_own, px, py)
            if d < 7.5 and (in_ours or (px - self.gx_def) * self.s < 10.0):
                # chase the intercept point
                t, p = self.intercept(w, u, path[pi:pi + 20], self.rules['moveSpeed'])
                tgt = (p['x'], p['y'])
                tgt = self._clamp_target_to_own_area(tgt)
                return self._move(w, u, tgt, 'N')
        tgt = (kx, ky)
        return self._move(w, u, tgt, 'N')

    def _clamp_target_to_own_area(self, tgt):
        # keeper may leave the box, but never enter the opponent box
        return self.safe_target(tgt[0], tgt[1])

    def keeper_with_ball(self, w, u):
        # hold in box if leading late; else look for a safe outlet
        t_left = self.time_left(w)
        lead = w.score[self.team] - w.score[self.opp]
        if lead > 0 and (t_left < 35 or w.golden):
            # stay deep in our box with the ball: unstoppable
            tx, ty = self._hold_spot(u)
            return self._move(w, u, (tx, ty), 'N', carrying=True)
        # find an open teammate upfield; pass if clear, else clear upfield
        best = None
        for mate in self.own_units(w):
            if mate['id'] == u['id']:
                continue
            d = math.hypot(mate['x'] - u['x'], mate['y'] - u['y'])
            if d > 26 or d < 3:
                continue
            prog = (mate['x'] - u['x']) * self.s
            open_d = min([math.hypot(mate['x'] - o['x'], mate['y'] - o['y'])
                          for o in self.opp_units(w)] or [99])
            lane = self.lane_clear(w, u['x'], u['y'], mate['x'], mate['y'])
            score = prog + open_d * 0.6 + (3.0 if lane else -8.0)
            if best is None or score > best[0]:
                best = (score, mate, lane)
        if best and best[2] and best[0] > 2:
            mate = best[1]
            ang = ang_of(mate['x'] - u['x'], mate['y'] - u['y'])
            return {'dir': 'N', 'aim': ang, 'kick': True}
        # otherwise boot it upfield toward a wing, away from our goal
        wx, wy = self.wing_spot(u['y'])
        ang = ang_of(wx - u['x'], wy - u['y'])
        return {'dir': 'N', 'aim': ang, 'kick': True}

    def _hold_spot(self, u):
        box = self.box_own
        gx = self.gx_def
        s = 1 if u['team'] == 0 else -1
        x = gx + s * 2.5
        y = max(box['y1'] + 2.5, min(box['y2'] - 2.5, u['y']))
        return x, y

    def lane_clear(self, w, x0, y0, x1, y1, margin=1.0):
        for o in self.opp_units(w):
            d = self.point_seg_dist(o['x'], o['y'], x0, y0, x1, y1)
            if d < self.rules['controlRadius'] + margin:
                return False
        return True

    @staticmethod
    def point_seg_dist(px, py, x0, y0, x1, y1):
        dx, dy = x1 - x0, y1 - y0
        l2 = dx * dx + dy * dy
        if l2 < 1e-12:
            return math.hypot(px - x0, py - y0)
        t = ((px - x0) * dx + (py - y0) * dy) / l2
        t = max(0.0, min(1.0, t))
        return math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))

    def time_left(self, w):
        return max(0.0, self.rules['matchSeconds'] - w.frame / self.rules['hz'])

    def late_lead(self, w):
        return (w.score[self.team] - w.score[self.opp] > 0) and (
            w.golden or self.time_left(w) < 32.0)

    def wing_spot(self, y):
        wy = 4.6 if y < 13 else 21.4
        return self.gx_att - self.s * 7.0, wy

    def wing_y_for(self, bally):
        return 4.6 if bally < 13 else 21.4

    # ---------------------------------------------------------------- owner
    def owner_decide(self, w, u, f, path):
        late_lead = self.late_lead(w)
        if late_lead:
            # kill the clock: give the ball back to the keeper, who can hold it
            # inside our own box where it cannot be stolen without a foul
            k = self.unit(w, self.team, 0)
            if k is not None and k['id'] != u['id']:
                d = math.hypot(k['x'] - u['x'], k['y'] - u['y'])
                if (2.0 < d < 30.0 and inside(self.box_own, k['x'], k['y'], 0.2)
                        and (u['x'] - self.gx_def) * self.s < 18.0
                        and self.lane_clear(w, u['x'], u['y'], k['x'], k['y'], margin=1.4)):
                    ang = ang_of(k['x'] - u['x'], k['y'] - u['y'])
                    return {'dir': 'N', 'aim': ang, 'kick': True}
        # Evaluate shooting every frame (open-loop, so evaluate against the
        # observed opponent positions + a chase model for their flight path).
        # Evaluate shooting every frame.  In 1v1 only the first frames of the
        # window are based on the exact observed state; later frames use our
        # (crude) opponent model and those speculative shots get blocked at
        # release (round-1 1v1 evidence).  With team-mates the open-loop drift
        # is smaller, so the normal threshold is kept there.
        if late_lead:
            min_clear = 0.55
        elif self.n == 1:
            min_clear = 0.12 if f <= 1 else 1e9
        else:
            min_clear = 0.18
        gy = self.pick_shot_target(w, u, min_clear=min_clear)
        if gy is not None:
            ang = ang_of(self.gx_att - u['x'], gy - u['y'])
            self.stats['shots'] += 1
            return {'dir': 'N', 'aim': ang, 'kick': True}
        # passing option
        mate, ang = self.pick_pass(w, u)
        if mate is not None:
            self.stats['passes'] += 1
            return {'dir': 'N', 'aim': ang, 'kick': True}
        # heavy pressure deep in our own half with no outlet: clear it upfield
        near = sum(1 for o in self.opp_units(w)
                   if math.hypot(o['x'] - u['x'], o['y'] - u['y']) < 2.2)
        deep = (u['x'] - self.gx_def) * self.s < 14.0
        if near >= 2 and deep:
            wx, wy = self.wing_spot(u['y'])
            wx = max(2.0, min(self.W - 2.0, wx))
            ang = ang_of(wx - u['x'], wy - u['y'])
            return {'dir': 'N', 'aim': ang, 'kick': True}
        # dribble
        tgt = self.dribble_target(w, u)
        tgt = self.safe_target(*tgt)
        d = self.choose_dir(w, u, tgt, avoid_box=self.box_opp)
        ang = ang_of(tgt[0] - u['x'], tgt[1] - u['y'])
        return {'dir': d, 'aim': ang, 'kick': False}

    def shooting_pocket(self, w, u):
        """A spot ~16.5 units from the goal line, on the side away from the
        nearest defender.  Shot experiments vs a line keeper show this band
        (e.g. x~26.5 / y~8 or 18 for team 0) has open corner shots, while the
        old wing spot (x~31, y~4.6/21.4) is fully covered by the keeper."""
        gx = self.gx_att
        px = gx - self.s * 16.5
        near, nd = None, 1e9
        for o in self.opp_units(w):
            d = math.hypot(o['x'] - u['x'], o['y'] - u['y'])
            if d < nd:
                nd, near = d, o
        if near is not None and near['y'] < 13.0:
            py = 18.0
        elif near is not None and near['y'] > 13.0:
            py = 8.0
        else:
            # tie at the centre line: flip with the team so that the policy is
            # 180-degree rotationally symmetric (team 0 lower, team 1 upper)
            py = 8.0 if self.team == 0 else 18.0
        # if the pocket is crowded, slide along the band
        if near is not None and math.hypot(near['x'] - px, near['y'] - py) < 2.0:
            py = 18.0 if py < 13.0 else 8.0
        return px, py

    def dribble_target(self, w, u):
        # advance toward a shooting pocket; when pressed, turn the body between
        # the opponent and the ball (shielding is the only safe carry)
        tx, ty = self.shooting_pocket(w, u)
        nearest, nd = None, 1e9
        for o in self.opp_units(w):
            d = math.hypot(o['x'] - u['x'], o['y'] - u['y'])
            if d < nd:
                nd, nearest = d, o
        if nearest is not None and nd < 4.0:
            # sidestep away from the opponent, still advancing
            ax, ay = u['x'] - nearest['x'], u['y'] - nearest['y']
            l = math.hypot(ax, ay) or 1
            tx = u['x'] + ax / l * 4.0 + self.s * 2.0
            ty = u['y'] + ay / l * 4.0
        return tx, ty

    def pick_pass(self, w, u):
        best = None
        for mate in self.own_units(w):
            if mate['id'] == u['id']:
                continue
            d = math.hypot(mate['x'] - u['x'], mate['y'] - u['y'])
            if d < 2.5 or d > 21:
                continue
            if inside(self.box_opp, mate['x'], mate['y'], 0.05):
                continue
            lane = self.lane_clear(w, u['x'], u['y'], mate['x'], mate['y'], margin=0.6)
            if not lane:
                continue
            prog = (mate['x'] - u['x']) * self.s
            open_d = min([math.hypot(mate['x'] - o['x'], mate['y'] - o['y'])
                          for o in self.opp_units(w)] or [99])
            # prefer progressive, open, not-too-long passes
            score = prog * 1.0 + open_d * 0.8 - d * 0.25
            if best is None or score > best[0]:
                best = (score, mate)
        if best is None or best[0] < 1.0:
            return None, None
        mate = best[1]
        ang = ang_of(mate['x'] - u['x'], mate['y'] - u['y'])
        return mate, ang

    # ---------------------------------------------------------------- field
    def field_decide(self, w, u, f, path):
        b = w.ball
        if b['owner'] == u['id']:
            return self.owner_decide(w, u, f, path)
        ours = b['owner'] is not None and b['owner'].startswith('t%d' % self.team)
        theirs = b['owner'] is not None and not ours
        # ball position prediction
        pi = min(f, len(path) - 1)
        bp = (path[pi]['x'], path[pi]['y'])

        field_units = [x for x in self.own_units(w) if x['index'] != 0 or self.n == 1]
        field_units.sort(key=lambda x: math.hypot(x['x'] - bp[0], x['y'] - bp[1]))
        try:
            rank = field_units.index(u)
        except ValueError:
            rank = 99

        if ours:
            owner = next((x for x in self.own_units(w) if x['id'] == b['owner']), None)
            mates = [x for x in field_units if x['id'] != b['owner']]
            mates.sort(key=lambda x: math.hypot(x['x'] - bp[0], x['y'] - bp[1]))
            try:
                mrank = mates.index(u)
            except ValueError:
                mrank = 99
            if mrank == 0:
                # support runner: offer an outlet upfield
                tgt = self.support_target(w, u, bp, owner)
                return self._move(w, u, self.safe_target(*tgt), 'N')
            # cover goal side
            tgt = self.cover_target(w, u, bp, mrank + 1)
            return self._move(w, u, self.safe_target(*tgt), 'N')

        if theirs:
            if rank == 0:
                tgt = self.press_target(w, u, bp)
                return self._move(w, u, self.safe_target(*tgt), 'N')
            tgt = self.cover_target(w, u, bp, rank)
            return self._move(w, u, self.safe_target(*tgt), 'N')

        # loose ball
        if rank == 0:
            t, p = self.intercept(w, u, path[pi:pi + 40], self.rules['moveSpeed'])
            tgt = (p['x'], p['y'])
            return self._move(w, u, self.safe_target(*tgt), 'N')
        if rank == 1 and self._can_win_race(w, u, bp):
            t, p = self.intercept(w, u, path[pi:pi + 40], self.rules['moveSpeed'])
            return self._move(w, u, self.safe_target(p['x'], p['y']), 'N')
        # otherwise take a support/cover spot
        if (bp[0] - u['x']) * self.s > -2:
            tgt = self.support_target(w, u, bp)
        else:
            tgt = self.cover_target(w, u, bp, rank)
        return self._move(w, u, self.safe_target(*tgt), 'N')

    def _can_win_race(self, w, u, bp):
        du = math.hypot(bp[0] - u['x'], bp[1] - u['y'])
        do = min([math.hypot(bp[0] - o['x'], bp[1] - o['y']) for o in self.opp_units(w)] or [99])
        return du < do + 0.5

    def press_target(self, w, u, bp):
        return bp

    def support_target(self, w, u, bp, owner=None):
        # When the keeper has the ball, push high to a shooting pocket so the
        # long outlet creates a shot instead of a midfield wrestle.
        if owner is not None and owner['index'] == 0 and self.n >= 2:
            px, py = self.shooting_pocket(w, u)
            return px, py
        # progressive outlet ~10 ahead of the ball, on the wing with a clear lane
        tx = bp[0] + self.s * 10.0
        if self.s > 0:
            tx = min(tx, self.gx_att - 6.0)
        else:
            tx = max(tx, self.gx_att + 6.0)
        cands = [(tx, 4.6), (tx, 21.4), (tx, 13.0)]

        def score(p):
            d = math.hypot(p[0] - u['x'], p[1] - u['y'])
            opp = min([math.hypot(p[0] - o['x'], p[1] - o['y']) for o in self.opp_units(w)] or [99])
            lane = 1.0 if self.lane_clear(w, bp[0], bp[1], p[0], p[1], margin=0.4) else 0.0
            inside_box = -6.0 if inside(self.box_opp, p[0], p[1], 0.05) else 0.0
            return d * 0.30 - min(opp, 8) * 0.6 - lane * 2.0 + inside_box

        return max(cands, key=score)

    def cover_target(self, w, u, bp, rank):
        gx = self.gx_def
        frac = 0.30 + 0.12 * min(rank, 4)
        px = bp[0] + (gx - bp[0]) * frac
        py = bp[1] + (13.0 - bp[1]) * frac
        # spread laterally by index
        py += ((u['index'] % 3) - 1) * 1.8
        py = max(1.0, min(self.H - 1.0, py))
        return px, py

    def _move(self, w, u, tgt, aim, carrying=False, kick=False):
        d = self.choose_dir(w, u, tgt, avoid_box=self.box_opp, stop=0.10)
        if aim == 'N':
            # face the movement direction (default); while carrying, face target
            if carrying or w.ball['owner'] == u['id']:
                ang = ang_of(tgt[0] - u['x'], tgt[1] - u['y'])
                return {'dir': d, 'aim': ang, 'kick': kick}
            return {'dir': d, 'aim': None, 'kick': kick}
        return {'dir': d, 'aim': aim, 'kick': kick}

    # ---------------------------------------------------------------- solo
    def solo_decide(self, w, u, f, path):
        b = w.ball
        if b['owner'] == u['id']:
            return self.owner_decide(w, u, f, path)
        pi = min(f, len(path) - 1)
        bp = (path[pi]['x'], path[pi]['y'])
        # 1v1, loose ball: if it is fast enough to be a shot and we cannot
        # intercept it before our box, cover the predicted goal-line crossing
        # instead of chasing it from behind.
        if self.n == 1 and b['owner'] is None:
            speed = math.hypot(b['vx'], b['vy'])
            if speed >= self.rules['keeperMinSpeed']:
                tball = None
                for j, p in enumerate(path[pi:pi + 30]):
                    if (p['x'] - self.gx_def) * self.s <= 10.0:
                        tball = j
                        break
                if tball is not None:
                    tme, _ = self.intercept(w, u, path[pi:pi + 40],
                                            self.rules['moveSpeed'])
                    if tme >= tball:
                        kx, ky = self.keeper_goal_target(u, w, path, f)
                        return self._move(w, u, (kx, ky), 'N')
        theirs = b['owner'] is not None and not b['owner'].startswith('t%d' % self.team)
        # they carry the ball near our goal: cover the ball-to-goal line
        # instead of chasing (the free-ball path is static while owned)
        if theirs and (bp[0] - self.gx_def) * self.s < 12.0:
            kx, ky = self.keeper_line_target(u, bp[0], bp[1])
            return self._move(w, u, (kx, ky), 'N')
        t, p = self.intercept(w, u, path[pi:pi + 40], self.rules['moveSpeed'])
        tx, ty = self.safe_target(p['x'], p['y'])
        return self._move(w, u, (tx, ty), 'N')

    # ---------------------------------------------------------------- opponent model
    def opp_model_inputs(self, w):
        """Fixed 20-frame script for the opponent, decided at the window start."""
        out = {}
        b = w.ball
        owner_id = b['owner']
        for o in self.opp_units(w):
            if o['id'] == owner_id:
                # carry toward our goal, shoot if close
                distg = math.hypot(o['x'] - self.gx_def, o['y'] - 13.0)
                if distg < 20 and o['kickCd'] <= 0:
                    ang = ang_of(self.gx_def - o['x'], 13.0 - o['y'])
                    out[o['id']] = {'dir': 'N', 'aim': ang, 'kick': True}
                else:
                    tgt = (self.gx_def - self.s * 8.0, 13.0 + (o['y'] - 13.0) * 0.4)
                    tgt = (max(1.0, min(self.W - 1.0, tgt[0])), max(1.0, min(self.H - 1.0, tgt[1])))
                    ang = ang_of(tgt[0] - o['x'], tgt[1] - o['y'])
                    out[o['id']] = {'dir': oct_name(ang), 'aim': ang, 'kick': False}
            elif o['index'] == 0:
                kx, ky = self.keeper_line_target(o, b['x'], b['y'])
                ang = ang_of(kx - o['x'], ky - o['y'])
                out[o['id']] = {'dir': oct_name(ang), 'aim': None, 'kick': False}
            else:
                ang = ang_of(b['x'] - o['x'], b['y'] - o['y'])
                out[o['id']] = {'dir': oct_name(ang), 'aim': None, 'kick': False}
        return out

    # ---------------------------------------------------------------- top level
    def plan(self, w):
        self.setup(w)
        sim = w.clone()
        frames = []
        t0 = time.monotonic()
        self.deadline = t0 + 2.0
        opp_script = self.opp_model_inputs(sim)
        for f in range(20):
            if time.monotonic() > self.deadline:
                fb = self._fallback_frame(sim)
                while len(frames) < 20:
                    frames.append(fb)
                break
            path = self.ball_path(sim, 24)
            mine = {}
            for u in self.own_units(sim):
                if self.n == 1:
                    inp = self.solo_decide(sim, u, f, path)
                elif u['index'] == 0 and sim.ball['owner'] != u['id']:
                    inp = self.keeper_decide(sim, u, f, path)
                elif u['index'] == 0 and sim.ball['owner'] == u['id']:
                    inp = self.keeper_decide(sim, u, f, path)
                else:
                    inp = self.field_decide(sim, u, f, path)
                inp = self._sanitize(inp)
                mine[u['id']] = inp
            inputs = dict(opp_script)
            inputs.update(mine)
            sim.step(inputs)
            frames.append([mine['t%du%d' % (self.team, i)] for i in range(self.n)])
        return frames

    def _fallback_frame(self, w):
        """Cheap 20th-frame script if planning runs out of time."""
        b = w.ball
        out = []
        for u in self.own_units(w):
            d = self.choose_dir(w, u, (b['x'], b['y']), avoid_box=self.box_opp)
            if b['owner'] == u['id']:
                out.append({'dir': d, 'aim': ang_of(self.gx_att - u['x'], 13.0 - u['y']), 'kick': False})
            else:
                out.append({'dir': d, 'aim': None, 'kick': False})
        return out

    def _sanitize(self, inp):
        d = inp.get('dir') or 'N'
        if d not in DIR_VEC:
            d = 'N'
        aim = inp.get('aim')
        if aim is not None:
            if isinstance(aim, str):
                if aim not in DIR_VEC:
                    aim = None
            else:
                aim = float(aim) % 360.0
        return {'dir': d, 'aim': aim, 'kick': bool(inp.get('kick'))}
