import gzip,json,os,math,sys
sys.path.insert(0,'.')
import agent_v2 as A
P=r"D:\extraProj\AIBattle\soccer\arena\control\practice-20261025-020536"
g=5
d=json.load(gzip.open(os.path.join(P,f"r1-g{g}.json.gz"))); fr=d['frames']
me=d['seats'].index('deepseek-g1')
w0=d['windows'][5]; f0=w0['frame']-20   # start=80
obs=fr[f0]; obs['map']=d['map']
st0=A.state_from_obs(obs)
mode=A.select_mode(st0,me)
w=A.build_wctx(st0,None,me,mode)
st=st0.clone()
print("start",f0,"ball",st.bx,st.by,"owner",st.owner)
for f in range(20):
    cmds=A.frame_commands_v2(st,me,w)
    inp=[]
    for u in st.units:
        if u.team==me:
            c=cmds.get(u.index) or A.Cmd()
            aim=None
            if c.aim is not None:
                a=math.radians(c.aim%360); aim=(math.cos(a),math.sin(a))
            inp.append((c.dir,aim,bool(c.kick)))
        else:
            inp.append((A.opp_pred_dir(st,u,w,f),None,False))
    got=A.step(st,inp,st.kickoffTeam)
    if got>=0:
        st.score[got]+=1; A.kickoff(st,1-got)
    # compare
    tr=fr[f0+f+1]
    maxd=0; who=None
    for u in st.units:
        u2=[q for q in tr['units'] if q['team']==u.team and q['index']==u.index][0]
        dd=math.hypot(u.x-u2['x'],u.y-u2['y'])
        if dd>maxd: maxd=dd; who=(u.team,u.index)
    bd=math.hypot(st.bx-tr['ball']['x'],st.by-tr['ball']['y'])
    print(f" f{f:2d} simball=({st.bx:.1f},{st.by:.1f}) real=({tr['ball']['x']:.1f},{tr['ball']['y']:.1f}) bd={bd:.2f} maxd={maxd:.2f}@{who} simowner={st.owner} realowner={tr['ball']['owner']}")
