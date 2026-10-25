import gzip,json,math,os,hashlib
RUN=r"D:\extraProj\AIBattle\soccer\arena\control\run-20261025-010809"
def load(gid):
    with gzip.open(os.path.join(RUN,gid+'.json.gz'),'rt',encoding='utf-8') as f: return json.load(f)
def dist_goal(x,y,team):
    gx = 43.0 if team==0 else 1.0
    return math.hypot(gx-x,13.0-y)
def describe(gid):
    d=load(gid); f=d['final']; ev=f['events']; seats=d['seats']
    print('='*100)
    print(gid,'seed',d['seed'],'teamSize',d['teamSize'],'seats',seats,'score(seat)',f['score'],
          'frames',len(d['frames']),'sim_s',(len(d['frames'])-1)/20,'wall_s',d['duration'])
    print('stats',json.dumps(f['stats'],ensure_ascii=False),'saves_by_seat(goals+saves)')
    lastkick=None
    for e in ev:
        if e['type']=='kick':
            lastkick=e
        elif e['type']=='goal':
            lk=lastkick
            print(f"GOAL  t={e['t']:7.2f} frame={e['frame']:5d} team={e['team']} scorer={e.get('scorer')} score={e.get('score')} own={e.get('ownGoal')}")
            if lk: print(f"      last kick t={lk['t']:7.2f} f={lk['frame']:5d} {lk.get('unit')} pos=({lk['x']:.2f},{lk['y']:.2f}) angle={lk['angle']:.3f} dist={dist_goal(lk['x'],lk['y'],lk['team']):.2f}")
        elif e['type']=='save':
            lk=lastkick
            print(f"SAVE  t={e['t']:7.2f} frame={e['frame']:5d} keeper_team={e['team']} unit={e.get('unit')}")
            if lk: print(f"      last kick t={lk['t']:7.2f} f={lk['frame']:5d} team={lk['team']} {lk.get('unit')} pos=({lk['x']:.2f},{lk['y']:.2f}) angle={lk['angle']:.3f} dist={dist_goal(lk['x'],lk['y'],lk['team']):.2f}")
        elif e['type']=='foul':
            print(f"FOUL  t={e['t']:7.2f} frame={e['frame']:5d} team={e['team']} unit={e.get('unit')} box={e.get('box')} pos=({e.get('x')},{e.get('y')})")
    # count kicks per team from events
    from collections import Counter
    c=Counter(e['team'] for e in ev if e['type']=='kick')
    print('kick events by team',dict(c),'total',sum(c.values()))
    # identity hash of frames/events to detect duplicate games
    h=hashlib.sha256()
    for fr in d['frames']:
        h.update(json.dumps([fr.get('ball'),fr.get('score'),fr.get('units')],sort_keys=True,ensure_ascii=False).encode())
    print('frame_content_sha256',h.hexdigest()[:32])
    return d
for gid in ['r1-g1','r1-g2','r1-g3','r1-g4','r1-g5','r1-g6']:
    describe(gid)
