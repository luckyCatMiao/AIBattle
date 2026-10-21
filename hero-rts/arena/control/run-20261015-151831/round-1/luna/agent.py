#!/usr/bin/env python3
import sys,json,math

def d(a,b): return math.hypot(a['x']-b['x'],a['y']-b['y'])
def main(s):
 me=s['yourPlayer']; p=s['players'][me]; now=s['now']; units=s['units']; buildings=s['buildings']; cmds=[]
 own=[u for u in units if u['owner']==me and u['hp']>0]
 army=[u for u in own if u['type']!='worker']
 workers=[u for u in own if u['type']=='worker']
 allb=[b for b in buildings if b['owner']==me and b['hp']>0]
 myb=[b for b in allb if b.get('complete')]
 halls=[b for b in myb if b['type']=='townhall']
 if not halls:return {'commands':[]}
 hall=halls[0]; enemies=[u for u in units if u['owner']>=0 and u['owner']!=me and u['hp']>0]
 # distribute current fighting units among neutral/captured enemy shrines, then keep the closest available nodes occupied
 nodes=sorted(s['nodes'],key=lambda n:d(n,hall))
 targets=[]
 for n in nodes:
  if n.get('owner')!=me and (n.get('owner') is None or n.get('owner')!=me): targets.append(n)
 # opening movement, then send replacements toward the nearest node not safely held
 for u in army:
  if len(cmds)>=15: break
  nearest=sorted(nodes,key=lambda n:d(u,n))
  desired=next((n for n in nearest if n['owner']!=me),nearest[0])
  order=u.get('order') or {}
  if order.get('type') not in ('attackMove','move') or math.hypot(order.get('x',0)-desired['x'],order.get('y',0)-desired['y'])>150:
   # don't pull units away from an active fight unless target is already reached
   close=[e for e in enemies if d(u,e)<240]
   if not close:
    cmds.append({'type':'attackMove','units':[u['id']],'x':desired['x'],'y':desired['y']})
 # workers: sustain 3 gold / 2 wood baseline; newly built workers default to gold
 goldres=next((r for r in s['resources'] if r['id']==f'res{me}gold' and r['amount']>0),None)
 woodres=next((r for r in s['resources'] if r['id']==f'res{me}wood' and r['amount']>0),None)
 # improve default gold assignment if too many on gold, keep two wood collectors
 if goldres and woodres:
  onwood=[w for w in workers if w.get('order',{}).get('target')==woodres['id']]
  ongold=[w for w in workers if w.get('order',{}).get('target')==goldres['id']]
  for w in workers:
   if len(cmds)>=18:break
   target=woodres if len(onwood)<2 and len(ongold)>=3 else goldres if len(ongold)<4 else None
   if target and w.get('order',{}).get('target')!=target['id']:
    cmds.append({'type':'gather','units':[w['id']],'target':target['id']})
    (onwood if target is woodres else ongold).append(w)
 # building plans: lumbermill (wood turn-in), then forge; send least busy worker
 types={b['type'] for b in allb}
 plan='lumbermill' if 'lumbermill' not in types else ('forge' if 'forge' not in types else None)
 if plan and workers and p['gold']>=({'lumbermill':100,'forge':150}[plan]) and p['wood']>=({'lumbermill':60,'forge':100}[plan]):
  busy={u.get('order',{}).get('target') for u in workers if u.get('order',{}).get('type')=='build'}
  w=next((w for w in workers if w['id'] not in busy),None)
  if w and len(cmds)<19:
   # position outward from hall, with multiple alternatives
   dx=hall['x']-1600;dy=hall['y']-1000; norm=max(1,math.hypot(dx,dy)); ux,uy=dx/norm,dy/norm
   for off in (260,330,400,220):
    x=max(60,min(3140,hall['x']+ux*off-uy*130)); y=max(60,min(1940,hall['y']+uy*off+ux*130))
    if all(math.hypot(b['x']-x,b['y']-y)>110 for b in buildings if b['hp']>0) and all(math.hypot(r['x']-x,r['y']-y)>140 for r in s['resources'] if r['amount']>0):
     cmds.append({'type':'build','building':plan,'units':[w['id']],'x':x,'y':y});break
 # recruit workers to grow resource flow, otherwise shield infantry
 if len(cmds)<19:
  q=sum(len(b.get('queue',[])) for b in myb)
  if len(workers)<10 and p['gold']>=60 and q<3 and p['population']+1<=p['popCap']:
   cmds.append({'type':'train','unit':'worker'})
  elif p['gold']>=90 and p['wood']>=10 and p['population']+2<=p['popCap'] and any(b['type']=='barracks' and len(b.get('queue',[]))<6 for b in myb):
   cmds.append({'type':'train','unit':'footman'})
 # necromancer spells
 hero=next((u for u in army if u.get('hero') and u.get('type')=='necromancer'),None)
 if hero and len(cmds)<20:
  near=sorted(enemies,key=lambda e:d(e,hero))
  if near and d(near[0],hero)<=550 and hero['mana']>=35 and hero.get('cooldowns',{}).get('n_drain',0)<=now and not hero.get('casting'):
   cmds.append({'type':'cast','unit':hero['id'],'skill':'n_drain','target':near[0]['id']})
  elif near and d(near[0],hero)<=280 and hero['mana']>=75 and hero.get('cooldowns',{}).get('n_raise',0)<=now and not hero.get('casting'):
   cmds.append({'type':'cast','unit':hero['id'],'skill':'n_raise','x':near[0]['x'],'y':near[0]['y']})
 return {'commands':cmds[:20]}
for line in sys.stdin:
 try:
  state=json.loads(line); out=main(state); sys.stdout.write(json.dumps(out,separators=(',',':'))+'\n');sys.stdout.flush()
 except Exception as e:
  sys.stderr.write(str(e)+'\n');sys.stdout.write('{"commands":[]}\n');sys.stdout.flush()
