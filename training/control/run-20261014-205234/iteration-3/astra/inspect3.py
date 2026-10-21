import json,time
from engine import Engine,Timeout
r=json.load(open('public_replays.json'))
for g in r[-2:]:
 b=[0]*225
 for m in g['moves']:
  p=m['y']*15+m['x'];c=m['color']
  if 'Astra' in g['black' if c==1 else 'white']['name'] and 7<=m['ply']<=20:
   e=Engine(b[:]);ps,_=e.moves(c);e.proofnodes=0;out=[]
   for q in ps[:35]:
    s=e.put(q,c);e.proofdeadline=time.perf_counter()+.025
    try:v=e.vcf(3-c)
    except Timeout:v='timeout'
    e.undo(q,c,s)
    if v is None:out.append((ps.index(q)+1,chr(65+q%15)+str(q//15+1)))
   print(g['id'],m['ply'],m['coordinate'],'rank',ps.index(p)+1,'unrefuted',out,flush=True)
  b[p]=c
