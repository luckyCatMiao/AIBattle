import json
from bench import run
from agent import Agent
from round2 import Agent as Old
from experiment3 import Agent as Experiment
from baseline import Agent as Baseline
Strong=type('Strong',(Experiment,),dict(release=.7,boost_curve=1.5,boost_err=.6,boost_slip=.7))
Expected=type('Expected',(Experiment,),dict(release=.7,boost_curve=3.2,boost_err=.6,boost_slip=.7))
o=json.load(open('example.json',encoding='utf-8'))
assert Agent().act(o)==Expected().act(o)
for label,rival,close in [('old_close',Old,True),('strong',Strong,False),('strong_close',Strong,True),('mirror_close',Agent,True),('baseline',Baseline,False)]:
 for seed in [7823491,1928374,8293746,3847192,6543821,2173948]:
  for seat in [0,1]:
   r=run(seed,Agent,rival,seat,close);r['kind']=label;print(json.dumps(r),flush=True)
