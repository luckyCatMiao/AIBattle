import json,time
from engine import Engine,Timeout
r=json.load(open('public_replays.json'))
def coord(p):return chr(65+p%15)+str(p//15+1)
def wins(b,c):
 out=[]
 for p in range(225):
  if b[p]:continue
  for dx,dy in ((1,0),(0,1),(1,1),(1,-1)):
   n=1
   for sign in (-1,1):
    x,y=p%15+sign*dx,p//15+sign*dy
    while 0<=x<15 and 0<=y<15 and b[y*15+x]==c:n+=1;x+=sign*dx;y+=sign*dy
   if n>=5:out.append(p);break
 return out
def proof(b,c):
 e=Engine(b[:]);e.proofnodes=0;e.proofdeadline=time.perf_counter()+.4
 try:p=e.vcf(c)
 except Timeout:return 'unknown'
 if p is None:return None
 trace=[]
 for _ in range(15):
  if wins(e.b,c):trace.append('win '+coord(wins(e.b,c)[0]));return trace
  e.proofdeadline=time.perf_counter()+.4
  p=e.vcf(c);assert p is not None
  e.put(p,c);trace.append(coord(p))
  assert not wins(e.b,3-c),'defender counterwin'
  threats=wins(e.b,c)
  if len(threats)>=2:trace.append('two wins '+','.join(map(coord,threats)));return trace
  assert len(threats)==1
  q=threats[0];e.put(q,3-c);trace.append('forced '+coord(q))
 raise AssertionError('proof too long')
if __name__=='__main__':
 for g in r[-2:]:
  b=[0]*225
  for m in g['moves']:
   b[m['y']*15+m['x']]=m['color']
   if (g==r[-2] and m['ply'] in [13,19,23,25,27,29,30]) or (g==r[-1] and m['ply'] in [30,32,34,36,38,40,42,44]):
    print(g['id'],'after',m['ply'],m['coordinate'],proof(b,3-m['color']),flush=True)
