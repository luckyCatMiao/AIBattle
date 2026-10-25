"""Always-drift controller: velocity-based pure pursuit, continuous boost.

Physics notes:
 - while drifting the body yaw rate is 1.6x, but the *path* follows the velocity
   direction, so all feedback is done on the velocity heading.
 - drift charge is high whenever the car slides, so drifting through corners both
   turns and recharges; boost is almost always on.
"""
import math

from planner import wrap


DEFAULTS = dict(
    turn_rate=3.2,
    look_t=0.55,
    look_min=4.0,
    look_max=26.0,
    khead=0.9,
    kff=0.75,
    klat=0.0,
    kappa_k=5.0,
    corner_vmax=46.0,
    corner_a=1e9,
    v_straight=46.0,
    brake_decel=16.0,
    brake_margin=1.0,
    throttle_brake=0.35,
    boost_energy_min=0.02,
    boost_always=True,
    wiggle_amp=0.20,
    wiggle_period=8,
    wiggle_kappa=0.030,
    release_charge=0.30,
    release_energy=0.90,
    drift_min_speed=4.5,
)


class DriftController:
    def __init__(self, line, params=None):
        self.line = line
        self.p = dict(DEFAULTS)
        if params:
            self.p.update(params)
        self.build_profile()
        self._hint = None
        self.stats = dict(boost=0, drift=0, frames=0, off=0)
        self.last = (0.0, 0.0, False, False)

    def build_profile(self):
        line = self.line
        n = line.n
        p = self.p
        vmax = [0.0] * n
        for i in range(n):
            k = line.kappa[i]
            if k > 1e-4:
                v = min(p['corner_vmax'], math.sqrt(p['corner_a'] / k), p['kappa_k'] / k)
            else:
                v = p['v_straight']
            vmax[i] = min(p['v_straight'], v)
        ds = [max(1e-3, line.cum[i + 1] - line.cum[i]) for i in range(n)]
        for _ in range(2):
            for i in range(n - 1, -1, -1):
                j = (i + 1) % n
                lim = math.sqrt(vmax[j] ** 2 + 2 * p['brake_decel'] * ds[i])
                if vmax[i] > lim:
                    vmax[i] = lim
        self.vmax = vmax

    def vmax_at(self, s):
        line = self.line
        s %= line.length
        lo, hi = 0, line.n
        while lo + 1 < hi:
            mid = (lo + hi) >> 1
            if line.cum[mid] <= s:
                lo = mid
            else:
                hi = mid
        return self.vmax[lo]

    def target_speed(self, s, v):
        p = self.p
        look = max(2.0, v * v / (2 * p['brake_decel']) + 3.0)
        look = min(look, 80.0)
        best = 1e9
        ds = 0.0
        step = 1.0
        while ds <= look:
            vv = self.vmax_at(s + ds)
            allow = math.sqrt(max(0.0, vv * vv + 2 * p['brake_decel'] * ds))
            if allow < best:
                best = allow
            ds += step
            step = 2.0 if ds > 10 else 1.0
        return best

    def act(self, car, frame):
        p = self.p
        line = self.line
        v = math.hypot(car.vx, car.vy)
        s, idx, off, tang = line.project(car.x, car.y, hint=self._hint)
        self._hint = idx
        fwd = car.vx * math.cos(car.angle) + car.vy * math.sin(car.angle)
        vang = math.atan2(car.vy, car.vx) if v > 1.0 else car.angle
        L = min(p['look_max'], max(p['look_min'], v * p['look_t']))
        tx, ty = line.point_at_s(s + L)
        alpha = wrap(math.atan2(ty - car.y, tx - car.x) - vang)
        kappa_cmd = 2.0 * math.sin(alpha) / max(1.5, L)
        om = p['turn_rate'] * min(1.0, abs(fwd) / 8.0) * 1.6
        if om < 0.05:
            steer = alpha * 2.0
        else:
            steer = kappa_cmd * v / om * p['kff']
        steer += p['khead'] * alpha
        if p['klat']:
            steer -= p['klat'] * off / max(2.0, v)
        if (car.boostEnergy < p['release_energy'] and car.driftCharge > p['release_charge']):
            drifting = False
        else:
            drifting = True

        if abs(steer) < 0.149:
            drifting = False
        if v < p['drift_min_speed'] or car.offRoad:
            drifting = False

        # straight-line charge wiggle: keep the drift alive and generate slip
        k_ahead = line.max_kappa_between(s + 1.0, s + 1.0 + max(6.0, v * 0.55))
        wiggle = False
        if k_ahead < p['wiggle_kappa'] and v > 6.0:
            wig = p['wiggle_amp'] if (frame // p['wiggle_period']) % 2 == 0 else -p['wiggle_amp']
            steer = max(-1.0, min(1.0, steer + wig))
            wiggle = True
            if abs(steer) > 0.15 and (not (car.boostEnergy < p['release_energy'] and car.driftCharge > p['release_charge'])):
                drifting = True
        steer = max(-1.0, min(1.0, steer))

        vt = self.target_speed(s, v)
        if v > vt + p['brake_margin']:
            throttle = max(-1.0, (vt - v) * p['throttle_brake'])
            drifting = False if p['wiggle_kappa'] and not wiggle else drifting
        else:
            throttle = 1.0
        boost = car.boostEnergy > p['boost_energy_min'] and (v < vt + 1.0)

        self.stats['frames'] += 1
        self.stats['boost'] += 1 if car.boosting else 0
        self.stats['drift'] += 1 if car.drifting else 0
        self.stats['off'] += 1 if car.offRoad else 0
        self.last = (throttle, steer, drifting, boost)
        return self.last
