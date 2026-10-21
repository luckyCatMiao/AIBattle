import random,time,json,subprocess
from engine import Engine,WIN,DIRS,Timeout
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
  sequence=empties[:6]
  for j,i in enumerate(sequence):
   e.put(i,1+j%2)
   fresh=Engine([e.b[y*15:y*15+15] for y in range(15)],5000)
   assert e.scores==fresh.scores and e.neighbors==fresh.neighbors
  for i in reversed(sequence):e.undo(i)
  assert e.scores==old and e.neighbors==nb and e.b==bb
  for i in empties:
   for p in (1,2):
    if e.scores[p][i]>=3_000_000 and e.scores[p][i]<WIN:
     trial=[r[:] for r in b];trial[i//15][i%15]=p
     wins=sum(brute(trial,j,p) for j in empties if j!=i)
     assert wins>=2,(k,i,p,wins)
print('50 random boards: exact wins, double-continuation proofs, nested incremental updates and rollback verified',flush=True)
# Interrupt an actual nested forcing search and verify all finally restorations.
b=[[0]*15 for _ in range(15)]
for x in (5,6,7):b[7][x]=1
b[7][4]=2
e=Engine(b,5000);old=[s[:] for s in e.scores];nb=e.neighbors[:];bb=e.b[:]
checks=[0]
def interrupt():
 checks[0]+=1
 if checks[0]>=2:raise Timeout
e.check=interrupt
try:e.force(1,8)
except Timeout:pass
assert checks[0]>=2
assert e.scores==old and e.neighbors==nb and e.b==bb and not e.history
del e.check
e.deadline=time.monotonic()-1
move,note=e.choose(2)
assert not e.b[move] and e.scores==old and e.b==bb and not e.history
print('Interrupted proof/search restoration and legal timeout fallback verified',flush=True)
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

# Expire the budget immediately after the completed root tactical screen.
r=json.load(open('public_replays.json'))
b=[[0]*15 for _ in range(15)]
for m in r[6]['moves'][:5]:b[m['y']][m['x']]=m['color']
e=Engine(b,5000);bb=e.b[:];scores=[a[:] for a in e.scores]
def expire(p,depth):
 return None
def stopsearch(*args):raise Timeout
e.force=expire
e.search=stopsearch
i,note=e.choose(2)
assert note=='tactical fallback',note
assert e.b==bb and e.scores==scores and not e.history
e.put(i,2)
assert not any(e.scores[1][j]>=3_000_000 for j in e.candidates(1)),(i,note)
e.undo(i)
print('Budget expiration after root screen retains a defense against the human replay open three',flush=True)
