import sys,json
from agent import World,DIRS
for line in sys.stdin:
    req=json.loads(line);w=World(req['observation'])
    for actions in req['actions']:
        w.step([(next(i for i,d in enumerate(DIRS) if d[0]==a['dir']),a['aim'],a['kick']) for a in actions])
        if w.reset:break
    print(json.dumps({'units':[{'x':u['x'],'y':u['y']} for u in w.units],'ball':w.ball,'goal':w.reset}),flush=True)
