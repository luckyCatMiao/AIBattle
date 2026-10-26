# -*- coding: utf-8 -*-
import math, os, sys
WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, WS); sys.path.insert(0, os.path.join(WS, 'work'))
import agent as A, policy2 as P, simtest as S
P.set_engine(A.step)
seed=int(sys.argv[1]); n=int(sys.argv[2]); me=int(sys.argv[3])
st=S.make_match(seed,n); opp=1-me
P.TRACE=[]
prev=0.0
for sec in range(125):
    P.TRACE=[]
    our=P.decide(st,me,n,A); their=S.opp_rows_for(st,opp)
    for tr in P.TRACE[:2]:
        print('  DEC t=%.1f u%d (%.1f,%.1f) shot=%.2f ty=%s pass=%s style=%s'%(
            tr['f']/20.0,tr['idx'],tr['x'],tr['y'],tr['shot'],tr['ty'],tr['pass'],tr['style']))
    for f in range(20):
        if st.status!='playing': break
        inp=[]
        for u in st.units:
            if u.team==me: inp.append(our[f].get((me,u.index)) or ('N',None,False))
            else: inp.append(their[f].get(u.index) or ('N',None,False))
        g=A.step(st,inp,st.kickoffTeam)
        sp=math.hypot(st.bvx,st.bvy)
        if sp>9.5 and prev<9.5:
            ang=math.degrees(math.atan2(st.bvy,st.bvx))%360
            print('  KICK %s t=%.1f (%.1f,%.1f) ang=%.0f d=%.1f'%('ME' if st.lastTeam==me else 'OPP',st.frame/20,st.bx,st.by,ang,abs((43.0 if st.lastTeam==0 else 1.0)-st.bx)))
        prev=sp
        if g>=0:
            st.score[g]+=1; print('GOAL','ME' if g==me else 'OPP','t=%.1f'%(st.frame/20),st.score); S.kickoff_jitter(st,1-g)
    if st.frame>=2400 and not st.golden:
        if st.score[0]==st.score[1]: st.golden=True; st.goldenEnd=st.frame+400
        else: break
print('final',st.score)
