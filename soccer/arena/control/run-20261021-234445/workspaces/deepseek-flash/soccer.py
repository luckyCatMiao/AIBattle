"""Faithful Python port of the public simulation.js rules (no practice AI).

Used by agent.py as an internal forward model and for offline self-play tests.
All constants are taken from the observation (map/rules) at parse time so the
agent adapts to the actual server values.
"""
import math

SQ = math.sqrt(0.5)
DIRS = {
    'N': (0.0, 0.0), 'U': (0.0, -1.0), 'D': (0.0, 1.0), 'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-SQ, -SQ), 'UR': (SQ, -SQ), 'DL': (-SQ, SQ), 'DR': (SQ, SQ),
}
DIR_KEYS = list(DIRS.keys())


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


def norm(x, y):
    l = math.hypot(x, y) or 1.0
    return x / l, y / l


def aim_vector(aim):
    if isinstance(aim, (int, float)) and math.isfinite(aim):
        a = aim * math.pi / 180.0
        return math.cos(a), math.sin(a)
    if isinstance(aim, str) and aim in DIRS and aim != 'N':
        return DIRS[aim]
    return None


class World:
    """Mutable match state. units: list of dicts in canonical order (team0 then team1)."""

    def __init__(self, W, H, tiles, rules, pen, goals, team_size):
        self.W = W
        self.H = H
        self.tiles = tiles
        self.rules = rules
        self.pen = pen
        self.goals = goals
        self.teamSize = team_size
        self.units = []
        self.ball = {'x': W / 2.0, 'y': H / 2.0, 'vx': 0.0, 'vy': 0.0,
                     'owner': None, 'lastTouch': None, 'lastTeam': None}
        self.freeze = 0
        self.frame = 0
        self.status = 'playing'
        self.score = [0, 0]
        self.kickoffTeam = 0
        self.golden = False
        self.goldenEnd = 0
        self.half = 1
        self.events = []
        self.gt = int(rules['goalTop'])
        self.gb = int(rules['goalBottom'])

    # ---------- geometry ----------
    def tile_at(self, x, y):
        tx = int(math.floor(x))
        ty = int(math.floor(y))
        if tx < 0 or ty < 0 or tx >= self.W or ty >= self.H:
            return 1
        return self.tiles[ty * self.W + tx]

    def circle_hits_wall(self, x, y, r):
        # Fast path: the field is empty except for the 1-tile border, so a
        # circle strictly inside the interior can never hit a wall.
        W = self.W
        H = self.H
        if (x - r >= 1.0 and x + r < W - 1.0 and
                y - r >= 1.0 and y + r < H - 1.0):
            return False
        gt = self.gt
        gb = self.gb
        k = r * SQ
        for px, py in ((x - r, y), (x + r, y), (x, y - r), (x, y + r),
                       (x - k, y - k), (x + k, y - k), (x - k, y + k), (x + k, y + k)):
            tx = int(math.floor(px))
            ty = int(math.floor(py))
            if tx < 0 or ty < 0 or tx >= W or ty >= H:
                return True
            if tx == 0 or tx == W - 1:
                if not (gt <= ty < gb):
                    return True
            elif ty == 0 or ty == H - 1:
                return True
        return False

    def in_pen(self, team, x, y):
        b = self.pen.get(str(team)) if isinstance(self.pen, dict) else None
        if b is None:
            b = self.pen[team]
        return b['x1'] <= x <= b['x2'] and b['y1'] <= y <= b['y2']

    def in_goal_mouth(self, x, y):
        gt = self.rules['goalTop']
        gb = self.rules['goalBottom']
        return gt + 0.5 <= y <= gb - 0.5

    def goal_x_team0(self):
        # team 0 defends left, scores at x >= W-1
        return self.W - 1.0

    # ---------- units ----------
    def add_unit(self, team, index, uid, keeper=False):
        u = {'id': uid, 'team': team, 'index': index, 'x': 0.0, 'y': 0.0,
             'fx': 1.0 if team == 0 else -1.0, 'fy': 0.0,
             'held': {'dir': 'N', 'aim': None, 'kick': False},
             'kickCd': 0, 'controlLock': 0, 'stealLock': 0, 'foulLock': 0}
        self.units.append(u)
        return u

    def unit_by_id(self, uid):
        for u in self.units:
            if u['id'] == uid:
                return u
        return None

    def move_unit(self, u, dx, dy):
        r = self.rules['unitRadius']
        nx = u['x'] + dx
        if not self.circle_hits_wall(nx, u['y'], r):
            u['x'] = nx
        else:
            slide = (1.0 if dx > 0 else -1.0) * r * 0.5 if dx != 0 else 0.0
            if slide and not self.circle_hits_wall(u['x'] + slide, u['y'], r):
                u['x'] += slide
        ny = u['y'] + dy
        if not self.circle_hits_wall(u['x'], ny, r):
            u['y'] = ny
        else:
            slide = (1.0 if dy > 0 else -1.0) * r * 0.5 if dy != 0 else 0.0
            if slide and not self.circle_hits_wall(u['x'], u['y'] + slide, r):
                u['y'] += slide
        u['x'] = clamp(u['x'], r, self.W - r)
        u['y'] = clamp(u['y'], r, self.H - r)

    def separate_units(self):
        r2 = self.rules['unitRadius'] * 2
        us = self.units
        for i in range(len(us)):
            a = us[i]
            for j in range(i + 1, len(us)):
                b = us[j]
                ddx = b['x'] - a['x']
                ddy = b['y'] - a['y']
                d = math.hypot(ddx, ddy)
                if d >= r2 or d < 1e-6:
                    continue
                push = (r2 - d) / 2.0
                ddx /= d
                ddy /= d
                ax = a['x'] - ddx * push
                ay = a['y'] - ddy * push
                bx = b['x'] + ddx * push
                by = b['y'] + ddy * push
                ur = self.rules['unitRadius']
                if not self.circle_hits_wall(ax, ay, ur):
                    a['x'] = ax
                    a['y'] = ay
                if not self.circle_hits_wall(bx, by, ur):
                    b['x'] = bx
                    b['y'] = by

    def update_unit(self, u):
        if u['kickCd'] > 0:
            u['kickCd'] -= 1
        if u['controlLock'] > 0:
            u['controlLock'] -= 1
        if u['stealLock'] > 0:
            u['stealLock'] -= 1
        if u['foulLock'] > 0:
            u['foulLock'] -= 1

        inp = u['held'] or {}
        dv = DIRS.get(inp.get('dir') or 'N', DIRS['N'])
        av = aim_vector(inp.get('aim'))
        if av is not None:
            u['fx'], u['fy'] = av
        elif dv[0] or dv[1]:
            u['fx'], u['fy'] = dv

        carrying = self.ball['owner'] == u['id']
        speed = self.rules['moveSpeed'] * (self.rules['dribbleSpeedFactor'] if carrying else 1.0)
        if u['foulLock'] <= 0 and (dv[0] or dv[1]):
            self.move_unit(u, dv[0] * speed * 0.05, dv[1] * speed * 0.05)

        if (u['foulLock'] <= 0 and inp.get('kick') and self.ball['owner'] == u['id']
                and u['kickCd'] <= 0 and u['controlLock'] <= 0):
            self.kick_ball(u)

    def kick_ball(self, u):
        b = self.ball
        fx, fy = norm(u['fx'], u['fy'])
        off = self.rules['unitRadius'] + self.rules['ballRadius'] + 0.03
        b['owner'] = None
        b['x'] = u['x'] + fx * off
        b['y'] = u['y'] + fy * off
        if self.circle_hits_wall(b['x'], b['y'], self.rules['ballRadius']):
            b['x'] = u['x']
            b['y'] = u['y']
        b['vx'] = fx * self.rules['kickPower']
        b['vy'] = fy * self.rules['kickPower']
        b['lastTouch'] = u['id']
        b['lastTeam'] = u['team']
        self._emit('kick', unit=u['id'], team=u['team'], x=round(b['x'], 2), y=round(b['y'], 2),
                   vx=round(b['vx'], 2), vy=round(b['vy'], 2))
        u['kickCd'] = int(round(self.rules['kickCooldown'] * self.rules['hz']))
        u['controlLock'] = int(round(self.rules['controlLock'] * self.rules['hz']))

    # ---------- ball ----------
    def nearest_eligible(self, x, y, flt=None):
        best = None
        bd = float('inf')
        for u in self.units:
            if flt is not None and not flt(u):
                continue
            d = math.hypot(u['x'] - x, u['y'] - y)
            if d < bd:
                bd = d
                best = u
        return best, bd

    def try_possession(self):
        b = self.ball
        if b['owner']:
            owner = self.unit_by_id(b['owner'])
            if owner is None:
                b['owner'] = None
                return
            ownerD = math.hypot(owner['x'] - b['x'], owner['y'] - b['y'])
            thief, d = self.nearest_eligible(
                b['x'], b['y'],
                lambda u: u['team'] != owner['team'] and u['stealLock'] <= 0 and u['controlLock'] <= 0)
            if thief is not None and d < self.rules['controlRadius'] and d + self.rules['tackleMargin'] < ownerD:
                self._emit('tackle', unit=thief['id'], team=thief['team'], frm=owner['id'])
                b['owner'] = thief['id']
                b['lastTouch'] = thief['id']
                b['lastTeam'] = thief['team']
                owner['stealLock'] = int(round(self.rules['stealLock'] * self.rules['hz']))
            return

        speed = math.hypot(b['vx'], b['vy'])
        if speed >= self.rules['keeperMinSpeed']:
            keeper = None
            kd = float('inf')
            for u in self.units:
                if u['index'] != 0 or u['controlLock'] > 0 or u['stealLock'] > 0:
                    continue
                if not self.in_pen(u['team'], b['x'], b['y']) or not self.in_pen(u['team'], u['x'], u['y']):
                    continue
                d = math.hypot(u['x'] - b['x'], u['y'] - b['y'])
                if d < self.rules['keeperRadius'] and d < kd:
                    keeper = u
                    kd = d
            if keeper is not None:
                self._emit('save', unit=keeper['id'], team=keeper['team'])
                b['owner'] = keeper['id']
                b['lastTouch'] = keeper['id']
                b['lastTeam'] = keeper['team']
                b['vx'] = 0.0
                b['vy'] = 0.0
                return

        u, d = self.nearest_eligible(
            b['x'], b['y'], lambda u: u['controlLock'] <= 0 and u['stealLock'] <= 0)
        winner = u
        if u is not None:
            preferred = None
            for x in self.units:
                if (x['team'] == self.kickoffTeam and x['controlLock'] <= 0 and x['stealLock'] <= 0
                        and math.hypot(x['x'] - b['x'], x['y'] - b['y']) <= d + 0.06):
                    preferred = x
                    break
            if preferred is not None:
                winner = preferred
        if winner is not None and math.hypot(winner['x'] - b['x'], winner['y'] - b['y']) < self.rules['controlRadius']:
            b['owner'] = winner['id']
            b['lastTouch'] = winner['id']
            b['lastTeam'] = winner['team']
            b['vx'] = 0.0
            b['vy'] = 0.0

    def _emit(self, typ, **kw):
        self.events.append(dict(type=typ, frame=self.frame, **kw))

    def _goal(self, team):
        self.score[team] += 1
        self._emit('goal', team=team, score=list(self.score))
        if self.golden:
            self.status = 'finished'
            return
        # server: kickoff(..., 1 - scoring_team), freeze 12
        self.kickoff(1 - team)

    def kickoff(self, new_kickoff_team):
        # reset all units to spawns (spawns stored in self.spawns)
        sp = self.spawns
        if isinstance(sp, dict) and any(isinstance(k, str) for k in sp):
            sp = {int(k): v for k, v in sp.items()}
            self.spawns = sp
        for u in self.units:
            sx, sy = sp[u['team']][u['index']]
            u['x'] = sx + 0.5
            u['y'] = sy + 0.5
            u['fx'] = 1.0 if u['team'] == 0 else -1.0
            u['fy'] = 0.0
            u['held'] = {'dir': 'N', 'aim': None, 'kick': False}
            u['kickCd'] = 0
            u['controlLock'] = 0
            u['stealLock'] = 0
            u['foulLock'] = 0
        self.ball.update({'x': self.W / 2.0, 'y': self.H / 2.0, 'vx': 0.0, 'vy': 0.0,
                          'owner': None, 'lastTouch': None, 'lastTeam': None})
        self.freeze = int(round(self.rules['kickoffFreeze'] * self.rules['hz']))
        self.kickoffTeam = new_kickoff_team
        self._emit('kickoff', team=new_kickoff_team)

    def update_ball(self):
        b = self.ball
        if b['owner']:
            u = self.unit_by_id(b['owner'])
            if u is None:
                b['owner'] = None
                return
            off = self.rules['dribbleDistance']
            b['x'] = u['x'] + u['fx'] * off
            b['y'] = u['y'] + u['fy'] * off
            if self.circle_hits_wall(b['x'], b['y'], self.rules['ballRadius']):
                b['x'] = u['x']
                b['y'] = u['y']
            b['vx'] = 0.0
            b['vy'] = 0.0
            self.try_possession()
            return

        steps = 4
        dt = 0.05
        br = self.rules['ballRadius']
        refl = self.rules['wallRestitution']
        W = self.W
        for _ in range(steps):
            b['x'] += b['vx'] * dt / steps
            b['y'] += b['vy'] * dt / steps

            if self.in_goal_mouth(b['x'], b['y']):
                if b['x'] <= 1.0:
                    self._goal(1)
                    return
                if b['x'] >= W - 1.0:
                    self._goal(0)
                    return

            if self.circle_hits_wall(b['x'], b['y'], br):
                px = b['x'] - b['vx'] * dt / steps
                py = b['y'] - b['vy'] * dt / steps
                if self.circle_hits_wall(b['x'], py, br):
                    b['x'] = px
                    b['vx'] = -b['vx'] * refl
                if self.circle_hits_wall(px, b['y'], br):
                    b['y'] = py
                    b['vy'] = -b['vy'] * refl
                if self.circle_hits_wall(b['x'], b['y'], br):
                    b['x'] = px
                    b['y'] = py
                    b['vx'] = -b['vx'] * refl
                    b['vy'] = -b['vy'] * refl

        b['vx'] *= self.rules['ballFriction']
        b['vy'] *= self.rules['ballFriction']
        if math.hypot(b['vx'], b['vy']) < 0.02:
            b['vx'] = 0.0
            b['vy'] = 0.0
        self.try_possession()

    def check_fouls(self):
        for u in self.units:
            if u['foulLock'] > 0:
                continue
            if self.in_pen(1 - u['team'], u['x'], u['y']):
                self.commit_foul(u, 1 - u['team'])
                return True
        return False

    def commit_foul(self, u, box_team):
        box = self.pen[str(box_team)] if isinstance(self.pen, dict) else self.pen[box_team]
        margin = 0.9
        cy = clamp(u['y'], box['y1'], box['y2'])
        cx = clamp(u['x'], box['x1'], box['x2'])
        cands = []
        if box['x1'] > 1:
            cands.append((box['x1'] - margin, cy))
        if box['x2'] < self.W - 1:
            cands.append((box['x2'] + margin, cy))
        cands.append((cx, box['y1'] - margin))
        cands.append((cx, box['y2'] + margin))
        best = cands[0]
        bd = float('inf')
        for c in cands:
            d = math.hypot(c[0] - u['x'], c[1] - u['y'])
            if d < bd:
                bd = d
                best = c
        ur = self.rules['unitRadius']
        spot = (clamp(best[0], ur, self.W - ur), clamp(best[1], ur, self.H - ur))
        bcx = (box['x1'] + box['x2']) / 2.0
        bcy = (box['y1'] + box['y2']) / 2.0
        dx = spot[0] - bcx
        dy = spot[1] - bcy
        l = math.hypot(dx, dy) or 1.0
        u['x'] = clamp(spot[0] + dx / l * 1.3, ur, self.W - ur)
        u['y'] = clamp(spot[1] + dy / l * 1.3, ur, self.H - ur)
        u['foulLock'] = int(round(self.rules['foulLock'] * self.rules['hz']))
        u['stealLock'] = max(u['stealLock'], u['foulLock'])
        u['kickCd'] = max(u['kickCd'], u['foulLock'])
        b = self.ball
        b['owner'] = None
        b['x'] = spot[0]
        b['y'] = spot[1]
        b['vx'] = 0.0
        b['vy'] = 0.0
        b['lastTouch'] = None
        b['lastTeam'] = None
        self.freeze = max(self.freeze, int(round(self.rules['foulFreeze'] * self.rules['hz'])))
        self._emit('foul', unit=u['id'], team=u['team'], box=box_team)

    def clone(self):
        w = World.__new__(World)
        w.__dict__.update(self.__dict__)
        w.units = [dict(u) for u in self.units]
        for u in w.units:
            u['held'] = dict(u['held'])
        w.ball = dict(self.ball)
        w.score = list(self.score)
        w.events = []
        return w

    def step(self, inputs_by_unit=None):
        """One physics frame. inputs_by_unit: dict uid -> {'dir','aim','kick'} (already chosen)."""
        if self.status != 'playing':
            return
        self.frame += 1
        if inputs_by_unit:
            for u in self.units:
                d = inputs_by_unit.get(u['id'])
                if d is not None:
                    u['held'] = d
        if self.freeze > 0:
            self.freeze -= 1
            self.check_clock()
            return
        for u in self.units:
            self.update_unit(u)
        self.separate_units()
        if self.check_fouls():
            self.check_clock()
            return
        self.update_ball()
        self.check_clock()

    def check_clock(self):
        if self.status != 'playing':
            return
        hz = self.rules['hz']
        half_frames = int(round(self.rules['halfSeconds'] * hz))
        match_frames = int(round(self.rules['matchSeconds'] * hz))
        if not self.golden:
            if self.half == 1 and self.frame >= half_frames:
                self.half = 2
                self._emit('half')
                self.kickoff(1 - self.kickoffTeam)  # half kickoff: new kickoff team = 1 - old
            if self.frame >= match_frames:
                if self.score[0] == self.score[1]:
                    self.golden = True
                    self.goldenEnd = self.frame + int(round(self.rules['goldenGoalSeconds'] * hz))
                else:
                    self.status = 'finished'
                    self._emit('end', winner=0 if self.score[0] > self.score[1] else 1)
        elif self.frame >= self.goldenEnd:
            self.status = 'finished'
            self._emit('end', winner=None)


