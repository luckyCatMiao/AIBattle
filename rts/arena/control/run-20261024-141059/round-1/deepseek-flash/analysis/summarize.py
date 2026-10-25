import json,sys
from collections import Counter
d=json.load(open('public_replays.json',encoding='utf-8'))
for g in d:
    seats=g['seats']
    print('='*80)
    print(g['id'],'seats',seats,'winner',g['winner'],'dur',round(g['duration'],1))
    dec=g['decisions']
    # collect all commands per seat, grouped by type/unit
    for seat in (0,1):
        cnt=Counter()
        firsts={}
        for fr in dec:
            cmds=fr['commands'][seat]
            for c in cmds:
                key=c['type']+(':'+c.get('unit','') if c.get('unit') else '')
                cnt[key]+=1
                if key not in firsts:
                    firsts[key]=fr['now']
        print(' seat',seat,seats[seat],dict(cnt))
        print('   firsts',{k:round(v,1) for k,v in firsts.items()})
