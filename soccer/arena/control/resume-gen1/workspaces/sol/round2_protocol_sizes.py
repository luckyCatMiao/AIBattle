import json,pathlib,subprocess,sys,time
root=pathlib.Path(__file__).resolve().parent
p=subprocess.Popen([sys.executable,str(root/'agent.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1,cwd=root)
cases=[]
for o in json.loads((root/'round2_protocol_observations.json').read_text(encoding='utf-8')):
 t=time.perf_counter();p.stdin.write(json.dumps(o)+'\n');p.stdin.flush();line=p.stdout.readline();assert line
 w=json.loads(line)['inputs'];assert len(w)==20
 for frame in w:
  assert len(frame)==o['teamSize']
  for a in frame:
   assert a['dir'] in ['N','U','D','L','R','UL','UR','DL','DR']
   assert type(a['kick']) is bool and isinstance(a['aim'],(float,int)) and 0<=a['aim']<360
 cases.append(dict(n=o['teamSize'],seat=o['yourTeam'],seconds=time.perf_counter()-t))
p.stdin.close();p.wait(timeout=10);err=p.stderr.read();assert p.returncode==0 and not err
print(json.dumps(dict(cases=cases,exitCode=p.returncode,stderr=err)))
