import json,time,sys,random
from selftest import Engine,Opponent
from agent import Agent
from round1_agent import Agent as Old

mode=sys.argv[1] if len(sys.argv)>1 else 'old'
n=int(sys.argv[2]) if len(sys.argv)>2 else 10
for seed in range(201,201+n):
    seat=seed%2
    engine=Engine(seed)
    foe=Old() if mode=='old' else Opponent(mode)
    agents=[Agent(),foe] if seat==0 else [foe,Agent()]
    times=[]
    try:
        for window in range(150):
            o=engine.state
            ins=[]
            for owner,ag in enumerate(agents):
                o['yourPlayer']=owner
                t=time.perf_counter(); result=ag.decide(o); times.append(time.perf_counter()-t)
                assert len(result['inputs'])==20
                ins.append(result['inputs'])
            engine.step(ins)
            if engine.state['roundLog']: break
        log=engine.state['roundLog']
        winner=log[0]['winner'] if log else None
        print(json.dumps({'seed':seed,'mode':mode,'seat':seat,'result': 'draw' if winner is None else 'win' if winner==('A' if seat==0 else 'B') else 'loss','max_time':max(times),'log':log}),flush=True)
    finally: engine.close()
