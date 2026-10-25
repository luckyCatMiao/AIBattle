import json,sys
from collections import Counter
d=json.load(open('public_replays.json',encoding='utf-8'))
gid=sys.argv[1]
g=[x for x in d if x['id']==gid][0]
step=int(sys.argv[2]) if len(sys.argv)>2 else 5
print(gid,'seats',g['seats'])
prev=None
for i,fr in enumerate(g['frames']):
    now=fr['now']
    if now%step>0.6: continue
    line=[f"t={now:5.0f}"]
    for seat in range(2):
        p=fr['players'][seat]
        us=[u for u in fr['units'] if u['owner']==seat]
        cnt=Counter(u['type'] for u in us)
        # queue
        b=[b for b in fr['bases'] if b['owner']==seat][0]
        line.append(f"{g['seats'][seat][:4]}:cr{p['credits']:4d} lv{p['level']} hp{b['hp']:.0f} q{''.join(x['type'][0] for x in b['queue'])} W{cnt['worker']} R{cnt['rifle']} T{cnt['tank']} X{cnt['raider']} k{p['kills']} dmg{p['damage']:.0f} mine{p['mined']:.0f} ctl{p['controlTime']:.0f} sc{p['score']}")
    nodes=''.join(str(n['owner']) if n['owner'] is not None else '.' for n in fr['nodes'])
    print(' | '.join(line),'| nodes',nodes, '|', ' '.join(f"{n['id']}:{n['progress']:.2f}" for n in fr['nodes'] if n['progress']>0))
