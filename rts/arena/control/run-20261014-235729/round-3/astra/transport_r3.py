import json,subprocess,time,statistics
records=json.load(open('public_replays.json'))
p=subprocess.Popen(['node','agent.js'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
times=[]
for r in records:
 for f in r['frames']:
  if f['status']!='playing':continue
  for seat in (0,1):
   f['yourPlayer']=seat
   t=time.perf_counter();p.stdin.write(json.dumps(f,separators=(',',':'))+'\n');p.stdin.flush()
   a=json.loads(p.stdout.readline());times.append((time.perf_counter()-t)*1000)
   assert isinstance(a['commands'],list) and len(a['commands'])<=10
p.stdin.close();p.wait();err=p.stderr.read();assert not err,err
print('responses',len(times),'mean_ms',statistics.mean(times),'p99_ms',sorted(times)[int(len(times)*.99)],'max_ms',max(times),'exit',p.returncode,'stderr',repr(err))
