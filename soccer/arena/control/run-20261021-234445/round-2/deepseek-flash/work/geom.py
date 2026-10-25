"""Shot geometry experiments on the faithful Python engine."""
import sys, math
sys.path.insert(0,'/workspace')
sys.path.insert(0,'/workspace/tools')
import soccer
from soccer_meta import get_meta
META=get_meta()
W,H=META['W'],META['H']

def build(shooter, keeper, defenders, n=2, kicker_team=0):
    w=soccer.World(W,H,META['tiles'],META['rules'],META['penaltyBoxes'],META['goals'],n)
    w.spawns={int(k):v for k,v in META['spawns_by_n'][str(n)].items()}
    w.kickoffTeam=0
    # units: our team 0 shooter index1, keeper index0; opponents team1 index0 keeper, index1 defender(s)
    u0=w.add_unit(0,0,'t0u0'); u0['x']=2.5; u0['y']=13.0
    us=w.add_unit(0,1,'t0u1'); us['x'],us['y']=shooter
    k=w.add_unit(1,0,'t1u0'); k['x'],k['y']=keeper
    for i,(dx,dy) in enumerate(defenders):
        d=w.add_unit(1,1+i,'t1u%d'%(1+i)); d['x'],d['y']=dx,dy
    w.ball={'x':us['x'],'y':us['y'],'vx':0,'vy':0,'owner':'t0u1','lastTouch':'t0u1','lastTeam':0}
    return w,us,k

def run_shot(shooter, keeper, defenders, target_y, keeper_mode='still', frames=70, defender_mode='still', aim_at_goal_line=True):
    w,us,k=build(shooter,keeper,defenders,n=2)
    gx=W-1.0
    ang=math.degrees(math.atan2(target_y-us['y'], gx-us['x']))
    inputs={}
    frames_out=[]
    for f in range(frames):
        b=w.ball
        inputs={'t0u0':{'dir':'N','aim':None,'kick':False},
                't0u1':{'dir':'N','aim':ang,'kick':(f==0)}}
        for o in w.units:
            if o['team']==1:
                # keeper
                if o['index']==0:
                    if keeper_mode=='still':
                        inputs[o['id']]={'dir':'N','aim':None,'kick':False}
                    elif keeper_mode=='predict':
                        # clairvoyant: move toward ball's current position (fast reactions)
                        dx=b['x']-o['x']; dy=b['y']-o['y']; dd=math.hypot(dx,dy) or 1
                        a=math.degrees(math.atan2(dy,dx))
                        from brain import oct_name
                        inputs[o['id']]={'dir':oct_name(a),'aim':None,'kick':False}
                    elif keeper_mode=='line':
                        # stay on ball->goal-centre line at x=41
                        if b['owner'] or (b['vx']==0 and b['vy']==0):
                            bx,by=b['x'],b['y']
                        else:
                            bx,by=b['x'],b['y']
                        bx0,by0=shooter
                        t=(41-bx0)/((gx)-bx0) if abs(gx-bx0)>1 else 0
                        ty=by0+t*(13.0-by0)
                        ty=max(10.8,min(15.2,ty))
                        from brain import oct_name
                        a=math.degrees(math.atan2(ty-o['y'],41-o['x']))
                        inputs[o['id']]={'dir':oct_name(a),'aim':None,'kick':False}
                else:
                    if defender_mode=='still':
                        inputs[o['id']]={'dir':'N','aim':None,'kick':False}
                    else:
                        dx=b['x']-o['x']; dy=b['y']-o['y']; dd=math.hypot(dx,dy) or 1
                        from brain import oct_name
                        a=math.degrees(math.atan2(dy,dx))
                        inputs[o['id']]={'dir':oct_name(a),'aim':None,'kick':False}
        w.step(inputs)
        frames_out.append((w.frame,w.ball['x'],w.ball['y'],w.score[0],w.ball['owner']))
        if w.score[0] or w.score[1] or w.status!='playing':
            break
        # if ball no longer free/owned by us and stopped, break
    if w.score[0]: return 'goal',w.frame,frames_out
    if w.score[1]: return 'own',w.frame,frames_out
    return 'no',w.frame,frames_out

if __name__=='__main__':
    print('shooter x sweep, keeper x=41 center y=13, target corners')
    for sx in (24,26,28,30,32,33.4):
        for ty in (10.7,11.2,13.0,14.8,15.3):
            row=[]
            for km in ('still','line','predict'):
                out,f,fo=run_shot((sx,13.0),(41,13.0),[],ty,keeper_mode=km)
                row.append('%s:%s@%d'%(km,out,f))
            print(f'x={sx:5.1f} ty={ty:4.1f} ', ' '.join(row))
