"""Per-frame controller: high-speed drift-cruise on straights, grip cornering."""
import math

from planner import wrap


DEFAULTS = dict(
    steer_gain=1.7,
    turn_rate=3.2,
    la_base=2.5,
    la_t=0.30,
    la_max=20.0,
    kappa_k=3.1,          # corner speed limit: v = min(corner_vmax, sqrt(corner_a/kappa))
    corner_vmax=16.0,
    corner_a=30.0,
    corner_safety=1.0,
    v_straight=46.0,
    brake_margin=0.6,
    brake_decel=16.0,
    boost_vmax=46.0,
    boost_energy_min=0.03,
    # cruise / charge
    cruise_kappa=0.030,   # considered straight if max kappa over zone below this
    cruise_zone=0.55,     # seconds worth of track to look at
    wiggle_amp=0.22,
    wiggle_period=8,
    release_charge=0.22,
    release_energy=0.92,
    cruise_boost=True,
    # corner mode
    corner_boost=True,
    boost_slack=1.0,
    brake_charge=False,
    brake_charge_minv=18.0,
    brake_charge_steer=0.25,
    corner_drift=False,
    drift_min_speed=5.0,
    off_limit=0.9,
    wiggle_vref=14.0,
    cruise_koff=0.8,
    cruise_khead=0.8,
    cruise_wiggle_gain=1.0,
)


class Controller:
    def __init__(self, line, params=None):
        self.line = line
        self.p = dict(DEFAULTS)
        if params:
            self.p.update(params)
        self.build_profile()
        self._hint = None
        self._cruise = 0
        self.mode = 'corner'
        self.stats = dict(boost=0, drift=0, frames=0, off=0)

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
            vmax[i] = min(p['v_straight'], v * p['corner_safety'])
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
        look = min(look, 90.0)
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
        L = min(p['la_max'], p['la_base'] + v * p['la_t'])
        tx, ty = line.point_at_s(s + L)
        desired = math.atan2(ty - car.y, tx - car.x)
        alpha = wrap(desired - car.angle)
        # curvature-based pure pursuit: steer for omega = v * kappa_cmd
        fwd = car.vx * math.cos(car.angle) + car.vy * math.sin(car.angle)
        om = p['turn_rate'] * min(1.0, abs(fwd) / 8.0)
        if om < 0.05:
            steer = max(-1.0, min(1.0, alpha * 3.0))
        else:
            kappa_cmd = 2.0 * math.sin(alpha) / max(1.0, L)
            turnmul = 1.6 if p.get('corner_drift') else 1.0
            steer = kappa_cmd * v / (om * turnmul) * (1.0 if fwd >= 0 else -1.0)
            steer = max(-1.0, min(1.0, steer))
        err = alpha

        vt = self.target_speed(s, v)
        zone = line.max_kappa_between(s + 1.5, s + 1.5 + max(6.0, v * p['cruise_zone']))
        cruise = zone < p['cruise_kappa'] and v > 8.0
        self.mode = 'cruise' if cruise else 'corner'

        drifting = False
        boost = False
        if cruise:
            vang = math.atan2(car.vy, car.vx) if v > 1.2 else car.angle
            path_dir = math.atan2(tang[1], tang[0])
            if abs(off) > p['off_limit'] * line.track.halfWidth:
                # too far from the line: abandon the drift and steer back
                steer = max(-1.0, min(1.0, err * 1.8))
                drifting = False
                boost = car.boostEnergy > p['boost_energy_min']
                throttle = 1.0
            else:
                amp = p['wiggle_amp'] * max(0.6, min(1.0, p['wiggle_vref'] / max(6.0, v)))
                wig = amp if (frame // p['wiggle_period']) % 2 == 0 else -amp
                des = path_dir - math.atan2(p['cruise_koff'] * off, max(2.0, v))
                err_v = wrap(des - vang)
                base = p['cruise_khead'] * err_v
                steer = max(-1.0, min(1.0, wig * p['cruise_wiggle_gain'] + base))
                drifting = abs(steer) > 0.15
                if car.driftCharge > p['release_charge'] and car.boostEnergy < p['release_energy']:
                    drifting = False
                if p['cruise_boost'] and car.boostEnergy > p['boost_energy_min']:
                    boost = True
                throttle = 1.0
                # still respect hard braking needs (corner approaching fast)
                if v > vt + 1.5:
                    throttle = max(-1.0, (vt - v) * 0.3)
                    drifting = False
                    boost = False
                    steer = max(-1.0, min(1.0, err * p['steer_gain']))
        else:
            if v > vt + p['brake_margin']:
                throttle = max(-1.0, (vt - v) * 0.3)
            else:
                throttle = 1.0
            if p['corner_boost'] and car.boostEnergy > p['boost_energy_min'] and v < vt - p['boost_slack']:
                boost = True
            if (p['brake_charge'] and throttle < -0.25 and v > p['brake_charge_minv']
                    and abs(steer) > p['brake_charge_steer'] and not car.offRoad):
                drifting = True
            if p['corner_drift'] and v > p['drift_min_speed'] and abs(steer) > 0.15 and not car.offRoad:
                drifting = True

        self.stats['frames'] += 1
        self.stats['boost'] += 1 if car.boosting else 0
        self.stats['drift'] += 1 if car.drifting else 0
        self.stats['off'] += 1 if car.offRoad else 0
        return throttle, steer, drifting, boost
