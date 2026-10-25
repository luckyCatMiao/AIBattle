import json
from bench import run
from experiment3 import Agent
from round2 import Agent as Old
base=dict(release=.3,boost_curve=3.2,boost_err=.8,boost_slip=1)
variants=[{},dict(release=.15),dict(release=.22),dict(release=.4),dict(release=.5),dict(release=.7),dict(boost_curve=1.5),dict(boost_curve=1.5,boost_err=.6,boost_slip=.7),dict(min_steer=.2),dict(min_steer=.25),dict(look_gain=.4),dict(look_gain=.5),dict(slip_gain=.5),dict(slip_gain=.8),dict(curvature_limit=2),dict(err_limit=.6),dict(gain=1.5),dict(gain=2.5)]
for k,params in enumerate(variants):
    cfg=dict(base);cfg.update(params);C=type('Candidate',(Agent,),cfg)
    for seed in [13,73,6021,6022,523194]:
        r=run(seed,C,Old);r.update(variant=k,params=cfg)
        print(json.dumps(r),flush=True)
