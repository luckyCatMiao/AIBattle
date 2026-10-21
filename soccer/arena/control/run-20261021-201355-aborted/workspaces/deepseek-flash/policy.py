"""Tactical controller for the 3v3 soccer arena (v2).

The controller uses a forward model (physics.py) to plan the full 20-frame
window: every simulated frame it re-evaluates roles from the current
(simulated) state, emits the three unit inputs, then steps the model.

Design notes
------------
* A ball carrier never stands still.  Under pressure it shoots, passes, or
  clears the ball into open space upfield.
* Facing (aim) is decoupled from movement for non-carriers: they always face
  the attacking direction, so an unexpected possession is immediately safe.
* Carriers never move straight toward their own goal.
* One player stays goal-side; on defense the closest presses the ball and the
  others protect the goal mouth / passing lanes.
"""
import math
import physics
from physics import (W, H, DT, DIRS, UNIT_R, BALL_R, RULES,
                     circle_hits_wall, ball_hits_wall, in_goal_mouth, js_round)

SPEED = RULES['moveSpeed']
CONTROL_R = RULES['controlRadius']
DRIBBLE = RULES['dribbleDistance']
KICK_POWER = RULES['kickPower']
FRICTION = RULES['ballFriction']
GOAL_Y = 13.0

SHOT_TARGETS = [10.9, 11.4, 11.9, 12.4, 12.9, 13.4, 13.9, 14.4, 14.9, 15.1]


def ang_deg(vx, vy):
    a = math.degrees(math.atan2(vy, vx))
    return a % 360.0


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def attack_x(team):
    return 43.0 if team == 0 else 1.0


def own_goal_center(team):
    return (0.9, 13.0) if team == 0 else (43.1, 13.0)


def attack_sign(team):
    return 1.0 if team == 0 else -1.0


def attack_angle(team):
    return 0.0 if team == 0 else 180.0


def ball_time_frames(d):
    """Frames for a kicked ball to cover distance d (straight, no bounces)."""
    if d <= 0:
        return 1.0
    k = 1.0 - d * (1.0 - FRICTION) / (KICK_POWER * DT)
    if k <= 0.02:
        return 400.0
    return max(1.0, math.log(k) / math.log(FRICTION))


def simulate_move(u, dx, dy):
    x, y = u.x, u.y
    r = UNIT_R
    nx = x + dx
    if not circle_hits_wall(nx, y, r):
        x = nx
    else:
        slide = (1.0 if dx > 0 else -1.0) * r * 0.5
        if not circle_hits_wall(x + slide, y, r):
            x += slide
    ny = y + dy
    if not circle_hits_wall(x, ny, r):
        y = ny
    else:
        slide = (1.0 if dy > 0 else -1.0) * r * 0.5
        if not circle_hits_wall(x, y + slide, r):
            y += slide
    return (max(r, min(W - r, x)), max(r, min(H - r, y)))


def lane_clearance(start, end, units, shooter, reaction=0.0, speed_factor=1.0):
    """Slack of the best blocker on a straight kick line.

    For every other unit, project onto the line, estimate when the ball gets
    there and how far the blocker can run by then.  `reaction` models the
    fact that both sides commit a whole second of inputs at once, so a
    defender cannot instantly choose to cover a line we pick now.
    """
    sx, sy = start
    ex, ey = end
    dx, dy = ex - sx, ey - sy
    length = math.hypot(dx, dy)
    if length < 1e-9:
        return -9.0
    fx, fy = dx / length, dy / length
    worst = 9.0
    for u in units:
        if u is shooter:
            continue
        wx, wy = u.x - sx, u.y - sy
        proj = wx * fx + wy * fy
        if proj <= -0.2 or proj >= length + 2.0:
            continue
        perp = abs(wx * fy - wy * fx)
        ball_d = max(0.0, proj - (UNIT_R + BALL_R + 0.03))
        # the ball cannot travel farther than ~23.3 tiles: such a unit can
        # never intercept it, so it must not count as a blocker.
        if ball_d > 22.8:
            continue
        t = ball_time_frames(ball_d)
        reach = SPEED * max(0.0, t - reaction) / 20.0 * speed_factor
        clear = perp - reach - CONTROL_R
        if clear < worst:
            worst = clear
    return worst


