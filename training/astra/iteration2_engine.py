import sys,json,time
from functools import lru_cache
N=225
DIR=((1,0),(0,1),(1,1),(1,-1))
POW=[3**i for i in range(9)]
RAYS=[]; UP=[[] for _ in range(N)]; NEAR=[]
for p in range(N):
 x,y=p%15,p//15; rays=[]
 for d,(dx,dy) in enumerate(DIR):
  ray=[]
  for i in range(9):
   xx,yy=x+(i-4)*dx,y+(i-4)*dy
   q=yy*15+xx if 0<=xx<15 and 0<=yy<15 else -1
   ray.append(q)
   if q>=0 and i!=4: UP[q].append((p,d,POW[i]))
  rays.append(ray)
 RAYS.append(rays)
 NEAR.append([yy*15+xx for yy in range(max(0,y-2),min(15,y+3)) for xx in range(max(0,x-2),min(15,x+3)) if (xx,yy)!=(x,y)])
@lru_cache(None)
def pattern(code,c):
 a=[]
 for i in range(9):
  v=code%3;code//=3;a.append(1 if v==c else 0 if v==0 else 2)
 a[4]=1
 wins=set(); threes=[]; weak=0
 for start in range(5):
  w=a[start:start+5]
  if 2 in w:continue
  z=[start+i for i,v in enumerate(w) if v==0]
  if not z:return (1,0,0,0)
  if len(z)==1:wins.add(z[0])
  elif len(z)==2: threes.append(z)
  weak+= (0,0,55,9,1,0)[len(z)]
 ext={}
 for pair in threes:
  for q in pair:ext.setdefault(q,set()).update(t for t in pair if t!=q)
 open3=any(len(v)>=2 for v in ext.values())
 return (0,len(wins),int(open3),weak)
def combine(parts):
 if any(v[0] for v in parts):return 100000000
 fours=sum(v[1] for v in parts);threes=sum(v[2] for v in parts)
 if fours>=2:return 2000000
 if fours and threes:return 650000
 if threes>=2:return 160000
 return fours*30000+threes*6000+sum(v[3] for v in parts)
