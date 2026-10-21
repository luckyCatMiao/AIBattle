import json, sys, math

def d(a,b): return math.hypot(a['x']-b['x'], a['y']-b['y'])

def act(o):
    me=o['yourPlayer']; p=o['players'][me]; now=o['now']
    own=[u for u in o['units'] if u['owner']==me and u['type']!='worker']
    foes=[u for u in o['units'] if u['owner']!=me]
    base=next(b for b in o['bases'] if b['owner']==me)
    enemy=next(b for b in o['bases'] if b['owner']!=me)
    cmds=[]

    # The round 1 loser split its four rifles into three isolated node trips.
    # Round 1 winner instead grouped the opening rifles at center and bought armor.
    if now < 0.01:
        cmds += [{'type':'train','unit':'tank'}, {'type':'train','unit':'raider'},
                 {'type':'gather','units':[u['id'] for u in o['units'] if u['owner']==me and u['type']=='worker'],
                  'target':next(m['id'] for m in o['mines'] if d(m,base)<150)},
                 {'type':'attackMove','units':[u['id'] for u in own], 'x':640,'y':250}]

    # Send newly idle combat units to the nearest unowned outpost. Existing
    # orders toward a node are persistent, so this is checked against live orders.
    claimed={n['id']:False for n in o['nodes']}
    for u in own:
        od=u.get('order',{})
        if od.get('type') in ('move','attackMove'):
            n=min(o['nodes'],key=lambda n:math.hypot(n['x']-od.get('x',-9999),n['y']-od.get('y',-9999)))
            if math.hypot(n['x']-od.get('x',-9999),n['y']-od.get('y',-9999))<55 and n['owner']!=me:
                claimed[n['id']]=True
    # Cover nodes with small groups; never peel soldiers from an active fight.
    for n in sorted(o['nodes'],key=lambda n:d(base,n)) if now>=0.01 else []:
        if n['owner']==me or claimed[n['id']]: continue
        near=[u for u in own if d(u,n)<80]
        if near: continue
        idle=[u for u in own if u.get('order',{}).get('type')=='hold' and
              not any(d(u,f)<220 for f in foes)]
        if idle and len(cmds)<8:
            u=min(idle,key=lambda u:d(u,n))
            cmds.append({'type':'attackMove','units':[u['id']],'x':n['x'],'y':n['y']})
            claimed[n['id']]=True

    # Upgrade only from surplus, leaving credits for the next combat unit.
    cost=180+p['level']*120
    if p['level']<2 and p['credits']>=cost+100 and len(base['queue'])<=1 and len(cmds)<9:
        cmds.append({'type':'upgrade'})

    # Tanks give the best sustained base pressure and survive the base gun;
    # use rifles when the bank cannot fund armor, and raiders to answer tanks.
    q=len(base['queue']); pop=p['population']+q
    if q<3 and pop<39 and len(cmds)<10:
        money=p['credits']-(cost if any(c['type']=='upgrade' for c in cmds) else 0)
        unit=None
        if now<0.01: pass
        elif money>=160 and (now>18 or p['level']>=1): unit='tank'
        elif money>=100 and any(u['type']=='tank' for u in foes): unit='raider'
        elif money>=60: unit='rifle'
        else: unit=None
        if unit: cmds.append({'type':'train','unit':unit})

    # Attack-move attracts reinforcements and lets the engine prioritize nearby
    # threats. Commit once our clustered force can withstand the 24 DPS base.
    healthy=sum(u['hp'] for u in own)
    if len(own)>=12 and healthy>1800 and d(base,enemy)>0:
        if d({'x':640,'y':420},enemy)>1 and len(cmds)<10:
            moving=[u for u in own if u.get('order',{}).get('type')!='attackMove' or
                    d(u.get('order',{}),enemy)>80]
            if moving:
                cmds.append({'type':'attackMove','units':[u['id'] for u in moving],
                             'x':enemy['x'],'y':enemy['y']})
    if base['hp']<1100 and p['credits']>=100 and now-p.get('repairAt',-30)>=30 and len(cmds)<10:
        cmds.append({'type':'repair'})
    return {'commands':cmds[:10], 'note':'grouped armor opening; capture and pressure'}

for line in sys.stdin:
    try: print(json.dumps(act(json.loads(line)),separators=(',',':')),flush=True)
    except Exception as e:
        print(json.dumps({'commands':[],'note':'recovery'}),flush=True)
        print(repr(e),file=sys.stderr,flush=True)
