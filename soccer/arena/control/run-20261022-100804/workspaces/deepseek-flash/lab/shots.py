"""Shot-scenario evaluator using agent.py's physics clone.

For a shooter at P aiming at goal-line target T, simulate 30 frames against
different keeper models. Reports goal / save / miss.
"""
import sys, math, itertools
sys.path.insert(0, '/workspace')
import agent as A

W, H = A.W, A.H
BOXES = {0:{'x1':1,'y1':6,'x2':10,'y2':20}, 1:{'x1':34,'y1':6,'x2':43,'y2':20}}

def mk_unit(uid, team, index, x, y, fx=1.0, fy=0.0):
    return {'id':uid,'team':team,'index':index,'name':uid,'x':x,'y':y,'fx':fx,'fy':fy,
            'kickCd':0,'controlLock':0,'stealLock':0,'foulLock':0,
            'held':{'dir':'N','aim':None,'kick':False}}

def mk_world(units, ball, tiles=None):
    w = A.World(tiles if tiles is not None else A.build_field()) if hasattr(A,'build_field') else A.World(tiles)
    return w

def build_field():
    tiles=[0]*(W*H)
    for y in range(H):
        for x in range(W):
            border = x==0 or y==0 or x==W-1 or y==H-1
            if not border: continue
            goal = (x==0 or x==W-1) and 10<=y<16
            if not goal: tiles[y*W+x]=1
    return tiles

TILES=build_field()

def world(units, ball):
    w=A.World(TILES)
    w.units=sorted(units,key=lambda u:(u['team'],u['index']))
    w.ball=dict(ball)
    return w

def keeper_guard(w, team):
    return A.keeper_guard_point(w, team)

def simulate_shot(shooter, target, keeper_model='agent', reaction_frames=0, n=3, defender_pos=None, frames=30):
    """shooter=(x,y), target=(43,ty). Returns ('goal'|'save'|'miss', final ball)."""
    att_team=0; def_team=1
    gx=43.0
    units=[]
    # attacker: shooter + a far teammate + keeper far away
    units.append(mk_unit('t0u0',0,0,3.0,13.0))
    units.append(mk_unit('t0u1',0,1,20.0,4.0))
    units.append(mk_unit('t0u2',0,2,shooter[0],shooter[1], fx=1.0,fy=0.0))
    # defender keeper at guard point
    w0=world(units,{'x':shooter[0]+0.62,'y':shooter[1],'vx':0.0,'vy':0.0,'owner':'t0u2'})
    kx,ky=A.keeper_guard_point(w0,def_team)
    if defender_pos: kx,ky=defender_pos
    units.append(mk_unit('t1u0',1,0,kx,ky,fx=-1.0,fy=0.0))
    if defender_pos is not None:
        units.append(mk_unit('t1u1',1,1,33.0,13.0,fx=-1.0,fy=0.0))
    else:
        units.append(mk_unit('t1u1',1,1,33.0,13.0,fx=-1.0,fy=0.0))
    if n>=3:
        units.append(mk_unit('t1u2',1,2,30.0,20.0,fx=-1.0,fy=0.0))
    w=world(units,{'x':shooter[0]+0.62,'y':shooter[1],'vx':0.0,'vy':0.0,'owner':'t0u2'})

    # defender window inputs
    try:
        dinputs=A.decide_frame(w, def_team, n, BOXES, allow_shot=False)
    except Exception as e:
        dinputs=[{'dir':'N','aim':None,'kick':False} for _ in range(n)]
    # keeper perfect model overrides keeper input each frame: move toward predicted intercept
    path=A.ball_path if False else None
    ang=math.degrees(math.atan2(target[1]-w.ball['y'], target[0]-w.ball['x']))
    ainputs=[{'dir':'N','aim':None,'kick':False} for _ in range(n)]
    ainputs[2]={'dir':'N','aim':ang,'kick':True}
    goal=None
    react=None
    for fi in range(frames):
        if fi>0 and fi%20==0:
            try:
                dinputs=A.decide_frame(w, def_team, n, BOXES, allow_shot=False)
            except Exception:
                pass
        # attacker input same every frame: kick only works when owner & no lock
        for u in w.units:
            if u['team']==0:
                u['held']=ainputs[u['index']]
            else:
                u['held']=dinputs[u['index']]
        if keeper_model=='perfect' and fi>=reaction_frames:
            # after reaction, keeper chases the ball path with full knowledge
            kp=[u for u in w.units if u['id']=='t1u0'][0]
            if w.ball['owner'] is None:
                pp=A.ball_path(w, 60)
                ip=A.intercept_point(kp, pp) if pp else None
                if ip:
                    dx,dy=ip[0]-kp['x'],ip[1]-kp['y']
                    dname=A.dir_toward(dx,dy)
                    u=[x for x in w.units if x['id']=='t1u0'][0]
                    u['held']={'dir':dname,'aim':None,'kick':False}
                    kp['held']=u['held']
        A.step(w, BOXES)
        if w.goal_scored is not None:
            return ('goal' if w.goal_scored==0 else 'own'), w.ball, fi
        if w.ball['owner'] and w.ball['owner'].startswith('t1'):
            return 'save', w.ball, fi
    return 'miss', w.ball, frames

def main():
    mode=sys.argv[1] if len(sys.argv)>1 else 'grid'
    if mode=='grid':
        print('shooter positions, best target over ty, vs agent keeper committed window')
        positions=[(x,y) for x in (33.0,34.5,36.0,38.0,40.0) for y in (3.5,4.5,5.0,8.0,13.0,18.0,21.5,22.5)]
        for P in positions:
            if 6<=P[1]<=20 and P[0]>=34: continue  # inside opponent box: illegal
            best=None
            for ty in [10.7,11.2,11.8,12.5,13.0,13.5,14.2,14.8,15.3]:
                r,ball,fi=simulate_shot(P,(43.0,ty),'agent')
                if r=='goal':
                    best=(ty,fi); break
            print(f"P=({P[0]:.1f},{P[1]:.1f}) -> {best}")
main()
