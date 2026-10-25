import json, subprocess, time
from agent import Agent
from experiment import Agent as Experiment
from bench import run
C=type('Candidate',(Experiment,),dict(curvature_limit=1.5,release=.15,look_gain=.45))
o=json.load(open('example.json',encoding='utf-8'))
a=Agent();b=C()
assert a.act(o)==b.act(o)
entry=json.load(open('entry.json'))
p=subprocess.Popen(entry['command'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8')
t=time.perf_counter()
for i in range(3):
    p.stdin.write(json.dumps(o)+'\n');p.stdin.flush()
    result=json.loads(p.stdout.readline())
    assert len(result['inputs'])==20
    for f in result['inputs']:
        assert len(f)==1
        u=f[0]
        assert -1<=u['throttle']<=1 and -1<=u['steer']<=1
        assert type(u['drift']) is bool and type(u['boost']) is bool
print(json.dumps(dict(protocol='passed',three_responses_ms=(time.perf_counter()-t)*1000,command=entry['command'])),flush=True)
p.terminate();p.wait()
for seed in [1,4,20261024]:
    for seat in [0,1]:
        print(json.dumps(run(seed,Agent,C,seat)),flush=True)
