import json, math, random, time
from agent import Agent,DIR

obs=json.load(open('/workspace/example.json'))
a=Agent(); assert len(a.act(obs)['buys'])==5
live=json.loads(json.dumps(obs));live['phase']='live'
start=time.perf_counter(); result=a.act(live);duration=time.perf_counter()-start
assert len(result['inputs'])==20
assert all(len(f)==5 and all(u['dir'] in DIR and u['aim'] in DIR for u in f) for f in result['inputs'])
# Exact planted and defusing cases must stay neutral for the complete window.
live['units'][0]['x']=10.5;live['units'][0]['y']=7.5
r=a.act(live);assert all(f[0]['dir']=='N' for f in r['inputs'])
live['side']='defend';live['bomb']={'state':'planted','x':10.5,'y':7.5,'timer':10,'defuseProgress':0}
r=a.act(live);assert all(f[0]['dir']=='N' for f in r['inputs'])
# Movement prediction cannot enter circular wall collision.
for _ in range(1000):
 q=random.choice(list(a.neighbors)); x=q%a.w+.5;y=q//a.w+.5
 for k in range(20):
  x,y=a.move(x,y,random.choice(list(DIR)))
  assert not a.hits(x,y,.299)
# Deliberately dense observations stress combat and bullet scoring.
live['side']='attack';live['bomb']={'state':'carried','carrier':live['units'][0]['id']}
for u in live['units']:u['x']=27.5;u['y']=25.5
live['visibleEnemies']={u['id']:[{'id':'t1u'+str(i),'team':1,'index':i,'x':27.5+(i-2)*.4,'y':22.5,'weapon':'rifle','facing':{'x':0,'y':1}} for i in range(5)] for u in live['units']}
live['bullets']=[{'id':'x'+str(i),'team':1,'unit':'t1u0','weapon':'rifle','x':27.5+(i%5-2)*.1,'y':23+(i//5)*.02,'r':.1} for i in range(100)]
start=time.perf_counter();r=a.act(live);stress=time.perf_counter()-start
assert stress<5
print(json.dumps({'protocol':'pass','plant_hold':'pass','defuse_hold':'pass','collision_steps':20000,'ordinary_seconds':duration,'stress_100_bullets_seconds':stress}))
