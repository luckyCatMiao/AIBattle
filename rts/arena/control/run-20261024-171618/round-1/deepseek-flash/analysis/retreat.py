import json
from collections import Counter
d=json.load(open('public_replays.json',encoding='utf-8'))
ids=['history-run-20261015-010803-r3-g1','history-run-20261015-010803-r3-g2','history-run-20261015-010803-r2-g1','history-run-20261015-010803-r2-g2','history-run-20261015-010803-r1-g1','history-run-20261015-010803-r1-g2']
for gid in ids:
    g=[x for x in d if x['id']==gid][0]
    si=g['seats'].index('sol')
    fracs=[]
    for i,fr in enumerate(g['frames'][:len(g['decisions'])]):
        us={u['id']:u for u in fr['units']}
        for c in g['decisions'][i]['commands'][si]:
            if c['type']=='move':
                for uid in c.get('units',[]):
                    u=us.get(uid)
                    if u: fracs.append((fr['now'],u['type'],round(u['hp']/u['maxHp'],2)))
    # histogram of hp fractions for moves
    h=Counter()
    for t,ty,f in fracs:
        b=min(int(f*10),9)
        h[b]+=1
    print(gid,'sol moves',len(fracs),'hp-frac deciles',dict(sorted(h.items())))
    print('   sample',[(t,ty,f) for t,ty,f in fracs[:12]])
