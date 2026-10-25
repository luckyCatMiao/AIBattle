import json
from selftest import Engine
from agent import Agent,Forecast
# Pickup is processed before planting. A newly acquired range increment must
# enter the safety forecast on that same frame.
e=Engine(1,{'empty':True,'fighters':[{'x':7,'y':7,'fromX':7,'fromY':7},{'x':17,'y':15,'fromX':17,'fromY':15}]})
o=e.state
o['drops']=[{'id':'test-range','x':7,'y':7,'type':'blast'}]
a=Agent(); fc=Forecast(o); observed=[]
original=a.enemy_risk
def record(obs,forecast,enemy):
    for b in forecast.bombs:
        if b.get('id')=='shield': observed.append(b['blast'])
    return original(obs,forecast,enemy)
a.enemy_risk=record
inputs=[{'dir':'N','btn':'BOMB'}]+[{'dir':'N','btn':None} for _ in range(19)]
a.shield(o,inputs,0,fc,o['fighters'][1])
assert observed and observed[0]==2,observed
e.close()
print(json.dumps({'same_frame_blast_pickup_safety':'passed'}))
