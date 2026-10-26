import gzip, json, os, math, sys

P = r"D:\extraProj\AIBattle\soccer\arena\control\practice-20261025-014818"

def load(g):
    return json.load(gzip.open(os.path.join(P, f'r1-g{g}.json.gz')))

def team_of(d):
    return d['seats'].index('deepseek-g1')

def unit_at(fr, uid):
    for u in fr['units']:
        if u['id']==uid: return u
    return None

for g in range(1,7):
    d=load(g); me=team_of(d); n=d['teamSize']
    frames=d['frames']; ev=d['final']['events']
    print(f"\n===== g{g} n={n} me={me} score={d['scores']} =====")
    # goal events with frame; reconstruct ball pos at kick by looking back for last kick
    for e in ev:
        if e['type']=='goal':
            f=e['frame']; fr=frames[f]
            print(f" GOAL team={e['team']} scorer={e.get('scorer')} own={e.get('ownGoal')} frame={f} t={e['t']} ball=({fr['ball']['x']:.1f},{fr['ball']['y']:.1f}) score={e['score']}")
            # last kick event before goal
            lk=[q for q in ev if q['type']=='kick' and q['frame']<f]
            if lk:
                q=lk[-1]
                fq=frames[q['frame']]
                print(f"   last kick: frame={q['frame']} t={q['t']} team={q['team']} unit={q['unit']} at=({q['x']:.1f},{q['y']:.1f}) angle={q['angle']:.1f} dt={f-q['frame']}f")
                gx = 43.0 if q['team']==0 else 1.0
                print(f"   shot dist to goal center={math.hypot(gx-q['x'],13-q['y']):.1f}")
            # positions at last kick
            if lk:
                fq=frames[lk[-1]['frame']]
                print("   players:", [(u['id'],u['team'],round(u['x'],1),round(u['y'],1)) for u in fq['units']])
    # kicks summary
    kicks=[q for q in ev if q['type']=='kick']
    for t in (0,1):
        kk=[q for q in kicks if q['team']==t]
        if not kk: continue
        xs=[q['x'] for q in kk]; ys=[q['y'] for q in kk]
        print(f" team{t} kicks={len(kk)} xrange=({min(xs):.1f},{max(xs):.1f})")
    # fouls
    for q in ev:
        if q['type']=='foul':
            print(f" FOUL team={q['team']} unit={q['unit']} box={q['box']} at=({q['x']:.1f},{q['y']:.1f}) frame={q['frame']}")
    # possession thirds
    def third(fr,t):
        if fr['ball']['owner'] is None: return None
        u=unit_at(fr,fr['ball']['owner'])
        return (u['team'], 0 if u['x']<15 else (2 if u['x']>29 else 1))
    cnt={}
    for fr in frames[::10]:
        th=third(fr,None)
        if th: cnt[th]=cnt.get(th,0)+1
    print(" possession samples (team,third):", sorted(cnt.items()))
