import sys, os, json, gzip, importlib.util, math
WS=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0,WS)
import agent as A
spec=importlib.util.spec_from_file_location('pol',os.path.join(WS,'policy.py'))
P=importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
path=sys.argv[1]; f=int(sys.argv[2])
d=json.load(gzip.open(path,'rt',encoding='utf-8')); me=d['seats'].index('deepseek-g1'); fmt=d['unitsFormat']
units=[]
for arr in d['frames'][f]['units']:
    u=dict(zip(fmt,arr))
    units.append({'id':u['id'],'team':u['team'],'index':u['index'],'x':u['x'],'y':u['y'],
                  'facing':{'x':u['fx'],'y':u['fy']},'hasBall':bool(u['hasBall']),
                  'keeper':bool(u['keeper']),'kickCd':u['kickCd'],'controlLock':u['controlLock']})
obs={'teamSize':d['teamSize'],'units':units,'ball':d['frames'][f]['ball'],'score':d['frames'][f]['score'],'frame':f,'freeze':0}
st=A.state_from_obs(obs)
owner=st.units[st.owner]
print('carrier',owner.team,owner.index,(round(owner.x,2),round(owner.y,2)))
for ty in P.SHOT_TARGETS:
    gx=P.opp_gx(me)
    ang=math.atan2(ty-owner.y, gx-owner.x)
    fx,fy=math.cos(ang),math.sin(ang)
    pts,gt,end=P.sim_ball(owner.x+fx*P.KICK_OFF, owner.y+fy*P.KICK_OFF, ang,160)
    if gt!=me: 
        print('ty',ty,'no goal',gt); continue
    risk=P.lane_risk(pts,st.units,0.5,skip=(owner,),delay=0.9,keeper_delay=1.0)
    # closest opponent details
    det=[]
    for o in st.units:
        if o is owner: continue
        m=9; mt=0
        for t,(x,y) in enumerate(pts):
            dd=math.hypot(x-o.x,y-o.y)
            if dd<m: m=dd; mt=t
        det.append((o.team,o.index,round(m,2),round(mt/20,2)))
    det.sort(key=lambda z:z[2])
    print('ty %.2f ang %.1f risk %.2f  closest %s'%(ty,math.degrees(ang)%360,risk,det[:2]))
