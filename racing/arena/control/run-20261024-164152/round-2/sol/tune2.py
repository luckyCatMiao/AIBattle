import json
from bench import run
from experiment import Agent
base=dict(curvature_limit=1.5,release=.15)
variants=[dict(release=.08),dict(release=.22),dict(release=.4),dict(look_gain=.25),dict(look_gain=.4),dict(slip_gain=.9),dict(slip_gain=.4),dict(curvature_limit=1.0),dict(curvature_limit=2.0),dict(min_steer=.18)]
for k,params in enumerate(variants):
    cfg=dict(base);cfg.update(params)
    C=type('Candidate',(Agent,),cfg)
    for seed in [1,4,42,6012]:
        r=run(seed,C);r.update(variant=k,params=cfg)
        print(json.dumps(r),flush=True)
