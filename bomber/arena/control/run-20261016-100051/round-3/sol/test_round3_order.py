from selftest import Bridge
from agent import Agent
N={'dir':'N','btn':None}
for seat in [0,1]:
 b=Bridge();o=b.send(op='new',raw=True);fs=o['raw']['fighters'];tiles=[1 if x%2==0 and y%2==0 else 0 for y in range(17)for x in range(19)]
 for i,f in enumerate(fs):
  x,y=(9,8)if i==seat else(9,7)
  f.update(x=x,y=y,fromX=x,fromY=y,moveProgress=1)
 o=b.send(op='set',state={'tiles':tiles,'fighters':fs,'roundFrames':1110});o['yourPlayer']=seat
 a=Agent();a.setup(o);tl=a.timeline((8*19+9,1));survival=a.enemy_survival(tl)
 assert survival==(39 if seat==0 else 40),(seat,survival)
 ans=a.decide(o)
 if seat==1:assert not any(z['btn']for z in ans['inputs']),ans
 else:assert ans['inputs'][0]['btn']=='BOMB',ans
 b.close()
print('same-frame entry before later-owner planting: passed in both seats')
