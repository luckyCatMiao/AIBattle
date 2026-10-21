import json,time,subprocess
import engine,iteration1_engine
from tactical_review import proof
r=json.load(open('public_replays.json'))
def pos(g,n):
 b=[0]*225
 for m in g['moves'][:n]:b[m['y']*15+m['x']]=m['color']
 return b
# Reproduce the false mate through actual search, not only a score clamp.
b=pos(r[-2],12)
for module in (iteration1_engine,engine):
 e=module.Engine(b[:]);e.deadline=time.perf_counter()+5
 value,p=e.search(1,1,-1e20,1e20,0)
 print(module.__name__,'depth1',value,p,flush=True)
 if module==engine:assert abs(value)<9000000
 else:assert value>9000000
# Real move-42 defense: old choice admits a separately checked forcing line.
b=pos(r[-1],41);old=r[-1]['moves'][41];bad=b[:];bad[old['y']*15+old['x']]=2
assert isinstance(proof(bad,1),list)
e=engine.Engine(b[:]);t=time.perf_counter();p,n=e.choose(2,5000);elapsed=time.perf_counter()-t
b[p]=2;result=proof(b,1)
assert result is None,(p,result)
print('move42',p%15,p//15,n,elapsed,'no VCF found',flush=True)
# Fresh-process full budget, real latest-game position; two input lines.
b=pos(r[-2],12)
msg={'board':[b[i:i+15] for i in range(0,225,15)],'yourColor':'black','ply':13,'matchId':'regression','moves':r[-2]['moves'][:12],'timeLimitMs':5000}
t=time.perf_counter();proc=subprocess.run(['python3','engine.py'],input=json.dumps(msg)+'\n'+json.dumps(dict(msg,board=[[0]*15 for _ in range(15)]))+'\n',capture_output=True,text=True,timeout=5)
elapsed=time.perf_counter()-t
lines=proc.stdout.splitlines();assert len(lines)==2,(proc.stdout,proc.stderr)
a=json.loads(lines[0]);assert b[a['y']*15+a['x']]==0 and 'fallback' not in a['note'];assert elapsed<5
print('fresh persistent process seconds',elapsed,proc.stdout,flush=True)
