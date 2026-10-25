"""Mimic-style controller: small alternating drift steer + grip pulses + always boost.

Path following is done on the velocity heading; the drift flag is kept alive with a
minimal +/-0.15 steer square wave, and released for one frame whenever driftCharge
has accumulated a little (banking energy and snapping the velocity to the body).
"""
import math

from planner import wrap

DEFAULTS = dict(
    turn_rate=3.2,
    la_base=4.0,
    la_t=0.45,
    la_max=24.0,
    khead=0.55,
    kappa_k=9.779,
    corner_vmax=46.0,
    v_straight=46.0,
    brake_decel=12.0,
    brake_margin=4.0,
    throttle_brake=0.25,
    boost_energy_min=0.02,
    wiggle=0.15,
    wiggle_period=2,
    release_charge=0.14,
    release_energy=0.92,
    drift_min_speed=6.0,
    beta_soft=45.0,      # above this, force a grip frame
    klat=0.5,
    brake_kappa=0.22,    # only brake very hard for hairpins
)


class SolMimic:
    def __init__(self, line, params=None):
        self.line = line
        self.p = dict(DEFAULTS)
        if params:
            self.p.update(params)
        self.build_profile()
        self._hint = None

    def build_profile(self):
        line = self.line
        n = line.n
        p = self.p
        vmax = [0.0] * n
        for i in range(n):
            k = line.kappa[i]
            if k > 1e-4:
                v = min(p['corner_vmax'], p['kappa_k'] / k)
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
        look = min(look, 60.0)
        best = 1e9
        ds = 0.0
        while ds <= look:
            vv = self.vmax_at(s + ds)
            allow = math.sqrt(max(0.0, vv * vv + 2 * p['brake_decel'] * ds))
            best = min(best, allow)
            ds += 1.0
        return best

    def act(self, car, frame):
        p = self.p
        line = self.line
        v = math.hypot(car.vx, car.vy)
        s, idx, off, tang = line.project(car.x, car.y, hint=self._hint)
        self._hint = idx
        vang = math.atan2(car.vy, car.vx) if v > 1.2 else car.angle
        k_ahead = line.max_kappa_between(s + 1.0, s + 1.0 + max(6.0, v * 0.5))
        L = min(p['la_max'], max(3.0, p['la_base'] + v * p['la_t']))
        tx, ty = line.point_at_s(s + L)
        path_dir = math.atan2(tang[1], tang[0])
        des = path_dir - math.atan2(p['klat'] * off, max(2.0, v))
        alpha = wrap(des - vang)
        wig = p['wiggle'] if (frame // p['wiggle_period']) % 2 == 0 else -p['wiggle']
        steer = p['khead'] * alpha + wig
        steer = max(-1.0, min(1.0, steer))

        fx, fy = math.cos(car.angle), math.sin(car.angle)
        vF = car.vx * fx + car.vy * fy
        vL = -car.vx * fy + car.vy * fx
        beta = math.degrees(math.atan2(vL, max(1.0, abs(vF))))

        drifting = v > p['drift_min_speed'] and abs(steer) > 0.15 and not car.offRoad
        if drifting and (car.driftCharge > p['release_charge'] or abs(beta) > p['beta_soft']):
            drifting = False

        vt = self.target_speed(s, v)
        if k_ahead > p['brake_kappa'] and v > vt + p['brake_margin']:
            throttle = max(-1.0, (vt - v) * p['throttle_brake'])
            drifting = False if v > vt + 6 else drifting
        else:
            throttle = 1.0
        boost = car.boostEnergy > p['boost_energy_min'] and not (throttle < -0.2)
        return throttle, steer, drifting, boost
