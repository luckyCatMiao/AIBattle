import gzip,json,os,math,sys
sys.path.insert(0,'.')
import agent
P=r"D:\extraProj\AIBattle\soccer\arena\control\practice-20261025-014818"
DIRV={'N':(0,0),'U':(0,-1),'D':(0,1),'L':(-1,0),'R':(1,0),'UL':(-.7071067811865476,-.7071067811865476),'UR':(.7071067811865476,-.7071067811865476),'DL':(-.7071067811865476,.7071067811865476),'DR':(.7071067811865476,.7071067811865476)}
def parse_inputs(w, st):
    out=[]
    for k in range(20):
        row=[]
        for u in st.units:
            r=w['inputs'][u.team][k][u.index]
            aim=r.get('aim'); av=None
            if aim is not None:
                a=math.radians(aim); av=(math.cos(a),math.sin(a))
            row.append((r['dir'],av,bool(r['kick'])))
        out.append(row)
    return out

def test_shot(obs, w, me, carrier_idx, ang_deg, kick_frame):
    st=agent.state_from_obs(obs)
    # me index mapping: units sorted by (team,index), so idx = team*n + index
    n=st.n
    ci=me*n+carrier_idx
    rec=parse_inputs(w, st)
    for k in range(20):
        row=list(rec[k])
        # carrier overrides
        if k==kick_frame:
            a=math.radians(ang_deg)
            row[ci]=('N',(math.cos(a),math.sin(a)),True)
        else:
            row[ci]=('N',(math.cos(a),math.sin(a)),False) if k>kick_frame else row[ci]
        g=agent.step(st,row,st.kickoffTeam)
        if g==me: return k+1, None
        if g>=0: return None, g
        if st.status!='playing': break
    return None,None

results={}
for g in range(1,7):
    d=json.load(gzip.open(os.path.join(P,f"r1-g{g}.json.gz"))); fr=d['frames']; ev=d['final']['events']
    me=d['seats'].index('deepseek-g1'); n=d['teamSize']
    badframes={e['frame'] for e in ev if e['type'] in ('goal','foul')}
    wcount=0; opp=0; bestshots=[]
    for w in d['windows']:
        f0=w['frame']-20
        if f0<0: continue
        if any(f0<bf<=w['frame'] for bf in badframes): continue
        obs=fr[f0]; b=obs['ball']
        if not b['owner'] or not b['owner'].startswith('t%du'%me): continue
        owner=[u for u in obs['units'] if u['id']==b['owner']][0]
        gx=43.0 if me==0 else 1.0
        dist=math.hypot(gx-owner['x'],13.0-owner['y'])
        if dist>16.0: continue
        wcount+=1
        found=[]
        for ang in range(0,360,4):
            kk,gteam=test_shot(obs,w,me,owner['index'],ang,0)
            if kk is not None: found.append((ang,kk))
        if found: opp+=1; bestshots.append((f0,round(owner['x'],1),round(owner['y'],1),round(dist,1),found[:6]))
    print(f"g{g} n={n} me={me}: shooting-zone windows={wcount}, windows with a scoring shot={opp}")
    for x in bestshots[:8]: print("   ",x)
