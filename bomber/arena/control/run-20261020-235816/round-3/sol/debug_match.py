import json
from selftest import Engine
from agent import Agent,Forecast

import sys
from selftest import Opponent
e=Engine(int(sys.argv[1]) if len(sys.argv)>1 else 2)
ag=[Agent(),Opponent(sys.argv[2]) if len(sys.argv)>2 else Agent()]
history=[]
try:
    for k in range(150):
        o=e.state
        ins=[]
        for owner in range(2):
            o['yourPlayer']=owner
            ans=ag[owner].decide(o)
            ins.append(ans['inputs'])
        history.append({'obs':o,'inputs':ins,'memory':[a.prev for a in ag]})
        e.step(ins)
        if e.state['roundLog']:
            print(json.dumps(e.state['roundLog']))
            break
    json.dump(history[-5:]+[{'obs':e.state}],open('/workspace/debug_trace.json','w'))
finally:e.close()
