import subprocess,json,time,random
p=subprocess.Popen(['python3','agent.py'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
s=json.load(open('example.json'));dirs={'N','F','B','U','D','UF','UB','DF','DB'};btns={None,'LP','HP','LK','HK','G'};times=[]
for char in ['aegis','vex','kestrel','torv','nyx','sable']:
 for seat in [0,1]:
  for meter in [0,100]:
   x=json.loads(json.dumps(s));x['yourPlayer']=seat;x['fighters'][seat]['char']=char;x['fighters'][seat]['meter']=meter
   t=time.perf_counter();p.stdin.write(json.dumps(x)+'\n');p.stdin.flush();line=p.stdout.readline();times.append(time.perf_counter()-t);out=json.loads(line);assert len(out['inputs'])==15
   for z in out['inputs']:assert isinstance(z,dict) and z['dir'] in dirs and z['btn'] in btns
p.stdin.close();p.wait(timeout=5);err=p.stderr.read();assert not err,err
print(json.dumps({'cases':len(times),'maxSeconds':max(times),'meanSeconds':sum(times)/len(times),'exit':p.returncode}))
