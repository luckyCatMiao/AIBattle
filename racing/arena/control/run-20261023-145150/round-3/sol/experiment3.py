import math
from round2 import Agent as Original, clamp, wrap

class Agent(Original):
    look_base=3
    look_gain=.45
    gain=2
    slip_gain=.65
    min_steer=.155
    release=.15
    curvature_limit=1.5
    err_limit=.45
    slip_limit=.5
    boost_curve=.8
    boost_err=.4
    boost_slip=.5
    def control(self,c,s):
        t=self.track
        x,y,a,vx,vy,ch,en,dr=c
        speed=math.hypot(vx,vy)
        tx,ty=t.at(s+self.look_base+speed*self.look_gain)
        err=wrap(math.atan2(ty-y,tx-x)-a)
        slip=wrap(math.atan2(vy,vx)-a) if speed>1 else 0
        steer=clamp((err-slip*self.slip_gain)*self.gain,-1,1)
        p0=t.at(s+3); p1=t.at(s+13); p2=t.at(s+23)
        curvature=abs(wrap(math.atan2(p2[1]-p1[1],p2[0]-p1[0])-math.atan2(p1[1]-p0[1],p1[0]-p0[0])))
        safe=curvature<self.curvature_limit and abs(err)<self.err_limit and abs(slip)<self.slip_limit
        drift=safe and speed>9 and ch<=self.release
        if drift:
            steer/=1.6
            if abs(steer)<self.min_steer: steer=math.copysign(self.min_steer,steer)
        boost=curvature<self.boost_curve and abs(err)<self.boost_err and abs(slip)<self.boost_slip
        self.frame+=1
        return (1,steer,drift,boost)
