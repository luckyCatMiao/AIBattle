import copy,json,time
from selftest import Bridge
from agent import Agent
N={'dir':'N','btn':None}
def state(b,frame,hero,enemy,tiles=None,bombs=None):
 o=b.send(op='new',raw=True)
 fs=o['raw']['fighters']
 for i,(x,y)in enumerate([hero,enemy]):
  fs[i].update(x=x,y=y,fromX=x,fromY=y,moveProgress=1,movingTo=None,invulnUntil=0 if i==0 else 10**9)
 if tiles is None:tiles=[1 if x%2==0 and y%2==0 else 0 for y in range(17)for x in range(19)]
 fs[0]['activeBombs']=sum(bb['owner']==0 for bb in bombs or [])
 return b.send(op='set',state={'tiles':tiles,'roundFrames':frame,'floodRing':0,'fighters':fs,'bombs':bombs or [],'blasts':[]})
def run():
 b=Bridge();a=Agent()
 # A single escape cell within the bomb's cross is not a valid refuge.
 tiles=[1]*323
 for x,y in [(1,1),(2,1),(17,15)]:tiles[y*19+x]=0
 tiles[0*19+1]=2
 o=state(b,100,(1,1),(17,15),tiles)
 ans=a.decide(o);assert not any(x['btn'] for x in ans['inputs'])
 print('dead-end bomb refusal: passed')
 # Logical-coordinate movement can escape an explosion on its very first frame.
 bb={'id':'bX','owner':1,'x':1,'y':1,'blast':1,'fuse':1}
 o=state(b,100,(1,2),(17,15),bombs=[bb]);a=Agent();ans=a.decide(o)
 assert ans['inputs'][0]['dir']=='D'
 o=b.send(op='advance',inputs=[ans['inputs'],[N]*20]);assert o['round']==1
 print('explosion-frame escape: passed')
 # A flood crossing must be escaped at the next logical step, despite pixel interpolation.
 o=state(b,849,(1,3),(17,15));a=Agent();ans=a.decide(o)
 assert ans['inputs'][0]['dir']=='R'
 o=b.send(op='advance',inputs=[ans['inputs'],[N]*20]);assert o['round']==1
 print('flood deadline escape: passed')
 # Both sides of a central bomb can be blocked by a simultaneous opponent input.
 for ey in [7,9]:
  bb={'id':'bX','owner':0,'x':9,'y':8,'blast':1,'fuse':21}
  o=state(b,700,(9,8),(9,ey),bombs=[bb]);a=Agent()
  for turn in range(4):
   ans=a.decide(o);op=[N.copy()for _ in range(20)]
   if turn==0:op[0]={'dir':'N','btn':'BOMB'}
   o=b.send(op='advance',inputs=[ans['inputs'],op]);assert o['round']==1,(ey,turn)
 print('opponent seals escape corridor: passed (both directions)')
 # Firepower is picked up before planting; defer until its new geometry is observed.
 o=state(b,100,(1,1),(17,15));o=b.send(op='set',state={'drops':[{'id':'test_drop','x':1,'y':1,'type':'blast'}]});a=Agent();ans=a.decide(o)
 assert not any(x['btn'] for x in ans['inputs'])
 o=b.send(op='advance',inputs=[ans['inputs'],[N]*20]);assert o['fighters'][0]['blast']==2
 print('firepower pickup before planting: passed')
 # Last-window horizons are shorter than 20 and must still produce 20 legal inputs.
 for frame in [1100,1120,1150,1180,1190,1199]:
  o=state(b,frame,(9,8),(9,9));a=Agent();ans=a.decide(o)
  assert len(ans['inputs'])==20
 print('late flood short-horizon protocol: passed')
 b.close()
if __name__=='__main__':run()
