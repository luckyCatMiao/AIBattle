import json,time,sys
from selftest import Engine
from agent import Agent,Forecast
from round2_agent import Agent as Old

n=int(sys.argv[1]) if len(sys.argv)>1 else 20
for seed in range(801,801+n):
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
    finally:e.close()
