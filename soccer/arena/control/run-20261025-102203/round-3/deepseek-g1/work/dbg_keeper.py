import sys, os, json, gzip, importlib.util, math
WS=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0,WS)
import agent as A
spec=importlib.util.spec_from_file_location('pol',os.path.join(WS,'policy.py'))
P=importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
path=sys.argv[1]; frames=[int(x) for x in sys.argv[2].split(',')]
d=json.load(gzip.open(path,'rt',encoding='utf-8')); me=d['seats'].index('deepseek-g1'); fmt=d['unitsFormat']
def obs(fr):
    units=[]
    for arr in fr['units']:
        u=dict(zip(fmt,arr))
        units.append({'id':u['id'],'team':u['team'],'index':u['index'],'x':u['x'],'y':u['y'],
                      'facing':{'x':u['fx'],'y':u['fy']},'hasBall':bool(u['hasBall']),
                      'keeper':bool(u['keeper']),'kickCd':u['kickCd'],'controlLock':u['controlLock']})
    return {'teamSize':d['teamSize'],'units':units,'ball':fr['ball'],'score':fr['score'],'frame':fr['frame'],'freeze':0}
for f in frames:
    st=A.state_from_obs(obs(d['frames'][f]))
    my=[u for u in st.units if u.team==me]; opp=[u for u in st.units if u.team!=me]
    keeper=my[0]; fielders=[u for u in my if u.index!=0]
    print('frame',f,'ball owner',st.owner,'keeper',(round(keeper.x,1),round(keeper.y,1)))
    for m in fielders:
        lo=P.long_ball_from(keeper.x,keeper.y,me,m,opp,st.units)
        print('   from here to mate',m.index,(round(m.x,1),round(m.y,1)),'->',None if lo is None else (round(lo[0],2),round(math.degrees(lo[1])%360,1)))
    for ps in P.punt_spots(me):
        for m in fielders:
            lo=P.long_ball_from(ps[0],ps[1],me,m,opp,st.units)
            print('   from punt',(round(ps[0],1),round(ps[1],1)),'to',m.index,'->',None if lo is None else (round(lo[0],2),round(math.degrees(lo[1])%360,1),tuple(round(v,1) for v in lo[2])))
    cm=P.keeper_hold_cmd(st,keeper,me,fielders,opp)
    print('   keeper_hold_cmd ->',(cm[0],None if cm[1] is None else round(cm[1],1),cm[2]))
