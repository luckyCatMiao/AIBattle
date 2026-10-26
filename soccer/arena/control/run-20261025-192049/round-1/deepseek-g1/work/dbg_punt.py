import sys, os, json, gzip, importlib.util, math
WS=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0,WS)
import agent as A
spec=importlib.util.spec_from_file_location('pol',os.path.join(WS,'policy.py'))
P=importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
path=sys.argv[1]; frames=[int(x) for x in sys.argv[2].split(',')]
d=json.load(gzip.open(path,'rt',encoding='utf-8')); me=d['seats'].index('deepseek-g1')
fmt=d['unitsFormat']; n=d['teamSize']
def obs_from_frame(fr):
    units=[]
    for arr in fr['units']:
        u=dict(zip(fmt,arr))
        units.append({'id':u['id'],'team':u['team'],'index':u['index'],'x':u['x'],'y':u['y'],
                      'facing':{'x':u['fx'],'y':u['fy']},'hasBall':bool(u['hasBall']),
                      'keeper':bool(u['keeper']),'kickCd':u['kickCd'],'controlLock':u['controlLock']})
    b=fr['ball']
    return {'teamSize':d['teamSize'],'units':units,'ball':b,'score':fr['score'],'frame':fr['frame'],
            'freeze':0,'golden':False,'half':1}
for f in frames:
    st=A.state_from_obs(obs_from_frame(d['frames'][f]))
    my=[u for u in st.units if u.team==me]; opp=[u for u in st.units if u.team!=me]
    owner=st.units[st.owner] if 0<=st.owner<len(st.units) else None
    print('frame',f,'owner',(owner.team,owner.index) if owner else None)
    keeper=my[0]
    for m in my[1:]:
        lo=P.long_ball(st,keeper,me,m,opp)
        ang=math.atan2(m.y-keeper.y,m.x-keeper.x)
        print('  mate',m.index,'pos',(round(m.x,1),round(m.y,1)),'dist',round(math.hypot(m.x-keeper.x,m.y-keeper.y),1),'angle',round(math.degrees(ang)%360,1),'->',None if lo is None else (round(lo[0],2),round(math.degrees(lo[1])%360,1),tuple(round(v,1) for v in lo[2])))
    print('  punt_aim',None if P.punt_aim(st,keeper,me) is None else round(math.degrees(P.punt_aim(st,keeper,me))%360,1))
