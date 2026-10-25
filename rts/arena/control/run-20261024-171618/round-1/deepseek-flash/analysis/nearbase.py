import json
d=json.load(open('public_replays.json',encoding='utf-8'))
def dist(a,b): return ((a['x']-b['x'])**2+(a['y']-b['y'])**2)**.5
for g in d:
    seats=g['seats']
    if 'sol' not in seats: continue
    si=seats.index('sol')
    base=next(b for b in g['frames'][0]['bases'] if b['owner']==si)
    worst=None
    # find closest enemy combat unit to sol base per frame
    for fr in g['frames']:
        enemy=[u for u in fr['units'] if u['owner']!=si and u['type']!='worker']
        if not enemy: continue
        m=min(dist(u,base) for u in enemy)
        if worst is None or m<worst[0]: worst=(m,fr['now'])
    # count frames where enemy within 400
    frames_near=sum(1 for fr in g['frames'] if any(u['owner']!=si and u['type']!='worker' and dist(u,base)<400 for u in fr['units']))
    print(g['id'],'solSeat',si,'closest enemy',round(worst[0]) if worst else None,'at',round(worst[1],1) if worst else None,'frames<400',frames_near,'dur',round(g['duration'],0))
