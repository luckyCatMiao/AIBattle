"""Self-authored freestyle Gomoku engine; no external dependencies."""
import sys,json,time,functools
N=15
WIN=100_000_000
MATE=1_000_000_000
DIRS=((1,0),(0,1),(1,1),(1,-1))
LINES=[]
AFFECT=[]
NEAR=[]
for i in range(225):
 x,y=i%15,i//15
 LINES.append([tuple((y+k*dy)*15+x+k*dx if 0<=x+k*dx<15 and 0<=y+k*dy<15 else 225 for k in range(-4,5)) for dx,dy in DIRS])
 AFFECT.append(tuple({j for line in LINES[i] for j in line if j<225}))
 NEAR.append(tuple(b*15+a for b in range(max(0,y-2),min(15,y+3)) for a in range(max(0,x-2),min(15,x+3)) if b*15+a!=i))

@functools.lru_cache(maxsize=120000)
def linevalue(s):
 # Every five-cell window includes the newly placed central stone.
 windows=[s[i:i+5] for i in range(5)]
 if '11111' in windows:return WIN
 points=set()
 for i,w in enumerate(windows):
  if w.count('1')==4 and w.count('0')==1:points.add(i+w.index('0'))
 if len(points)>1:return 3_000_000
 if points:return 90_000
 # Test genuine open-three extensions rather than counting overlapping windows.
 extensions=0
 for j,v in enumerate(s):
  if v!='0':continue
  t=s[:j]+'1'+s[j+1:]
  wins=set()
  for i in range(max(0,j-4),min(4,j)+1):
   w=t[i:i+5]
   if w.count('1')==4 and w.count('0')==1:wins.add(i+w.index('0'))
  if len(wins)>1:extensions+=1
 if extensions:return 12_000+min(extensions,2)*500
 # Quiet development: viable windows and open pairs, anchored at the move.
 value=0
 for w in windows:
  if '2' not in w:
   n=w.count('1');value=max(value,(0,15,150,900,0,0)[n])
 for t in ('001100','0010100','010010','01010'):
  start=0
  while True:
   at=s.find(t,start)
   if at<0:break
   if at<=4<at+len(t) and t[4-at]=='1':value=max(value,650)
   start=at+1
 return value

# A placement changes just one direction for most affected candidate cells.
IMPACT=[tuple((j,tuple(d for d,line in enumerate(LINES[j]) if i in line))
              for j in AFFECT[i]) for i in range(225)]

