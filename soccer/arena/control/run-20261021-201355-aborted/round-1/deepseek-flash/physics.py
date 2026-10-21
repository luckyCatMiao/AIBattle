"""Faithful Python port of /workspace/simulation.js (physics + rules).

Used for offline self-testing and for the agent's internal forward model.
Coordinates: x in [0,44), y in [0,26).  Team 0 defends the left goal (x=0)
and attacks the right goal (x=43); team 1 is the mirror.
"""
import math

W, H = 44, 26
DT = 1.0 / 20.0

RULES = dict(
    hz=20, decisionFrames=20, width=W, height=H, teamSize=3,
    unitRadius=0.34, moveSpeed=3.15, ballRadius=0.22,
    controlRadius=0.82, tackleMargin=0.12, dribbleDistance=0.62,
    kickPower=14.0, kickCooldown=0.35, controlLock=0.30, stealLock=0.18,
    ballFriction=0.97, wallRestitution=0.72,
    matchSeconds=120, halfSeconds=60, goldenGoalSeconds=20,
    kickoffFreeze=0.6, goalTop=10, goalBottom=16, goalDepth=0.55,
)

DIRS = {
    'N': (0.0, 0.0), 'U': (0.0, -1.0), 'D': (0.0, 1.0),
    'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-math.sqrt(0.5), -math.sqrt(0.5)), 'UR': (math.sqrt(0.5), -math.sqrt(0.5)),
    'DL': (-math.sqrt(0.5), math.sqrt(0.5)), 'DR': (math.sqrt(0.5), math.sqrt(0.5)),
}
DIR_KEYS = list(DIRS.keys())

SPAWNS = {0: [(7, 7), (7, 13), (7, 19)], 1: [(W - 8, 7), (W - 8, 13), (W - 8, 19)]}
BALL_SPAWN = (W / 2.0, H / 2.0)

UNIT_R = RULES['unitRadius']
BALL_R = RULES['ballRadius']

def js_round(v):
    """JavaScript Math.round semantics (round half up)."""
    return math.floor(v + 0.5)

def clamp(v, a, b):
    return a if v < a else (b if v > b else v)

def tile_at(x, y):
    tx, ty = math.floor(x), math.floor(y)
    if tx < 0 or ty < 0 or tx >= W or ty >= H:
        return 1
    if (tx == 0 or tx == W - 1) and RULES['goalTop'] <= ty < RULES['goalBottom']:
        return 0
    if tx == 0 or ty == 0 or tx == W - 1 or ty == H - 1:
        return 1
    return 0

def circle_hits_wall(x, y, r):
    k = r * math.sqrt(0.5)
    pts = ((x - r, y), (x + r, y), (x, y - r), (x, y + r),
           (x - k, y - k), (x + k, y - k), (x - k, y + k), (x + k, y + k))
    for px, py in pts:
        if tile_at(px, py) == 1:
            return True
    return False

def ball_hits_wall(x, y):
    return circle_hits_wall(x, y, BALL_R)

def in_goal_mouth(x, y):
    return RULES['goalTop'] + 0.5 <= y <= RULES['goalBottom'] - 0.5

def aim_vector(aim):
    if isinstance(aim, (int, float)) and not isinstance(aim, bool) and math.isfinite(aim):
        a = float(aim) * math.pi / 180.0
        return (math.cos(a), math.sin(a))
    if isinstance(aim, str) and aim in DIRS and aim != 'N':
        return DIRS[aim]
    return None

def norm(x, y):
    l = math.hypot(x, y) or 1.0
    return (x / l, y / l)


class Unit:
    __slots__ = ('id', 'team', 'index', 'x', 'y', 'facing', 'held',
                 'kick_cd', 'control_lock', 'steal_lock', 'goals', 'kicks', 'touches')

    def __init__(self, team, index):
        self.id = 't%du%d' % (team, index)
        self.team = team
        self.index = index
        self.x = 0.0
        self.y = 0.0
        self.facing = (1.0 if team == 0 else -1.0, 0.0)
        self.held = {'dir': 'N', 'aim': None, 'kick': False}
        self.kick_cd = 0
        self.control_lock = 0
        self.steal_lock = 0
        self.goals = 0
        self.kicks = 0
        self.touches = 0

    def reset(self):
        tx, ty = SPAWNS[self.team][self.index]
        self.x = tx + 0.5
        self.y = ty + 0.5
        self.facing = (1.0 if self.team == 0 else -1.0, 0.0)
        self.held = {'dir': 'N', 'aim': None, 'kick': False}
        self.kick_cd = 0
        self.control_lock = 0
        self.steal_lock = 0


