import math, sim
from planner import wrap

class BangDrift:
    def __init__(self, line, params=None):
        self.line=line
        self.p=dict(amp=0.35, koff=0.5, kh=0.6, lat_t=0.6, boost=True, drift=True,
                    rel=0.3, brake_k=0.0, vcap=99.0, dead=0.05)
        if params: self.p.update(params)
        self._hint=None
    def act(self, car, frame):
        p=self.p; line=self.line
        v=math.hypot(car.vx,car.vy)
        s,idx,off,tang=line.project(car.x,car.y,hint=self._hint); self._hint=idx
        vang=math.atan2(car.vy,car.vx) if v>1.0 else car.angle
        L=max(4.0, v*p['lat_t'])
        tx,ty=line.point_at_s(s+L)
        alpha=wrap(math.atan2(ty-car.y,tx-car.x)-vang)
        # error signal: heading error plus lateral offset
        e = alpha + math.atan2(p['koff']*off, max(2.0,v))
        if abs(e) < p['dead']: steer=0.0
        else: steer = p['amp'] if e>0 else -p['amp']
        steer=steer + p['kh']*alpha
        steer=max(-1.0,min(1.0,steer))
        drift = p['drift'] and v>4.5 and abs(steer)>0.15 and not car.offRoad
        if drift and car.driftCharge>p['rel'] and car.boostEnergy<0.9: drift=False
        boost = p['boost'] and car.boostEnergy>0.02
        throttle=1.0
        if v>p['vcap']: throttle=-1.0
        return throttle, steer, drift, boost
