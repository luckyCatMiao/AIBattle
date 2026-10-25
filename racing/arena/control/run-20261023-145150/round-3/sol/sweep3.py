import json
from bench import run
from experiment3 import Agent
from round2 import Agent as Old
variants=[{},dict(release=.3),dict(release=.5),dict(release=.8),dict(curvature_limit=3.2,err_limit=.8,slip_limit=1),dict(release=.3,curvature_limit=3.2,err_limit=.8,slip_limit=1),dict(release=.5,curvature_limit=3.2,err_limit=.8,slip_limit=1),dict(boost_curve=3.2,boost_err=.8,boost_slip=1),dict(release=.3,boost_curve=3.2,boost_err=.8,boost_slip=1),dict(look_gain=.6),dict(look_gain=.7),dict(slip_gain=1),dict(slip_gain=.3),dict(min_steer=.22),dict(min_steer=.3),dict(release=.3,min_steer=.22),dict(curvature_limit=3.2,err_limit=.8,slip_limit=1,boost_curve=3.2,boost_err=.8,boost_slip=1,release=.3)]
for k,cfg in enumerate(variants):
    C=type('Candidate',(Agent,),cfg)
    for seed in [13,73,6021,6022]:
        r=run(seed,C,Old);r.update(variant=k,params=cfg)
        print(json.dumps(r),flush=True)
