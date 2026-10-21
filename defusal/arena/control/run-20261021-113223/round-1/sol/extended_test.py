import json,time,subprocess,math
from selftest import Engine,Baseline
from agent import Agent

results=[]
for seed in (2,7,19,43):
    for kind in ('left','right','rush','spread','self'):
        for seat in (0,1):
            engine=Engine();r=engine.ask({'op':'new','seed':seed})
            agents=[None,None];agents[seat]=Agent();other=Agent('right') if kind=='self' else Baseline(kind)
            other.variant='main' if kind!='self' else 'right';agents[1-seat]=other
            windows=0;worst=0.
            while r['status']=='playing' and windows<700:
                actions=[]
                for a,v in zip(agents,r['views']):
                    st=time.perf_counter();actions.append(a.act(v));worst=max(worst,time.perf_counter()-st)
                r=engine.ask({'op':'buy' if r['views'][0]['phase']=='buy' else 'step','actions':actions});windows+=1
            engine.close()
            result={'seed':seed,'kind':kind,'seat':seat,'wins':r['wins'],'windows':windows,'max_response':round(worst,4),'rounds':[{k:q[k] for k in ('round','winnerTeam','reason','frames')} for q in r['log']]}
            results.append(result);print(seed,kind,seat,r['wins'],flush=True)
with open('/workspace/extended_results.json','w') as f:json.dump(results,f,indent=2)
