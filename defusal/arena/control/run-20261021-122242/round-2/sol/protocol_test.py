import json
import time
from agent import Agent, DIRS

with open('/workspace/example.json') as f:
    base = json.load(f)
base.pop('exampleWindow', None)

def clone():
    return json.loads(json.dumps(base))

checks = []
def check(name, condition):
    assert condition, name
    checks.append(name)

agent = Agent()
buy = agent.window(base)
check('opening armor affordable', all(p.get('armor') and not p.get('weapon') for p in buy['buys']))
o = clone()
o['phase'] = 'live'
o['frame'] = 20
for u in o['units']:
    u['armor'] = 100
    u['x'], u['y'] = 9.5, 7.5
out = agent.window(o)
check('plant stationary all twenty frames', all(f[0]['dir'] == 'N' for f in out['inputs']))
o = clone()
o['phase'] = 'live'
o['frame'] = 40
o['side'] = 'defend'
o['bomb'] = {'state': 'planted', 'x': 9.5, 'y': 7.5, 'timer': 20, 'defuseProgress': 0}
for u in o['units']:
    u['x'], u['y'] = 9.5, 7.5
    u['kit'] = True
out = Agent().window(o)
check('defuse stationary all twenty frames', all(all(u['dir'] == 'N' for u in f) for f in out['inputs']))
o['side'] = 'attack'
out = Agent().window(o)
check('postplant holds bomb position', all(all(u['dir'] == 'N' for u in f) for f in out['inputs']))
# Exercise dense enemy contacts, repeated windows and exact frame validation.
o = clone()
o['phase'] = 'live'
o['frame'] = 200
o['visibleEnemies'] = {u['id']: [{'id': 'e'+str(i), 'x': 17+i*.7, 'y': 15.5, 'weapon': 'rifle', 'facing': {'x': 0, 'y': 1}} for i in range(5)] for u in o['units']}
a = Agent()
max_time = 0
for i in range(50):
    begin = time.perf_counter()
    out = a.window(o)
    max_time = max(max_time, time.perf_counter()-begin)
    assert len(out['inputs']) == 20
    for frame in out['inputs']:
        assert len(frame) == 5
        assert all(v['dir'] in DIRS and v['aim'] in DIRS for v in frame)
check('50 dense-contact protocol windows legal', True)
# Every static open tile is route-connected to both sites.
a.setup(base)
for cell in a.neighbors:
    p = (cell[0]+.5, cell[1]+.5)
    for goal in [(9.5, 7.5), (30.5, 7.5)]:
        path = a.route(p, goal)
        assert path and path[-1] == goal
check('all open cells route to both sites', True)
print(json.dumps({'checks': checks, 'dense_contact_max_ms': round(max_time*1000, 2)}, ensure_ascii=False))
