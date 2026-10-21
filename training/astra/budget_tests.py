import json,time,subprocess
from tactical_review import wins,proof
r=json.load(open('public_replays.json'))
for g,turn in [(r[-2],3),(r[-2],33),(r[-1],30),(r[-1],34),(r[-1],45)]:
 b=[0]*225
 for m in g['moves'][:turn-1]:b[m['y']*15+m['x']]=m['color']
 c=1 if turn%2 else 2
 msg={'board':[b[i:i+15] for i in range(0,225,15)],'yourColor':'black' if c==1 else 'white','ply':turn,'matchId':g['id'],'moves':g['moves'][:turn-1],'timeLimitMs':5000}
 t=time.perf_counter();rproc=subprocess.run(['python3','engine.py'],input=json.dumps(msg)+'\n',capture_output=True,text=True,timeout=5);elapsed=time.perf_counter()-t
 a=json.loads(rproc.stdout);p=a['y']*15+a['x'];assert not b[p] and 'fallback' not in a['note'] and elapsed<5
 print(g['id'],turn,a,'elapsed',elapsed,flush=True)
 if turn==45:
  assert proof(b,c) is not None
  assert (a['x'],a['y'])==(10,8)
# Independent confirmation of the final diagonal fork in the first game.
b=[0]*225
for m in r[-2]['moves'][:34]:b[m['y']*15+m['x']]=m['color']
assert set(wins(b,2))=={2*15+7,7*15+12}
print('Confirmed move34 L7 creates H3/M8 winning endpoints.')
