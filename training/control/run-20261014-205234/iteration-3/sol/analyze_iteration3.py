"""Public replay analysis using independent contiguous-stone checks."""
import json
D=((1,0),(0,1),(1,1),(1,-1))
def win(b,x,y,p):
 for dx,dy in D:
  n=1
  for s in (-1,1):
   a,c=x+s*dx,y+s*dy
   while 0<=a<15 and 0<=c<15 and b[c][a]==p:n+=1;a+=s*dx;c+=s*dy
  if n>=5:return True
 return False
def wins(b,p):return [(x,y) for y in range(15) for x in range(15) if not b[y][x] and win(b,x,y,p)]
def forks(b,p):
 out=[]
 for y in range(15):
  for x in range(15):
   if b[y][x]:continue
   b[y][x]=p
   if not wins(b,3-p):
    w=wins(b,p)
    if len(w)>1:out.append(((x,y),w))
   b[y][x]=0
 return out
r=json.load(open('public_replays.json'))
for gi,plies,p in [(15,{16,17,19,20,21,22,23},2),(16,{16,18,19,20,21,22},1)]:
 b=[[0]*15 for _ in range(15)]
 for m in r[gi]['moves']:
  b[m['y']][m['x']]=m['color']
  if m['ply'] in plies:print(r[gi]['id'],m['ply'],'attacker',p,'wins',wins(b,p),'forks',forks(b,p),flush=True)
