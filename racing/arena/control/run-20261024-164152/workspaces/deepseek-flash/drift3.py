"""Drift-cruise controller (experimental).

Velocity-heading pure pursuit + slip-angle regulated drift pulses:
 - hold drift to keep lateral speed (the forward-speed cap only applies to vF,
   so a sliding car can exceed it while its velocity still points down the track)
 - when |slip| grows too large, one grip frame kills it and snaps the velocity
   direction towards the body heading.
"""
import math

from planner import wrap

DEFAULTS = dict(
    turn_rate=3.2,
    la_base=3.0,
    la_t=0.30,
    la_max=20.0,
    kappa_k=9.779,
    corner_vmax=46.0,
    corner_a=1e9,
    v_straight=46.0,
    brake_decel=16.0,
    brake_margin=0.6,
    throttle_brake=0.3,
    boost_energy_min=0.02,
    khead=0.9,
    kff=0.8,
    klat=0.6,
    beta_max=35.0,       # deg; grip pulse above this slip
    beta_min=8.0,        # deg; do not enter drift below this unless cornering
    drift_kappa=0.035,   # curvature above which drift is used in corners
    release_charge=0.30,
    release_energy=0.90,
    min_steer=0.16,
    drift_min_speed=6.0,
    boost_always=True,
    wiggle_amp=0.0,
    wiggle_period=7,
)


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


class Drift3Controller:
    def __init__(self, line, params=None):
        self.line = line
        self.p = dict(DEFAULTS)
        if params:
            self.p.update(params)
        self.build_profile()
        self._hint = None
        self.stats = dict(boost=0, drift=0, frames=0, off=0)
        self.grip_pulse = 0

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
        if v > 1.2:
            vang = math.atan2(car.vy, car.vx)
        else:
            vang = car.angle
        fx, fy = math.cos(car.angle), math.sin(car.angle)
        vF = car.vx * fx + car.vy * fy
        vL = -car.vx * fy + car.vy * fx
        beta = math.degrees(math.atan2(vL, max(1.0, abs(vF))))

        k_ahead = line.max_kappa_between(s + 1.5, s + 1.5 + max(6.0, v * 0.55))
        L = min(p['la_max'], max(3.0, p['la_base'] + v * p['la_t']))
        tx, ty = line.point_at_s(s + L)
        path_dir = math.atan2(tang[1], tang[0])
        des = path_dir - math.atan2(p['klat'] * off, max(2.0, v))
        alpha = wrap(des - vang)
        kappa_cmd = 2.0 * math.sin(alpha) / max(1.0, L)
        om = p['turn_rate'] * min(1.0, abs(vF) / 8.0)
        if om < 0.05:
            steer = alpha * 3.0
        else:
            steer = kappa_cmd * v / om * p['kff'] + p['khead'] * alpha
            steer /= 1.0  # feedforward already curvature-based
            steer = max(-1.0, min(1.0, steer))

        # ---- decide drift ----
        want_drift = False
        if v > p['drift_min_speed'] and not car.offRoad and abs(steer) > 0.05:
            want_drift = (abs(beta) < p['beta_max'] and k_ahead > p['drift_kappa'])
            # keep drifting on straights too if slip is low and energy is not full
            if not want_drift and k_ahead <= p['drift_kappa'] and abs(beta) < p['beta_max'] * 0.7:
                want_drift = True
        # release charge when full enough, or slip too big -> one grip frame
        if want_drift:
            if car.driftCharge > p['release_charge'] and car.boostEnergy < p['release_energy']:
                want_drift = False
            elif abs(beta) > p['beta_max']:
                want_drift = False
        drifting = bool(want_drift)
        # drift only engages when |steer|>0.15; pad the command to the threshold
        if drifting and abs(steer) < p['min_steer']:
            steer = math.copysign(p['min_steer'], steer if abs(steer) > 1e-6 else math.sin(car.angle) or 1.0)
        elif drifting and abs(steer) < 0.15:
            drifting = False
        if car.offRoad:
            drifting = False

        vt = self.target_speed(s, v)
        if v > vt + p['brake_margin']:
            throttle = max(-1.0, (vt - v) * p['throttle_brake'])
            drifting = False
        else:
            throttle = 1.0
        boost = car.boostEnergy > p['boost_energy_min'] and not (throttle < -0.1)

        self.stats['frames'] += 1
        self.stats['boost'] += 1 if car.boosting else 0
        self.stats['drift'] += 1 if car.drifting else 0
        self.stats['off'] += 1 if car.offRoad else 0
        return throttle, steer, drifting, boost
