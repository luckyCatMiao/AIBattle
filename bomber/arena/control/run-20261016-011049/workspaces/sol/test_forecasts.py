import random,json
from selftest import Bridge
from agent import Agent
N={'dir':'N','btn':None}
rng=random.Random(147761)
b=Bridge();checks=0
for case in range(60):
 o=b.send(op='new',seed=case+2000,raw=True);tiles=o['map']['tiles'][:];fs=o['raw']['fighters']
 cells=rng.sample([p for p,v in enumerate(tiles) if v!=1],10)
 for p in cells:tiles[p]=0
 for i,p in enumerate(cells[:2]):fs[i].update(x=p%19,y=p//19,fromX=p%19,fromY=p//19,moveProgress=1,invulnUntil=10**9,bombs=6,blast=rng.randrange(1,7),activeBombs=4)
 bombs=[{'id':'e'+str(k),'owner':k%2,'x':p%19,'y':p//19,'fuse':rng.randrange(1,41),'blast':rng.randrange(1,7)}for k,p in enumerate(cells[2:])]
 o=b.send(op='set',state={'tiles':tiles,'fighters':fs,'bombs':bombs,'roundFrames':500})
 seat=case%2;o['yourPlayer']=seat;a=Agent();a.setup(o)
 times=[rng.randrange(1,20),rng.randrange(1,20)]
 extra=(cells[seat],times[seat]);enemy=(cells[1-seat],times[1-seat]);tl=a.timeline(extra,enemy)
 for tt in range(1,81):
  ins=[{'dir':'N','btn':'BOMB' if tt==times[i] else None}for i in range(2)]
  o=b.send(op='step',inputs=ins)
  fire={z['y']*19+z['x'] for z in o['blasts']};bb={z['y']*19+z['x']for z in o['bombs']}
  for p in range(323):
   assert (tl[2][p]<=tt)==(o['map']['tiles'][p]==0),(case,tt,p,'tile')
   assert bool(tl[0][p]&(1<<tt))==(p in fire),(case,tt,p,'fire')
   assert bool(tl[1][p]&(1<<tt))==(p in bb),(case,tt,p,'bomb')
   checks+=3
print('scheduled two-player bomb forecast checks:',checks)
o=b.send(op='new',raw=True);tiles=[1 if x%2==0 and y%2==0 else 0 for y in range(17)for x in range(19)];fs=o['raw']['fighters']
for i,x in enumerate([9,10]):fs[i].update(x=x,y=7,fromX=x,fromY=7,invulnUntil=10**9)
o=b.send(op='set',state={'tiles':tiles,'fighters':fs,'roundFrames':100})
o['yourPlayer']=1;a=Agent();a.setup(o);tl=a.timeline((7*19+10,1),(7*19+9,1));assert tl[7] is True
for tt in range(1,42):o=b.send(op='step',inputs=[{'dir':'N','btn':'BOMB' if tt==1 else None}]*2)
assert [f['activeBombs']for f in o['fighters']]==[0,1]
b.close();print('same-frame chain capacity and owner ordering: passed')