class Timeout(Exception):pass
class Engine:
 def __init__(self,b):
  self.b=b
  # Boundaries are blockers for either color.
  self.codes=[[sum((b[q] if q>=0 else 0)*POW[i] for i,q in enumerate(ray)) for ray in rays] for rays in RAYS]
  self.edges=[[sum(POW[i] for i,q in enumerate(ray) if q<0) for ray in rays] for rays in RAYS]
  self.s=[[0]*N for _ in range(3)];self.near=[sum(b[q]!=0 for q in ns) for ns in NEAR]
  for p in range(N):self.refresh(p)
  self.nodes=0
 def refresh(self,p):
  for c in (1,2):self.s[c][p]=combine([pattern(self.codes[p][d]+(3-c)*self.edges[p][d],c) for d in range(4)])
 def put(self,p,c):
  self.b[p]=c; changed={}
  for q,d,w in UP[p]:
   if q not in changed:changed[q]=(self.s[1][q],self.s[2][q])
   self.codes[q][d]+=c*w
  for q in changed:
   if not self.b[q]:self.refresh(q)
  for q in NEAR[p]:self.near[q]+=1
  return changed
 def undo(self,p,c,changed):
  self.b[p]=0
  for q,d,w in UP[p]:self.codes[q][d]-=c*w
  for q,(a,b) in changed.items():self.s[1][q]=a;self.s[2][q]=b
  for q in NEAR[p]:self.near[q]-=1
 def moves(self,c):
  own=self.s[c];opp=self.s[3-c]
  ps=[p for p in range(N) if not self.b[p] and self.near[p]]
  wins=[p for p in ps if own[p]>=100000000]
  if wins:return wins,1
  blocks=[p for p in ps if opp[p]>=100000000]
  if blocks:return blocks,2 if len(blocks)==1 else 3
  ps.sort(key=lambda p:max(own[p],opp[p]*1.04)+min(own[p],opp[p])*.35-abs(p%15-7)-abs(p//15-7),reverse=True)
  return ps,0
 def evaluate(self,c,ps):
  a=sorted((self.s[c][p] for p in ps),reverse=True)[:3];b=sorted((self.s[3-c][p] for p in ps),reverse=True)[:3]
  return max(-3000000,min(3000000,(a[0]+sum(a[1:])*.15 if a else 0)-(b[0]+sum(b[1:])*.15 if b else 0)*1.08))
 def search(self,c,depth,alpha,beta,ply,ext=5):
  self.nodes+=1
  if time.perf_counter()>self.deadline:raise Timeout()
  ps,forced=self.moves(c)
  if ply==0 and getattr(self,"safe",None):ps=[p for p in ps if p in self.safe]
  if forced==1:return 10000000-ply,None if not ps else ps[0]
  if forced==3:return -10000000+ply+1,ps[0]
  if not ps:return 0,None
  if forced==0:
   forks=[p for p in ps if self.s[c][p]>=2000000]
   if forks:return 10000000-ply-2,forks[0]
  if depth<=0 and forced!=2:
   # Extend forcing fours at horizon; quiet moves use static evaluation.
   forcing=[p for p in ps if self.s[c][p]>=30000 and self.s[c][p]!=160000]
   if ext>0 and forcing:ps=forcing[:5]
   else:return self.evaluate(c,ps),None
  limit=14 if ply==0 else 9 if depth>=2 else 7
  if forced==2:limit=1
  best=-1e20;bp=ps[0]
  for p in ps[:limit]:
   saved=self.put(p,c)
   try:v,_=self.search(3-c,depth-1,-beta,-alpha,ply+1,ext-(depth<=0));v=-v
   finally:self.undo(p,c,saved)
   if v>best:best,bp=v,p
   alpha=max(alpha,v)
   if alpha>=beta:break
  return best,bp
 def vcf(self,c,left=12):
  # Only search attacks creating an immediate five threat. Every defender
  # reply is forced; a discovered line is a proof, failure is inconclusive.
  self.proofnodes+=1
  if time.perf_counter()>self.proofdeadline:raise Timeout()
  ps,forced=self.moves(c)
  if forced==1:return ps[0]
  if forced==3 or left<=0:return None
  attacks=[p for p in ps if self.s[c][p]>=30000 and self.s[c][p]!=160000]
  if forced==2:attacks=[p for p in attacks if p==ps[0]]
  for p in attacks:
   if self.s[c][p]>=2000000 and forced==0:return p
   saved=self.put(p,c)
   try:
    replies,kind=self.moves(3-c)
    if kind==1:continue
    if kind==3:return p
    if kind!=2:continue
    q=replies[0];saved2=self.put(q,3-c)
    try:win=self.vcf(c,left-1)
    finally:self.undo(q,3-c,saved2)
    if win is not None:return p
   finally:self.undo(p,c,saved)
  return None
 def choose(self,c,ms):
  if not any(self.b):return 112,'center'
  self.deadline=time.perf_counter()+min(4.35,max(.05,ms/1000-.35))
  ps,forced=self.moves(c)
  if not ps:return next(p for p in range(N) if not self.b[p]),'empty'
  best=ps[0]
  if forced:return best,'win' if forced==1 else 'block'
  self.proofnodes=0
  self.proofdeadline=min(self.deadline,time.perf_counter()+.30)
  try:
   win=self.vcf(c)
   if win is not None:return win,f'proved four sequence; nodes {self.proofnodes}'
  except Timeout:pass
  # Screen the normal root candidates for longer opponent four sequences.
  candidates=ps[:14];safe=[];rejected=[]
  screening_end=min(self.deadline,time.perf_counter()+.85)
  for p in candidates:
   self.proofdeadline=min(screening_end,time.perf_counter()+.065)
   saved=self.put(p,c)
   try:
    try:loss=self.vcf(3-c)
    except Timeout:loss=None
   finally:self.undo(p,c,saved)
   if loss is None:safe.append(p)
   else:rejected.append(p)
  self.safe=set(safe) if safe else set(candidates)
  best=next(p for p in candidates if p in self.safe)
  completed=0
  for depth in range(1,9):
   try:value,p=self.search(c,depth,-1e20,1e20,0)
   except Timeout:break
   if p is not None:best=p
   completed=depth
   if value>9000000:break
  return best,f'depth {completed}; nodes {self.nodes}; rejected {len(rejected)}'
def main():
 for line in sys.stdin:
  try:
   a=json.loads(line);b=[v for row in a['board'] for v in row];c=1 if a['yourColor'] in ('black',1) else 2
   started=time.perf_counter();e=Engine(b);p,note=e.choose(c,a.get('timeLimitMs',5000)-(time.perf_counter()-started)*1000)
   print(json.dumps({'x':p%15,'y':p//15,'note':note}),flush=True)
  except Exception as ex:
   empties=[i for i,v in enumerate(b) if not v]
   p=empties[0] if empties else 0
   print(json.dumps({'x':p%15,'y':p//15,'note':'fallback '+type(ex).__name__}),flush=True)
if __name__=='__main__':main()
