import json,sys
from collections import Counter
d=json.load(open('public_replays.json',encoding='utf-8'))
gid=sys.argv[1]; step=int(sys.argv[2]) if len(sys.argv)>2 else 10
g=[x for x in d if x['id']==gid][0]
print(gid,'seats',g['seats'])
for i,fr in enumerate(g['frames']):
    if i%step: continue
    line=[f"t={fr['now']:5.0f}"]
    for seat in range(2):
        p=fr['players'][seat]
        us=[u for u in fr['units'] if u['owner']==seat]
        cnt=Counter(u['type'] for u in us)
        b=[b for b in fr['bases'] if b['owner']==seat][0]
        line.append(f"{g['seats'][seat][:4]}:cr{p['credits']:4d} lv{p['level']} hp{b['hp']:4.0f} W{cnt['worker']} R{cnt['rifle']} T{cnt['tank']} X{cnt['raider']} k{p['kills']} ctl{p['controlTime']:3.0f}")
    nodes=''.join(str(n['owner']) if n['owner'] is not None else '.' for n in fr['nodes'])
    print(' | '.join(line),'|',nodes)
