import json,collections,sys
from r2_skirmish import play
from compare_versions import load
rs=[]
for seed in range(121,221):
 for seat in [0,1]:rs.append(play(seed,seat,load('agent_round2')))
 if seed%10==0:print(seed,dict(collections.Counter(r['result']for r in rs)),flush=True)
json.dump(rs,open('r3_skirmish_results.json','w'),indent=2)
