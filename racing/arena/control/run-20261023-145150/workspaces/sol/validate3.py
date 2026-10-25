import json
from bench import run
from experiment3 import Agent
from round2 import Agent as Old
variants=[dict(release=.7,boost_curve=3.2,boost_err=.8,boost_slip=1),dict(release=.5,boost_curve=3.2,boost_err=.8,boost_slip=1),dict(release=.3,boost_curve=1.5,boost_err=.6,boost_slip=.7),dict(release=.3,boost_curve=3.2,boost_err=.8,boost_slip=1),dict(min_steer=.3)]
seeds=[192837,918273,827364,748291,382916,928374,371829,182736,564738,657483,483726,273849]
for k,cfg in enumerate(variants):
 C=type('Candidate',(Agent,),cfg)
 for seed in seeds:
  for seat in [0,1]:
   r=run(seed,C,Old,seat);r.update(variant=k,params=cfg);print(json.dumps(r),flush=True)
