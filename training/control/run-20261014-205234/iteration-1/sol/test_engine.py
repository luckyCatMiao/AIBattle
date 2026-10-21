import json,subprocess,time,random,hashlib
from engine import Engine,WIN
replays=json.load(open('public_replays.json'))
cases=[]
def position(moves):
 b=[[0]*15 for _ in range(15)]
 for m in moves:b[m['y']][m['x']]=m['color']
 return b
def add(name,b,p,allowed=None):cases.append((name,b,p,allowed))
add('empty',position([]),1,{(7,7)})
add('white opening',position([dict(x=7,y=7,color=1)]),2,{(8,8)})
for gi,ply,p,allowed in [(0,7,2,{(5,9)}),(0,9,2,{(8,5),(8,9)}),(0,11,2,{(8,5)}),(1,8,1,{(6,6),(10,10)}),(1,10,1,{(6,6)}),(6,5,2,{(7,6),(7,10)}),(6,7,2,{(7,5),(7,10)}),(7,5,2,None),(7,11,2,{(8,5),(8,9)}),(7,13,2,{(8,9)}),(8,10,1,{(10,3)}),(8,12,1,{(8,6),(4,10)}),(8,14,1,{(4,10)}),(9,5,2,None),(9,9,2,{(9,8)}),(9,11,2,{(11,8)}),(10,8,1,{(13,12)}),(10,10,1,{(9,7),(10,7)}),(10,12,1,{(10,7)})]:
 add(f'replay {gi} after {ply}',position(replays[gi]['moves'][:ply]),p,allowed)
# Additional archived iteration-3 games, without treating shared prefixes as independent evidence.
for gi,ply,p,allowed in [(11,5,2,None),(11,7,2,{(7,3)}),(11,9,2,None),(11,11,2,{(11,5),(7,9)}),(11,13,2,{(7,9)}),(12,8,1,{(13,12)}),(12,10,1,{(5,7),(9,7)}),(12,12,1,{(10,7),(5,7)})]:
 add(f'replay {gi} after {ply}',position(replays[gi]['moves'][:ply]),p,allowed)
for color in (1,2):
 b=position([dict(x=x,y=0,color=color) for x in (0,1,2,3)])
 add(f'edge four color {color}',b,color,{(4,0)})
 b=position([dict(x=x,y=7,color=3-color) for x in (3,4,6,7)])
 add(f'broken four block color {color}',b,color,{(5,7)})
b=position([dict(x=x,y=7,color=1) for x in (4,5,6,7,9)])
add('overline winning gap',b,1,{(3,7),(8,7)})
b=position([dict(x=x,y=7,color=2) for x in (4,5,6,7)]+[dict(x=x,y=3,color=1) for x in (0,1,2,3)])
add('own win before defense',b,1,{(4,3)})
# A crossing move creates two independent one-ended fours.
b=position([dict(x=x,y=7,color=1) for x in (5,6,8)]+[dict(x=7,y=y,color=1) for y in (5,6,8)]+[dict(x=4,y=7,color=2),dict(x=7,y=4,color=2)])
add('double four',b,1,{(7,7)})
rng=random.Random(14)
b=[[0]*15 for _ in range(15)]
for i in rng.sample(range(3*15+3,12*15+12),30):b[i//15][i%15]=rng.choice((1,2))
add('busy board budget',b,1)
p=subprocess.Popen(['python3','engine.py'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
results=[]
for name,b,color,allowed in cases:
 start=time.monotonic()
 p.stdin.write(json.dumps(dict(board=b,yourColor='black' if color==1 else 'white',ply=sum(v!=0 for r in b for v in r),moves=[],matchId='test',timeLimitMs=5000))+'\n');p.stdin.flush()
 response=json.loads(p.stdout.readline());elapsed=time.monotonic()-start
 xy=response['x'],response['y'];legal=0<=xy[0]<15 and 0<=xy[1]<15 and b[xy[1]][xy[0]]==0
 passed=legal and elapsed<5 and (allowed is None or xy in allowed)
 result=dict(name=name,move=xy,note=response['note'],seconds=round(elapsed,3),passed=passed)
 print(result,flush=True);results.append(result)
p.stdin.close();p.wait(timeout=5)
print('STDERR:',p.stderr.read())
json.dump(results,open('validation.json','w'),indent=2)
assert all(r['passed'] for r in results)
