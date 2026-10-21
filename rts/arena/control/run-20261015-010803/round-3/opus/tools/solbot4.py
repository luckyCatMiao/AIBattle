# Stronger sol approximation: tank mass, camp centre/outposts, in-range focus fire, kite damaged tanks.
import sys,json,math
D=lambda a,b:math.hypot(a['x']-b['x'],a['y']-b['y'])
for line in sys.stdin:
  o=json.loads(line);me=o['yourPlayer'];p=o['players'][me];cr=p['credits'];cmds=[]
  base=[b for b in o['bases'] if b['owner']==me][0];eb=[b for b in o['bases'] if b['owner']!=me][0]
  my=[u for u in o['units'] if u['owner']==me];en=[u for u in o['units'] if u['owner']!=me]
  ea=[e for e in en if e['type']!='worker'];t=o['now']
  if t==0:
    cmds+=[{"type":"train","unit":"tank"},{"type":"train","unit":"worker"},{"type":"rally","x":640,"y":300}]
    cmds.append({"type":"attackMove","x":640,"y":250,"units":[u['id'] for u in my if u['type']=='rifle']})
  else:
    if p['level']<2 and cr>=180+120*p['level'] and t>30: cmds.append({"type":"upgrade"});cr-=180+120*p['level']
    if len(base['queue'])<1 and cr>=160: cmds.append({"type":"train","unit":"tank"})
    if base['hp']<1300 and cr>=100 and t-p['repairAt']>=30: cmds.append({"type":"repair"})
    army=[u for u in my if u['type']!='worker']
    threats=[e for e in ea if D(e,base)<320]
    unowned=[n for n in o['nodes'] if n['owner']!=me]
    goal=min(unowned,key=lambda n:D(n,base)) if unowned else {'x':640,'y':330}
    if threats: goal=threats[0]
    if len(army)>=2*len(ea)+4: goal=eb
    rest=[]
    for u in army:
      inr=[e for e in en if D(u,e)<=(160 if u['type']=='tank' else 115)+e['r']]
      targeted=any(e['order'].get('target')==u['id'] for e in ea)
      cdr=u.get('fireAt',0)-t
      if inr and (cdr>0.9 or (u['hp']<0.35*u['maxHp'] and targeted)) and len(cmds)<8:
        e=min(inr,key=lambda e:D(u,e));dx,dy=u['x']-e['x'],u['y']-e['y'];d=math.hypot(dx,dy) or 1
        cmds.append({"type":"move","units":[u['id']],"x":min(1260,max(20,u['x']+dx/d*45)),"y":min(820,max(20,u['y']+dy/d*45))});continue
      if inr:
        e=min(inr,key=lambda e:e['hp'])
        if u['order'].get('target')!=e['id'] and len(cmds)<9: cmds.append({"type":"attack","units":[u['id']],"target":e['id']})
        continue
      rest.append(u['id'])
    if rest and t%3==0 and len(cmds)<10:
      cmds.append({"type":"attackMove","x":goal['x'],"y":goal['y'],"units":rest})
  print(json.dumps({"commands":cmds[:10]}),flush=True)
