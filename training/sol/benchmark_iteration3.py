"""Compare only our saved engine with the directional-update engine."""
import importlib.util,json,time
import engine
spec=importlib.util.spec_from_file_location('baseline','engine_iteration3_before.py')
old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
r=json.load(open('public_replays.json'));out=[]
for gi,ply in [(15,5),(15,9),(16,6),(16,12)]:
 b=[[0]*15 for _ in range(15)]
 for m in r[gi]['moves'][:ply]:b[m['y']][m['x']]=m['color']
 result={'game':r[gi]['id'],'afterPly':ply,'limitMs':2000}
 for name,mod in [('baseline',old),('directional',engine)]:
  e=mod.Engine(b,2000);start=time.monotonic();i,note=e.choose(1 if ply%2==0 else 2)
  result[name]={'move':[i%15,i//15],'note':note,'nodes':e.nodes,'seconds':round(time.monotonic()-start,3)}
 out.append(result);print(result,flush=True)
json.dump(out,open('benchmark_iteration3.json','w'),indent=2)
