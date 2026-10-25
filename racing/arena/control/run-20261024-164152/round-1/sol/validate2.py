import json
from bench import run
from experiment import Agent
from round1 import Agent as Old
C=type('Candidate',(Agent,),dict(curvature_limit=1.5,release=.15))
seeds=[2,3,5,12345,746292,20261023,591837,987654321,100,777,84021,99117,54321,678901,314159,271828,998877,941823,763542,482192]
for seed in seeds:
    for seat in [0,1]:
        print(json.dumps(run(seed,C,Old,seat)),flush=True)
