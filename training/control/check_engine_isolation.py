import json, pathlib, subprocess
from train import command
train=pathlib.Path(__file__).resolve().parents[1]
active=json.loads((train/'active-run.json').read_text(encoding='utf-8'))
run=pathlib.Path(active['path'])
script='''import json,pathlib,socket
try:
    f=open('/workspace/canary.txt','a')
except PermissionError:
    readonly=True
except OSError as e:
    assert e.errno==30,e
    readonly=True
else:
    f.close()
    raise AssertionError('workspace writable')
assert not pathlib.Path('/home/player/.codex').exists()
routes=pathlib.Path('/proc/net/route').read_text().splitlines()
assert len(routes)==1,routes
print(json.dumps({'workspace_read_only':readonly,'authentication_absent':True,'network_routes_absent':True}))
'''
checks=[]
for who in active.get('players',['luna','sol']):
    p=subprocess.run(command(who,'engine',['python3','-']),input=script,text=True,encoding='utf-8',capture_output=True,timeout=20)
    if p.returncode: raise RuntimeError(p.stderr)
    checks.append({'player':who,**json.loads(p.stdout)})
(run/'engine-isolation-checks.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
print(json.dumps(checks))
