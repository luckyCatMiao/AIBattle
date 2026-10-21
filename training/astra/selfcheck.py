import time,json
from engine import Engine
b=[0]*225;log=[];t=time.perf_counter()
for ply in range(1,51):
 c=1+(ply-1)%2;e=Engine(b[:]);p,n=e.choose(c,550)
 assert b[p]==0
 win=e.s[c][p]>=100000000
 b[p]=c;log.append({'ply':ply,'color':c,'x':p%15,'y':p//15,'note':n})
 if win:break
print(json.dumps({'seconds':time.perf_counter()-t,'moves':log,'winner':c if win else None},indent=2))
