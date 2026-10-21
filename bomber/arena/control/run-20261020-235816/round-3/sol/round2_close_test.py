import json,time
from selftest import Engine
from agent import Agent,Forecast,Planner
from round1_agent import Agent as Old

# A normal-fuse enemy bomb is a future obstacle, even without an existing flame.
e=Engine(1,{'empty':True,'fighters':[{'x':7,'y':7,'fromX':7,'fromY':7,'speed':3,'blast':6,'bombs':6},{'x':9,'y':7,'fromX':9,'fromY':7,'speed':3,'blast':6,'bombs':6}]})
o=e.state
fc=Forecast(o)
a=Agent(); a.enemy_risk(o,fc,o['fighters'][1])
assert fc.block[7*19+9] & (1<<20)
assert fc.hazard[7*19+7] & (1<<41)
e.close()
print(json.dumps({'normal_fuse_and_block':'passed'}),flush=True)
for seed in range(301,321):
    seat=seed%2
    patch={'empty':True,'fighters':[{'x':7,'y':7,'fromX':7,'fromY':7,'speed':3,'blast':6,'bombs':6},{'x':11,'y':9,'fromX':11,'fromY':9,'speed':3,'blast':6,'bombs':6}]}
    e=Engine(seed,patch)
    agents=[Agent(),Old()] if seat==0 else [Old(),Agent()]
    times=[]
    try:
        for window in range(150):
            o=e.state; ins=[]
            for owner,ag in enumerate(agents):
                o['yourPlayer']=owner
                t=time.perf_counter(); ans=ag.decide(o); times.append(time.perf_counter()-t)
                ins.append(ans['inputs'])
            e.step(ins)
            if e.state['roundLog']: break
        winner=e.state['roundLog'][0]['winner']
        print(json.dumps({'seed':seed,'seat':seat,'result':'draw' if winner is None else 'win' if winner==('A' if seat==0 else 'B') else 'loss','max_time':max(times),'log':e.state['roundLog']}),flush=True)
    finally: e.close()
