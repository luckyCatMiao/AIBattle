import json
from bench import run
from experiment import Agent
B=type('B',(Agent,),dict(curvature_limit=1.5,release=.15,look_gain=.4))
for k,params in enumerate([dict(look_gain=.4),dict(look_gain=.45),dict(look_gain=.5),dict(look_gain=.6),dict(look_gain=.4,slip_gain=.5),dict(look_gain=.45,release=.25)]):
    cfg=dict(curvature_limit=1.5,release=.15);cfg.update(params)
    C=type('C',(Agent,),cfg)
    for seed in [1,4,42,6012,987654321]:
        r=run(seed,C,B);r.update(variant=k,params=cfg)
        print(json.dumps(r),flush=True)
