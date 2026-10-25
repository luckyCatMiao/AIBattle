import gzip,json,os,math,sys
sys.path.insert(0,'.')
import agent
P=r"D:\extraProj\AIBattle\soccer\arena\control\practice-20261025-074632"
DIRV={'N':(0,0),'U':(0,-1),'D':(0,1),'L':(-1,0),'R':(1,0),'UL':(-.7071067811865476,-.7071067811865476),'UR':(.7071067811865476,-.7071067811865476),'DL':(-.7071067811865476,.7071067811865476),'DR':(.7071067811865476,.7071067811865476)}
mism=0; tot=0; worst=0; checked=0; skipped=0
for g in range(1,7):
    d=json.load(gzip.open(os.path.join(P,f"r1-g{g}.json.gz"))); fr=d['frames']; ev=d['final']['events']
    badframes={e['frame'] for e in ev if e['type'] in ('goal','foul')}
    for w in d['windows']:
        f0=w['frame']-20
        if f0<0: continue
        if any(f0<bf<=w['frame'] for bf in badframes): skipped+=1; continue
        obs=fr[f0]
        st=agent.state_from_obs(obs)
        ok=True
        for k in range(20):
            inp=[]
            for u in st.units:
                row=w['inputs'][u.team][k][u.index]
                aim=row.get('aim')
                av=None
                if aim is not None:
                    a=math.radians(aim); av=(math.cos(a),math.sin(a))
                inp.append((row['dir'],av,bool(row['kick'])))
            agent.step(st,inp,st.kickoffTeam)
            if st.status!='playing': break
            st2=fr[f0+k+1]
            maxd=0
            for u in st.units:
                u2=[q for q in st2['units'] if q['team']==u.team and q['index']==u.index][0]
                maxd=max(maxd,math.hypot(u.x-u2['x'],u.y-u2['y']))
            bd=math.hypot(st.bx-st2['ball']['x'],st.by-st2['ball']['y'])
            own=st.owner; own2=st2['ball']['owner']; exp=None
            if own>=0:
                u=st.units[own]; exp='t%du%d'%(u.team,u.index)
            tot+=1; worst=max(worst,maxd,bd)
            if maxd>0.02 or bd>0.03 or (exp!=own2 and not (exp is None and own2 is None)):
                mism+=1
                if mism<6:
                    print(f"g{g} win end={w['frame']} step {k}: maxd={maxd:.3f} bd={bd:.3f} exp={exp} got={own2} ballv=({st.bvx:.2f},{st.bvy:.2f})")
                ok=False; break
        checked+=1
print("windows",checked,"skipped",skipped,"frames",tot,"mismatch",mism,"worst",round(worst,4))
