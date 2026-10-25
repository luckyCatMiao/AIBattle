"""Racing agent: reads observations on stdin, writes 20-frame input windows.

Strategy: geometric racing line + curvature-limited speed profile.
 - on straights: drift-wiggle to charge boost energy, boost whenever available
 - in corners: grip cornering at the physical limit (drift cornering is unstable)
The 20-frame window is produced by simulating our own car with the exact physics
and re-planning at every internal frame (receding horizon), so within a window the
controller is still closed-loop on the predicted state.
"""
import json
import math
import sys

sys.dont_write_bytecode = True

import sim
from planner import Line, wrap
from controller import Controller

import os
AVOID = os.environ.get('NOAVOID', '') == ''

PARAMS = {
    "boost_energy_min": 0.08,
    "brake_margin": 0.603,
    "corner_a": 1000000000.0,
    "corner_vmax": 46.0,
    "cruise_kappa": 0.036,
    "cruise_khead": 0.606,
    "cruise_koff": 0.876,
    "cruise_zone": 0.535,
    "kappa_k": 9.779,
    "la_base": 3.143,
    "la_t": 0.31,
    "off_limit": 99.0,
    "release_charge": 0.137,
    "release_energy": 0.773,
    "wiggle_amp": 0.285,
    "wiggle_period": 7,
    "wiggle_vref": 999.0,
}


class Agent:
    def __init__(self):
        self.seed = None
        self.key = None
        self.track = None
        self.line = None
        self.ctrl = None
        self.hint = None

    def setup(self, obs):
        seed = obs.get('seed')
        tr = obs['track']
        key = (seed, len(tr.get('points', ())), round(float(tr.get('length', 0)), 1),
               round(float(tr.get('halfWidth', 0)), 2))
        if self.track is None or key != self.key:
            self.key = key
            self.seed = seed
            self.track = sim.Track(tr)
            self.line = Line(self.track)
            self.ctrl = Controller(self.line, PARAMS)
            self.ctrl._hint = None
            self.hint = None

    def avoid(self, car, opp, throttle, steer, drift, boost):
        """Small steering bias away from the opponent when alongside/ahead."""
        dx, dy = opp[0] - car.x, opp[1] - car.y
        ca, sa = math.cos(car.angle), math.sin(car.angle)
        lon = dx * ca + dy * sa
        lat = -dx * sa + dy * ca
        if lon < -1.5 or abs(lat) > 2.4 or lon > 6.0:
            return throttle, steer, drift, boost
        closing = (car.vx - opp[2]) * ca + (car.vy - opp[3]) * sa
        side_by_side = abs(lat) < 1.3 and abs(lon) < 4.0
        catching = 0.0 < lon < 5.0 and closing > 0.8
        if not (side_by_side or catching):
            return throttle, steer, drift, boost
        w = (1.0 - abs(lat) / 2.4) * (1.0 - max(0.0, lon) / 6.0)
        if abs(lat) < 0.6:
            _, _, off, _ = self.line.project(car.x, car.y, hint=self.ctrl._hint)
            side = 1.0 if off >= 0 else -1.0
            steer = steer + side * 0.25 * w
        else:
            steer = steer - (1.0 if lat > 0 else -1.0) * 0.25 * w
        steer = max(-1.0, min(1.0, steer))
        if abs(lat) < 1.3 and -1.0 < lon < 4.0:
            drift = False
        return throttle, steer, drift, boost

    def neutral(self):
        return {"throttle": 0, "steer": 0, "drift": False, "boost": False}

    def plan(self, obs):
        cars = obs.get('cars') or []
        me = obs.get('yourPlayer', 0)
        if not cars or me >= len(cars):
            return [self.neutral() for _ in range(20)]
        if obs.get('status') == 'finished' or cars[me].get('finished'):
            return [self.neutral() for _ in range(20)]
        self.setup(obs)
        cj = cars[me]
        car = sim.Car.from_json(cj)
        car.drifting = bool(cj.get('drifting'))
        car.boosting = bool(cj.get('boosting'))
        car.offRoad = bool(cj.get('offRoad'))
        # re-sync controller hint
        self.ctrl._hint = None
        # opponent state (predicted with constant velocity inside the window)
        opp = None
        oi = 1 - me
        if len(cars) > oi:
            oc = cars[oi]
            opp = [float(oc.get('x', 0)), float(oc.get('y', 0)),
                   float(oc.get('vx', 0)), float(oc.get('vy', 0))]
        frame = int(obs.get('frame', 0))
        # number of frames still in countdown at the start of this window
        cd = int(round(float(obs.get('countdownLeft', 0)) * sim.RULES['hz']))
        out = []
        for i in range(20):
            frame += 1
            if i < cd:
                out.append(self.neutral())
                continue
            if car.finished:
                out.append(self.neutral())
                continue
            try:
                throttle, steer, drift, boost = self.ctrl.act(car, frame)
            except Exception:
                throttle, steer, drift, boost = 0.6, 0.0, False, False
            if opp is not None and AVOID:
                throttle, steer, drift, boost = self.avoid(car, opp, throttle, steer, drift, boost)
            out.append({"throttle": round(float(throttle), 4),
                        "steer": round(float(steer), 4),
                        "drift": bool(drift), "boost": bool(boost)})
            car.throttle = throttle
            car.steer = steer
            car.drift = drift
            car.boost = boost
            sim.update_car(self.track, car)
            sim.update_progress(self.track, car)
            opp[0] += opp[2] * sim.DT
            opp[1] += opp[3] * sim.DT
        return out


def decode_obs(raw):
    """Decode the raw JSON line regardless of the host pipe encoding."""
    for enc in ('utf-8', 'gbk', 'latin-1'):
        try:
            return json.loads(raw.decode(enc))
        except Exception:
            continue
    return None


def main():
    agent = Agent()
    inp = sys.stdin.buffer
    out = sys.stdout.buffer
    for raw in inp:
        raw = raw.strip()
        if not raw:
            continue
        obs = decode_obs(raw)
        if obs is None:
            sys.stderr.write('undecodable observation\n')
            continue
        try:
            frames = agent.plan(obs)
        except Exception as exc:
            sys.stderr.write('plan-error: %r\n' % (exc,))
            frames = [{"throttle": 0, "steer": 0, "drift": False, "boost": False} for _ in range(20)]
        out.write((json.dumps({"inputs": [[f] for f in frames]}) + "\n").encode('utf-8'))
        out.flush()


if __name__ == '__main__':
    main()
