import sys, os, json, gzip, importlib.util
WS=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0,WS)
import agent as A
spec=importlib.util.spec_from_file_location('pol',os.path.join(WS,'policy.py'))
P=importlib.util.module_from_spec(spec); spec.loader.exec_module(P)

path=sys.argv[1]; frames=[int(x) for x in sys.argv[2].split(',')]
d=json.load(gzip.open(path,'rt',encoding='utf-8'))
seat=d['seats'].index('deepseek-g1'); me=seat
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
            'freeze':fr.get('freeze',0),'golden':fr.get('golden',False),'half':fr.get('half',1)}
for f in frames:
    fr=d['frames'][f]
    obs=obs_from_frame(fr); st=A.state_from_obs(obs)
    my=[u for u in st.units if u.team==me]
    owner=st.units[st.owner] if 0<=st.owner<len(st.units) else None
    print('=== frame',f,'ball',round(st.bx,2),round(st.by,2),'owner',('t%du%d'%(owner.team,owner.index)) if owner else None)
    print('  my',[(u.index,round(u.x,1),round(u.y,1)) for u in my])
    plan=P.build_plan(st,me,n)
    print('  plan',{k:(v if k!='spots' else {kk:(round(vv[0],1),round(vv[1],1)) for kk,vv in v.items()}) for k,v in plan.items()})
    cmds=P.exec_plan(st,me,n,plan,A)
    print('  cmds',{k:(v[0],None if v[1] is None else round(v[1],1),v[2]) for k,v in cmds.items()})
    if owner is not None and owner.team==me and owner.index!=0:
        sh=P.best_shot(st,owner,me,st.units)
        print('  best_shot',None if sh is None else (round(sh[0],2),round(sh[1]*57.3,1),round(sh[2],2)),'should',sh is not None and P.should_shoot(st,owner,me,sh))
