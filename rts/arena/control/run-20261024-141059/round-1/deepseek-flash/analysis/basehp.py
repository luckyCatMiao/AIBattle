import json
d=json.load(open('public_replays.json',encoding='utf-8'))
for g in d:
    seats=g['seats']
    if 'sol' not in seats: continue
    si=seats.index('sol')
    minhp=1700; mint=None
    for fr in g['frames']:
        b=[b for b in fr['bases'] if b['owner']==si][0]
        if b['hp']<minhp: minhp=b['hp']; mint=fr['now']
    print(g['id'],'solseat',si,'result',('WIN' if g['winner']==si else 'LOSS' if g['winner'] is not None else 'DRAW'),'minBaseHP',round(minhp),'at',round(mint,1) if mint else '-','dur',round(g['duration'],1))
