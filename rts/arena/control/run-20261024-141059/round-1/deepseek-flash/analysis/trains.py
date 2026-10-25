import json,sys
d=json.load(open('public_replays.json',encoding='utf-8'))
for gid in sys.argv[1:]:
    g=[x for x in d if x['id']==gid][0]
    print('==',gid,'seats',g['seats'])
    for seat in range(2):
        rows=[]
        for fr in g['decisions']:
            for c in fr['commands'][seat]:
                if c['type'] in ('train','upgrade','repair','rally'):
                    rows.append((fr['now'],c))
        print(' seat',seat,g['seats'][seat])
        print('   ', '; '.join(f"{t:.0f}:{c['type'][0]}{c.get('unit','')[:1] if c.get('unit') else ''}@{c.get('x','')}{c.get('y','')}" for t,c in rows))
