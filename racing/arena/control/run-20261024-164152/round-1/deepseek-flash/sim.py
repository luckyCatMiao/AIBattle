"""Exact Python port of the racing physics (catalog.js + simulation.js).

Used both for the live controller's internal prediction and for offline tuning.
"""
import math

DT = 0.05
W, H = 128, 88
ROAD, GRASS, WALL = 0, 1, 2

RULES = dict(
    hz=20, accel=17.0, brake=26.0, reverseAccel=8.0,
    maxSpeed=14.0, boostMaxSpeed=23.0, boostAccel=30.0,
    drag=0.6, gripNormal=0.80, gripDrift=0.985,
    turnRate=3.2, driftTurnBoost=1.6, driftMinSpeed=4.0,
    driftChargeRate=0.55, boostDrain=0.6,
    collisionRestitution=0.55, wallRestitution=0.45,
    offRoadMax=7.0, offRoadAccel=0.35, offRoadDrag=0.94,
    carRadius=0.55, checkpointRadiusPad=0.6, checkpointCount=16,
    laps=3, matchSeconds=300,
)


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


class Track:
    def __init__(self, raw):
        self.points = [(float(p['x']), float(p['y'])) for p in raw['points']]
        self.halfWidth = float(raw['halfWidth'])
        self.length = float(raw['length'])
        self.tiles = raw['tiles']
        self.width = int(raw.get('width', W))
        self.height = int(raw.get('height', H))
        self.checkpoints = [(float(c['x']), float(c['y']), float(c['radius'])) for c in raw['checkpoints']]
        self.start = raw.get('start')
        self.grid = [(float(g['x']), float(g['y']), float(g['angle'])) for g in raw.get('grid', [])]
        self.cum = [0.0]
        n = len(self.points)
        for i in range(1, n + 1):
            a = self.points[i - 1]
            b = self.points[i % n]
            self.cum.append(self.cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        # recompute exact length from observed points (obs length is rounded)
        self.length = self.cum[-1]

    def tile_at(self, x, y):
        tx, ty = int(math.floor(x)), int(math.floor(y))
        if tx < 0 or ty < 0 or tx >= self.width or ty >= self.height:
            return WALL
        return self.tiles[ty * self.width + tx]

    def point_at(self, s):
        total = self.length
        s = s % total
        lo, hi = 0, len(self.cum) - 1
        while lo + 1 < hi:
            mid = (lo + hi) >> 1
            if self.cum[mid] <= s:
                lo = mid
            else:
                hi = mid
        a = self.points[lo]
        b = self.points[(lo + 1) % len(self.points)]
        seg = self.cum[lo + 1] - self.cum[lo] or 1.0
        t = (s - self.cum[lo]) / seg
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
                math.atan2(b[1] - a[1], b[0] - a[0]))

    def nearest(self, x, y):
        """Nearest centreline vertex (same as JS nearestOnTrack)."""
        pts = self.points
        best, bd = 0, 1e18
        for i, (px, py) in enumerate(pts):
            dx, dy = px - x, py - y
            d = dx * dx + dy * dy
            if d < bd:
                bd, best = d, i
        return best, math.sqrt(bd), self.cum[best]

    def nearest_s(self, x, y):
        """Continuous projection onto the polyline: (s, distance)."""
        pts = self.points
        n = len(pts)
        best_s, best_d = 0.0, 1e18
        for i in range(n):
            a = pts[i]
            b = pts[(i + 1) % n]
            vx, vy = b[0] - a[0], b[1] - a[1]
            l2 = vx * vx + vy * vy or 1.0
            t = ((x - a[0]) * vx + (y - a[1]) * vy) / l2
            t = 0.0 if t < 0 else (1.0 if t > 1 else t)
            px, py = a[0] + vx * t, a[1] + vy * t
            d = math.hypot(x - px, y - py)
            if d < best_d:
                best_d = d
                best_s = self.cum[i] + t * math.sqrt(l2)
        return best_s, best_d


class Car:
    __slots__ = ('x', 'y', 'angle', 'vx', 'vy', 'lap', 'nextCp', 'progress',
                 'driftCharge', 'boostEnergy', 'drifting', 'boosting', 'offRoad',
                 'finished', 'throttle', 'steer', 'drift', 'boost')

    def __init__(self, x, y, angle, vx=0.0, vy=0.0, lap=0, nextCp=1,
                 driftCharge=0.0, boostEnergy=0.0, progress=0.0, finished=False):
        self.x, self.y, self.angle = x, y, angle
        self.vx, self.vy = vx, vy
        self.lap, self.nextCp, self.progress = lap, nextCp, progress
        self.driftCharge, self.boostEnergy = driftCharge, boostEnergy
        self.drifting = self.boosting = self.offRoad = False
        self.finished = finished
        self.throttle = self.steer = 0.0
        self.drift = self.boost = False

    @classmethod
    def from_json(cls, c):
        return cls(c['x'], c['y'], c['angle'], c.get('vx', 0.0), c.get('vy', 0.0),
                   c.get('lap', 0), c.get('nextCp', 1), c.get('driftCharge', 0.0),
                   c.get('boostEnergy', 0.0), c.get('progress', 0.0), c.get('finished', False))

    def copy(self):
        c = Car(self.x, self.y, self.angle, self.vx, self.vy, self.lap, self.nextCp,
                self.driftCharge, self.boostEnergy, self.progress, self.finished)
        c.drifting, c.boosting, c.offRoad = self.drifting, self.boosting, self.offRoad
        c.throttle, c.steer, c.drift, c.boost = self.throttle, self.steer, self.drift, self.boost
        return c


