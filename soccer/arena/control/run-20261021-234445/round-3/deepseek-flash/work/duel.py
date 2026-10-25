import sys, math
sys.path.insert(0,'/workspace'); sys.path.insert(0,'/workspace/work'); sys.path.insert(0,'/workspace/tools')
import soccer
from soccer_meta import get_meta
META=get_meta(); RULES=META['rules']; W,H=META['W'],META['H']

def new1():
    w=soccer.World(W,H,META['tiles'],RULES,META['penaltyBoxes'],META['goals'],1)
    w.spawns={0:[[22,13]],1:[[18,13]]}
    a=w.add_unit(0,0,'t0u0'); b=w.add_unit(1,0,'t1u0')
    a['x'],a['y']=22,13; b['x'],b['y']=18,13
    w.ball={'x':22.62,'y':13,'vx':0,'vy':0,'owner':'t0u0','lastTouch':'t0u0','lastTeam':0}
    return w,a,b

def run(policy_carrier, policy_chaser, frames=300, a0=(22,13), b0=(18,13), target=(38,5.5)):
    w,a,b=new1(); a['x'],a['y']=a0; b['x'],b['y']=b0
    if w.ball['owner']=='t0u0':
        w.ball['x']=a['x']+0.62; w.ball['y']=a['y']
    for f in range(frames):
        ia=policy_carrier(w,a,target)
        ib=policy_chaser(w,a,b)
        w.step({'t0u0':ia,'t1u0':ib})
        if w.ball['owner']!='t0u0':
            return f, 'lost', w.ball['owner'], (a['x'],a['y'],b['x'],b['y'])
    return frames,'kept',w.ball['owner'],(a['x'],a['y'],b['x'],b['y'])

def d2(x0,y0,x1,y1): return math.hypot(x1-x0,y1-y0)

def carrier_shield(w,a,target):
    b=w.ball
    # face away from chaser
    ops=[u for u in w.units if u['team']!=a['team']]
    near=min(ops,key=lambda o:d2(a['x'],a['y'],o['x'],o['y'])) if ops else None
    if near is not None:
        ax,ay=a['x']-near['x'],a['y']-near['y']
        face=math.degrees(math.atan2(ay,ax))
    else: face=None
    # move toward target
    ang=math.degrees(math.atan2(target[1]-a['y'],target[0]-a['x']))
    # 8-dir toward target
    from brain import oct_name
    d=oct_name(ang)
    return {'dir':d,'aim':face,'kick':False}

def carrier_face_target(w,a,target):
    ang=math.degrees(math.atan2(target[1]-a['y'],target[0]-a['x']))
    from brain import oct_name
    return {'dir':oct_name(ang),'aim':ang,'kick':False}

def chaser_ball(w,a,b):
    bx,by=w.ball['x'],w.ball['y']
    ang=math.degrees(math.atan2(by-b['y'],bx-b['x']))
    from brain import oct_name
    return {'dir':oct_name(ang),'aim':None,'kick':False}

def chaser_predict(w,a,b):
    b_=w.ball
    # aim at ball's future pos (lead)
    best=(b_['x'],b_['y']); bd=1e9
    for t in range(1,20):
        px=b_['x']+b_['vx']*0.05*t; py=b_['y']+b_['vy']*0.05*t
        dd=d2(px,py,b['x'],b['y'])-RULES['moveSpeed']*0.05*t
        if dd<bd: bd=dd;best=(px,py)
    ang=math.degrees(math.atan2(best[1]-b['y'],best[0]-b['x']))
    from brain import oct_name
    return {'dir':oct_name(ang),'aim':None,'kick':False}

if __name__=='__main__':
    for name,pc in (('shield',carrier_shield),('face-target',carrier_face_target)):
        for cn,ch in (('chase',chaser_ball),('predict',chaser_predict)):
            for a0,b0,tgt in (((22,13),(18,13),(38,5.5)), ((30,13),(26,13),(38,5.5)), ((33.5,8),(30,8),(40,5.2)), ((22,13),(18,10),(38,5.5))):
                f,res,ow,pos=run(pc,ch,300,a0,b0,tgt)
                print(f'{name:12s} vs {cn:8s} a={a0} b={b0} -> {res} at frame {f} owner {ow} pos {tuple(round(v,1) for v in pos)}')