def predict_free_ball(w, frames=90):
    b = w.ball
    x, y, vx, vy = b.x, b.y, b.vx, b.vy
    out = []
    for _ in range(frames):
        for _s in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if in_goal_mouth(x, y) and (x <= 1.0 or x >= W - 1.0):
                out.append((x, y))
                return out
            if ball_hits_wall(x, y):
                px = x - vx * DT / 4.0
                py = y - vy * DT / 4.0
                if ball_hits_wall(x, py):
                    x = px
                    vx = -vx * RULES['wallRestitution']
                if ball_hits_wall(px, y):
                    y = py
                    vy = -vy * RULES['wallRestitution']
                if ball_hits_wall(x, y):
                    x, y = px, py
                    vx = -vx * RULES['wallRestitution']
                    vy = -vy * RULES['wallRestitution']
        vx *= FRICTION
        vy *= FRICTION
        if math.hypot(vx, vy) < 0.02:
            vx = vy = 0.0
        out.append((x, y))
        if vx == 0.0 and vy == 0.0:
            break
    while len(out) < frames:
        out.append(out[-1])
    return out


def intercept_time(pos, traj):
    for t, p in enumerate(traj):
        frames = t + 1
        if dist(pos, p) <= SPEED * frames / 20.0 + CONTROL_R * 0.9:
            return frames, p
    return None, traj[-1]


def ball_danger_score(ball_xy, opps):
    """Heuristic 0 (safe) .. large (about to be stolen)."""
    bxp, byp = ball_xy
    s = 0.0
    for o in opps:
        db = math.hypot(bxp - o.x, byp - o.y)
        if db < 0.55:
            s += 400.0
        elif db < 0.85:
            s += 40.0 * (0.85 - db) / 0.30 + 8.0
        elif db < 1.25:
            s += 2.5 * (1.25 - db)
    return s


