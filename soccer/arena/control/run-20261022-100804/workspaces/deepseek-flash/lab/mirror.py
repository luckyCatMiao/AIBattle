import sys, math
sys.path.insert(0,'/workspace')
import agent as A
W,H=44,26
BOXES={0:{'x1':1,'y1':6,'x2':10,'y2':20},1:{'x1':34,'y1':6,'x2':43,'y2':20}}
def build_field():
    tiles=[0]*(W*H)
    for y in range(H):
        for x in range(W):
            border=x==0 or y==0 or x==W-1 or y==H-1
            if not border: continue
            goal=(x==0 or x==W-1) and 10<=y<16
            if not goal: tiles[y*W+x]=1
    return tiles
TILES=build_field()
def mk(uid,team,index,x,y,fx=1.0,fy=0.0,**kw):
    d={'id':uid,'team':team,'index':index,'name':uid,'x':x,'y':y,'fx':fx,'fy':fy,
       'kickCd':kw.get('kickCd',0),'controlLock':kw.get('controlLock',0),'stealLock':0,'foulLock':0,
       'held':{'dir':'N','aim':None,'kick':False}}
    return d
def world(units,ball):
    w=A.World(TILES); w.units=sorted(units,key=lambda u:(u['team'],u['index'])); w.ball=dict(ball); return w

def scenario(team, ballpos, ballv, keeperpos):
    # team=0: defending left; team=1 defending right (mirror)
    units=[]
    if team==0:
        units.append(mk('t0u0',0,0,*keeperpos))
        units.append(mk('t0u1',0,1,8.0,8.0))
        units.append(mk('t0u2',0,2,10.0,18.0))
        units.append(mk('t1u0',1,0,41.0,13.0,fx=-1))
        units.append(mk('t1u1',1,1,14.0,10.0,fx=-1))
        units.append(mk('t1u2',1,2,16.0,16.0,fx=-1))
    else:
        units.append(mk('t0u0',0,0,3.0,13.0,fx=1))
        units.append(mk('t0u1',0,1,30.0,10.0,fx=1))
        units.append(mk('t0u2',0,2,28.0,16.0,fx=1))
        units.append(mk('t1u0',1,0,*keeperpos,fx=-1))
        units.append(mk('t1u1',1,1,36.0,8.0,fx=-1))
        units.append(mk('t1u2',1,2,34.0,18.0,fx=-1))
    ball={'x':ballpos[0],'y':ballpos[1],'vx':ballv[0],'vy':ballv[1],'owner':None}
    return world(units,ball)

# A: team0 keeper at (2.3,13), ball (6,15) v(-5.4,-4.3)
wa=scenario(0,(6.0,15.0),(-5.4,-4.3),(2.3,13.0))
# B: mirrored: x'=44-x, vx'=-vx; team1 keeper at (41.7,13), ball (38,15) v(5.4,-4.3)
wb=scenario(1,(38.0,15.0),(5.4,-4.3),(41.7,13.0))
oa=A.decide_frame(wa,0,3,BOXES,allow_shot=False)
ob=A.decide_frame(wb,1,3,BOXES,allow_shot=False)
print("A keeper:",oa[0])
print("B keeper:",ob[0])
# mirror check: dir names mirror L<->R, UL<->UR, DL<->DR
MIR={'N':'N','U':'U','D':'D','L':'R','R':'L','UL':'UR','UR':'UL','DL':'DR','DR':'DL'}
print("B keeper mirrored back:",{**ob[0],'dir':MIR[ob[0]['dir']]})
# print targets
def dbg(team,ballpos,ballv,kp):
    w=scenario(team,ballpos,ballv,kp)
    b=w.ball
    gx0=A.own_goal_x(team)
    dgoal=math.hypot(b['x']-gx0,b['y']-13)
    attv=1.0 if team==0 else -1.0
    incoming=b['vx']*attv < -1.2
    path=A.ball_path(w,45)
    k=[u for u in w.units if u['team']==team and u['index']==0][0]
    ipt=A.intercept_point(k,path) if path else None
    print("team",team,"dgoal",round(dgoal,2),"incoming",incoming,"guard",tuple(round(v,2) for v in A.keeper_guard_point(w,team)),"ipt",ipt,"pathlen",len(path),"last",path[-1] if path else None)
dbg(0,(6.0,15.0),(-5.4,-4.3),(2.3,13.0))
dbg(1,(38.0,15.0),(5.4,-4.3),(41.7,13.0))
