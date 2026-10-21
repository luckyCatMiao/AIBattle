import importlib.util,json,time,collections,sys
from selftest import Bridge
from agent import Agent

def load(name):
 spec=importlib.util.spec_from_file_location(name,name+'.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m.Agent

def play(seed,seat,enemyclass):
 b=Bridge();o=b.send(op='new',seed=seed);aa=[None,None];aa[seat]=Agent();aa[1-seat]=enemyclass();maxt=0
 while o['round']==1:
  ins=[]
  for i in range(2):
   o['yourPlayer']=i;t=time.perf_counter();ins.append(aa[i].decide(o)['inputs']);maxt=max(maxt,time.perf_counter()-t)
  o=b.send(op='advance',inputs=ins)
 log=o['roundLog'][0];b.close();out='draw' if log['winner'] is None else ('win' if log['winner']==('A' if seat==0 else 'B') else 'loss')
 return {'seed':seed,'seat':seat,'result':out,'max_response':maxt,**log}
if __name__=='__main__':
 n=int(sys.argv[1]) if len(sys.argv)>1 else 10
 all=[]
 for name in ['agent_v1','agent_v2','agent_v3','agent_v4','agent_v5']:
  for seed in range(1,n+1):
   for seat in [0,1]:
    r=play(seed,seat,load(name));r['enemy']=name;all.append(r);print(json.dumps(r,ensure_ascii=False),flush=True)
 json.dump(all,open('compare_results.json','w'),ensure_ascii=False,indent=2)