class Agent:
    def __init__(self, params=None):
        self.team = 0
        self.p = dict(
            kick_clear_pressure=2.2,   # pressure at which carrier looks to clear
            shoot_range_long=14.0,
            shot_bias=-0.6,
            lane_reaction=0.0,
            lane_speed=1.0,
            through_margin=0.15,
            keeper_depth=2.6,
            press_lead=0.0,
            press_near=99.0,
            block_lead=7.0,
        )
        if params:
            self.p.update(params)
        self.history = []
        self.last_obs = None

    def plan(self, obs):
        return self.plan_window(obs)

    def plan_window(self, obs):
        self.team = int(obs.get('yourTeam', 0))
        self._set_urgency(obs)
        w = self.world_from_obs(obs)
        frames = []
        for _ in range(20):
            mine_inp = self.frame_inputs(w, self.team)
            opp_inp = self.opponent_frame(w, 1 - self.team)
            frames.append(mine_inp)
            w.step({self.team: mine_inp, 1 - self.team: opp_inp})
        self.last_obs = obs
        return {'inputs': frames}

    def world_from_obs(self, obs):
        w = physics.World()
        w.frame = int(obs.get('frame', 0))
        w.freeze = int(round(float(obs.get('freeze', 0)) * 20))
        w.golden = bool(obs.get('golden', False))
        w.score = list(obs.get('score', [0, 0]))
        w.half = int(obs.get('half', 1))
        w.status = 'playing' if obs.get('status') == 'playing' else 'finished'
        if w.golden:
            # timeLeft during golden goal is the remaining golden time
            w.golden_end = w.frame + int(round(float(obs.get('timeLeft', 0)) * 20))
        by_id = {u.id: u for u in w.units}
        obs_units = {}
        for ou in obs.get('units', []):
            u = by_id.get(ou.get('id'))
            if u is None:
                # tolerate servers that rename units: fall back to (team, index)
                try:
                    t = int(ou.get('team', 0))
                    idx = int(ou.get('index', 0))
                except (TypeError, ValueError):
                    continue
                u = next((x for x in w.units if x.team == t and x.index == idx), None)
            if u is None:
                continue
            obs_units[ou.get('id')] = u
            u.x = float(ou.get('x', u.x))
            u.y = float(ou.get('y', u.y))
            f = ou.get('facing') or {'x': 1, 'y': 0}
            fx, fy = float(f.get('x', 1)), float(f.get('y', 0))
            l = math.hypot(fx, fy) or 1.0
            u.facing = (fx / l, fy / l)
            u.kick_cd = int(round(float(ou.get('kickCd', 0)) * 20))
            u.control_lock = int(round(float(ou.get('controlLock', 0)) * 20))
            u.steal_lock = 0
            u.goals = int(ou.get('goals', 0))
            u.kicks = int(ou.get('kicks', 0))
            u.touches = int(ou.get('touches', 0))
        ob = obs.get('ball', {})
        w.ball.x = float(ob.get('x', W / 2))
        w.ball.y = float(ob.get('y', H / 2))
        w.ball.vx = float(ob.get('vx', 0))
        w.ball.vy = float(ob.get('vy', 0))
        mapped = obs_units.get(ob.get('owner'))
        w.ball.owner = mapped.id if mapped is not None else ob.get('owner')
        w.ball.last_touch = ob.get('lastTouch')
        w.ball.last_team = ob.get('lastTeam')
        return w

    def _set_urgency(self, obs):
        """Positive = need a goal, negative = protect a lead."""
        me = int(obs.get('yourTeam', 0))
        sc = obs.get('score', [0, 0])
        diff = int(sc[me]) - int(sc[1 - me])
        tl = float(obs.get('timeLeft', 120))
        if obs.get('golden'):
            self.urgency = 0.8
        elif diff < 0:
            self.urgency = 1.0 if tl < 35 else 0.45
        elif diff > 0:
            self.urgency = -1.0 if tl < 30 else -0.25
        else:
            self.urgency = 0.35 if tl < 25 else (0.12 if tl < 60 else 0.0)
        self.time_left = tl

    def kick_safe(self, team, pos, fx, fy):
        """Refuse kicks whose line would enter our own goal mouth."""
        if team == 0:
            if fx < -0.03:
                s = (1.0 - pos[0]) / fx
                if 0 < s < 45:
                    y = pos[1] + fy * s
                    if 8.8 < y < 17.2:
                        return False
        else:
            if fx > 0.03:
                s = (43.0 - pos[0]) / fx
                if 0 < s < 45:
                    y = pos[1] + fy * s
                    if 8.8 < y < 17.2:
                        return False
        return True

    # ------------------------------------------------------------------ #
    def frame_inputs(self, w, team):
        mine = [u for u in w.units if u.team == team]
        opps = [u for u in w.units if u.team != team]
        ball = w.ball
        owner = w.unit(ball.owner) if ball.owner else None
        if owner is not None and owner.team == team:
            return self.offense_frame(w, team, mine, opps, owner)
        if owner is not None:
            return self.defense_frame(w, team, mine, opps, owner)
        return self.loose_frame(w, team, mine, opps)

    # ------------------------------ decision helpers ------------------ #
    def choose_shot(self, w, team, shooter, units):
        gx = attack_x(team)
        best = None
        for yt in SHOT_TARGETS:
            end = (gx, yt)
            cl = lane_clearance((shooter.x, shooter.y), end, units, shooter,
                                self.p['lane_reaction'], self.p['lane_speed'])
            d = dist((shooter.x, shooter.y), end)
            score = cl - 0.012 * d
            if best is None or score > best[0]:
                best = (score, cl, yt, d)
        return best

    def shot_threshold(self, dgoal):
        if dgoal < 4.0:
            return -2.0
        if dgoal < 6.0:
            return -1.2
        if dgoal < 9.0:
            return -0.45
        if dgoal < 14.0:
            return 0.10
        return 0.55

    def choose_pass(self, w, team, carrier, mates, units, opps, lead=0.5):
        best = None
        for m in mates:
            end = (m.x + m.facing[0] * lead, m.y + m.facing[1] * lead)
            end = (min(W - 0.6, max(0.6, end[0])), min(H - 0.6, max(0.6, end[1])))
            pdx, pdy = end[0] - carrier.x, end[1] - carrier.y
            pl = math.hypot(pdx, pdy) or 1.0
            if not self.kick_safe(team, (carrier.x, carrier.y), pdx / pl, pdy / pl):
                continue
            cl = lane_clearance((carrier.x, carrier.y), end, units, carrier,
                                self.p['lane_reaction'], self.p['lane_speed'])
            d = pl
            if d < 2.5 or d > 22.0:
                continue
            sec = min((dist((m.x, m.y), (o.x, o.y)) for o in opps), default=9.0)
            adv = (m.x - carrier.x) * attack_sign(team)
            score = cl + 0.35 * min(sec, 2.5) + 0.02 * adv - 0.01 * d
            if best is None or score > best[0]:
                best = (score, cl, sec, end, m, d)
        return best

    def choose_through(self, w, team, carrier, mates, units, opps):
        """Kick into space and race for it.

        A goal-side marker can block every pass line and every dribble, but it
        cannot cover the space behind it if we can get there first.  For each
        direction/distance we compare the ball's arrival time with the time our
        closest mate and the closest opponent need to reach that spot.
        """
        sign = attack_sign(team)
        base = 0.0 if team == 0 else math.pi
        gx = attack_x(team)
        best = None
        for k in range(-4, 5):
            a = base + k * math.radians(15.0)
            fx, fy = math.cos(a), math.sin(a)
            if fx * sign < -0.15:
                continue
            if not self.kick_safe(team, (carrier.x, carrier.y), fx, fy):
                continue
            for d in (8.0, 11.0, 14.0, 17.0):
                ex = carrier.x + fx * d
                ey = carrier.y + fy * d
                if ex < 1.0 or ex > W - 1.0 or ey < 1.0 or ey > H - 1.0:
                    break
                # ball can only travel ~23.3 tiles
                if d > 22.0:
                    break
                cl = lane_clearance((carrier.x, carrier.y), (ex, ey), units,
                                    carrier, 5.0, 1.0)
                if cl < -0.6:
                    continue
                tb = ball_time_frames(d) / 20.0
                our = min((max(0.0, dist((m.x, m.y), (ex, ey)) - CONTROL_R) / SPEED
                           for m in mates), default=99.0) + 0.10
                opp = min((max(0.0, dist((o.x, o.y), (ex, ey)) - CONTROL_R) / SPEED
                           for o in opps), default=99.0) + 0.25
                # who wins the race to the spot after the ball arrives?
                our_arr = max(our, tb)
                opp_arr = max(opp, tb)
                margin = opp_arr - our_arr
                if margin < -0.05:
                    continue
                central = 1.0 - min(1.0, abs(ey - GOAL_Y) / 12.0)
                advance = d * fx * sign
                score = 1.6 * margin + 0.045 * advance + 0.45 * central
                # prefer spots with a shooting angle afterwards
                score += 0.02 * (30.0 - min(30.0, dist((ex, ey), (gx, GOAL_Y))))
                if best is None or score > best[0]:
                    best = (score, margin, cl, (ex, ey), ang_deg(fx, fy))
        return best

    def choose_clearance(self, w, team, carrier, units, opps):
        """Pick a kick direction into open space, biased upfield."""
        sign = attack_sign(team)
        base = 0.0 if team == 0 else math.pi
        best = None
        for k in range(-5, 6):
            a = base + k * math.radians(15.0)
            fx, fy = math.cos(a), math.sin(a)
            # never clear straight toward our own goal / goal mouth
            if fx * sign < -0.25:
                continue
            if not self.kick_safe(team, (carrier.x, carrier.y), fx, fy):
                continue
            end = (carrier.x + fx * 11.0, carrier.y + fy * 11.0)
            cl = lane_clearance((carrier.x, carrier.y), end, units, carrier,
                                self.p['lane_reaction'], self.p['lane_speed'])
            # prefer forward and open, avoid the opponent goal-line corner
            fwd = fx * sign
            score = cl + 0.55 * fwd
            if best is None or score > best[0]:
                best = (score, cl, ang_deg(fx, fy), fwd)
        return best

    # ------------------------------ offense --------------------------- #
    def offense_frame(self, w, team, mine, opps, carrier):
        ball = w.ball
        mates = [u for u in mine if u is not carrier]
        units = mine + opps
        sign = attack_sign(team)
        gx = attack_x(team)
        ins = {}

        pressure = min((dist((carrier.x, carrier.y), (o.x, o.y)) for o in opps), default=9.0)
        dgoal = dist((carrier.x, carrier.y), (gx, GOAL_Y))
        can_kick = carrier.kick_cd <= 0 and carrier.control_lock <= 0
        ball_xy = (ball.x, ball.y)
        danger = ball_danger_score(ball_xy, opps)
        my_ball_d = math.hypot(carrier.x - ball.x, carrier.y - ball.y)

        shot = self.choose_shot(w, team, carrier, units)
        kick_aim = None
        do_kick = False

        press_ball = min((dist((ball.x, ball.y), (o.x, o.y)) for o in opps), default=9.0)
        if can_kick:
            need = (self.shot_threshold(shot[3] if shot else 9.0)
                    - 0.22 * self.urgency + self.p['shot_bias'])
            if shot is not None and shot[1] >= need and shot[3] > 0.7:
                do_kick = True
                kick_aim = ang_deg(gx - carrier.x, shot[2] - carrier.y)
            elif press_ball < 1.05 or pressure < 1.15 or danger > 3.0:
                passopt = self.choose_pass(w, team, carrier, mates, units, opps)
                if passopt is not None and passopt[1] > -0.05 and passopt[2] > 0.85 and passopt[0] > 0.05:
                    end = passopt[3]
                    do_kick = True
                    kick_aim = ang_deg(end[0] - carrier.x, end[1] - carrier.y)
                else:
                    thr = self.choose_through(w, team, carrier, mates, units, opps)
                    if (thr is not None and thr[1] > self.p['through_margin']
                            and thr[2] > -0.35):
                        do_kick = True
                        kick_aim = thr[4]
                    else:
                        clr = self.choose_clearance(w, team, carrier, units, opps)
                        if clr is not None and clr[1] > -0.45:
                            do_kick = True
                            kick_aim = clr[2]

        if do_kick:
            ins[carrier.index] = {'dir': 'N', 'aim': kick_aim, 'kick': True}
        else:
            target = (gx, GOAL_Y)
            d, aimv = self.move_carrier(w, team, carrier, target, mine, opps)
            ins[carrier.index] = {'dir': d, 'aim': aimv, 'kick': False}

        # --- explicit striker / safety roles
        adv = sorted(mates, key=lambda u: dist((u.x, u.y), (gx, GOAL_Y)))
        striker = adv[0] if adv else None
        safety = adv[1] if len(adv) > 1 else None
        if striker is not None:
            st = self.striker_target(w, team, carrier)
            if dist((striker.x, striker.y), (carrier.x, carrier.y)) < 1.4:
                st = (striker.x + sign * 2.5, striker.y + (2.5 if striker.y < carrier.y else -2.5))
            d, aimv = self.move_general(w, team, striker, st, mine, opps)
            ins[striker.index] = {'dir': d, 'aim': aimv, 'kick': False}
        if safety is not None:
            sf = (carrier.x - sign * (7.0 + 3.0 * max(0.0, -self.urgency)),
                  carrier.y * 0.45 + GOAL_Y * 0.55)
            sf = (min(W - 1.3, max(1.3, sf[0])), min(H - 1.5, max(1.5, sf[1])))
            if dist((safety.x, safety.y), (carrier.x, carrier.y)) < 1.4:
                sf = (carrier.x - sign * 3.0, carrier.y + (3.0 if safety.y < carrier.y else -3.0))
            d, aimv = self.move_general(w, team, safety, sf, mine, opps)
            ins[safety.index] = {'dir': d, 'aim': aimv, 'kick': False}
        return [ins[i] for i in range(3)]

    def striker_target(self, w, team, carrier):
        gx = attack_x(team)
        sign = attack_sign(team)
        dg = dist((carrier.x, carrier.y), (gx, GOAL_Y))
        if dg < 19.0:
            # far post relative to the carrier
            post_y = GOAL_Y + (3.2 if carrier.y < GOAL_Y else -3.2)
            return (gx - sign * 3.2, post_y)
        # otherwise stay ahead of the ball, wide, within passing range
        ty = carrier.y + (5.0 if carrier.y < GOAL_Y else -5.0)
        tx = carrier.x + sign * 11.0
        return (min(W - 1.5, max(1.5, tx)), min(H - 1.8, max(1.8, ty)))

    def support_points(self, w, team, carrier, opps):
        sign = attack_sign(team)
        gx = attack_x(team)
        cx, cy = carrier.x, carrier.y
        pts = []
        dxs = tuple(d + 3.0 * self.urgency for d in (5.0, 8.0, 11.0, 14.0))
        for dx in dxs:
            for dy in (-4.5, 4.5, -7.0, 7.0, 0.0):
                x = cx + sign * dx
                y = cy + dy
                if x < 1.2 or x > W - 1.2 or y < 1.5 or y > H - 1.5:
                    continue
                nearest = min((dist((x, y), (o.x, o.y)) for o in opps), default=9.0)
                if nearest < 1.8:
                    continue
                sc = nearest * 0.4 + dx * 0.08
                pts.append((sc, (x, y)))
        sx = cx - sign * (7.0 + 3.0 * max(0.0, -self.urgency))
        sy = cy * 0.55 + GOAL_Y * 0.45
        pts.append((2.0, (max(1.2, min(W - 1.2, sx)), max(1.5, min(H - 1.5, sy)))))
        pts.sort(key=lambda z: -z[0])
        return [p for _, p in pts[:6]]

    # ------------------------------ defense --------------------------- #
    def defense_frame(self, w, team, mine, opps, owner):
        ball = w.ball
        gx_own, gy_own = own_goal_center(team)
        ins = {}

        ofx, ofy = owner.facing
        pred = []
        x, y = ball.x, ball.y
        for _ in range(25):
            x += ofx * SPEED * DT
            y += ofy * SPEED * DT
            x = min(W - 0.5, max(0.5, x))
            y = min(H - 0.5, max(0.5, y))
            pred.append((x, y))

        scored = []
        for u in mine:
            t, p = intercept_time((u.x, u.y), pred)
            scored.append((t if t is not None else 999, u, p))
        scored.sort(key=lambda z: z[0])
        presser, press_t, press_p = scored[0][1], scored[0][0], scored[0][2]
        rest = [z for z in scored if z[1] is not presser]
        rest.sort(key=lambda z: dist((z[1].x, z[1].y), (gx_own, gy_own)))
        keeper = rest[0][1]
        third = rest[1][1] if len(rest) > 1 else rest[0][1]

        pt = press_p if press_t < 999 else pred[-1]
        lead = self.p['press_lead']
        if lead > 0.0 and dist((presser.x, presser.y), (ball.x, ball.y)) <= self.p['press_near']:
            dbx, dby = gx_own - ball.x, gy_own - ball.y
            dl = math.hypot(dbx, dby) or 1.0
            lead = min(lead, dl * 0.7)
            pt = (ball.x + dbx / dl * lead, ball.y + dby / dl * lead)
        d, aimv = self.move_general(w, team, presser, pt, mine, opps)
        ins[presser.index] = {'dir': d, 'aim': aimv, 'kick': False}

        dbx, dby = ball.x - gx_own, ball.y - gy_own
        dd = math.hypot(dbx, dby)
        depth = min(self.p['keeper_depth'], max(0.9, dd - 0.4))
        if dd > 1e-6:
            kt = (gx_own + dbx / dd * depth, gy_own + dby / dd * depth)
        else:
            kt = (gx_own, gy_own)
        d, aimv = self.move_general(w, team, keeper, kt, mine, opps)
        ins[keeper.index] = {'dir': d, 'aim': aimv, 'kick': False}

        bl = self.p['block_lead']
        if bl > 0.0:
            dbx, dby = gx_own - ball.x, gy_own - ball.y
            dl = math.hypot(dbx, dby) or 1.0
            bl = min(bl, dl * 0.8)
            ct = (ball.x + dbx / dl * bl, ball.y + dby / dl * bl)
        else:
            danger = None
            for o in opps:
                if o is owner:
                    continue
                sc = dist((o.x, o.y), (gx_own, gy_own))
                if danger is None or sc < danger[0]:
                    danger = (sc, o)
            if danger is not None:
                o = danger[1]
                mx, my = (o.x + gx_own) / 2.0, (o.y + gy_own) / 2.0
                mx += (ball.x - mx) * 0.12
                my += (ball.y - my) * 0.12
                ct = (mx, my)
            else:
                ct = ((ball.x + gx_own) / 2.0, (ball.y + gy_own) / 2.0)
        d, aimv = self.move_general(w, team, third, ct, mine, opps)
        ins[third.index] = {'dir': d, 'aim': aimv, 'kick': False}
        return [ins[i] for i in range(3)]

    # ------------------------------ loose ball ------------------------ #
    def loose_frame(self, w, team, mine, opps):
        ball = w.ball
        gx_own, gy_own = own_goal_center(team)
        sign = attack_sign(team)
        ins = {}

        moving = math.hypot(ball.vx, ball.vy) > 0.3
        traj = predict_free_ball(w, 80) if moving else [(ball.x, ball.y)] * 80

        scored = []
        for u in mine:
            t, p = intercept_time((u.x, u.y), traj)
            key = t if t is not None else 999.0 + dist((u.x, u.y), (ball.x, ball.y))
            scored.append((key, u, p))
        opp_scores = []
        for o in opps:
            t, p = intercept_time((o.x, o.y), traj)
            opp_scores.append((t if t is not None else 999, o, p))
        scored.sort(key=lambda z: z[0])
        prim_t, primary, prim_p = scored[0]
        opp_best = min(z[0] for z in opp_scores)
        we_win = prim_t <= opp_best + 2

        d, aimv = self.move_general(w, team, primary, prim_p, mine, opps)
        ins[primary.index] = {'dir': d, 'aim': aimv, 'kick': False}

        rest = [z for z in scored if z[1] is not primary]
        rest.sort(key=lambda z: dist((z[1].x, z[1].y), (gx_own, gy_own)))
        back = rest[0][1]
        other = rest[1][1] if len(rest) > 1 else None

        bx = gx_own + (ball.x - gx_own) * 0.35
        by = gy_own + (ball.y - gy_own) * 0.35
        d, aimv = self.move_general(w, team, back, (bx, by), mine, opps)
        ins[back.index] = {'dir': d, 'aim': aimv, 'kick': False}

        if other is not None:
            if we_win:
                tx = prim_p[0] + sign * 8.0
                ty = prim_p[1] + (5.0 if prim_p[1] < GOAL_Y else -5.0)
                tx = min(W - 1.5, max(1.5, tx))
                ty = min(H - 1.5, max(1.5, ty))
            else:
                bx2 = gx_own + (ball.x - gx_own) * 0.55
                by2 = gy_own + (ball.y - gy_own) * 0.55
                tx, ty = bx2, by2
            d, aimv = self.move_general(w, team, other, (tx, ty), mine, opps)
            ins[other.index] = {'dir': d, 'aim': aimv, 'kick': False}
        return [ins[i] for i in range(3)]

    # ------------------------------ movement -------------------------- #
    def _move_score(self, team, u, nx, ny, fx, fy, target, carrier, mine, opps):
        sc = -dist((nx, ny), target)
        if carrier:
            bxp, byp = nx + fx * DRIBBLE, ny + fy * DRIBBLE
            for o in opps:
                db = math.hypot(bxp - o.x, byp - o.y)
                if db < 0.55:
                    sc -= 500.0
                elif db < 0.85:
                    sc -= 30.0 * (0.85 - db) / 0.30 + 10.0
                elif db < 1.25:
                    sc -= 2.0 * (1.25 - db)
                du = math.hypot(nx - o.x, ny - o.y)
                if du < 0.72:
                    sc -= 60.0
                elif du < 0.92:
                    sc -= 3.0 * (0.92 - du) / 0.2
            # never dribble backwards toward own goal
            if fx * attack_sign(team) < -0.35:
                sc -= 25.0
        else:
            for o in opps:
                du = math.hypot(nx - o.x, ny - o.y)
                if du < 0.62:
                    sc -= 5.0
                elif du < 0.85:
                    sc -= 1.2 * (0.85 - du) / 0.23
        for m in mine:
            if m is u:
                continue
            dm = math.hypot(nx - m.x, ny - m.y)
            if dm < 0.9:
                sc -= (0.9 - dm) * 1.2
        sc += 0.05 * (fx if not carrier else fx) * attack_sign(team)
        return sc

    def move_carrier(self, w, team, u, target, mine, opps):
        best = None
        spd = SPEED * DT
        options = []
        for name, (dx, dy) in DIRS.items():
            options.append((name, dx, dy))
        # allow pivoting on the spot to move the ball away from pressure
        for name, (dx, dy) in DIRS.items():
            if name == 'N':
                continue
            options.append(('PIVOT_' + name, 0.0, 0.0))
        for name, dx, dy in options:
            nx, ny = simulate_move(u, dx * spd, dy * spd)
            if name.startswith('PIVOT_'):
                d2 = DIRS[name.split('_', 1)[1]]
                fl = math.hypot(d2[0], d2[1])
                fx, fy = d2[0] / fl, d2[1] / fl
                dname = 'N'
            else:
                if dx or dy:
                    fl = math.hypot(dx, dy)
                    fx, fy = dx / fl, dy / fl
                else:
                    fx, fy = u.facing
                dname = name
            sc = self._move_score(team, u, nx, ny, fx, fy, target, True, mine, opps)
            if best is None or sc > best[0]:
                best = (sc, dname, ang_deg(fx, fy))
        # stay option
        sc = self._move_score(team, u, u.x, u.y, u.facing[0], u.facing[1], target, True, mine, opps)
        if best is None or sc > best[0]:
            return 'N', ang_deg(u.facing[0], u.facing[1])
        return best[1], best[2]

    def move_general(self, w, team, u, target, mine, opps):
        best = None
        spd = SPEED * DT
        for name, (dx, dy) in DIRS.items():
            nx, ny = simulate_move(u, dx * spd, dy * spd)
            sc = self._move_score(team, u, nx, ny, 0.0, 0.0, target, False, mine, opps)
            if best is None or sc > best[0]:
                best = (sc, name)
        sc = self._move_score(team, u, u.x, u.y, 0.0, 0.0, target, False, mine, opps)
        if best is None or sc > best[0]:
            return 'N', attack_angle(team)
        # non-carriers always face the attacking direction (safe possession)
        return best[1], attack_angle(team)

    # ------------------------------ opponent model --------------------- #
    def opponent_frame(self, w, team):
        # Assume the opponent is a competent agent using the same machinery.
        # Both sides commit a whole window at once, so this is a useful prior.
        return self.frame_inputs(w, team)


if __name__ == '__main__':
    import json
    obs = json.load(open('/workspace/example.json'))
    a = Agent()
    win = a.plan_window(obs)
    print(len(win['inputs']), win['inputs'][0])
