import sys, math
sys.path.insert(0,'/workspace')
import physics, policy, soccer_test as T

def count_shots(events, team, gx):
    shots=0; goals=0
    for e in events:
        if e[1]=='goal' and e[2]==team: goals+=1
        if e[1]!='kick' or not e[2].startswith('t%d'%team): continue
        x,y,ang=e[3],e[4],e[5]
        fx,fy=math.cos(math.radians(ang)),math.sin(math.radians(ang))
        if abs(fx)<1e-6: continue
        s=(gx-x)/fx
        if s<=0 or s>24: continue
        yy=y+fy*s
        if 9.8<=yy<=16.2: shots+=1
    return shots,goals

def match(pa,pb,label):
    w=physics.World()
    while w.status=='playing' and w.frame<2400:
        wa=pa.plan(T.make_obs(w,0)); wb=pb.plan(T.make_obs(w,1))
        for i in range(20):
            if w.status!='playing': break
            w.step({0:wa['inputs'][i],1:wb['inputs'][i]})
    s0,g0=count_shots(w.events,0,43); s1,g1=count_shots(w.events,1,0)
    print('%-28s score %d-%d  shots %d/%d'%(label,w.score[0],w.score[1],s0,s1))
    return w.score

for bias in (-1.5,-1.0,-0.5,0.0,0.5):
    print('--- shot_bias',bias)
    for k in range(2):
        a=policy.Agent({'shot_bias':bias}); b=policy.Agent({'shot_bias':bias})
        match(a,b,'self#%d'%k)
    for name,cls in [('Simple',T.SimpleBot),('Motion',T.MotionBot)]:
        a=policy.Agent({'shot_bias':bias}); b=cls()
        match(a,b,'A0 vs %s'%name)
        a=policy.Agent({'shot_bias':bias}); b=cls()
        match(b,a,'%s vs A1'%name)
