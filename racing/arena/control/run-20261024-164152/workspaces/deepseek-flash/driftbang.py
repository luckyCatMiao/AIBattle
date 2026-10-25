"""Bang-bang drift/grip controller (experimental).

Body-heading pure pursuit.  Drift is held while the velocity heading is close to
the target (so the body can lead into the corner and bank charge); as soon as the
velocity lags the target by more than `tol` degrees, one or more grip frames snap
the velocity back towards the body heading.
"""
import math

from planner import wrap

DEFAULTS = dict(
    turn_rate=3.2,
    look=6.0,
    look_t=0.30,
    look_max=24.0,
    kgain=1.4,
    kff=0.35,
    tol=4.0,             # deg of velocity-heading error that forces grip
    tol_on=1.5,          # deg below which drift may re-engage
    drift_kappa=0.06,    # only drift when curvature below this
    drift_min_speed=6.0,
    min_steer=0.16,
    beta_max=55.0,
    kappa_k=9.779,
    corner_vmax=46.0,
    v_straight=46.0,
    brake_decel=14.0,
    brake_margin=3.0,
    throttle_brake=0.25,
    boost_energy_min=0.02,
    release_energy=0.97,
)

def clamp(v,a,b): return a if v<a else (b if v>b else v)

class DriftBang:
    def __init__(self, line, params=None):
        self.line=line; self.p=dict(DEFAULTS)
        if params: self.p.update(params)
        self.build_profile(); self._hint=None
    def build_profile(self):
        line=self.line; n=line.n; p=self.p
        vmax=[0.0]*n
        for i in range(n):
            k=line.kappa[i]
            vmax[i]=min(p['v_straight'], p['kappa_k']/k) if k>1e-4 else p['v_straight']
        ds=[max(1e-3,line.cum[i+1]-line.cum[i]) for i in range(n)]
        for _ in range(2):
            for i in range(n-1,-1,-1):
                j=(i+1)%n; lim=math.sqrt(vmax[j]**2+2*p['brake_decel']*ds[i])
                if vmax[i]>lim: vmax[i]=lim
        self.vmax=vmax
    def vmax_at(self,s):
        line=self.line; s%=line.length; lo,hi=0,line.n
        while lo+1<hi:
            mid=(lo+hi)>>1
            if line.cum[mid]<=s: lo=mid
            else: hi=mid
        return self.vmax[lo]
    def target_speed(self,s,v):
        p=self.p; look=min(70.0,max(2.0,v*v/(2*p['brake_decel'])+3.0)); best=1e9; ds=0.0
        while ds<=look:
            vv=self.vmax_at(s+ds); best=min(best,math.sqrt(max(0.0,vv*vv+2*p['brake_decel']*ds))); ds+=1.0
        return best
    def act(self,car,frame):
        p=self.p; line=self.line; v=math.hypot(car.vx,car.vy)
        s,idx,off,tang=line.project(car.x,car.y,hint=self._hint); self._hint=idx
        vang=math.atan2(car.vy,car.vx) if v>1.2 else car.angle
        L=min(p['look_max'],max(3.0,p['look']+v*p['look_t']))
        tx,ty=line.point_at_s(s+L)
        aim=math.atan2(ty-car.y,tx-car.x)
        e_head=wrap(aim-car.angle)
        e_vel=wrap(aim-vang)
        k_ahead=line.max_kappa_between(s+1.0,s+1.0+max(6.0,v*0.5))
        # steering: pure pursuit on body heading + curvature feedforward
        om=p['turn_rate']*min(1.0,abs(v)/8.0)
        kappa_cmd=2.0*math.sin(e_head)/max(1.0,L)
        steer=e_head*p['kgain'] + (kappa_cmd*v/max(0.05,om))*p['kff']
        steer=clamp(steer,-1.0,1.0)
        fx,fy=math.cos(car.angle),math.sin(car.angle)
        vF=car.vx*fx+car.vy*fy; vL=-car.vx*fy+car.vy*fx
        beta=math.degrees(math.atan2(vL,max(1.0,abs(vF))))
        # bang-bang drift: drift while the velocity tracks the aim, grip when it lags
        if abs(e_vel)<math.radians(p['tol_on']): self.drift_ok=True
        elif abs(e_vel)>math.radians(p['tol']): self.drift_ok=False
        want_drift=(getattr(self,'drift_ok',True) and v>p['drift_min_speed']
                    and k_ahead<p['drift_kappa'] and abs(beta)<p['beta_max']
                    and not car.offRoad)
        drifting=want_drift
        if drifting and abs(steer)<p['min_steer']:
            if abs(e_head)>1e-3:
                sgn=1.0 if e_head>0 else -1.0
            else:
                sgn=1.0 if (frame//2)%2==0 else -1.0
            steer=sgn*p['min_steer']
        vt=self.target_speed(s,v)
        if v>vt+p['brake_margin']:
            throttle=max(-1.0,(vt-v)*p['throttle_brake']); drifting=False
        else:
            throttle=1.0
        boost=car.boostEnergy>p['boost_energy_min'] and throttle>-0.2
        return throttle,steer,drifting,boost
