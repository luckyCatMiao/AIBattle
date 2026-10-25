"""Racing agent: one JSON observation per stdin line -> one 20-frame window per stdout line.

Strategy
--------
* The engine's speed "caps" are leaky (`vF = max(cap, vF - 0.9)` per frame), so a
  full throttle + boost equilibrium sits near 48 grid/s instead of the nominal 23.
  Boost and drift-charging therefore dominate everything else.
* A minimum-curvature racing line is built from the observed track; a curvature ->
  speed table (measured from the physics) plus a backward braking pass gives the
  target speed profile.
* Steering is closed-loop on the *velocity* heading: the heading target is the
  velocity direction plus a capped slip, and a P loop drives the car heading to it.
  On straights a small square-wave weave forces drift frames, which farms boost
  energy; the weaving offsets cancel so the line is not disturbed.
* Inside each 20-frame window the car is re-simulated with the exact engine physics,
  so the controller is closed-loop at 20 Hz internally.
"""
import json
import math
import sys

sys.dont_write_bytecode = True

import sim
from planner import Line, wrap
from driver import Driver, v_for_radius

PARAMS = {
    "vmax": 41.473112623574096,
    "vscale": 1.305,
    "decel": 32.425,
    "la_base": 2.026,
    "la_v": 0.237,
    "slip_max": 1.489,
    "slip_gain": 1.974,
    "steer_gain": 5.395,
    "drift_slip": 0.727,
    "prof_ahead": -2.322,
    "vt_scale": 1.238,
    "boost_min": 0.02,
    "centre": 0.062,
    "weave_on": 0.531,
    "weave_amp": 0.258,
    "weave_half": 2,
    "weave_pulse": 7,
    "weave_vmin": 6.536,
    "boost_slack": -3.741,
    "margin": 0.6,
    "cp_guard_dist": 8.0,
    "cp_guard_w": 0.35,
    "cp_guard_slack": 0.9,
    "av_dist": 17.0,
    "av_lat": 2.3,
    "av_margin": 0.85,
    "av_slow_dist": 0.0,
    "av_slow_lat": 1.2,
}
HZ = 20
COUNTDOWN_FRAMES = 30


class Agent:
    def __init__(self):
        self.key = None
        self.track = None
        self.drv = None
        self.stuck = 0

    # ---- per-track setup -------------------------------------------------
    def setup(self, obs):
        tr = obs['track']
        key = (obs.get('seed'), len(tr.get('points', ())),
               round(float(tr.get('length', 0.0)), 1))
        if self.track is not None and key == self.key:
            return
        self.key = key
        self.track = sim.Track(tr)
        self.line = Line(self.track, margin=PARAMS['margin'])
        self.drv = Driver(self.line, PARAMS, checkpoints=self.track.checkpoints)
        self.stuck = 0

    def neutral(self):
        return {"throttle": 0.0, "steer": 0.0, "drift": False, "boost": False}

    # ---- one 20-frame window --------------------------------------------
    def plan(self, obs):
        cars = obs.get('cars') or []
        me = obs.get('yourPlayer', 0)
        if not cars or me >= len(cars):
            return [self.neutral() for _ in range(20)]
        if obs.get('status') == 'finished' or cars[me].get('finished'):
            return [self.neutral() for _ in range(20)]
        try:
            self.setup(obs)
        except Exception as exc:
            sys.stderr.write('setup-error: %r\n' % (exc,))
            return [self.neutral() for _ in range(20)]

        cj = cars[me]
        car = sim.Car.from_json(cj)
        car.drifting = bool(cj.get('drifting'))
        car.boosting = bool(cj.get('boosting'))
        car.offRoad = bool(cj.get('offRoad'))
        self.drv._hint = None

        opp = None
        oi = 1 - me
        if len(cars) > oi:
            oc = cars[oi]
            opp = [float(oc.get('x', 0.0)), float(oc.get('y', 0.0)),
                   float(oc.get('vx', 0.0)), float(oc.get('vy', 0.0))]

        frame = int(obs.get('frame', 0))
        cd = int(round(float(obs.get('countdownLeft', 0.0)) * HZ))
        out = []
        for i in range(20):
            frame += 1
            if frame <= COUNTDOWN_FRAMES or i < cd:
                out.append(self.neutral())
                continue
            if car.finished:
                out.append(self.neutral())
                continue
            try:
                throttle, steer, drift, boost = self.drv.act(car, frame, opp)
            except Exception as exc:
                sys.stderr.write('act-error: %r\n' % (exc,))
                throttle, steer, drift, boost = 0.55, 0.0, False, False
            # stuck recovery: if we have been crawling for a while, floor it and
            # steer towards the line instead of trusting the speed profile.
            v = math.hypot(car.vx, car.vy)
            if v < 1.5:
                self.stuck += 1
            else:
                self.stuck = 0
            if self.stuck > 25:
                throttle = 1.0
                _, _, _, tang = self.line.project(car.x, car.y, hint=self.drv._hint)
                want = math.atan2(tang[1], tang[0])
                steer = max(-1.0, min(1.0, 2.5*wrap(want - car.angle)))
                drift = False
                boost = car.boostEnergy > 0.05
            if opp is not None:
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
            opp[0] += opp[2]*sim.DT
            opp[1] += opp[3]*sim.DT
        return out

    # ---- avoid contact ---------------------------------------------------
    def avoid(self, car, opp, throttle, steer, drift, boost):
        """The driver already plans a passing lane; here we only suppress drift
        (lateral slide) when the cars are literally side by side."""
        dx, dy = opp[0]-car.x, opp[1]-car.y
        ca, sa = math.cos(car.angle), math.sin(car.angle)
        lon = dx*ca + dy*sa
        lat = -dx*sa + dy*ca
        if abs(lat) < 1.5 and -1.5 < lon < 4.0:
            drift = False
        return throttle, steer, drift, boost


def decode_obs(raw):
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
            frames = [{"throttle": 0.0, "steer": 0.0, "drift": False, "boost": False}
                      for _ in range(20)]
        out.write((json.dumps({"inputs": [[f] for f in frames]}) + "\n").encode('utf-8'))
        out.flush()


if __name__ == '__main__':
    main()
