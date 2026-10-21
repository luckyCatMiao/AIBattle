import copy,json,random,time
from agent import Agent
rng=random.Random(151599)
base=json.load(open('example.json'));rows=[]
for case in range(60):
 o=copy.deepcopy(base);o['frame']=rng.choice([0,400,780,850,1000,1120,1180]);o['map']['tiles']=[1 if x%2==0 and y%2==0 else (2 if rng.random()<.12 else 0)for y in range(17)for x in range(19)]
 cells=[p for p,v in enumerate(o['map']['tiles'])if v==0 and min(p%19,p//19,18-p%19,16-p//19)>=2]
 me=rng.choice(cells);en=rng.choice(cells)
 for i,p in enumerate([me,en]):o['fighters'][i].update(x=p%19,y=p//19,px=p%19,py=p//19,bombs=6,blast=rng.randrange(1,7),speed=rng.randrange(4),activeBombs=0)
 o['bombs']=[]
 for k,p in enumerate(rng.sample(cells,rng.randrange(0,10))):
  owner=k%2;o['bombs'].append({'id':str(k),'owner':owner,'x':p%19,'y':p//19,'fuse':rng.randrange(1,41),'blast':rng.randrange(1,7)});o['fighters'][owner]['activeBombs']+=1
 o['drops']=[{'id':'d'+str(k),'x':p%19,'y':p//19,'type':rng.choice(['speed','blast','bomb'])}for k,p in enumerate(rng.sample(cells,4))]
 st=time.perf_counter();r=Agent().decide(o);elapsed=time.perf_counter()-st
 assert len(r['inputs'])==20 and elapsed<4.5
 rows.append({'case':case,'frame':o['frame'],'seconds':elapsed})
json.dump(rows,open('benchmark_results.json','w'),indent=2)
print('60 stressed observations; max seconds:',max(x['seconds']for x in rows))
