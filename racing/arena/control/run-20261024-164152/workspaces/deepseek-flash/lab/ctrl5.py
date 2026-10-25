"""v5: slip-target + heading-rate feedforward, weave as a modulation of slip target."""
import math
from planner import wrap
from ctrl1 import v_for_radius

GRIP = 4.46
TURN = 3.2

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
        slip = wrap(car.angle - vang)
        L = P['la_base'] + P['la_v']*v
        tx, ty = line.point_at_s(s+L)
        des = math.atan2(ty-car.y, tx-car.x)
        e = wrap(des - vang)
        omega = max(-P['omax'], min(P['omax'], P['kw']*e))
        a = min(1.0, abs(omega)/GRIP)
        bd = 0.5*math.asin(min(1.0, 2*a))*(1.0 if omega >= 0 else -1.0)
        # weave modulation (charge): only when path demand is gentle
        if abs(omega) < P['weave_w'] and v > P['weave_vmin'] and abs(off) < P['weave_off']:
            ph = (frame // P['weave_half']) % 2
            bd = bd + (P['weave_beta'] if ph==0 else -P['weave_beta'])
            weave_on = True
        else:
            weave_on = False
        # heading-rate feedforward + slip feedback
        vF = car.vx*math.cos(car.angle)+car.vy*math.sin(car.angle)
        gain = min(1.0, abs(vF)/8.0)
        ff = omega/(TURN*max(gain,0.12))
        steer = max(-1.0, min(1.0, ff + P['kb']*wrap(bd - slip)))
        drift = (weave_on or bool(P['corner_drift'])) and abs(slip) < max(abs(bd)*P['drift_hyst'], P['drift_min'])
        i = line.index_at_s(s+P['prof_ahead'])
        vt = min(P['vmax'], self.prof[i])*P['vt_scale']
        throttle = 1.0 if v < vt else -1.0
        boost = car.boostEnergy > P['boost_min'] and v < vt + P['boost_slack']
        return throttle, steer, drift, boost
