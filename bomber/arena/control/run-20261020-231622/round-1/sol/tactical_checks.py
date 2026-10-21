import json
from selftest import Engine
from agent import Agent, Forecast, Planner

# One empty tile surrounded by hard walls: no valid retreat exists.
e=Engine(1)
o=e.state
o['map']['tiles']=[1]*len(o['map']['tiles'])
f=o['fighters'][0]
i=f['y']*19+f['x']
o['map']['tiles'][i]=0
o['map']['tiles'][i+1]=2
ans=Agent().decide(o)
assert not any(a['btn']=='BOMB' for a in ans['inputs'])
e.close()

# Known imminent flame: escape must be immediate, never plant on a fatal ray.
e=Engine(1,{'empty':True,'bombs':[{'id':'test','owner':1,'x':1,'y':3,'fuse':1,'blast':4}]})
o=e.state
o['yourPlayer']=0
ans=Agent().decide(o)
e.step([ans['inputs'],[{'dir':'N','btn':None} for _ in range(20)]])
assert not e.state['roundLog'] or e.state['roundLog'][0]['winner']!='B'
e.close()
print(json.dumps({'no_escape_bomb':'passed','imminent_flame_escape':'passed'}))
