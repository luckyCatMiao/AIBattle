import subprocess,json,select,time,sys,collections
from selftest import Bridge,Hunter,Still

def series(seed,seat,kind):
 b=Bridge();o=b.send(op='new',seed=seed)
 p=subprocess.Popen(['python3','agent.py'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 enemy=Hunter() if kind=='hunter' else Still()
 count=0;max_time=0;total=0
 while o['status']=='playing':
  o['yourPlayer']=seat;st=time.perf_counter();p.stdin.write(json.dumps(o,separators=(',',':'))+'\n');p.stdin.flush()
  ready,_,_=select.select([p.stdout],[],[],4.8)
  assert ready,('timeout',seed,seat,o['frame'])
  raw=p.stdout.readline();ans=json.loads(raw);elapsed=time.perf_counter()-st;max_time=max(max_time,elapsed);total+=elapsed
  assert isinstance(ans['inputs'],list) and len(ans['inputs'])==20
  for x in ans['inputs']:assert isinstance(x,dict) and x['dir'] in ['N','U','D','L','R'] and x['btn'] in [None,'BOMB']
  o['yourPlayer']=1-seat;other=enemy.decide(o)['inputs'];inputs=[None,None];inputs[seat]=ans['inputs'];inputs[1-seat]=other
  o=b.send(op='advance',inputs=inputs);count+=1
  assert count<400
 p.stdin.close();p.wait(timeout=3);err=p.stderr.read();assert not err,err
 b.close()
 r={'seed':seed,'seat':seat,'opponent':kind,'rounds':len(o['roundLog']),'windows':count,'max_seconds':max_time,'mean_seconds':total/count,'wins':[x['wins']for x in o['players']], 'winner':o['winner'],'roundLog':o['roundLog']}
 print(json.dumps(r,ensure_ascii=False),flush=True);return r
if __name__=='__main__':
 rs=[]
 for kind in ['still','hunter']:
  for seed in range(31,35):
   for seat in [0,1]:rs.append(series(seed,seat,kind))
 json.dump(rs,open('protocol_results.json','w'),ensure_ascii=False,indent=2)
