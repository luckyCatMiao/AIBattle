#!/usr/bin/env python3
import json, subprocess, time, select
source = r'''
const E=require('./engine'),A=require('./agent'),{Adversary}=require('./adversaries');
for(let k=0;k<3;k++){
 const teams=[['kestrel','vex','aegis'],['vex','aegis','kestrel'],['aegis','kestrel','vex']];
 const g=E.createMatch({id:'protocol-'+k,players:[{name:'A',kind:'api',team:teams[k]},{name:'B',kind:'api',team:['sable','torv','nyx']}]});
 const policies=[new Adversary('mix'),new Adversary('dp')];
 for(let w=0;w<50&&g.status==='playing';w++){
  console.log(JSON.stringify(E.snapshot(g,k%2)));
  for(let t=0;t<15&&g.status==='playing';t++)A.stepFrame(g,policies.map((x,p)=>x.next(g,p)));
 }
}
'''
observations=subprocess.check_output(['node','-e',source],text=True).splitlines()
p=subprocess.Popen(['python3','agent.py'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
times=[]
for obs in observations:
    t=time.perf_counter()
    p.stdin.write(obs+'\n');p.stdin.flush()
    ready,_,_=select.select([p.stdout],[],[],5)
    assert ready,'5 second response timeout'
    out=json.loads(p.stdout.readline())
    times.append((time.perf_counter()-t)*1000)
    assert isinstance(out['inputs'],list) and len(out['inputs'])==15
    for frame in out['inputs']:
        assert isinstance(frame,dict)
        assert frame['dir'] in ['N','F','B','U','D','UF','UB','DF','DB']
        assert frame['btn'] in [None,'LP','HP','LK','HK','G']
p.stdin.close();p.wait(timeout=5)
err=p.stderr.read()
assert p.returncode==0 and not err,err
result={'observations':len(times),'legal_responses':len(times),'max_ms':round(max(times),2),'mean_ms':round(sum(times)/len(times),2),'exit_code':p.returncode}
open('protocol_results.json','w').write(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
