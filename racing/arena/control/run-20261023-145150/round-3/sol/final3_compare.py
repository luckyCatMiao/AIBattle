import json
from bench import run
from experiment3 import Agent
from round2 import Agent as Old
variants=[dict(release=.7,boost_curve=3.2,boost_err=.8,boost_slip=1),dict(release=.9,boost_curve=3.2,boost_err=.8,boost_slip=1),dict(release=.7,boost_curve=1.5,boost_err=.6,boost_slip=.7),dict(release=.7,boost_curve=3.2,boost_err=.6,boost_slip=.7)]
for k,cfg in enumerate(variants):
 C=type('Candidate',(Agent,),cfg)
 for seed in [3847291,5643728,8271943,9381724,1627384,7891234,4568172,7241938,3764192,8291746,3928174,9183726,2486173,1273649,5236718]:
  for seat in [0,1]:
   r=run(seed,C,Old,seat);r.update(variant=k,params=cfg);print(json.dumps(r),flush=True)
