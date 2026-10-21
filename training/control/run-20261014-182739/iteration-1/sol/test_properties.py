import random,time,json,subprocess
from engine import Engine,WIN,DIRS
rng=random.Random(314)
def brute(b,i,p):
 x,y=i%15,i//15
 for dx,dy in DIRS:
  n=1
  for sign in (-1,1):
   a,c=x+sign*dx,y+sign*dy
   while 0<=a<15 and 0<=c<15 and b[c][a]==p:
    n+=1;a+=sign*dx;c+=sign*dy
  if n>=5:return True
 return False
for k in range(50):
 b=[[rng.choices((0,1,2),(6,2,2))[0] for _ in range(15)] for _ in range(15)]
 e=Engine(b,5000)
 for i in range(225):
  if not b[i//15][i%15]:
   for p in (1,2):assert (e.scores[p][i]>=WIN)==brute(b,i,p),(k,i,p)
 empties=[i for i in range(225) if not e.b[i]]
 if empties:
  old=[s[:] for s in e.scores];nb=e.neighbors[:];bb=e.b[:]
  e.put(empties[0],1);e.undo(empties[0])
  assert e.scores==old and e.neighbors==nb and e.b==bb
print('50 random boards: exact immediate-win agreement for both colors; incremental rollback verified',flush=True)
results=[]
for k in range(4):
 b=[[0]*15 for _ in range(15)]
 if k==0:b[7][7]=1
 else:
  for j,i in enumerate(rng.sample([y*15+x for y in range(4,11) for x in range(4,11)],8+2*k)):b[i//15][i%15]=1+j%2
 color=2 if k==0 else 1
 start=time.monotonic()
 q=subprocess.run(['python3','engine.py'],input=json.dumps(dict(board=b,yourColor='white' if color==2 else 'black',timeLimitMs=5000))+'\n',text=True,capture_output=True,timeout=6)
 dt=time.monotonic()-start;out=json.loads(q.stdout)
 assert q.returncode==0 and not q.stderr and b[out['y']][out['x']]==0 and dt<5
 result=dict(case=f'cold quiet {k}',seconds=round(dt,3),response=out)
 results.append(result);print(result,flush=True)
json.dump(results,open('budget_validation.json','w'),indent=2)
