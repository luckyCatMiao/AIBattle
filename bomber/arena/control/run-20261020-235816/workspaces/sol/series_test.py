import json, time
from selftest import Engine, Opponent
from agent import Agent
from baseline import Agent as Baseline

def series(seed,seat,mode):
    e=Engine(seed)
    opponent=Baseline() if mode=='baseline' else Opponent(mode)
    agents=[Agent(),opponent] if seat==0 else [opponent,Agent()]
    peak=0
    windows=0
    try:
        while e.state['status']=='playing' and windows<760:
            o=e.state
            ins=[]
            for owner,ag in enumerate(agents):
                o['yourPlayer']=owner
                t=time.perf_counter()
                a=ag.decide(o)
                peak=max(peak,time.perf_counter()-t)
                assert len(a['inputs'])==20
                ins.append(a['inputs'])
            e.step(ins)
            windows+=1
        result={'seed':seed,'seat':seat,'mode':mode,'winner':e.state['winner'],'status':e.state['status'],'windows':windows,'peak_seconds':round(peak,4),'roundLog':e.state['roundLog']}
        print(json.dumps(result,ensure_ascii=False),flush=True)
    finally:e.close()

if __name__=='__main__':
    for mode in ['baseline','rush']:
        for seed in range(101,105):
            for seat in range(2):series(seed,seat,mode)
