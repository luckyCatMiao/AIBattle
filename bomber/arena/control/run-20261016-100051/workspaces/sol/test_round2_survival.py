import random,json,time
from selftest import Bridge
from agent import Agent
rng=random.Random(620261016);b=Bridge();tested=0;skipped=0;slow=0
for case in range(300):
 o=b.send(op='new',seed=case+9000,raw=True)
 frame=rng.choice([100,600,790,850,950,1040,1100,1140])
 ring=0 if frame<=800 else 1+(frame-800)//50
 tiles=[1 if x%2==0 and y%2==0 else (2 if rng.random()<.13 else 0)for y in range(17)for x in range(19)]
 cells=[p for p,v in enumerate(tiles)if v==0 and min(p%19,p//19,18-p%19,16-p//19)>=ring]
 me,en=rng.sample(cells,2);fs=o['raw']['fighters']
 for i,p in enumerate([me,en]):fs[i].update(x=p%19,y=p//19,fromX=p%19,fromY=p//19,moveProgress=1,invulnUntil=0 if i==0 else 10**9,speed=rng.randrange(4),blast=rng.randrange(1,7),bombs=6)
 bombs=[{'id':'r'+str(i),'x':p%19,'y':p//19,'owner':i%2,'fuse':rng.randrange(1,41),'blast':rng.randrange(1,7)}for i,p in enumerate(rng.sample(cells,min(len(cells),rng.randrange(1,9))))]
 for i,f in enumerate(fs):f['activeBombs']=sum(bb['owner']==i for bb in bombs)
 o=b.send(op='set',state={'tiles':tiles,'fighters':fs,'bombs':bombs,'roundFrames':frame,'floodRing':ring})
 a=Agent();a.setup(o);base=a.timeline();rr=a.search(base,[0.0]*323,end=20,initial_rem=a.rem)
 if rr is None:skipped+=1;continue
 st=time.perf_counter();ans=a.decide(o);slow=max(slow,time.perf_counter()-st)
 after=b.send(op='advance',inputs=[ans['inputs'],[{'dir':'N','btn':None}]*20])
 if after['round']!=1:
  assert after['roundLog'][0]['winner']=='A',(case,frame,after['roundLog'][0])
 else:assert after['fighters'][0]['alive'],(case,frame)
 tested+=1
b.close()
result={'generated':300,'safe_initial_windows':tested,'no_20_frame_escape':skipped,'max_seconds':slow}
json.dump(result,open('r2_survival_results.json','w'),indent=2);print(result)
