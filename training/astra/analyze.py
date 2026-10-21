import json,time
from engine import Engine
r=json.load(open('public_replays.json'))
for g,turns in [(r[-2],[13,15,23,25,27,31]),(r[-1],[30,34,38,42])]:
 for turn in turns:
  b=[0]*225
  for m in g['moves'][:turn-1]:b[m['y']*15+m['x']]=m['color']
  e=Engine(b);t=time.perf_counter();p,n=e.choose(1 if turn%2 else 2,1800)
  print(g['id'],turn,'old',g['moves'][turn-1]['coordinate'],'new',chr(65+p%15)+str(1+p//15),n,round(time.perf_counter()-t,3),flush=True)
