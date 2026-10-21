import gzip,json,collections
out=[]
for fn in ['public-r1-g1.json.gz','public-r1-g2.json.gz']:
 r=json.load(gzip.open(fn,'rt'));me=r['seats'].index('sol');summary={'file':fn,'seats':r['seats'],'winner':r['winner'],'duration':r['duration'],'checkpoints':[],'solHeroDeaths':[]}
 seen=set()
 for f in r['frames']:
  for e in f['events']:
   if e['id'] not in seen and e['type']=='heroDeath' and e['owner']==me:summary['solHeroDeaths'].append(e)
   seen.add(e['id'])
 for t in [60,90,120,150,180,210,240,270,300]:
  f=min(r['frames'],key=lambda f:abs(f['now']-t))
  if abs(f['now']-t)>1:continue
  p=f['players'][me];uu=[u for u in f['units'] if u['owner']==me];summary['checkpoints'].append({'time':t,'gold':p['gold'],'wood':p['wood'],'population':p['population'],'units':dict(collections.Counter(u['type'] for u in uu)),'woodWorkers':sum(u['type']=='worker' and any(v['id']==u['order'].get('target') and v['kind']=='wood' for v in f['resources']) for u in uu),'nodes':sum(n['owner']==me for n in f['nodes'])})
 out.append(summary)
open('round2-public-analysis.json','w').write(json.dumps(out,ensure_ascii=False,indent=2))
print(json.dumps(out,ensure_ascii=False,indent=2))
