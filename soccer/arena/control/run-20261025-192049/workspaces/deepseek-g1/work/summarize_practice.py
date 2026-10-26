#!/usr/bin/env python3
import gzip,json,os,sys
root=sys.argv[1]
opp='sol'; ME='deepseek-g1'
print('dir',root)
tot={}
for i in range(1,30):
    p=os.path.join(root,f'r1-g{i}.json.gz')
    if not os.path.exists(p): break
    with gzip.open(p,'rt',encoding='utf-8') as f: d=json.load(f)
    me=d['seats'].index(ME); oppt=1-me; ts=d['teamSize']
    frames=d['frames']; ev=d['final']['events']; st=d['final']['stats']
    # possession location
    own=opph=fin=0; pm=po=0
    for fr in frames:
        b=fr['ball']; o=b.get('owner')
        if not o: continue
        t=int(o[1])
        if t==me:
            pm+=1
            if (me==0 and b['x']<22) or (me==1 and b['x']>22): own+=1
            if (me==0 and b['x']>22) or (me==1 and b['x']<22): opph+=1
            if (me==0 and b['x']>=29.33) or (me==1 and b['x']<=14.67): fin+=1
        else: po+=1
    goals_me=sum(1 for e in ev if e['type']=='goal' and e['team']==me)
    goals_op=sum(1 for e in ev if e['type']=='goal' and e['team']==oppt)
    cards=sum(1 for e in ev if e['type']=='card' and e['team']==me)
    saves_me=sum(1 for e in ev if e['type']=='save' and e['team']==me)
    saves_op=sum(1 for e in ev if e['type']=='save' and e['team']==oppt)
    print(f"g{i} ts={ts} score={goals_me}:{goals_op} cards={cards} kicks={st[me]['kicks']}/{st[oppt]['kicks']} possF={pm}/{po} own%={100*own/pm if pm else 0:.1f} oppHalf%={100*opph/pm if pm else 0:.1f} final%={100*fin/pm if pm else 0:.1f} saves={saves_me}/{saves_op}")
    tot.setdefault(ts,[]).append((goals_me,goals_op,cards,pm,po,own,opph,fin,st[me]['kicks'],st[oppt]['kicks']))
print('by size:')
for ts,rs in sorted(tot.items()):
    gm=sum(r[0] for r in rs); go=sum(r[1] for r in rs); c=sum(r[2] for r in rs)
    pm=sum(r[3] for r in rs); po=sum(r[4] for r in rs); own=sum(r[5] for r in rs); opph=sum(r[6] for r in rs); fin=sum(r[7] for r in rs)
    km=sum(r[8] for r in rs); ko=sum(r[9] for r in rs)
    print(f'{ts}v{ts}: n={len(rs)} goals={gm}:{go} cards={c} kicks={km}:{ko} possF={pm}:{po} own%={100*own/pm if pm else 0:.1f} oppHalf%={100*opph/pm if pm else 0:.2f} final%={100*fin/pm if pm else 0:.2f}')
