import sys, os, json, gzip, importlib.util, math
WS=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0,WS)
import agent as A
spec=importlib.util.spec_from_file_location('pol',os.path.join(WS,'policy.py'))
P=importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
path=r'D:/extraProj/AIBattle/soccer/arena/control/practice-20261025-152527/r1-g6.json.gz'
d=json.load(gzip.open(path,'rt',encoding='utf-8')); me=d['seats'].index('deepseek-g1')
fmt=d['unitsFormat']
def obs_from_frame(fr):
    units=[]
    for arr in fr['units']:
        u=dict(zip(fmt,arr))
        units.append({'id':u['id'],'team':u['team'],'index':u['index'],'x':u['x'],'y':u['y'],
                      'facing':{'x':u['fx'],'y':u['fy']},'hasBall':bool(u['hasBall']),
                      'keeper':bool(u['keeper']),'kickCd':u['kickCd'],'controlLock':u['controlLock']})
    return {'teamSize':d['teamSize'],'units':units,'ball':fr['ball'],'score':fr['score'],'frame':fr['frame'],'freeze':0}
st=A.state_from_obs(obs_from_frame(d['frames'][600]))
my=[u for u in st.units if u.team==me]; opp=[u for u in st.units if u.team!=me]
u=my[0]
for m in my[1:]:
    ang=math.atan2(m.y-u.y,m.x-u.x); fx,fy=math.cos(ang),math.sin(ang)
    sx,sy=u.x+fx*P.KICK_OFF,u.y+fy*P.KICK_OFF
    pts,gt,end=P.sim_ball(sx,sy,ang,160)
    lx,ly=pts[-1] if pts else end
    print('mate',m.index,'dist',round(math.hypot(m.x-u.x,m.y-u.y),1),'gt',gt,'npts',len(pts),'landing',(round(lx,1),round(ly,1)),
          'adv',round((lx-u.x)*P.atk(me),1),'tm',round(math.hypot(m.x-lx,m.y-ly)/P.MOV,2),
          'tb',round(P.frames_for_dist(math.hypot(lx-u.x,ly-u.y))/20.0,2),
          'to',round(min(math.hypot(o.x-lx,o.y-ly)/P.MOV for o in opp),2),
          'risk',round(P.lane_risk(pts,st.units,0.7,skip=(u,m),delay=0.5),2))
