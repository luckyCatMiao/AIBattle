import json,time,subprocess
from engine import Engine,Timeout
from tactical_review import wins,coord
r=json.load(open('public_replays.json'));byid={g['id']:g for g in r}
def pos(g,n):
 b=[0]*225
 for m in g['moves'][:n]:b[m['y']*15+m['x']]=m['color']
 return b
def verify_vcf(b,c,depth=12):
 # Engine proposes attack; independent contiguous scanner validates every
 # immediate counterwin, forced block, and terminal fork in the certificate.
 if wins(b,c):return True
 e=Engine(b[:]);e.proofnodes=0;e.proofdeadline=time.perf_counter()+1
 p=e.vcf(c,depth)
 if p is None:return False
 b=b[:];b[p]=c
 assert not wins(b,3-c)
 w=wins(b,c)
 if len(w)>=2:return True
 assert len(w)==1
 b[w[0]]=3-c
 assert depth>0
 return verify_vcf(b,c,depth-1)
g=byid['c1ca491b0482e5f2'];b=pos(g,14)
e=Engine(b[:]);e.proofnodes=0;e.proofdeadline=time.perf_counter()+2
assert e.vcf(1) is None
p=e.threat(1);assert p==3*15+8,(p,coord(p))
assert e.b==b
b[p]=1;assert not wins(b,1) and not wins(b,2)
count=0
for q in range(225):
 if b[q]:continue
 bb=b[:];bb[q]=2
 assert verify_vcf(bb,1),(q,coord(q))
 count+=1
print('Independently verified I4 quiet-threat certificate against',count,'legal replies',flush=True)
# Full entrypoint, fresh cold process per representative real position.
for gid,n in [('9c80ca79494320e9',6),('9c80ca79494320e9',8),('9c80ca79494320e9',14),('9c80ca79494320e9',16),('c1ca491b0482e5f2',7),('c1ca491b0482e5f2',13),('c1ca491b0482e5f2',19),('72ccfa4ccb489216',41)]:
 g=byid[gid];b=pos(g,n);c=1+n%2
 a={'board':[b[i:i+15] for i in range(0,225,15)],'yourColor':'black' if c==1 else 'white','ply':n+1,'moves':g['moves'][:n],'matchId':'regression3','timeLimitMs':5000}
 t=time.perf_counter();run=subprocess.run(['python3','engine.py'],input=json.dumps(a)+'\n',text=True,capture_output=True,timeout=5);elapsed=time.perf_counter()-t
 ans=json.loads(run.stdout);p=ans['y']*15+ans['x'];assert not b[p] and 'fallback' not in ans['note'];assert elapsed<5
 b[p]=c;e=Engine(b[:]);e.proofnodes=0;e.proofdeadline=time.perf_counter()+.5
 try:refutation=e.threat(3-c)
 except Timeout:refutation='unknown'
 if gid=='c1ca491b0482e5f2' and n==13:assert refutation is None
 if gid=='72ccfa4ccb489216':
  e.proofdeadline=time.perf_counter()+.5
  assert e.vcf(3-c) is None
 print(gid,'move',n+1,coord(p),ans['note'],'seconds',round(elapsed,4),'opponent threat',refutation,flush=True)
# A forced defensive move can itself preserve a quiet winning attack.
g=byid['9c80ca79494320e9'];b=pos(g,21);e=Engine(b[:]);e.proofnodes=0;e.proofdeadline=time.perf_counter()+2
p=e.threat(2);assert p==7*15+12,coord(p)
b[p]=2;count=0
for q in range(225):
 if b[q]:continue
 bb=b[:];bb[q]=1;assert verify_vcf(bb,2);count+=1
print('Verified M8 forced-block/quiet-threat certificate against',count,'legal replies',flush=True)
# Interrupted proof search restores the full incremental position.
b=pos(byid['c1ca491b0482e5f2'],14);e=Engine(b[:]);before=(e.b[:],[v[:] for v in e.s],[v[:] for v in e.codes],e.near[:]);e.proofnodes=0;e.proofdeadline=time.perf_counter()+.001
try:e.threat(1)
except Timeout:pass
assert (e.b,e.s,e.codes,e.near)==before
print('Timeout restoration passed',flush=True)
