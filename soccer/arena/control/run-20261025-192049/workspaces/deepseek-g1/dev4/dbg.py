import importlib.util,sys,json,math
spec=importlib.util.spec_from_file_location('ag','agent2.py')
ag=importlib.util.module_from_spec(spec); spec.loader.exec_module(ag)
def load(obs):
    return ag.state_from_obs(obs)
def show(obs,label=''):
    st=load(obs); me=obs['yourTeam']
    cmds,my,opp,owner=ag.frame_commands(st,me)
    print('---',label,'me',me,'n',st.n,'ball(%.1f,%.1f) own=%s'%(st.bx,st.by,('t%d u%d'%(owner.team,owner.index)) if owner else None))
    roles,_,_,_=ag.plan_roles(st,me)
    for u in my:
        c=cmds.get(u.index)
        r=roles.get(u.index)
        print('  #%d (%.1f,%.1f) role=%s dir=%s aim=%s kick=%s'%(u.index,u.x,u.y,r,c.dir,c.aim,c.kick))
    if owner is not None and owner.team==me:
        u=owner
        sh=ag.best_shot_at(u.x,u.y,opp,me)
        print('  shot:',None if not sh else ('q=%.2f aim=%.1f ty=%.1f n=%d'%(sh[1],sh[2],sh[3],sh[4])))
        for ang in range(0,360,45):
            print('    kick %3d -> %.2f'%(ang,ag.eval_kick(st,u,ang,opp,[m for m in my if m.index!=0],me,{})))
