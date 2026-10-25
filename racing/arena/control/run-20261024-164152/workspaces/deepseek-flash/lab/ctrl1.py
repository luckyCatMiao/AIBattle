"""Drift-aware pursuit controller (v1, parameterised)."""
import math
from planner import wrap

V_TABLE = [(3.0,12.0),(5.0,15.6),(7.9,20.2),(10.8,23.5),(13.6,27.2),(16.3,28.8),
           (22.6,31.8),(28.5,34.3),(43.2,41.7),(60.0,44.0),(1e9,48.0)]

def v_for_radius(R, scale=1.0):
    if R <= 0: return 48.0
    prev = V_TABLE[0]
    if R <= prev[0]: return prev[1]*scale
    for R2,v2 in V_TABLE[1:]:
        if R <= R2:
            t = (R-prev[0])/(R2-prev[0])
            return (prev[1]+(v2-prev[1])*t)*scale
        prev = (R2,v2)
    return 48.0*scale

class Ctrl:
    def __init__(self, fast, P):
        self.f = fast
        self.P = P
        self.line = fast.line
        self._hint = None
        self.prof = self.build_profile(P)
    def build_profile(self, P):
        line = self.line
        n = line.n
        ds = line.length/n
        v = [0.0]*n
        for i in range(n):
            k = line.kappa[i]
            R = 1.0/max(k,1e-6)
            v[i] = min(P['vmax'], v_for_radius(R, P['vscale']))
        dec = P['decel']
        for _ in range(2):
            for i in range(n-1,-1,-1):
                j = (i+1)%n
                lim = math.sqrt(max(0.0, v[j]*v[j] + 2*dec*ds))
                if v[i] > lim: v[i] = lim
        return v
    def act(self, car, frame, fast):
        line = self.line
        s, idx, off, tang = line.project(car.x, car.y, hint=self._hint)
        self._hint = idx
        v = math.hypot(car.vx, car.vy)
        P = self.P
        L = P['la_base'] + P['la_v']*v
        tx, ty = line.point_at_s(s+L)
        # gentle centring
        tx -= tang[0]*(0) ; ty -= tang[1]*0
        des = math.atan2(ty-car.y, tx-car.x)
        vang = math.atan2(car.vy, car.vx) if v > 0.4 else car.angle
        e = wrap(des - vang)
        slip_t = max(-P['slip_max'], min(P['slip_max'], P['slip_gain']*e))
        head_t = vang + slip_t
        err = wrap(head_t - car.angle)
        steer = max(-1.0, min(1.0, P['steer_gain']*err))
        slip = wrap(car.angle - vang)
        drifting = abs(slip) < P['drift_slip'] and v > 5.0 and abs(steer) > 0.16
        # target speed
        i = line.index_at_s(s + P['prof_ahead'])
        vt = min(P['vmax'], self.prof[i]) * P['vt_scale']
        throttle = 1.0 if v < vt else -1.0
        boost = car.boostEnergy > P['boost_min'] and v < vt*P['boost_vcap']
        return throttle, steer, drifting, boost