class Timeout(Exception):pass
class Engine:
 def __init__(self,board,limit):
  self.b=[v for row in board for v in row]+[3]
  # Maintain both color views so line evaluation avoids repeated cell decoding.
  self.views=[None]+[['0' if not v else '1' if v==p else '2' for v in self.b] for p in (1,2)]
  self.deadline=time.monotonic()+min(4.4,max(.05,limit/1000-.35))
  self.scores=[[0]*225 for _ in range(3)]
  self.parts=[[None]*225 for _ in range(3)]
  self.neighbors=[0]*225
  for i,v in enumerate(self.b[:225]):
   if v:
    for j in NEAR[i]:self.neighbors[j]+=1
  for i in range(225):self.update(i)
  self.tt={};self.order={};self.force_cache={};self.nodes=0;self.history=[]
 def check(self):
  if time.monotonic()>=self.deadline:raise Timeout
 def update(self,i,directions=(0,1,2,3)):
  if self.b[i]:
   self.scores[1][i]=self.scores[2][i]=0
   self.parts[1][i]=self.parts[2][i]=(0,0,0,0);return
  for p in (1,2):
   vals=list(self.parts[p][i] or (0,0,0,0))
   for d in directions:
    s=''.join(map(self.views[p].__getitem__,LINES[i][d]))
    s=s[:4]+'1'+s[5:]
    vals[d]=linevalue(s)
   self.parts[p][i]=tuple(vals)
   vals.sort(reverse=True)
   if vals[0]>=WIN:v=WIN
   elif vals[1]>=90_000:v=4_000_000
   elif vals[0]>=90_000 and vals[1]>=12_000:v=max(sum(vals),220_000)
   elif vals[1]>=12_000:v=70_000+sum(vals)
   else:v=sum(vals)
   self.scores[p][i]=v
 def put(self,i,p):
  # Save evaluated cells: restoration should not evaluate the same lines again.
  self.history.append((i,[(j,self.scores[1][j],self.scores[2][j],self.parts[1][j],self.parts[2][j]) for j in AFFECT[i]]))
  self.b[i]=p
  self.views[p][i]='1';self.views[3-p][i]='2'
  for j in NEAR[i]:self.neighbors[j]+=1
  for j,directions in IMPACT[i]:self.update(j,directions)
 def undo(self,i):
  last,saved=self.history.pop()
  assert last==i
  self.b[i]=0
  self.views[1][i]=self.views[2][i]='0'
  for j in NEAR[i]:self.neighbors[j]-=1
  for j,a,b,c,d in saved:
   self.scores[1][j]=a;self.scores[2][j]=b
   self.parts[1][j]=c;self.parts[2][j]=d
 def candidates(self,p):
  a,b=self.scores[p],self.scores[3-p]
  cells=[i for i in range(225) if not self.b[i] and self.neighbors[i]]
  cells.sort(key=lambda i:(max(a[i],b[i]*1.04)+min(a[i],b[i])*.18,-abs(i%15-7)-abs(i//15-7),-i),reverse=True)
  return cells
 def shortlist(self,cs,p,width,threshold=90_000):
  # Keep tactical attacks and preventive defenses outside the quiet beam.
  a,b=self.scores[p],self.scores[3-p]
  return cs[:width]+[i for i in cs[width:] if max(a[i],b[i])>=threshold]
 def force(self,p,depth):
  self.check();cs=self.candidates(p);a,b=self.scores[p],self.scores[3-p]
  wins=[i for i in cs if a[i]>=WIN]
  if wins:return wins[0]
  blocks=[i for i in cs if b[i]>=WIN]
  if len(blocks)>1 or depth<=0:return None
  key=(bytes(self.b),p,depth)
  if key in self.force_cache:return self.force_cache[key]
  opts=blocks or [i for i in cs if a[i]>=90_000]
  for i in opts:
   self.put(i,p)
   try:
    rs=self.candidates(3-p)
    if any(self.scores[3-p][j]>=WIN for j in rs):continue
    forced=[j for j in rs if self.scores[p][j]>=WIN]
    if len(forced)>1:
     self.force_cache[key]=i;return i
    if len(forced)==1:
     j=forced[0];self.put(j,3-p)
     try:
      if self.force(p,depth-1) is not None:
       self.force_cache[key]=i;return i
     finally:self.undo(j)
   finally:self.undo(i)
  self.force_cache[key]=None
  return None
 def evaluate(self,p,cs):
  a=sorted((self.scores[p][i] for i in cs),reverse=True)
  b=sorted((self.scores[3-p][i] for i in cs),reverse=True)
  if not a:return 0
  return a[0]*1.08+sum(a[1:4])*.12-b[0]-sum(b[1:4])*.12
 def search(self,p,depth,alpha,beta,extra=4):
  self.check();self.nodes+=1
  cs=self.candidates(p)
  if not cs:return 0
  a,b=self.scores[p],self.scores[3-p]
  if any(a[i]>=WIN for i in cs):return MATE+depth*1000
  blocks=[i for i in cs if b[i]>=WIN]
  if len(blocks)>1:return -MATE-depth*1000
  # Without a current enemy win, two distinct winning continuations are exact.
  if not blocks and any(a[i]>=3_000_000 for i in cs):return MATE+(depth-2)*1000
  quiet=depth<=0 and not blocks
  danger=quiet and any(b[i]>=3_000_000 for i in cs)
  stand=self.evaluate(p,cs) if quiet else -2*MATE
  if depth<=0 and extra<=0:return self.evaluate(p,cs)
  if quiet and not danger:
   # Keep the option to play quietly, but resolve forcing fours at the horizon.
   if stand>=beta:return stand
   alpha=max(alpha,stand)
   opts=[i for i in cs if a[i]>=90_000]
   if not opts:return stand
  else:opts=blocks or self.shortlist(cs,p,12 if danger else 10 if depth>=2 else 8)
  key=(bytes(self.b),p,depth,extra)
  old=self.tt.get(key)
  if old:
   val,flag=old
   if flag==0:return val
   if flag==1:alpha=max(alpha,val)
   else:beta=min(beta,val)
   if alpha>=beta:return val
  # Previous iterations teach move ordering even when their depth differs.
  orderkey=(key[0],p)
  preferred=self.order.get(orderkey)
  if preferred in opts:
   opts=[preferred]+[i for i in opts if i!=preferred]
  original=alpha
  selected=None
  best=stand if quiet and not danger else -2*MATE
  for i in opts:
   self.put(i,p)
   try:val=-self.search(3-p,depth-1,-beta,-alpha,extra-(depth<=0))
   finally:self.undo(i)
   if val>best:best=val;selected=i
   alpha=max(alpha,val)
   if alpha>=beta:break
  if selected is not None:self.order[orderkey]=selected
  self.tt[key]=(best,2 if best<=original else 1 if best>=beta else 0)
  return best
 def choose(self,p):
  if not any(self.b[:225]):return 112,'center'
  occupied=[i for i in range(225) if self.b[i]]
  if len(occupied)==1:
   x,y=occupied[0]%15,occupied[0]//15
   options=[(y+dy)*15+x+dx for dx in (-1,1) for dy in (-1,1) if 0<=x+dx<15 and 0<=y+dy<15]
   if options:return min(options,key=lambda i:(abs(i%15-7)+abs(i//15-7),-i)),'adjacent opening'
  cs=self.candidates(p)
  if not cs:return next((i for i in range(225) if not self.b[i]),112),'fallback'
  for i in cs:
   if self.scores[p][i]>=WIN:return i,'win'
  blocks=[i for i in cs if self.scores[3-p][i]>=WIN]
  if blocks:return blocks[0],'block' if len(blocks)==1 else 'multiple threats'
  for i in cs:
   if self.scores[p][i]>=3_000_000:return i,'proved double continuation'
  bestmove=cs[0];note='ordered fallback'
  roots=self.shortlist(cs,p,16,12_000)
  try:
   # Complete a cheap tactical pass before spending time on a deep proof.
   # A quiet move allowing an enemy double continuation loses in two turns.
   ranked=[];screenbest=(-1,-float('inf'),-1)
   for i in roots:
    self.check();self.put(i,p)
    try:
     replies=self.candidates(3-p)
     ourwins=[j for j in replies if self.scores[p][j]>=WIN]
     enemyforks=[j for j in replies if self.scores[3-p][j]>=3_000_000]
     danger=bool(enemyforks) if not ourwins else len(ourwins)==1 and ourwins[0] in enemyforks
     value=-self.evaluate(3-p,replies)
     record=(not danger,value,i);ranked.append(record)
     if record>screenbest:
      screenbest=record;bestmove=i;note='tactical fallback'
    finally:self.undo(i)
   ranked.sort(reverse=True)
   safe=[i for ok,v,i in ranked if ok]
   roots=safe or [i for ok,v,i in ranked]
   bestmove=roots[0];note='tactical fallback'

   # A failed proof attempt must leave time for general defensive search.
   deadline=self.deadline
   self.deadline=min(deadline,time.monotonic()+.65)
   try:
    try:forced=self.force(p,8)
    except Timeout:forced=None
   finally:self.deadline=deadline
   if forced is not None:return forced,'proved four sequence'
   # A successful opponent proof is conclusive; timeout/None is unknown.
   # Allocate a fixed total slice so defense cannot starve general search.
   defense_deadline=min(deadline,time.monotonic()+.75)
   defended=[];refuted=[]
   for i in roots:
    if time.monotonic()>=defense_deadline:
     defended.extend(j for j in roots if j not in defended and j not in refuted)
     break
    self.put(i,p)
    self.deadline=min(defense_deadline,time.monotonic()+.07)
    try:
     try:losing=self.force(3-p,6) is not None
     except Timeout:losing=False
    finally:
     self.undo(i);self.deadline=deadline
    (refuted if losing else defended).append(i)
   if defended:
    roots=defended;bestmove=roots[0];note='four-sequence defense'
   for depth in range(2,13):
    self.check();best=-2*MATE;chosen=bestmove;values=[]
    for i in roots:
     self.put(i,p)
     try:v=-self.search(3-p,depth-1,-2*MATE,-best)
     finally:self.undo(i)
     values.append((v,i))
     if v>best:best=v;chosen=i
    bestmove=chosen;note=f'search depth {depth}'
    roots=[i for v,i in sorted(values,reverse=True)]
    if best>=MATE-100000:break
  except Timeout:pass
  return bestmove,note

def main():
 for line in sys.stdin:
  try:
   req=json.loads(line)
   board=req['board'];p=1 if req['yourColor'] in ('black',1) else 2
   engine=Engine(board,req.get('timeLimitMs',5000))
   i,note=engine.choose(p)
   print(json.dumps({'x':i%15,'y':i//15,'note':note}),flush=True)
  except Exception as e:
   # Legal emergency response; diagnostics never pollute the JSON channel.
   print(str(e),file=sys.stderr,flush=True)
   board=req.get('board',[[0]*15 for _ in range(15)])
   cells=[(x,y) for y,row in enumerate(board) for x,v in enumerate(row) if not v]
   x,y=min(cells,key=lambda xy:abs(xy[0]-7)+abs(xy[1]-7)) if cells else (0,0)
   print(json.dumps({'x':x,'y':y,'note':'emergency'}),flush=True)
if __name__=='__main__':main()
