import json, sys, math

def dist(a,b): return math.hypot(a['x']-b['x'], a['y']-b['y'])
def act(o):
    me=o['yourPlayer']; p=o['players'][me]; now=o['now']; units=o['units']; bases=o['bases']; base=next(b for b in bases if b['owner']==me); enemy=next(b for b in bases if b['owner']!=me and b['hp']>0)
    own=[u for u in units if u['owner']==me and u['type']!='worker']; foes=[u for u in units if u['owner']!=me]
    nodes=o['nodes']; cmds=[]
    # Secure the nearest neutral/hostile nodes. Keep one or more assigned combat units there.
    assigned={n['id']:[] for n in nodes}
    for u in own:
        od=u.get('order',{}); dest=None
        if od.get('type') in ('move','attackMove'):
            dest=min(nodes,key=lambda n:math.hypot(n['x']-od.get('x',-9999),n['y']-od.get('y',-9999)))
            if math.hypot(dest['x']-od.get('x',-9999),dest['y']-od.get('y',-9999))>80: dest=None
        if dest and (dest['owner']!=me or dist(u,dest)<90): assigned[dest['id']].append(u)
    # Start captures with available units, emphasizing the two closest nodes and taking center if affordable.
    for n in sorted(nodes,key=lambda n: min(dist(base,n),9999)):
        if n['owner']==me: continue
        nearby=[u for u in own if dist(u,n)<95]
        if assigned[n['id']] or nearby: continue
        free=[u for u in own if not any(u in arr for arr in assigned.values()) and (u.get('order',{}).get('type') in ('hold','attackMove','move'))]
        if free:
            u=min(free,key=lambda u:dist(u,n))
            cmds.append({'type':'attackMove','units':[u['id']],'x':n['x'],'y':n['y']})
            assigned[n['id']].append(u)
            if len(cmds)>=8: break
    # Move idle units from owned nodes toward the front if there is no local danger.
    # Upgrade as soon as affordable before spending on marginal production.
    if p['level']<2 and p['credits'] >= (180 if p['level']==0 else 300) and len(base['queue'])==0:
        cmds.append({'type':'upgrade'})
    # Produce rifles continuously. Tank infusion when enemy has a tank-heavy force.
    if len(base['queue'])<2 and p['population']+len(base['queue'])<39:
        cost=60
        reserved=(180+p['level']*120) if p['level']<2 and p['credits'] >= (180 if p['level']==0 else 300) and len(base['queue'])==0 else 0
        if p['credits']-reserved>=cost and len(cmds)<10: cmds.append({'type':'train','unit':'rifle'})
    # Consolidate a large army for a decisive assault; approach near the enemy but outside base range.
    force=len(own)
    enemy_force=len(foes)
    if force>=18 and force>=enemy_force+5:
        # Single persistent assault order; movement halts at the base, where combat starts.
        attackers=[u for u in own if dist(u,enemy)>230 and not (u.get('order',{}).get('type')=='attackMove' and math.hypot(u['order'].get('x',0)-enemy['x'],u['order'].get('y',0)-enemy['y'])<100)]
        if attackers and len(cmds)<10:
            ids=[u['id'] for u in attackers[:40]]
            cmds.append({'type':'attackMove','units':ids,'x':enemy['x'],'y':enemy['y']})
    return {'commands':cmds[:10], 'note':'node control, rifle growth, timed assault'}

for line in sys.stdin:
    try:
        print(json.dumps(act(json.loads(line)),separators=(',',':')),flush=True)
    except Exception as e:
        print(json.dumps({'commands':[],'note':'recovery'}),flush=True)
        print(repr(e),file=sys.stderr,flush=True)
