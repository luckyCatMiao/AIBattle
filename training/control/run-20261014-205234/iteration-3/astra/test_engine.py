import json,time,subprocess
from engine import Engine
records=json.load(open('public_replays.json'))
def pos(g,n):
 b=[0]*225
 for m in g['moves'][:n]:b[m['y']*15+m['x']]=m['color']
 return b
def winning(b,p,c):
 x,y=p%15,p//15
 for dx,dy in ((1,0),(0,1),(1,1),(1,-1)):
  count=1
  for sign in (-1,1):
   xx,yy=x+sign*dx,y+sign*dy
   while 0<=xx<15 and 0<=yy<15 and b[yy*15+xx]==c:
    count+=1;xx+=sign*dx;yy+=sign*dy
  if count>=5:return True
 return False
seen=set();tests=[]
for g in records:
 key=tuple((m['color'],m['x'],m['y']) for m in g['moves'])
 if key in seen:continue
 seen.add(key)
 # Winner's final move: must find an actual immediate win.
 b=pos(g,len(key)-1);c=g['moves'][-1]['color'];e=Engine(b);t=time.perf_counter();p,n=e.choose(c,5000)
 assert winning(b,p,c),(g['id'],p,n)
 tests.append((g['id'],'final',p%15,p//15,round(time.perf_counter()-t,3),n))
# Replay precursor to open fours: choose a move preventing an immediate fork.
for gid,n in [('2854c6431a3427f1',8),('94a783909494e51c',7),('83478ee6ee2cac64',5),('c0456dbabc64e04d',8),('86c477fc4433b321',10)]:
 g=next(g for g in records if g['id']==gid);b=pos(g,n);c=1+n%2;e=Engine(b);t=time.perf_counter();p,note=e.choose(c,5000)
 saved=e.put(p,c)
 ownwin=any(not e.b[q] and e.s[c][q]>=100000000 for q in range(225))
 oppfork=[(q%15,q//15) for q in range(225) if not e.b[q] and e.s[3-c][q]>=2000000]
 assert not oppfork or ownwin,(gid,p,oppfork)
 tests.append((gid,n+1,p%15,p//15,round(time.perf_counter()-t,3),note,'opponent forks',oppfork,'own forcing',ownwin))
# Unique broken-four block, edge win, overline completion.
for stones,c,expected in [([(0,0,2),(1,0,2),(3,0,2),(4,0,2)],1,{(2,0)}), ([(0,14,1),(1,14,1),(2,14,1),(3,14,1)],1,{(4,14)}), ([(2,7,1),(3,7,1),(4,7,1),(6,7,1),(7,7,1)],1,{(5,7)})]:
 b=[0]*225
 for x,y,v in stones:b[y*15+x]=v
 e=Engine(b);p,n=e.choose(c,5000);assert (p%15,p//15) in expected
# Incremental updates and restoration match a fresh evaluator.
e=Engine(pos(records[0],8));original=(e.b[:],[r[:] for r in e.s]);s=e.put(112+2,1);fresh=Engine(e.b[:])
for p in range(225):
 if not e.b[p]:assert e.s[1][p]==fresh.s[1][p] and e.s[2][p]==fresh.s[2][p]
e.undo(114,1,s);assert (e.b,e.s)==original
# Persistent JSON process, two positions on same stdin stream.
msgs=[{'board':[[0]*15 for _ in range(15)],'yourColor':'black','timeLimitMs':5000},{'board':[pos(records[0],11)[i:i+15] for i in range(0,225,15)],'yourColor':'white','timeLimitMs':5000}]
r=subprocess.run(['python3','engine.py'],input=''.join(json.dumps(m)+'\n' for m in msgs),text=True,capture_output=True,timeout=10)
assert len(r.stdout.splitlines())==2
for line in r.stdout.splitlines():assert 'fallback' not in json.loads(line)['note']
print(json.dumps(tests,indent=2));print('All assertions passed. Protocol:',r.stdout)
