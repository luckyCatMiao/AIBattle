import json,sys
d=json.load(open('public_replays.json',encoding='utf-8'))
gid=sys.argv[1]
g=[x for x in d if x['id']==gid][0]
maxnow=float(sys.argv[2]) if len(sys.argv)>2 else 40
for i,fr in enumerate(g['decisions']):
    if fr['now']>maxnow: break
    cmds=fr['commands']
    if any(cmds):
        print('t=%.0f'%fr['now'])
        for seat in range(2):
            if cmds[seat]:
                print('  ',g['seats'][seat],json.dumps(cmds[seat],ensure_ascii=False))
        print('   notes:',fr['notes'])
