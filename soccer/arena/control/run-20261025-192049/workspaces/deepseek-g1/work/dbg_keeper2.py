import sys, os, json, gzip, importlib.util, math
WS=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0,WS)
import agent as A
spec=importlib.util.spec_from_file_location('pol',os.path.join(WS,'policy.py'))
P=importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
path=r'D:/extraProj/AIBattle/soccer/arena/control/practice-20261025-153805/r1-g6.json.gz'
d=json.load(gzip.open(path,'rt',encoding='utf-8')); me=d['seats'].index('deepseek-g1'); fmt=d['unitsFormat']
def obs(fr):
    units=[]
    for arr in fr['units']:
        u=dict(zip(fmt,arr))
        units.append({'id':u['id'],'team':u['team'],'index':u['index'],'x':u['x'],'y':u['y'],
                      'facing':{'x':u['fx'],'y':u['fy']},'hasBall':bool(u['hasBall']),
                      'keeper':bool(u['keeper']),'kickCd':u['kickCd'],'controlLock':u['controlLock']})
    return {'teamSize':d['teamSize'],'units':units,'ball':fr['ball'],'score':fr['score'],'frame':fr['frame'],'freeze':0}
st=A.state_from_obs(obs(d['frames'][482]))
my=[u for u in st.units if u.team==me]; opp=[u for u in st.units if u.team!=me]
px,py=40.4,19.4
m=[u for u in my if u.index==3][0]
print('mate',m.index,m.x,m.y)
ang=math.atan2(m.y-py,m.x-px); fx,fy=math.cos(ang),math.sin(ang)
sx,sy=px+fx*P.KICK_OFF,py+fy*P.KICK_OFF
pts,gt,end=P.sim_ball(sx,sy,ang,160)
print('gt',gt,'npts',len(pts))
lx,ly=pts[-1] if pts else end
print('landing',lx,ly,'adv',(lx-px)*P.atk(me))
tb=P.frames_for_dist(math.hypot(lx-px,ly-py))/20.0
tm=math.hypot(m.x-lx,m.y-ly)/P.MOV
print('tb',tb,'tm',tm,'to',min(math.hypot(o.x-lx,o.y-ly)/P.MOV for o in opp))
print('to who',[(o.index,round(math.hypot(o.x-lx,o.y-ly)/P.MOV,2)) for o in opp])
opp_only=[x for x in st.units if x.team!=me]
print('risk opp_only',P.lane_risk(pts,opp_only,0.7,skip=(m,),delay=0.5))
print('risk all',P.lane_risk(pts,st.units,0.7,skip=(m,),delay=0.5))
print('long_ball_from',P.long_ball_from(px,py,me,m,opp,st.units))
