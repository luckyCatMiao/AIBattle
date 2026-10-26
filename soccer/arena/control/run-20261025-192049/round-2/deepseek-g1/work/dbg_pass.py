import sys, os, json, gzip, importlib.util, math
WS=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0,WS)
import agent as A
spec=importlib.util.spec_from_file_location('pol',os.path.join(WS,'policy.py'))
P=importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
path=sys.argv[1]; fs=[int(x) for x in sys.argv[2].split(',')]
d=json.load(gzip.open(path,'rt',encoding='utf-8')); me=d['seats'].index('deepseek-g1'); fmt=d['unitsFormat']; n=d['teamSize']
def obs(fr):
    units=[]
    for arr in fr['units']:
        u=dict(zip(fmt,arr))
        units.append({'id':u['id'],'team':u['team'],'index':u['index'],'x':u['x'],'y':u['y'],
                      'facing':{'x':u['fx'],'y':u['fy']},'hasBall':bool(u['hasBall']),
                      'keeper':bool(u['keeper']),'kickCd':u['kickCd'],'controlLock':u['controlLock']})
    return {'teamSize':n,'units':units,'ball':fr['ball'],'score':fr['score'],'frame':fr['frame'],'freeze':0}
for f in fs:
    st=A.state_from_obs(obs(d['frames'][f]))
    my=[u for u in st.units if u.team==me]; opp=[u for u in st.units if u.team!=me]
    owner=st.units[st.owner] if 0<=st.owner<len(st.units) else None
    if owner is None or owner.team!=me: print('frame',f,'no owner'); continue
    plan=P.build_plan(st,me,n)
    u=owner
    mates=[z for z in my if z.index!=0 and z is not u]+[my[0]]
    print('frame',f,'carrier',u.index,(round(u.x,1),round(u.y,1)),'mode',plan['mode'],'spots',{k:(round(v[0],1),round(v[1],1)) for k,v in plan['spots'].items()})
    for m in mates:
        spot=plan['spots'].get(m.index)
        po=P.pass_option(st,u,m,me,st.units,spot,0.55)
        print('   ->',m.index,(round(m.x,1),round(m.y,1)),'spot',None if spot is None else (round(spot[0],1),round(spot[1],1)),
              'opt',None if po is None else (round(po[0],2),round(math.degrees(po[1])%360,1),round(po[2],1),round(po[3],1),round(po[4],2)))
    print('   best_pass',P.best_pass(st,u,me,mates,st.units,plan['spots']))
    print('   best_shot',P.best_shot(st,u,me,st.units))