def _tile_at(track, x, y):
    return track.tile_at(x, y)


def _circle_hits_wall(track, x, y, r):
    k = r * 0.7071067811865476
    pts = ((x - r, y), (x + r, y), (x, y - r), (x, y + r),
           (x - k, y - k), (x + k, y - k), (x - k, y + k), (x + k, y + k))
    return any(_tile_at(track, px, py) == WALL for px, py in pts)


def move_car(track, car, dx, dy):
    r = RULES['carRadius']
    nx = car.x + dx
    if not _circle_hits_wall(track, nx, car.y, r):
        car.x = nx
    else:
        car.vx = -car.vx * RULES['wallRestitution']
        car.vy *= 0.9
    ny = car.y + dy
    if not _circle_hits_wall(track, car.x, ny, r):
        car.y = ny
    else:
        car.vy = -car.vy * RULES['wallRestitution']
        car.vx *= 0.9
    car.x = clamp(car.x, r, W - r)
    car.y = clamp(car.y, r, H - r)


def update_car(track, car):
    """One physics frame, matching simulation.js updateCar()."""
    throttle = clamp(float(car.throttle or 0), -1, 1)
    steer = clamp(float(car.steer or 0), -1, 1)
    fx, fy = math.cos(car.angle), math.sin(car.angle)
    rx, ry = -fy, fx
    vF = car.vx * fx + car.vy * fy
    vL = car.vx * rx + car.vy * ry
    off = _tile_at(track, car.x, car.y) == GRASS
    car.offRoad = off

    wasDrifting = car.drifting
    car.drifting = bool(car.drift) and abs(vF) > RULES['driftMinSpeed'] and abs(steer) > 0.15 and not off

    if throttle > 0:
        vF += RULES['accel'] * throttle * (RULES['offRoadAccel'] if off else 1.0) * DT
    elif throttle < 0:
        if vF > 0.5:
            vF -= RULES['brake'] * DT
        else:
            vF = max(-5.0, vF - RULES['reverseAccel'] * DT)

    vF *= math.exp(-RULES['drag'] * DT)
    if off:
        vF *= RULES['offRoadDrag']

    speedAbs = abs(vF)
    if speedAbs > 0.25:
        direction = 1.0 if vF > 0 else -1.0
        gain = clamp(speedAbs / 8.0, 0, 1)
        car.angle += steer * RULES['turnRate'] * gain * (RULES['driftTurnBoost'] if car.drifting else 1.0) * direction * DT

    vL *= RULES['gripDrift'] if car.drifting else RULES['gripNormal']

    if car.drifting:
        car.driftCharge = clamp(car.driftCharge + (abs(vL) * 0.12 + speedAbs * 0.02) * RULES['driftChargeRate'] * DT, 0, 1)
    elif wasDrifting:
        if car.driftCharge > 0.02:
            car.boostEnergy = clamp(car.boostEnergy + car.driftCharge, 0, 1)
        car.driftCharge = 0.0

    wantBoost = bool(car.boost) and car.boostEnergy > 0.02
    car.boosting = wantBoost
    if wantBoost:
        vF += RULES['boostAccel'] * DT
        car.boostEnergy = max(0.0, car.boostEnergy - RULES['boostDrain'] * DT)
    cap = RULES['offRoadMax'] if off else (RULES['boostMaxSpeed'] if car.boosting else RULES['maxSpeed'])
    if vF > cap:
        vF = max(cap, vF - 18 * DT)
    if vF < -5:
        vF = -5.0

    car.vx = fx * vF + rx * vL
    car.vy = fy * vF + ry * vL
    move_car(track, car, car.vx * DT, car.vy * DT)
    if car.x <= RULES['carRadius'] + 0.01 or car.x >= W - RULES['carRadius'] - 0.01:
        car.vx *= -RULES['wallRestitution']
    if car.y <= RULES['carRadius'] + 0.01 or car.y >= H - RULES['carRadius'] - 0.01:
        car.vy *= -RULES['wallRestitution']


def update_progress(track, car):
    _near_i, _near_d, s = track.nearest(car.x, car.y)
    car.progress = car.lap * track.length + s
    if car.finished:
        return
    cx, cy, rad = track.checkpoints[car.nextCp]
    if math.hypot(car.x - cx, car.y - cy) <= rad:
        if car.nextCp == 0:
            car.lap += 1
            car.nextCp = 1
            if car.lap >= RULES['laps']:
                car.finished = True
        else:
            car.nextCp = (car.nextCp + 1) % RULES['checkpointCount']


def speed(car):
    return math.hypot(car.vx, car.vy)


def resolve_car_collision(a, b):
    r2 = RULES['carRadius'] * 2
    dx, dy = b.x - a.x, b.y - a.y
    d = math.hypot(dx, dy)
    if d >= r2 or d < 1e-6:
        return
    nx, ny = dx / d, dy / d
    overlap = r2 - d
    a.x -= nx * overlap / 2
    a.y -= ny * overlap / 2
    b.x += nx * overlap / 2
    b.y += ny * overlap / 2
    rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
    if rel < 0:
        j = -(1 + RULES['collisionRestitution']) * rel / 2
        a.vx -= j * nx
        a.vy -= j * ny
        b.vx += j * nx
        b.vy += j * ny
