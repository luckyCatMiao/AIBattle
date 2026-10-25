import gzip, json, math, os, sys
RUN = r"D:\extraProj\AIBattle\soccer\arena\control\run-20261025-010809"
W,H = 44.0,26.0
DT=0.05; KICKP=11.0; FRIC=0.978; WALLR=0.72
GOAL_TOP,GOAL_BOT=10.0,16.0

def load(gid):
    with gzip.open(os.path.join(RUN,gid+'.json.gz'),'rt',encoding='utf-8') as f:
        return json.load(f)

def trajectory_shot(x,y,ang,team, max_t=2.0, steps=200):
    """return (on_target, goal_frame_delta) simulating ball only."""
    vx=KICKP*math.cos(ang); vy=KICKP*math.sin(ang)
    t=0.0
    for i in range(steps):
        # substep movement in 0.05s
        nx=x+vx*DT; ny=y+vy*DT
        # wall collisions (simplified as spec)
        if ny<0.22:
            ny=0.22; vy=-vy*WALLR
        elif ny>H-0.22:
            ny=H-0.22; vy=-vy*WALLR
        # goal mouth check crossing left/right boundary
        if team==0:  # attacks right x=43
            if nx>=W-1 and GOAL_TOP<=ny<=GOAL_BOT:
                return True,i
            if nx>W-0.22:
                nx=W-0.22; vx=-vx*WALLR
        else:
            if nx<=1 and GOAL_TOP<=ny<=GOAL_BOT:
                return True,i
            if nx<0.22:
                nx=0.22; vx=-vx*WALLR
        if nx<0.22: nx=0.22; vx=-vx*WALLR
        if nx>W-0.22: nx=W-0.22; vx=-vx*WALLR
        x,y=nx,ny
        vx*=FRIC; vy*=FRIC
        t+=DT
        if t>max_t or math.hypot(vx,vy)<0.5:
            break
    return False,None

def analyze(gid):
    d=load(gid); f=d['final']; ev=f['events']
    seats=d['seats']
    stats=f['stats']
    goals=[]
    saves={0:[],1:[]}
    for e in ev:
        if e['type']=='goal':
            goals.append({'frame':e['frame'],'t':e['t'],'team':e['team'],'scorer':e.get('scorer'),'own':e.get('ownGoal',False)})
        if e['type']=='save':
            saves[e['team']].append({'frame':e['frame'],'t':e['t'],'unit':e.get('unit')})
    shots={0:[],1:[]}
    for e in ev:
        if e['type']!='kick': continue
        team=e['team']; x=e['x']; y=e['y']; ang=e['angle']
        # only consider goalward attempts from attacking half
        if team==0 and x<22: continue
        if team==1 and x>22: continue
        ok,delta=trajectory_shot(x,y,ang,team)
        if ok:
            shots[team].append({'frame':e['frame'],'t':e['t'],'unit':e.get('unit'),'x':round(x,2),'y':round(y,2),'angle':round(ang,3)})
    # goals also count as on target
    return d,goals,saves,shots

gids=[f'r1-g{i}' for i in range(1,21)]
print('id seed size seats score frames windows dur | goals(team@frame/t) | shots_on_target(traj) D/S | saves D/S | kicks D/S poss D/S fouls D/S')
for gid in gids:
    d,goals,saves,shots=analyze(gid); f=d['final']; seats=d['seats']
    score=f['score']
    gs=' '.join(f"T{g['team']}@{g['frame']}/{g['t']}" for g in goals) or '-'
    print(gid, d['seed'], d['teamSize'], ','.join(seats), score, len(d['frames']), len(d['windows']), d['duration'],
          '|', gs, '|', f"{len(shots[0])}/{len(shots[1])}", '|', f"{len(saves[0])}/{len(saves[1])}",
          '|', f"{f['stats'][0]['kicks']}/{f['stats'][1]['kicks']}",
          f"{f['stats'][0]['possession']}/{f['stats'][1]['possession']}",
          f"{f['stats'][0]['fouls']}/{f['stats'][1]['fouls']}")
