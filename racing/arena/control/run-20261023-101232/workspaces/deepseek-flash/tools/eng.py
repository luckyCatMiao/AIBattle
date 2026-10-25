# -*- coding: utf-8 -*-
"""Exact Python port of the parts of simulation.js we need for single-car testing.

Only used offline for tuning; the submitted agent has its own copy of the physics.
"""
import math

DT = 1.0 / 20.0
ROAD, GRASS, WALL = 0, 1, 2

RULES = {
    "hz": 20, "decisionFrames": 20, "laps": 3, "matchSeconds": 150,
    "carRadius": 0.55, "accel": 17.0, "brake": 26.0, "reverseAccel": 8.0,
    "maxSpeed": 14.0, "boostMaxSpeed": 23.0, "boostAccel": 30.0,
    "drag": 0.6, "gripNormal": 0.80, "gripDrift": 0.985,
    "turnRate": 3.2, "driftTurnBoost": 1.6, "driftMinSpeed": 4.0,
    "driftChargeRate": 0.55, "boostDrain": 0.6,
    "collisionRestitution": 0.55, "wallRestitution": 0.45,
    "offRoadMax": 7.0, "offRoadAccel": 0.35, "offRoadDrag": 0.94,
    "checkpointCount": 12, "checkpointRadiusPad": 0.6,
}


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


class Track(object):
    def __init__(self, tr):
        self.W = tr["width"]
        self.H = tr["height"]
        self.tiles = tr["tiles"] if isinstance(tr["tiles"], str) else "".join(str(t) for t in tr["tiles"])
        self.half = tr["halfWidth"]
        self.checkpoints = tr["checkpoints"]
        self.P = [(p["x"], p["y"]) for p in tr["points"]]
        n = len(self.P)
        self.n = n
        cum = [0.0]
        for i in range(n):
            ax, ay = self.P[i]
            bx, by = self.P[(i + 1) % n]
            cum.append(cum[-1] + math.hypot(bx - ax, by - ay))
        self.cum = cum
        self.L = cum[-1]
        self.seg = []
        self.seglen = []
        for i in range(n):
            ax, ay = self.P[i]
            bx, by = self.P[(i + 1) % n]
            self.seg.append(math.atan2(by - ay, bx - ax))
            self.seglen.append(cum[i + 1] - cum[i])

    def tile(self, x, y):
        tx = int(math.floor(x))
        ty = int(math.floor(y))
        if tx < 0 or ty < 0 or tx >= self.W or ty >= self.H:
            return WALL
        return ord(self.tiles[ty * self.W + tx]) - 48 if isinstance(self.tiles, str) else self.tiles[ty * self.W + tx]

    def nearest_s(self, x, y):
        best, bi = 1e18, 0
        for i in range(self.n):
            dx = self.P[i][0] - x
            dy = self.P[i][1] - y
            d = dx * dx + dy * dy
            if d < best:
                best, bi = d, i
        return self.cum[bi]


class Car(object):
    __slots__ = ("x", "y", "angle", "vx", "vy", "driftCharge", "boostEnergy",
                 "drifting", "boosting", "offRoad", "lap", "nextCp", "progress",
                 "finished", "finishTime", "boosts", "driftTime", "collisions",
                 "lapStart", "bestLap")

    def __init__(self, x, y, angle):
        self.x = x
        self.y = y
        self.angle = angle
        self.vx = 0.0
        self.vy = 0.0
        self.driftCharge = 0.0
        self.boostEnergy = 0.0
        self.drifting = False
        self.boosting = False
        self.offRoad = False
        self.lap = 0
        self.nextCp = 1
        self.progress = 0.0
        self.finished = False
        self.finishTime = None
        self.boosts = 0
        self.driftTime = 0.0
        self.collisions = 0
        self.lapStart = 0.0
        self.bestLap = None


def circle_hits_wall(track, x, y, r):
    k = r * 0.7071067811865476
    pts = ((x - r, y), (x + r, y), (x, y - r), (x, y + r),
           (x - k, y - k), (x + k, y - k), (x - k, y + k), (x + k, y + k))
    for px, py in pts:
        if track.tile(px, py) == WALL:
            return True
    return False


