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
  old=[s[:] for s in e.scores];nb=e.neighbors[:];bb=e.b[:];parts=[a[:] for a in e.parts]
  sequence=empties[:6]
  for j,i in enumerate(sequence):
   e.put(i,1+j%2)
   fresh=Engine([e.b[y*15:y*15+15] for y in range(15)],5000)
   assert e.scores==fresh.scores and e.neighbors==fresh.neighbors
   assert e.parts==fresh.parts and e.views==fresh.views
  for i in reversed(sequence):e.undo(i)
  assert e.scores==old and e.neighbors==nb and e.b==bb and e.parts==parts
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
e=Engine(b,5000);old=[s[:] for s in e.scores];nb=e.neighbors[:];bb=e.b[:];parts=[a[:] for a in e.parts]
checks=[0]
def interrupt():
 checks[0]+=1
 if checks[0]>=2:raise Timeout
e.check=interrupt
try:e.force(1,8)
except Timeout:pass
assert checks[0]>=2
assert e.scores==old and e.neighbors==nb and e.b==bb and e.parts==parts and not e.history
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
assert note in ('tactical fallback','four-sequence defense'),note
assert e.b==bb and e.scores==scores and not e.history
e.put(i,2)
assert not any(e.scores[1][j]>=3_000_000 for j in e.candidates(1)),(i,note)
e.undo(i)
print('Budget expiration after root screen retains a defense against the human replay open three',flush=True)

# Longer opponent VCF: a four forces one block, then a vertical open four wins.
b=[[0]*15 for _ in range(15)]
for x,y in [(4,7),(5,7),(7,7),(6,4),(6,5)]:b[y][x]=2
b[7][3]=1;b[9][9]=1
e=Engine(b,5000)
assert not any(e.scores[2][i]>=3_000_000 for i in e.candidates(2))
assert e.force(2,6)==111
# Validate the actual forcing continuation against the independent line oracle.
trial=[r[:] for r in b];trial[7][6]=2
wins=[i for i in range(225) if not trial[i//15][i%15] and brute(trial,i,2)]
assert wins==[113],wins
trial[7][8]=1;trial[6][6]=2
wins=[i for i in range(225) if not trial[i//15][i%15] and brute(trial,i,2)]
assert set(wins)=={51,126},wins
# Isolate the new defensive screen by stopping the ordinary search.
before=e.b[:];scores=[a[:] for a in e.scores]
e.search=stopsearch
i,note=e.choose(1)
assert e.b==before and e.scores==scores and not e.history
e.put(i,1);assert e.force(2,6) is None,(i,note);e.undo(i)
print('Independent two-four sequence verified; defensive fallback prevents its proof',i%15,i//15,flush=True)
# Every tactical candidate must survive even a deliberately tiny beam.
cs=e.candidates(1);kept=e.shortlist(cs,1,1)
assert all(i in kept for i in cs if max(e.scores[1][i],e.scores[2][i])>=90000)
print('Forcing/defensive candidates survive quiet beam truncation',flush=True)

# Root expansion retains developing open threes as well as forcing fours.
b=[[0]*15 for _ in range(15)]
b[7][5]=b[7][6]=1
b[4][8]=b[5][8]=2
e=Engine(b,5000);cs=e.candidates(1)
kept=e.shortlist(cs,1,1,12000)
assert any(12000<=max(e.scores[1][i],e.scores[2][i])<90000 for i in cs[1:])
assert all(i in kept for i in cs if max(e.scores[1][i],e.scores[2][i])>=12000)
for i in cs[:6]:
 e.put(i,1)
 fresh=Engine([e.b[y*15:y*15+15] for y in range(15)],5000)
 assert e.views==fresh.views
 e.undo(i)
assert e.views==Engine(b,5000).views
print('Root open-three retention and incremental color views verified',flush=True)
