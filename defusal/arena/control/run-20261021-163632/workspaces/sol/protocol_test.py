import json
import math
import random
import time
from agent import Agent, Arena, DIRS


def run():
    obs = json.load(open('example.json'))
    agent = Agent()
    start = time.perf_counter()
    buy = agent.act(obs)
    assert len(buy['buys']) == 5
    for b, u in zip(buy['buys'], obs['units']):
        cost = obs['weapons'].get(b.get('weapon', 'pistol'), {}).get('cost', 0)
        cost += 650 * bool(b.get('armor')) + 400 * bool(b.get('kit'))
        assert cost <= u['money']
    obs['phase'] = 'live'
    action = agent.act(obs)
    assert len(action['inputs']) == 20
    assert all(len(f) == 5 for f in action['inputs'])
    assert all(i['dir'] in DIRS and i['aim'] in DIRS for f in action['inputs'] for i in f)
    # On-site carrier must not issue movement while planting.
    a = agent.arena
    p = agent.site_target(agent.site)
    obs['units'][0]['x'], obs['units'][0]['y'] = p
    obs['frame'] = 300
    obs['tick'] = 300
    action = agent.act(obs)
    assert all(f[0]['dir'] == 'N' for f in action['inputs'])
    # A stationary defender in defuse range holds still, even with visible enemies.
    obs['side'] = 'defend'
    obs['bomb'] = {'state': 'planted', 'x': p[0], 'y': p[1], 'timer': 15, 'site': agent.site}
    obs['visibleEnemies'] = {'t0u0': [{'id': 't1u1', 'x': p[0]+1, 'y':p[1], 'weapon':'rifle'}]}
    action = agent.act(obs)
    assert all(f[0]['dir'] == 'N' for f in action['inputs'])
    # Dead units still receive syntactically valid neutral commands.
    for u in obs['units']:
        u['alive'] = False
    action = agent.act(obs)
    assert all(i['dir'] == 'N' for f in action['inputs'] for i in f)
    # Navigation never predicts moving a circle into a wall.
    random.seed(42)
    for _ in range(500):
        i = random.choice(a.open)
        x,y = i%a.w+.5,i//a.w+.5
        for dx,dy in DIRS.values():
            nx,ny = a.move(x,y,dx*.15,dy*.15)
            assert not a.collision(nx,ny)
    print(json.dumps({'checks':'passed','elapsedMs':round((time.perf_counter()-start)*1000,2)}))


if __name__ == '__main__':
    run()