def world_from_obs(obs):
    """Build a World from a real observation dict."""
    m = obs['map']
    W = int(m['width'])
    H = int(m['height'])
    tiles = list(m['tiles'])
    rules = obs['rules']
    pen = m['penaltyBoxes']
    goals = m['goals']
    n = int(obs['teamSize'])
    w = World(W, H, tiles, rules, pen, goals, n)
    w.spawns = {int(k): v for k, v in m['spawns'].items()}
    w.frame = int(obs.get('frame') or 0)
    w.half = int(obs.get('half') or 1)
    w.score = list(obs.get('score') or [0, 0])
    w.golden = bool(obs.get('golden'))
    w.goldenEnd = w.frame + int(round(float(obs.get('goldenLeft') or 0) * rules['hz']))
    w.status = obs.get('status') or 'playing'
    w.freeze = int(round(float(obs.get('freeze') or 0) * rules['hz']))
    b = obs['ball']
    w.ball = {'x': float(b['x']), 'y': float(b['y']), 'vx': float(b['vx']), 'vy': float(b['vy']),
              'owner': b.get('owner'), 'lastTouch': b.get('lastTouch'), 'lastTeam': b.get('lastTeam')}
    # units: observation order is canonical (team0 then team1); keep it
    for u in obs['units']:
        uu = {'id': u['id'], 'team': int(u['team']), 'index': int(u['index']),
              'x': float(u['x']), 'y': float(u['y']),
              'fx': float(u['facing']['x']), 'fy': float(u['facing']['y']),
              'held': {'dir': 'N', 'aim': None, 'kick': False},
              'kickCd': int(round(float(u.get('kickCd') or 0) * rules['hz'])),
              'controlLock': int(round(float(u.get('controlLock') or 0) * rules['hz'])),
              'stealLock': 0, 'foulLock': 0}
        w.units.append(uu)
    # kickoff team heuristic: not exposed directly; infer from spawn/seed parity like server
    seed = obs.get('seed')
    w.kickoffTeam = (abs(int(seed)) % 2) if seed is not None else 0
    return w