class Ball:
    __slots__ = ('x', 'y', 'vx', 'vy', 'owner', 'last_touch', 'last_team')

    def __init__(self):
        self.x = BALL_SPAWN[0]
        self.y = BALL_SPAWN[1]
        self.vx = 0.0
        self.vy = 0.0
        self.owner = None
        self.last_touch = None
        self.last_team = None


class World:
    """Deterministic 3v3 match state (no rendering, no events)."""

    def __init__(self):
        self.frame = 0
        self.half = 1
        self.score = [0, 0]
        self.golden = False
        self.golden_end = 0
        self.freeze = 0
        self.status = 'playing'
        self.units = [Unit(t, i) for t in range(2) for i in range(3)]
        self.ball = Ball()
        self.events = []
        self.kickoff(12)
        self.freeze = 0  # fresh match starts live (server does the same: freeze=0)

    # ---- helpers ----
    def unit(self, uid):
        for u in self.units:
            if u.id == uid:
                return u
        return None

    def kickoff(self, freeze_frames=12):
        for u in self.units:
            u.reset()
        self.ball = Ball()
        self.freeze = max(0, freeze_frames)
        if self.frame == 0:
            self.freeze = 0

    def _goal(self, team):
        self.score[team] += 1
        self.events.append((self.frame, 'goal', team, self.ball.last_touch, self.ball.last_team))
        if self.golden:
            self.status = 'finished'
            return
        self.kickoff(12)

    def _move_unit(self, u, dx, dy):
        r = UNIT_R
        nx = u.x + dx
        if not circle_hits_wall(nx, u.y, r):
            u.x = nx
        else:
            slide = (1.0 if dx > 0 else -1.0) * r * 0.5
            if not circle_hits_wall(u.x + slide, u.y, r):
                u.x += slide
        ny = u.y + dy
        if not circle_hits_wall(u.x, ny, r):
            u.y = ny
        else:
            slide = (1.0 if dy > 0 else -1.0) * r * 0.5
            if not circle_hits_wall(u.x, u.y + slide, r):
                u.y += slide
        u.x = clamp(u.x, r, W - r)
        u.y = clamp(u.y, r, H - r)

    def _separate(self):
        r2 = UNIT_R * 2.0
        us = self.units
        for i in range(len(us)):
            for j in range(i + 1, len(us)):
                a, b = us[i], us[j]
                dx = b.x - a.x
                dy = b.y - a.y
                d = math.hypot(dx, dy)
                if d >= r2 or d < 1e-6:
                    continue
                push = (r2 - d) / 2.0
                dx /= d
                dy /= d
                ax, ay = a.x - dx * push, a.y - dy * push
                bx, by = b.x + dx * push, b.y + dy * push
                if not circle_hits_wall(ax, ay, UNIT_R):
                    a.x, a.y = ax, ay
                if not circle_hits_wall(bx, by, UNIT_R):
                    b.x, b.y = bx, by

    def _kick(self, u):
        b = self.ball
        f = norm(*u.facing)
        off = UNIT_R + BALL_R + 0.03
        b.owner = None
        b.x = u.x + f[0] * off
        b.y = u.y + f[1] * off
        if ball_hits_wall(b.x, b.y):
            b.x, b.y = u.x, u.y
        b.vx = f[0] * RULES['kickPower']
        b.vy = f[1] * RULES['kickPower']
        b.last_touch = u.id
        b.last_team = u.team
        u.kick_cd = js_round(RULES['kickCooldown'] * RULES['hz'])
        u.control_lock = js_round(RULES['controlLock'] * RULES['hz'])
        u.kicks += 1
        self.events.append((self.frame, 'kick', u.id, round(u.x, 2), round(u.y, 2),
                            round(math.degrees(math.atan2(f[1], f[0])) % 360, 1)))

    def _update_unit(self, u):
        if u.kick_cd > 0:
            u.kick_cd -= 1
        if u.control_lock > 0:
            u.control_lock -= 1
        if u.steal_lock > 0:
            u.steal_lock -= 1
        inp = u.held or {}
        d = DIRS.get(inp.get('dir') or 'N', DIRS['N'])
        av = aim_vector(inp.get('aim'))
        if av is not None:
            u.facing = av
        elif d[0] or d[1]:
            u.facing = d
        if d[0] or d[1]:
            self._move_unit(u, d[0] * RULES['moveSpeed'] * DT, d[1] * RULES['moveSpeed'] * DT)
        if inp.get('kick') and self.ball.owner == u.id and u.kick_cd <= 0 and u.control_lock <= 0:
            self._kick(u)

    def _nearest_eligible(self, x, y, filter_fn):
        best, best_d = None, float('inf')
        for u in self.units:
            if filter_fn is not None and not filter_fn(u):
                continue
            d = math.hypot(u.x - x, u.y - y)
            if d < best_d:
                best_d, best = d, u
        return best, best_d

    def _try_possession(self):
        b = self.ball
        if b.owner:
            owner = self.unit(b.owner)
            if owner is None:
                b.owner = None
                return
            owner_d = math.hypot(owner.x - b.x, owner.y - b.y)
            thief, d = self._nearest_eligible(
                b.x, b.y,
                lambda u: u.team != owner.team and u.steal_lock <= 0 and u.control_lock <= 0)
            if thief is not None and d < RULES['controlRadius'] and d + RULES['tackleMargin'] < owner_d:
                b.owner = thief.id
                b.last_touch = thief.id
                b.last_team = thief.team
                thief.touches += 1
                owner.steal_lock = js_round(RULES['stealLock'] * RULES['hz'])
                self.events.append((self.frame, 'tackle', thief.id, owner.id))
            return
        u, d = self._nearest_eligible(
            b.x, b.y, lambda u: u.control_lock <= 0 and u.steal_lock <= 0)
        if u is not None and d < RULES['controlRadius']:
            b.owner = u.id
            b.last_touch = u.id
            b.last_team = u.team
            u.touches += 1
            b.vx = 0.0
            b.vy = 0.0

    def _update_ball(self):
        b = self.ball
        if b.owner:
            u = self.unit(b.owner)
            if u is None:
                b.owner = None
                return
            off = RULES['dribbleDistance']
            b.x = u.x + u.facing[0] * off
            b.y = u.y + u.facing[1] * off
            if ball_hits_wall(b.x, b.y):
                b.x, b.y = u.x, u.y
            b.vx = 0.0
            b.vy = 0.0
            self._try_possession()
            return
        steps = 4
        for _ in range(steps):
            b.x += b.vx * DT / steps
            b.y += b.vy * DT / steps
            if in_goal_mouth(b.x, b.y):
                if b.x <= 1.0:
                    self._goal(1)
                    return
                if b.x >= W - 1.0:
                    self._goal(0)
                    return
            if ball_hits_wall(b.x, b.y):
                px = b.x - b.vx * DT / steps
                py = b.y - b.vy * DT / steps
                if ball_hits_wall(b.x, py):
                    b.x = px
                    b.vx = -b.vx * RULES['wallRestitution']
                if ball_hits_wall(px, b.y):
                    b.y = py
                    b.vy = -b.vy * RULES['wallRestitution']
                if ball_hits_wall(b.x, b.y):
                    b.x, b.y = px, py
                    b.vx = -b.vx * RULES['wallRestitution']
                    b.vy = -b.vy * RULES['wallRestitution']
        b.vx *= RULES['ballFriction']
        b.vy *= RULES['ballFriction']
        if math.hypot(b.vx, b.vy) < 0.02:
            b.vx = 0.0
            b.vy = 0.0
        self._try_possession()

    def _check_clock(self):
        if self.status != 'playing':
            return
        half_frames = js_round(RULES['halfSeconds'] * RULES['hz'])
        match_frames = js_round(RULES['matchSeconds'] * RULES['hz'])
        if not self.golden:
            if self.half == 1 and self.frame >= half_frames:
                self.half = 2
                self.kickoff(12)
            if self.frame >= match_frames:
                if self.score[0] == self.score[1]:
                    self.golden = True
                    self.golden_end = self.frame + js_round(RULES['goldenGoalSeconds'] * RULES['hz'])
                else:
                    self.status = 'finished'
        elif self.frame >= self.golden_end:
            self.status = 'finished'

    def step(self, held_inputs):
        """held_inputs: dict team -> list of 3 input dicts for this frame."""
        if self.status != 'playing':
            return
        self.frame += 1
        if self.freeze > 0:
            self.freeze -= 1
            self._check_clock()
            return
        for u in self.units:
            u.held = (held_inputs.get(u.team) or [None, None, None])[u.index] or {'dir': 'N'}
        for u in self.units:
            self._update_unit(u)
        self._separate()
        self._update_ball()
        self._check_clock()


if __name__ == '__main__':
    w = World()
    w.step({0: [{'dir': 'R', 'aim': 0, 'kick': False}] * 3,
            1: [{'dir': 'L', 'aim': 180, 'kick': False}] * 3})
    print(w.frame, [(round(u.x, 2), round(u.y, 2)) for u in w.units], w.ball.x, w.ball.y)
