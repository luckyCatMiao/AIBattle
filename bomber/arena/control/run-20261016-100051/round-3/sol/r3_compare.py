import json,collections,sys
import compare_versions as c
name=sys.argv[1] if len(sys.argv)>1 else 'agent_round2'
n=int(sys.argv[2])if len(sys.argv)>2 else 12
rs=[]
for seed in range(1,n+1):
 for seat in [0,1]:rs.append(c.play(seed,seat,c.load(name)))
 if seed%4==0:print(seed,dict(collections.Counter(r['result']for r in rs)),flush=True)
json.dump(rs,open('r3_vs_'+name+'.json','w'),indent=2)
