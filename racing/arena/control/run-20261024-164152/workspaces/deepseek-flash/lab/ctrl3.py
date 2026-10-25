"""Slip-target controller v3.

Controls the *velocity direction* by commanding a slip angle:
  omega_req  = desired velocity turn rate (from path error)
  beta_des   = slip angle that produces omega_req through the grip term
               (in grip: omega = GRIP*sin(b)cos(b))
  drift      = build slip fast while |slip|<|beta_des|, grip to convert slip->turn
On straights beta_des is replaced by an alternating charge weave that keeps the
mean heading aligned while forcing drift frames (to farm boost energy).
"""
import math
from planner import wrap
from ctrl1 import v_for_radius

GRIP = 4.46  # -ln(0.8)*20

class Ctrl:
    def __init__(self, fast, P):
        self.f = fast; self.P = P; self.line = fast.line; self._hint = None
        self.prof = self.build_profile(P)
    def build_profile(self, P):
        line=self.line; n=line.n; ds=line.length/n
        v=[min(P['vmax'], v_for_radius(1.0/max(line.kappa[i],1e-6), P['vscale'])) for i in range(n)]
        for _ in range(3):
            for i in range(n-1,-1,-1):
                j=(i+1)%n
                v[i]=min(v[i], math.sqrt(max(0.0, v[j]*v[j]+2*P['decel']*ds)))
        return v
    def act(self, car, frame, fast):
        line=self.line; P=self.P
        s, idx, off, tang = line.project(car.x, car.y, hint=self._hint)
        self._hint = idx
        v = math.hypot(car.vx, car.vy)
        vang = math.atan2(car.vy, car.vx) if v > 0.6 else car.angle
        L = P['la_base'] + P['la_v']*v
        tx, ty = line.point_at_s(s+L)
        nx, ny = -tang[1], tang[0]
        # aim slightly back to the line
        des = math.atan2(ty-car.y, tx-car.x)
        e = wrap(des - vang)
        omega = max(-P['omax'], min(P['omax'], P['kw']*e))
        # base slip from omega (inverse of omega = GRIP sin b cos b)
        a = min(1.0, abs(omega)/P['grip'])
        b = 0.5*math.asin(a) if a < 1.0 else 0.785
        b = b*(1.0 if omega >= 0 else -1.0)
        if abs(omega) < P['weave_w'] and v > P['weave_vmin']:
            ph = (frame // P['weave_half']) % 2
            beta = P['weave_beta'] if ph==0 else -P['weave_beta']
            drifting = True
        else:
            beta = b
            drifting = abs(wrap(car.angle-vang)) < max(abs(beta)*P['drift_hyst'], 0.06)
        head_t = vang + beta
        steer = max(-1.0, min(1.0, P['steer_gain']*wrap(head_t-car.angle)))
        i = line.index_at_s(s+P['prof_ahead'])
        vt = min(P['vmax'], self.prof[i])*P['vt_scale']
        throttle = 1.0 if v < vt else -1.0
        boost = car.boostEnergy > P['boost_min'] and v < vt + P['boost_slack']
        return throttle, steer, drifting, boost
