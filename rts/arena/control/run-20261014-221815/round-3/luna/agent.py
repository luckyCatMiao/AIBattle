import json, sys, math

MID=(640.0,250.0)

def dist(a,b):
    return math.hypot(a['x']-b['x'],a['y']-b['y'])

def act(o):
    me=o['yourPlayer']; p=o['players'][me]; now=o['now']
    own=[u for u in o['units'] if u['owner']==me and u['type']!='worker']
    foes=[u for u in o['units'] if u['owner']!=me]
    base=next(b for b in o['bases'] if b['owner']==me)
    enemy_base=next(b for b in o['bases'] if b['owner']!=me)
    nodes=o['nodes']; cmds=[]
    tanks=sum(u['type']=='tank' for u in own)
    raiders=sum(u['type']=='raider' for u in own)
    rifles=sum(u['type']=='rifle' for u in own)
    q=len(base['queue']); pop=p['population']+q
    home_mine=min(o['mines'],key=lambda m:dist(m,base))

    if now < .01:
        cmds += [{'type':'train','unit':'tank'}, {'type':'train','unit':'raider'},
                 {'type':'rally','x':MID[0],'y':MID[1]},
                 {'type':'gather','units':[u['id'] for u in o['units'] if u['owner']==me and u['type']=='worker'], 'target':home_mine['id']},
                 {'type':'attackMove','units':[u['id'] for u in own], 'x':MID[0], 'y':MID[1]}]

    # Hold the valuable central node with the whole army. Do not peel new units
    # toward side nodes: round 2's single-unit excursions were repeatedly killed.
    center=min(nodes,key=lambda n:math.hypot(n['x']-MID[0],n['y']-MID[1]))
    rally_target=center
    # Once the central node is ours, use the army to contest the closest
    # enemy-owned/contested node while keeping rally close enough to reinforce.
    if center['owner']==me:
        contested=[n for n in nodes if n['owner']!=me]
        if contested:
            rally_target=min(contested,key=lambda n:dist(n,enemy_base))
    if now>=.01 and (abs(p.get('rally',{}).get('x',-1)-rally_target['x'])>1 or abs(p.get('rally',{}).get('y',-1)-rally_target['y'])>1) and len(cmds)<8:
        cmds.append({'type':'rally','x':rally_target['x'],'y':rally_target['y']})

    # Focus the same nearby threat with most combat units. Exclude workers from
    # automatic attack orders; the engine's normal local defense still applies.
    endangered=[f for f in foes if any(dist(u,f)<260 for u in own)]
    if endangered and now>=.01:
        target=min(endangered,key=lambda f:(f['hp'],dist(f,{'x':MID[0],'y':MID[1]})))
        group=[u['id'] for u in own if dist(u,target)<250]
        if group and len(cmds)<9:
            cmds.append({'type':'attack','units':group,'target':target['id']})

    # Upgrade after establishing central income and only when a queued tank can
    # still be afforded; upgrades snowball later but cost too much in the opening.
    upgrade_cost=180+p['level']*120
    if p['level']<2 and center['owner']==me and p['credits']>=upgrade_cost+160 and q<=1 and len(cmds)<9:
        cmds.append({'type':'upgrade'})

    # Tanks anchor fights. Add a raider for every three tanks when opposing
    # tanks are present, using rifles only while the bank cannot buy either.
    enemy_tanks=sum(u['type']=='tank' for u in foes)
    available=p['credits']-(upgrade_cost if any(c['type']=='upgrade' for c in cmds) else 0)
    unit=None
    if now<.01:
        unit=None  # the opening tank and raider consume all starting credits
    elif pop<39 and q<3:
        if available>=160 and (raiders>=max(1,tanks//3) or enemy_tanks==0): unit='tank'
        elif available>=100 and enemy_tanks and raiders<max(1,tanks//3): unit='raider'
        elif available>=160: unit='tank'
        elif available>=60: unit='rifle'
    if unit and len(cmds)<10: cmds.append({'type':'train','unit':unit})

    if base['hp']<1100 and p['credits']>=100 and now-p.get('repairAt',-30)>=30 and len(cmds)<10:
        cmds.append({'type':'repair'})
    return {'commands':cmds[:10], 'note':'mass center control, focus fire, armor production'}

for line in sys.stdin:
    try:
        print(json.dumps(act(json.loads(line)),separators=(',',':')),flush=True)
    except Exception as e:
        print(json.dumps({'commands':[],'note':'recovery'}),flush=True)
        print(repr(e),file=sys.stderr,flush=True)
