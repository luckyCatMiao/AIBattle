import json
from bench import run
from experiment import Agent
C=type('Final',(Agent,),dict(curvature_limit=1.5,release=.15,look_gain=.45))
B=type('Fast',(Agent,),dict(curvature_limit=1.5,release=.15,look_gain=.4))
seeds=[1,2,3,4,5,42,12345,746292,20261023,591837,987654321,100,777,84021,99117,54321,678901,314159,271828,998877,941823,763542,482192,82736191,5512907,792641,20261024,392857,112233,908172]
for seed in seeds:
    for seat in [0,1]:
        r=run(seed,C,B,seat);r['kind']='fast';print(json.dumps(r),flush=True)
for close in [False,True]:
    for seed in [1,4,42,20261023,987654321]:
        for seat in [0,1]:
            r=run(seed,C,C,seat,close);r['kind']='close_mirror' if close else 'mirror';print(json.dumps(r),flush=True)