def move_car(track, car, dx, dy):
    r = RULES["carRadius"]
    nx = car.x + dx
    if not circle_hits_wall(track, nx, car.y, r):
        car.x = nx
    else:
        car.vx = -car.vx * RULES["wallRestitution"]
        car.vy *= 0.9
    ny = car.y + dy
    if not circle_hits_wall(track, car.x, ny, r):
        car.y = ny
    else:
        car.vy = -car.vy * RULES["wallRestitution"]
        car.vx *= 0.9
    car.x = clamp(car.x, r, track.W - r)
    car.y = clamp(car.y, r, track.H - r)


def update_car(track, car, inp, events=None):
    """inp = dict(throttle, steer, drift, boost). Returns nothing."""
    throttle = clamp(float(inp.get("throttle", 0)), -1, 1)
    steer = clamp(float(inp.get("steer", 0)), -1, 1)
    f = (math.cos(car.angle), math.sin(car.angle))
    right = (-f[1], f[0])
    vF = car.vx * f[0] + car.vy * f[1]
    vL = car.vx * right[0] + car.vy * right[1]
    off = track.tile(car.x, car.y) == GRASS
    car.offRoad = off

    wasDrifting = car.drifting
    wasBoosting = car.boosting
    car.drifting = bool(inp.get("drift", False)) and abs(vF) > RULES["driftMinSpeed"] and abs(steer) > 0.15 and not off
    if car.drifting:
        car.driftTime += DT

    if throttle > 0:
        vF += RULES["accel"] * throttle * (RULES["offRoadAccel"] if off else 1.0) * DT
    elif throttle < 0:
        if vF > 0.5:
            vF -= RULES["brake"] * DT
        else:
            vF = max(-5.0, vF - RULES["reverseAccel"] * DT)
    vF *= math.exp(-RULES["drag"] * DT)
    if off:
        vF *= RULES["offRoadDrag"]

    sa = abs(vF)
    if sa > 0.25:
        d = 1.0 if vF > 0 else -1.0
        gain = clamp(sa / 8.0, 0.0, 1.0)
        car.angle += steer * RULES["turnRate"] * gain * (RULES["driftTurnBoost"] if car.drifting else 1.0) * d * DT

    vL *= RULES["gripDrift"] if car.drifting else RULES["gripNormal"]

    if car.drifting:
        car.driftCharge = clamp(car.driftCharge + (abs(vL) * 0.12 + sa * 0.02) * RULES["driftChargeRate"] * DT, 0, 1)
        if not wasDrifting and events is not None:
            events.append(("drift", None))
    elif wasDrifting:
        if car.driftCharge > 0.02:
            car.boostEnergy = clamp(car.boostEnergy + car.driftCharge, 0, 1)
            if events is not None:
                events.append(("charge", car.driftCharge))
        car.driftCharge = 0.0

    want = bool(inp.get("boost", False)) and car.boostEnergy > 0.02
    car.boosting = want
    if want and not wasBoosting:
        car.boosts += 1
    if want:
        if car.boostEnergy >= 0.02:
            vF += RULES["boostAccel"] * DT
            car.boostEnergy = max(0.0, car.boostEnergy - RULES["boostDrain"] * DT)
    cap = RULES["offRoadMax"] if off else (RULES["boostMaxSpeed"] if car.boosting else RULES["maxSpeed"])
    if vF > cap:
        vF = max(cap, vF - 18.0 * DT)
    if vF < -5.0:
        vF = -5.0

    car.vx = f[0] * vF + right[0] * vL
    car.vy = f[1] * vF + right[1] * vL
    move_car(track, car, car.vx * DT, car.vy * DT)
    r = RULES["carRadius"]
    if car.x <= r + 0.01 or car.x >= track.W - r - 0.01:
        car.vx *= -RULES["wallRestitution"]
    if car.y <= r + 0.01 or car.y >= track.H - r - 0.01:
        car.vy *= -RULES["wallRestitution"]


def update_progress(track, car, t, laps=3):
    s = track.nearest_s(car.x, car.y)
    car.progress = car.lap * track.L + s
    if car.finished:
        return None
    cp = track.checkpoints[car.nextCp]
    if math.hypot(car.x - cp["x"], car.y - cp["y"]) <= cp["radius"]:
        if car.nextCp == 0:
            lapTime = t - car.lapStart
            if car.bestLap is None or lapTime < car.bestLap:
                car.bestLap = lapTime
            car.lapStart = t
            car.lap += 1
            car.nextCp = 1
            out = ("lap", car.lap, lapTime)
            if car.lap >= laps and not car.finished:
                car.finished = True
                car.finishTime = t
            return out
        else:
            car.nextCp = (car.nextCp + 1) % 12
    return None
