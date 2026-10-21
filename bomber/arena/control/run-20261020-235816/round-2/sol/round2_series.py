import json,time
from selftest import Engine
from agent import Agent
from round1_agent import Agent as Old
for seed in range(401,405):
    for seat in range(2):
        e=Engine(seed); agents=[Agent(),Old()] if seat==0 else [Old(),Agent()]
        peak=0; windows=0
        try:
            while e.state['status']=='playing' and windows<760:
                o=e.state; ins=[]
                for owner,ag in enumerate(agents):
                    o['yourPlayer']=owner
                    t=time.perf_counter(); ans=ag.decide(o); peak=max(peak,time.perf_counter()-t)
                    assert len(ans['inputs'])==20
                    assert all(a['dir'] in 'NUDLR' and a['btn'] in (None,'BOMB') for a in ans['inputs'])
                    ins.append(ans['inputs'])
                e.step(ins); windows+=1
            assert e.state['status']=='finished'
            win=e.state['winner']
            print(json.dumps({'seed':seed,'seat':seat,'result':'draw' if win is None else 'win' if win==seat else 'loss','max_time':peak,'windows':windows,'roundLog':e.state['roundLog']}),flush=True)
        finally: e.close()
