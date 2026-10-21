import json, random, time
from agent import Agent, DIR

o=json.load(open('/workspace/example.json'))
a=Agent();assert len(a.act(o)['buys'])==5
o['phase']='live'
r=a.act(o)
assert len(r['inputs'])==20 and all(len(f)==5 for f in r['inputs'])
assert all(v['dir'] in DIR and v['aim'] in DIR for f in r['inputs'] for v in f)
o['units'][0]['x']=10.5;o['units'][0]['y']=8.5
assert all(f[0]['dir']=='N' for f in a.act(o)['inputs'])
o['side']='defend';o['bomb']={'state':'planted','x':10.5,'y':8.5,'timer':10,'defuseProgress':0}
assert all(f[0]['dir']=='N' for f in a.act(o)['inputs'])
random.seed(2026)
for _ in range(1000):
    k=random.choice(list(a.adj));x,y=k%a.w+.5,k//a.w+.5
    for _ in range(20):
        x,y=a.move(x,y,random.choice(list(DIR)))
        assert a.fits(x,y)
o['side']='attack';o['bomb']={'state':'carried','carrier':o['units'][0]['id']}
for u in o['units']:u['x']=27.5;u['y']=25.5
o['visibleEnemies']={u['id']:[{'id':'t1u'+str(i),'team':1,'index':i,'x':27.5+(i-2)*.4,'y':22.5,'weapon':'rifle','facing':{'x':0,'y':1}} for i in range(5)] for u in o['units']}
o['bullets']=[{'id':'stress'+str(i),'team':1,'unit':'t1u0','weapon':'rifle','x':27.5+(i%5-2)*.1,'y':23+(i//5)*.02,'r':.1} for i in range(200)]
t=time.perf_counter();a.act(o);elapsed=time.perf_counter()-t
assert elapsed<5
print(json.dumps({'protocol':'pass','plantHold':'pass','defuseHold':'pass','collisionSteps':20000,'stressBullets':200,'stressSeconds':elapsed}))
