"""Simple wing-attack bot used to test the concept on the Python engine."""
import sys, math
sys.path.insert(0,'/workspace')
import soccer
from brain import oct_name, ang_of

SQ = math.sqrt(0.5)

def clamp(v,a,b): return max(a,min(b,v))

class WingBot:
    def __init__(self, team, wing_y=4.8, shoot_rng=13.0, debug=False):
        self.team=team; self.opp=1-team
        self.s=1 if team==0 else -1
        self.wing_y=wing_y
        self.shoot_rng=shoot_rng
        self.debug=debug
        self.shots=0

    def setup(self,w):
        self.W=w.W; self.H=w.H; self.rules=w.rules
        self.gx_att=w.W-1.0 if self.s>0 else 1.0
        self.gx_def=1.0 if self.s>0 else w.W-1.0
        self.box_opp=w.pen['1' if self.opp==1 else '0'] if isinstance(w.pen,dict) else w.pen[self.opp]
        self.box_own=w.pen['0' if self.team==0 else '1'] if isinstance(w.pen,dict) else w.pen[self.team]
        self.n=w.teamSize

    def opps(self,sim): return [u for u in sim.units if u['team']==self.opp]
    def mine(self,sim): return [u for u in sim.units if u['team']==self.team]

    def aim_at(self, ang): return ang  # degrees

    def box_dist_to(self,box,x,y):
        dx=max(box['x1']-x,0.0,x-box['x2']); dy=max(box['y1']-y,0.0,y-box['y2'])
        return math.hypot(dx,dy)

    def safe_move_dir(self,u,tx,ty,box,margin=0.55):
        """pick 8-dir move toward target, never approaching `box` below margin"""
        d0=self.box_dist_to(box,u['x'],u['y'])
        carrying=False
        sp=self.rules['moveSpeed']*0.05
        best,bd='N',1e18
        for name,(vx,vy) in soccer.DIRS.items():
            if name=='N': continue
            nx=clamp(u['x']+vx*sp,0.34,self.W-0.34)
            ny=clamp(u['y']+vy*sp,0.34,self.H-0.34)
            nd=self.box_dist_to(box,nx,ny)
            if nd<margin and nd<d0-1e-9:
                continue
            d=math.hypot(tx-nx,ty-ny)
            if d<bd: bd,best=d,name
        return best

    def shot_clearance(self,sim,u,ty,frames=45):
        """simulate kick from u at target ty at goal line; opponents chase ball.
        returns min clearance or None if no goal possibility."""
        kp=self.rules['kickPower']; br=self.rules['ballRadius']
        ang=math.radians(math.degrees(math.atan2(ty-u['y'], self.gx_att-u['x'])))
        # angle in radians from degrees computed correctly:
        deg=math.degrees(math.atan2(ty-u['y'], self.gx_att-u['x']))
        ang=math.radians(deg)
        fx,fy=math.cos(ang),math.sin(ang)
        off=self.rules['unitRadius']+br+0.03
        b={'x':u['x']+fx*off,'y':u['y']+fy*off,'vx':fx*kp,'vy':fy*kp}
        # opponent model positions (straight chase of ball pos)
        opps=[{'u':o,'x':o['x'],'y':o['y']} for o in self.opps(sim)]
        dt=0.05; refl=self.rules['wallRestitution']
        minclear=1e9
        for t in range(frames):
            for _ in range(4):
                b['x']+=b['vx']*dt/4; b['y']+=b['vy']*dt/4
                if sim.in_goal_mouth(b['x'],b['y']) and (b['x']>=self.W-1.0 or b['x']<=1.0):
                    return minclear
                if sim.circle_hits_wall(b['x'],b['y'],br):
                    px=b['x']-b['vx']*dt/4; py=b['y']-b['vy']*dt/4
                    if sim.circle_hits_wall(b['x'],py,br): b['x']=px; b['vx']=-b['vx']*refl
                    if sim.circle_hits_wall(px,b['y'],br): b['y']=py; b['vy']=-b['vy']*refl
                    if sim.circle_hits_wall(b['x'],b['y'],br):
                        b['x']=px;b['y']=py;b['vx']=-b['vx']*refl;b['vy']=-b['vy']*refl
            b['vx']*=self.rules['ballFriction']; b['vy']*=self.rules['ballFriction']
            if math.hypot(b['vx'],b['vy'])<0.02: break
            # move opponents toward ball at max speed
            for o in opps:
                dx,dy=b['x']-o['x'],b['y']-o['y']; d=math.hypot(dx,dy) or 1
                mv=min(self.rules['moveSpeed']*dt,d)
                o['x']+=dx/d*mv; o['y']+=dy/d*mv
                K=o['u']
                rad=self.rules['controlRadius']
                if (K['index']==0 and math.hypot(b['vx'],b['vy'])>=self.rules['keeperMinSpeed']
                    and sim.in_pen(K['team'],b['x'],b['y']) and sim.in_pen(K['team'],o['x'],o['y'])):
                    rad=self.rules['keeperRadius']
                c=math.hypot(b['x']-o['x'],b['y']-o['y'])-rad
                if c<minclear: minclear=c
                if minclear<0.05: return None
        return None

    def pick_shot(self,sim,u):
        gd=math.hypot(self.gx_att-u['x'],13.0-u['y'])
        if gd>self.shoot_rng: return None
        # keeper y determines preferred side
        ky=None
        for o in self.opps(sim):
            if o['index']==0: ky=o['y']
        best=None
        for ty in (10.65,11.1,11.6,13.0,14.4,14.9,15.35):
            c=self.shot_clearance(sim,u,ty)
            if c is None or c<0.06: continue
            sc=c - abs(ty-13.0)*0.02
            if ky is not None and abs(ty-ky)>2.0: sc+=0.35
            if best is None or sc>best[0]: best=(sc,ty)
        return None if best is None else best[1]

    def straight_aim(self,sim,u,tx,ty):
        return math.degrees(math.atan2(ty-u['y'],tx-u['x']))

    def field_decide(self,sim,u,f):
        b=sim.ball
        if b['owner']==u['id']:
            ty=self.pick_shot(sim,u)
            if ty is not None:
                self.shots+=1
                return {'dir':'N','aim':self.straight_aim(sim,u,self.gx_att,ty),'kick':True}
            # choose wing side away from nearest opponent
            near=None; nd=1e9
            for o in self.opps(sim):
                d=math.hypot(o['x']-u['x'],o['y']-u['y'])
                if d<nd: nd,d0=d,o; near=o
            wy=4.8
            if near is not None and near['y']<13.0: wy=21.2
            tx=self.gx_att-self.s*6.0
            # if deep behind, first push forward
            d=self.safe_move_dir(u,tx,wy,self.box_opp)
            ang=self.straight_aim(sim,u,tx,wy)
            return {'dir':d,'aim':ang,'kick':False}
        # loose or opp owned: go to intercept
        return self.chase_decide(sim,u)

    def chase_decide(self,sim,u):
        b=sim.ball
        # intercept point of free ball or current ball pos
        tx,ty=b['x'],b['y']
        if b['owner'] is None:
            # simple lead
            for t in range(1,20):
                px=b['x']+b['vx']*0.05*t; py=b['y']+b['vy']*0.05*t
                if math.hypot(px-u['x'],py-u['y']) <= self.rules['moveSpeed']*0.05*t+0.6:
                    tx,ty=px,py; break
        else:
            o=sim.unit_by_id(b['owner'])
            if o is not None:
                tx=b['x']+ (b['x']-o['x'])*0.15
                ty=b['y']+ (b['y']-o['y'])*0.15
        tx=max(0.4,min(self.W-0.4,tx)); ty=max(0.4,min(self.H-0.4,ty))
        d=self.safe_move_dir(u,tx,ty,self.box_opp)
        return {'dir':d,'aim':None,'kick':False}

    def keeper_decide(self,sim,u,f):
        b=sim.ball
        if b['owner']==u['id']:
            # boot it upfield toward wing
            wy=4.8 if u['y']<13 else 21.2
            tx=self.gx_att-self.s*10.0
            return {'dir':'N','aim':self.straight_aim(sim,u,tx,wy),'kick':True}
        # track line to goal center at x = gx_def + s*2.6
        kx=self.gx_def+self.s*2.6
        # if ball is fast and inside box, move to crossing y
        ty=13.0+(b['y']-13.0)*0.5
        ty=clamp(ty,6.6,19.4)
        d=self.safe_move_dir(u,kx,ty,self.box_own,margin=0.0)
        return {'dir':d,'aim':None,'kick':False}

    def decide(self,sim,u,f):
        self.setup(sim)
        if self.n==1 or u['index']!=0:
            return self.field_decide(sim,u,f) if self.n>1 else self.solo_decide(sim,u,f)
        return self.keeper_decide(sim,u,f)

    def solo_decide(self,sim,u,f):
        b=sim.ball
        if b['owner']==u['id']:
            return self.field_decide(sim,u,f)
        # defense: if ball is heading to our goal and fast, cover line; else chase
        sp=math.hypot(b['vx'],b['vy'])
        if b['owner'] is None and sp>=self.rules['keeperMinSpeed']:
            # predicted crossing at x = gx_def + s*2.2
            kx=self.gx_def+self.s*2.2
            if abs(b['vx'])>1e-6:
                t=(kx-b['x'])/b['vx']
                if t>0:
                    yy=b['y']+b['vy']*t
                    if 4<yy<22:
                        ty=clamp(yy,6.6,19.4)
                        d=self.safe_move_dir(u,kx,ty,self.box_own,margin=0.0)
                        return {'dir':d,'aim':None,'kick':False}
        return self.chase_decide(sim,u)

    def plan(self,w):
        self.setup(w)
        sim=w.clone()
        frames=[]
        for f in range(20):
            mine={}
            for u in self.mine(sim):
                inp=self.decide(sim,u,f)
                mine[u['id']]=inp
            inputs={}
            # opponent: same bot policy mirrored (so it plays itself sensibly)
            for u in sim.units:
                if u['team']==self.team: inputs[u['id']]=mine[u['id']]
                else: inputs[u['id']]=self.opp_decide(sim,u,f)
            sim.step(inputs)
            frames.append([mine['t%du%d'%(self.team,i)] for i in range(self.n)])
        return frames

    def opp_decide(self,sim,u,f):
        """crude opponent model: chase ball, keeper line"""
        b=sim.ball
        if self.n>1 and u['index']==0:
            kx=self.gx_def-self.s*2.6
            ty=clamp(13.0+(b['y']-13.0)*0.5,6.6,19.4)
            a=math.degrees(math.atan2(ty-u['y'],kx-u['x']))
            return {'dir':oct_name(a),'aim':None,'kick':False}
        a=math.degrees(math.atan2(b['y']-u['y'],b['x']-u['x']))
        return {'dir':oct_name(a),'aim':None,'kick':False}
