"""v4: velocity-direction control with heading-rate feedforward + slip feedback."""
import math
from planner import wrap
from ctrl1 import v_for_radius

GRIP = 4.46      # -ln(0.8)*20
TURN = 3.2
DTB  = 1.6

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
        des = math.atan2(ty-car.y, tx-car.x)
        e = wrap(des - vang)
        omega = P['kw']*e
        omega = max(-P['omax'], min(P['omax'], omega))
        slip = wrap(car.angle - vang)
        drift = False
        if abs(omega) < P['weave_w'] and v > P['weave_vmin']:
            ph = (frame // P['weave_half']) % 2
            steer = P['weave_amp'] if ph==0 else -P['weave_amp']
            drift = (frame % P['weave_pulse']) != 0
        else:
            a = min(1.0, abs(omega)/GRIP)
            bd = 0.5*math.asin(a)*(1.0 if omega >= 0 else -1.0)
            gain = min(1.0, abs(car.vx*math.cos(car.angle)+car.vy*math.sin(car.angle))/8.0)
            ff = omega/(TURN*max(gain,0.15))
            fb = P['kb']*wrap(bd - slip)
            steer = max(-1.0, min(1.0, ff + fb))
            drift = abs(slip) < abs(bd)*P['drift_hyst']
        i = line.index_at_s(s+P['prof_ahead'])
        vt = min(P['vmax'], self.prof[i])*P['vt_scale']
        throttle = 1.0 if v < vt else -1.0
        boost = car.boostEnergy > P['boost_min'] and v < vt + P['boost_slack']
        return throttle, steer, drift, boost
