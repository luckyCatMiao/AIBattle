import json,urllib.request,time,sys,functools
TOKEN=sys.argv[1]
DIRS=((1,0),(0,1),(1,1),(1,-1))
B=[[0]*15 for _ in range(15)]
@functools.lru_cache(maxsize=250000)
def lineval(s):
 if '11111' in s:return 10000000
 if '011110' in s:return 1000000
 fours=sum(s[i:i+5].count('1')==4 and s[i:i+5].count('0')==1 for i in range(5) if '2' not in s[i:i+5])
 if fours:return 100000+1000*fours
 if any(t in s for t in ('01110','010110','011010')):return 10000
 if any(t in s for t in ('001110','011100','0101010','010010','01010')):return 1800
 if any(t in s for t in ('001100','0010100','0100100')):return 700
 if '1' in s:return 40
 return 0
def score(x,y,p):
 vals=[]
 for dx,dy in DIRS:
  s=''
  for k in range(-4,5):
   a,b=x+k*dx,y+k*dy
   v=B[b][a] if 0<=a<15 and 0<=b<15 else 3
   s+='1' if k==0 or v==p else '0' if v==0 else '2'
  vals.append(lineval(s))
 vals.sort(reverse=True)
 if vals[0]>=10000000:return 10000000
 if vals[1]>=100000:return 2000000
 if vals[0]>=100000 and vals[1]>=10000:return 1500000
 if vals[1]>=10000:return 250000
 return sum(vals)
def candidates(p):
 cells=set()
 for y in range(15):
  for x in range(15):
   if B[y][x]:
    for dy in range(-2,3):
     for dx in range(-2,3):
      a,b=x+dx,y+dy
      if 0<=a<15 and 0<=b<15 and not B[b][a]:cells.add((a,b))
 if not cells:return [(0,0,7,7,0,0)]
 out=[]
 for x,y in cells:
  a,b=score(x,y,p),score(x,y,3-p)
  out.append((max(a,b*.98)+min(a,b)*.2,-(abs(x-7)+abs(y-7)),x,y,a,b))
 return sorted(out,reverse=True)
def force(p,depth):
 cs=candidates(p)
 wins=[c for c in cs if c[4]>=10000000]
 if wins:return (wins[0][2],wins[0][3])
 if depth<=0:return None
 ow=[c for c in cs if c[5]>=10000000]
 if len(ow)>1:return None
 opts=ow if ow else [c for c in cs if c[4]>=100000][:8]
 for c in opts:
  x,y=c[2:4];B[y][x]=p
  replies=candidates(3-p)
  if any(z[4]>=10000000 for z in replies):B[y][x]=0;continue
  blocks=[z for z in replies if z[5]>=10000000]
  if len(blocks)>1:B[y][x]=0;return (x,y)
  if len(blocks)==1:
   a,b=blocks[0][2:4];B[b][a]=3-p
   result=force(p,depth-1)
   B[b][a]=0
   if result:B[y][x]=0;return (x,y)
  B[y][x]=0
 return None
def evaluate(cs):
 a=sorted((c[4] for c in cs),reverse=True);b=sorted((c[5] for c in cs),reverse=True)
 return a[0]*1.08+sum(a[1:4])*.15-b[0]-sum(b[1:4])*.15
def search(p,depth,alpha,beta):
 cs=candidates(p)
 if any(c[4]>=10000000 for c in cs):return 1e9+depth*1e6
 blocks=[c for c in cs if c[5]>=10000000]
 if len(blocks)>1:return -1e9-depth*1e6
 if not depth:return evaluate(cs)
 opts=blocks or cs[:(10 if depth>1 else 7)]
 best=-1e12
 for c in opts:
  x,y=c[2:4];B[y][x]=p
  val=-search(3-p,depth-1,-beta,-alpha)
  B[y][x]=0
  best=max(best,val);alpha=max(alpha,val)
  if alpha>=beta:break
 return best
def choose(p):
 cs=candidates(p)
 for c in cs:
  if c[4]>=10000000:return c[2:4],'win'
 blocks=[c for c in cs if c[5]>=10000000]
 if blocks:return blocks[0][2:4],'block'
 f=force(p,7)
 if f:return f,'forcing attack'
 best=-1e15;move=cs[0][2:4]
 for c in cs[:12]:
  x,y=c[2:4];B[y][x]=p
  danger=force(3-p,5)
  v=-2e9 if danger else -search(3-p,2,-1e12,-best)
  B[y][x]=0
  v+=c[0]*.0001+c[1]*.01
  if v>best:best=v;move=(x,y)
 return move,'search'
def api(path,data=None):
 req=urllib.request.Request('http://127.0.0.1:8787'+path,data=json.dumps(data).encode() if data else None,headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'})
 return json.load(urllib.request.urlopen(req,timeout=30))
while True:
 try:
  s=api('/api/agent/state')
  if s['seriesStatus']=='finished':print('FINISHED',json.dumps(s['standings']),flush=True);break
  if not s['yourTurn']:time.sleep(1);continue
  B=s['board'];t=time.time();mv,note=choose(1 if s['yourColor']=='black' else 2)
  r=api('/api/move',dict(matchId=s['matchId'],ply=s['ply'],x=mv[0],y=mv[1],note=note))
  print(s['matchId'],s['ply'],s['yourColor'],mv,note,round(time.time()-t,2),flush=True)
 except Exception as e:print('ERROR',repr(e),flush=True);time.sleep(2)

