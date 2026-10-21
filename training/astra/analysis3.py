import json,time
from engine import Engine,Timeout
from tactical_review import proof,coord,wins
r=json.load(open('public_replays.json'))
for g in r[-2:]:
 b=[0]*225
 for m in g['moves']:
  b[m['y']*15+m['x']]=m['color']
  if 'Astra' in g['black' if m['color']==1 else 'white']['name'] and m['ply']>=7:
   e=Engine(b[:]);e.proofnodes=0;e.proofdeadline=time.perf_counter()+.3
   try:v=e.threat(3-m['color']);v=None if v is None else coord(v)
   except Timeout:v='timeout'
   print(g['id'],'after',m['ply'],m['coordinate'],'threat',v,'VCF',proof(b,3-m['color']),flush=True)
