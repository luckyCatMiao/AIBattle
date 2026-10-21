import json, subprocess, time
from pathlib import Path
obs=json.loads(Path('/workspace/example.json').read_text())
p=subprocess.Popen(['python3','/workspace/agent.py'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,cwd='/workspace')
valid={'N','U','D','L','R','UL','UR','DL','DR'}
mx=0
for n in range(12):
    o=dict(obs)
    if n:
        o['phase']='live';o['tick']=n*20;o['frame']=n*20
    st=time.perf_counter();p.stdin.write(json.dumps(o)+'\n');p.stdin.flush();a=json.loads(p.stdout.readline());mx=max(mx,time.perf_counter()-st)
    if not n:assert 'buys' in a
    else:
        assert len(a['inputs'])==20
        for f in a['inputs']:
            assert len(f)==5
            for u in f:assert u['dir'] in valid and u['aim'] in valid
p.stdin.close();assert p.wait(timeout=3)==0
print(json.dumps({'persistentProcess':'pass','responses':12,'maxSeconds':mx}))
