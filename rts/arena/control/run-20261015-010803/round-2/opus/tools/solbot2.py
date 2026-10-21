# Approximation of incumbent 'sol': tanks only, early upgrades, outpost control, damaged-tank retreat.
import sys,json,math
D=lambda a,b:math.hypot(a['x']-b['x'],a['y']-b['y'])
for line in sys.stdin:
  o=json.loads(line);me=o['yourPlayer'];p=o['players'][me];cr=p['credits'];cmds=[]
  base=[b for b in o['bases'] if b['owner']==me][0];eb=[b for b in o['bases'] if b['owner']!=me][0]
  my=[u for u in o['units'] if u['owner']==me];en=[u for u in o['units'] if u['owner']!=me]
  t=o['now']
  if t==0:
    cmds+= [{"type":"train","unit":"tank"},{"type":"train","unit":"worker"},{"type":"rally","x":640,"y":267}]
    cmds.append({"type":"attackMove","x":640,"y":250,"units":[u['id'] for u in my if u['type']=='rifle']})
  else:
    if p['level']<2 and cr>=180+120*p['level'] and t>30: cmds.append({"type":"upgrade"});cr-=180+120*p['level']
    if len(base['queue'])<1 and cr>=160: cmds.append({"type":"train","unit":"tank"})
    if base['hp']<1300 and cr>=100 and t-p['repairAt']>=30: cmds.append({"type":"repair"})
    army=[u for u in my if u['type']!='worker']
    threats=[e for e in en if e['type']!='worker' and D(e,base)<320]
    nodes=sorted(o['nodes'],key=lambda n:D(n,base))
    goal=None
    for n in nodes:
      if n['owner']!=me: goal=n;break
    if goal is None: goal=nodes[0]
    ids=[]
    for u in army:
      if u['hp']<0.3*u['maxHp'] and u['type']=='tank' and not threats:
        if D(u,base)>150: cmds.append({"type":"move","x":base['x'],"y":base['y'],"units":[u['id']]})
        continue
      ids.append(u['id'])
    if ids and t%3==0:
      tgt=threats[0] if threats else goal
      if len(army)>=12 and sum(1 for e in en if e['type']!='worker')<=3: tgt=eb
      cmds.append({"type":"attackMove","x":tgt['x'],"y":tgt['y'],"units":ids})
  print(json.dumps({"commands":cmds[:10]}),flush=True)
