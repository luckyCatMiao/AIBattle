import json,collections,sys
import compare_versions as c
name=sys.argv[1];c.Agent=c.load(name)
rs=[]
for seed in range(1,int(sys.argv[2])+1):
 for seat in [0,1]:rs.append(c.play(seed,seat,c.load('agent_round2')))
 if seed%4==0:print(name,seed,dict(collections.Counter(r['result']for r in rs)),flush=True)
json.dump(rs,open(name+'_results.json','w'),indent=2)
