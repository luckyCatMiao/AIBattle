import json,sys
d=json.load(open('public_replays.json',encoding='utf-8'))
gid=sys.argv[1]; t0=float(sys.argv[2]); t1=float(sys.argv[3]); seat=int(sys.argv[4])
g=[x for x in d if x['id']==gid][0]
# map unit id->info at each frame; print sol commands + hp of referenced units
for i,fr in enumerate(g['frames']):
    now=fr['now']
    if now<t0 or now>t1: continue
    us={u['id']:u for u in fr['units']}
    cmds=g['decisions'][i]['commands'][seat]
    if not cmds: continue
    print('t=%.1f'%now)
    for c in cmds:
        ids=c.get('units',[])
        info=' '.join(f"{uid}:{us[uid]['type'][0]}{us[uid]['hp']:.0f}@({us[uid]['x']:.0f},{us[uid]['y']:.0f})" for uid in ids if uid in us)
        tg=''
        if 'target' in c:
            t=us.get(c['target'])
            tg=f" TARGET {c['target']} {t['type'] if t else '?'} hp{t['hp']:.0f}@({t['x']:.0f},{t['y']:.0f})" if t else f" TARGET {c['target']} (missing)"
        print('  ',c['type'],'['+info+']',tg, ('->(%d,%d)'%(c['x'],c['y'])) if 'x' in c else '')
