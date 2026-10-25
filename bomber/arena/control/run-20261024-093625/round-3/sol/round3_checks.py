import json
from selftest import Engine
from agent import Agent,Forecast

e=Engine(19,{'empty':True,'fighters':[{'x':7,'y':7,'fromX':7,'fromY':7,'speed':3,'blast':6,'bombs':6},{'x':11,'y':9,'fromX':11,'fromY':9,'speed':3,'blast':6,'bombs':6}]})
o=e.state
a=Agent(); fc=Forecast(o); a.enemy_risk(o,fc,o['fighters'][1])
# Enemy can move up at frame 1 and plant once ready on frame 4.
assert fc.block[8*19+11] & (1<<4)
assert fc.hazard[7*19+11] & (1<<44)
e.close()
print(json.dumps({'mobile_bomb_block_and_flame':'passed'}))
# Replay complete windows against a stationary opponent, with damage immunity
# only for the opponent: verify that all own extra bombs have safe execution.
e=Engine(23,{'empty':True,'fighters':[{'x':7,'y':7,'fromX':7,'fromY':7,'speed':3,'blast':6,'bombs':6},{'x':11,'y':9,'fromX':11,'fromY':9,'speed':3,'blast':6,'bombs':6,'invulnUntil':10000}]})
a=Agent(); multi=0; total=0
try:
    for window in range(60):
        o=e.state; o['yourPlayer']=0
        ins=a.decide(o)['inputs']
        count=sum(x['btn']=='BOMB' for x in ins)
        multi+=count>1; total+=count
        before=o['round']
        e.step([ins,[{'dir':'N','btn':None} for _ in range(20)]])
        assert e.state['round']==before, ('self_death',window,e.state['roundLog'])
    assert multi>0
finally:e.close()
print(json.dumps({'multi_bomb_safe_windows':multi,'bomb_button_pulses':total}))
