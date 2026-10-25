"""Drift-aware pursuit controller v2: explicit charge weave + corner drift pulse."""
import math
from planner import wrap
from ctrl1 import v_for_radius

class Ctrl:
    def __init__(self, fast, P):
        self.f = fast; self.P = P; self.line = fast.line; self._hint = None
        self.prof = self.build_profile(P)
    def build_profile(self, P):
        line = self.line; n = line.n; ds = line.length/n
        v = [min(P['vmax'], v_for_radius(1.0/max(line.kappa[i],1e-6), P['vscale'])) for i in range(n)]
        dec = P['decel']
        for _ in range(2):
            for i in range(n-1,-1,-1):
                j=(i+1)%n
                lim=math.sqrt(max(0.0, v[j]*v[j]+2*dec*ds))
                if v[i]>lim: v[i]=lim
        return v
    def act(self, car, frame, fast):
        line=self.line; P=self.P
        s, idx, off, tang = line.project(car.x, car.y, hint=self._hint)
        self._hint = idx
        v = math.hypot(car.vx, car.vy)
        L = P['la_base'] + P['la_v']*v
        tx, ty = line.point_at_s(s+L)
        # pull toward line proportional to lateral error
        nx, ny = -tang[1], tang[0]
        tx -= nx*off*P['centre']
        ty -= ny*off*P['centre']
        des = math.atan2(ty-car.y, tx-car.x)
        vang = math.atan2(car.vy, car.vx) if v>0.4 else car.angle
        e = wrap(des-vang)
        slip_t = max(-P['slip_max'], min(P['slip_max'], P['slip_gain']*e))
        head_t = vang + slip_t
        steer = max(-1.0, min(1.0, P['steer_gain']*wrap(head_t-car.angle)))
        i = line.index_at_s(s+P['prof_ahead'])
        vt = min(P['vmax'], self.prof[i])*P['vt_scale']
        slip = wrap(car.angle-vang)
        # charge weave when steering demand is small
        if abs(steer) < P['weave_on'] and v > P['weave_vmin']:
            ph = (frame // P['weave_half']) % 2
            steer = P['weave_amp'] if ph==0 else -P['weave_amp']
            drifting = (frame % P['weave_pulse']) != 0
        else:
            drifting = abs(slip) < P['drift_slip'] and v > 5.0 and abs(steer) > 0.16
        throttle = 1.0 if v < vt else -1.0
        boost = bool(P['always_boost']) and car.boostEnergy > P['boost_min'] and v < P['vmax']*1.02
        return throttle, steer, drifting, boost
