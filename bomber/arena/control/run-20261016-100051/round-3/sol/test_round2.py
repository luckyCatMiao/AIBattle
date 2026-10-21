"""Round 2 regression checks, using only the public rule engine."""
from selftest import Bridge
from agent import Agent
from agent_round1 import Agent as Previous

N={'dir':'N','btn':None}

def trap(frame,seat,controller):
    b=Bridge();o=b.send(op='new',raw=True)
    cells=[(6,7),(7,7),(8,7),(9,7),(9,8),(9,9)]
    # Rotate the constructed corridor to exercise the other approach direction.
    if seat:cells=[(18-x,16-y)for x,y in cells]
    tiles=[1]*323
    for x,y in cells:tiles[y*19+x]=0
    positions=[(9,8),(6,7)] if not seat else [(12,9),(9,8)]
    fs=o['raw']['fighters']
    for f,(x,y)in zip(fs,positions):
        f.update(x=x,y=y,fromX=x,fromY=y,moveProgress=1,movingTo=None,invulnUntil=0)
    o=b.send(op='set',state={'tiles':tiles,'fighters':fs,'roundFrames':frame})
    aa=[Previous(),Previous()];aa[seat]=controller()
    while o['round']==1:
        inputs=[]
        for i in range(2):
            o['yourPlayer']=i;inputs.append(aa[i].decide(o)['inputs'])
        o=b.send(op='advance',inputs=inputs)
    result=o['roundLog'][0];b.close();return result

if __name__=='__main__':
    for frame in [1080,1085,1090]:
        for seat in [0,1]:
            old=trap(frame,seat,Previous);new=trap(frame,seat,Agent)
            assert old['winner'] is None,(frame,seat,old)
            assert new['winner']==('A'if seat==0 else'B'),(frame,seat,new)
    print('6 rotated flood-gate scenarios: old draws, new wins')
    # A new bomb must make the gate impassable in the opponent reachability model.
    b=Bridge();o=b.send(op='new',raw=True);tiles=[1]*323
    for x,y in [(6,7),(7,7),(8,7),(9,7),(9,8),(9,9)]:tiles[y*19+x]=0
    fs=o['raw']['fighters']
    for f,(x,y)in zip(fs,[(9,8),(6,7)]):f.update(x=x,y=y,fromX=x,fromY=y,moveProgress=1)
    o=b.send(op='set',state={'tiles':tiles,'fighters':fs,'roundFrames':1080})
    a=Agent();a.setup(o);base=a.opponent_placements(a.timeline());blocked=a.opponent_placements(a.timeline((7*19+9,8)))
    assert any(p==8*19+9 for p,t in base)
    assert not any(p==8*19+9 for p,t in blocked)
    print('opponent cannot forecast planting across a newly blocked gate')
    b.close()

    # No partially validated fallback may replace the original safe route.
    import json
    obs=json.load(open('r2_regression1040.json'))
    ans=Agent().decide(obs)
    assert not any(z['dir']=='D' for z in ans['inputs'])
    print('multiple incompatible threat branches preserve the validated fallback')
