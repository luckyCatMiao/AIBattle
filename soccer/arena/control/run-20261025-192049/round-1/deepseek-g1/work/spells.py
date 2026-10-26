import sys, gzip, json, math
p=sys.argv[1]
d=json.load(gzip.open(p,'rt',encoding='utf-8'))
me=d['seats'].index('deepseek-g1')
n=d['teamSize']; a=1.0 if me==0 else -1.0
frames=d['frames']
fmt=d['unitsFormat']
def units(fr): return [dict(zip(fmt,u)) for u in fr['units']]
spells=[]; cur=None
for fr in frames:
    b=fr['ball']; ow=b.get('owner')
    mine = ow is not None and ow.startswith('t%d'%me)
    if mine:
        if cur is None:
            cur={'start':fr['frame'],'x0':b['x'],'y0':b['y'],'maxadv':0,'kicks':0,'end':None}
        if 'x0' not in cur:
            print('DEBUG cur=',cur,'frame',fr['frame'],'ball',b); raise SystemExit(1)
        cur['maxadv']=max(cur['maxadv'], (b['x']-cur['x0'])*a)
        cur['last']=(fr['frame'],b['x'],b['y'])
    else:
        if cur is not None:
            cur['end']=(fr['frame'], ow, b['x'], b['y'], b['vx'], b['vy'])
            cur['dur']=fr['frame']-cur['start']
            spells.append(cur); cur=None
if cur:
    cur['dur']=frames[-1]['frame']-cur['start']; cur['end']=None; spells.append(cur)
print('game',d['id'],'n',n,'seat',me,'score',d['scores'],'spells',len(spells))
tot=0
for s in spells:
    if s['dur']<5: continue
    tot+=s['dur']
    e=s['end']
    print('  start f%4d (%5.1f,%5.1f) dur%3d maxadv%5.1f end=%s'%(s['start'],s['x0'],s['y0'],s['dur'],s['maxadv'],
        None if e is None else (e[1],round(e[2],1),round(e[3],1))))
print('total possession frames',tot)
