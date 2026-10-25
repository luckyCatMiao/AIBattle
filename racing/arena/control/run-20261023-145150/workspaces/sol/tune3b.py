import json
from bench import run
from experiment3 import Agent
B=type('Base',(Agent,),dict(release=.7,boost_curve=3.2,boost_err=.8,boost_slip=1))
variants=[dict(release=1),dict(release=.9),dict(boost_err=.6,boost_slip=.7),dict(boost_curve=1.5,boost_err=.6,boost_slip=.7),dict(look_gain=.5),dict(look_gain=.55),dict(curvature_limit=2),dict(curvature_limit=1),dict(min_steer=.18),dict(min_steer=.25),dict(slip_gain=.5),dict(slip_gain=.8)]
for k,params in enumerate(variants):
 cfg=dict(release=.7,boost_curve=3.2,boost_err=.8,boost_slip=1);cfg.update(params);C=type('Candidate',(Agent,),cfg)
 for seed in [13,6022,523194,918273,382916,827364]:
  r=run(seed,C,B);r.update(variant=k,params=cfg);print(json.dumps(r),flush=True)
