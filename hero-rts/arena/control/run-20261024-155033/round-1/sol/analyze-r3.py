import json,gzip,collections
out=[]
for fn in ['public-r2-g1.json.gz','public-r2-g2.json.gz']:
 r=json.load(gzip.open(fn,'rt')); me=r['seats'].index('sol'); a={'file':fn,'seats':r['seats'],'duration':r['duration'],'winner':r['winner'],'checkpoints':[],'heroDeaths':[]}; seen=set()
 for f in r['frames']:
  for e in f['events']:
   if e['id'] not in seen and e['type']=='heroDeath':a['heroDeaths'].append(e)
   seen.add(e['id'])
 for t in [30,60,90,120,150,180,210,240,270,300,330,360,420,480,540,600,660,684]:
  f=min(r['frames'],key=lambda f:abs(f['now']-t))
  if abs(f['now']-t)>1:continue
  cp={'t':t,'players':[]}
  for i in [me,1-me]:
   p=f['players'][i];uu=[u for u in f['units'] if u['owner']==i];army=[u for u in uu if u['type']!='worker' and not u.get('summoned')];bs=[b for b in f['buildings'] if b['owner']==i]
   cp['players'].append({'side':'sol' if i==me else 'opus','gold':p['gold'],'wood':p['wood'],'tier':p['tier'],'tech':p['tech'],'pop':p['population'],'units':dict(collections.Counter(u['type'] for u in uu)),'nodes':[n['id'] for n in f['nodes'] if n['owner']==i],'hp':round(sum(u['hp'] for u in army)),'center':[round(sum(u[c] for u in army)/max(1,len(army))) for c in ['x','y']],'heroes':[(u['type'],u['level'],round(u['hp']),round(u['x']),round(u['y'])) for u in uu if u['hero']],'hall':[(round(b['hp']),round(b['x']),round(b['y'])) for b in bs if b['type']=='townhall']})
  a['checkpoints'].append(cp)
 out.append(a)
json.dump(out,open('round3-public-analysis.json','w'),ensure_ascii=False,indent=2)
for a in out:
 print(a['file'],a['winner'],a['duration']);print('deaths',a['heroDeaths'])
 for c in a['checkpoints']:
  print(c['t'],*[str({k:v for k,v in p.items() if k not in ['tech','hall','heroes']}) for p in c['players']],sep='\n')
print('decisions sample',str(r['decisions'][:2])[:3000])
