import json
import math
import random
import subprocess
import time
from agent import Agent, DIRS


def protocol_and_physics():
    server = subprocess.Popen(['node', 'test_server.js'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf-8')
    def request(obj):
        server.stdin.write(json.dumps(obj) + '\n')
        server.stdin.flush()
        return json.loads(server.stdout.readline())
    obs = request({'init': True, 'seed': 89001})
    rng = random.Random(51)
    agent = Agent()
    agent.init_map(obs)
    max_player_error = max_bullet_error = 0.
    steps = 0
    for _ in range(150):
        windows = [[{'dir': rng.choice(list(DIRS)), 'aim': rng.choice(list(DIRS)[1:]), 'fire': True} for t in range(3)] for p in range(2)]
        predicted_players = []
        for i, p in enumerate(obs['players']):
            x, y = p['x'], p['y']
            for f in windows[i]:
                x, y = agent.move(x, y, f['dir'])
            predicted_players.append((x, y))
        predicted_bullets = {}
        for b in obs['bullets']:
            x, y, vx, vy = b['x'], b['y'], b['vx'], b['vy']
            for t in range(3):
                x, y, vx, vy = agent.bullet_step(x, y, vx, vy)
            predicted_bullets[b['id']] = (x, y)
        new = request({'inputs': windows})
        if new['frame'] - obs['frame'] != 3:
            break
        for p, (x, y) in zip(new['players'], predicted_players):
            max_player_error = max(max_player_error, math.hypot(p['x'] - x, p['y'] - y))
        for b in new['bullets']:
            if b['id'] in predicted_bullets:
                x, y = predicted_bullets[b['id']]
                max_bullet_error = max(max_bullet_error, math.hypot(b['x'] - x, b['y'] - y))
        steps += 3
        obs = new
        if obs['status'] != 'playing':
            break
    server.terminate()
    server.wait()
    assert max_player_error < .002, max_player_error
    # Snapshots round coordinates to 0.001. Near a tile boundary this can
    # change the reflection substep; one diagonal substep is about 0.20035.
    assert max_bullet_error < .205, max_bullet_error
    # Real persistent-process protocol, not just an imported function call.
    proc = subprocess.Popen(['python', 'agent.py'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
    for i in range(3):
        proc.stdin.write(json.dumps(obs) + '\n')
        proc.stdin.flush()
        answer = json.loads(proc.stdout.readline())
        assert len(answer['inputs']) == 3
        for f in answer['inputs']:
            assert f['dir'] in DIRS and (f['aim'] is None or f['aim'] in DIRS) and type(f['fire']) is bool
    proc.stdin.close()
    proc.wait(timeout=5)
    err = proc.stderr.read()
    assert proc.returncode == 0 and not err, err
    return {'frames_compared': steps, 'max_player_error': max_player_error, 'max_bullet_error': max_bullet_error, 'persistent_protocol': 'pass'}


def stress():
    obs = json.load(open('example.json', encoding='utf-8'))
    rng = random.Random(44)
    obs['frame'] = 1800
    obs['now'] = 90
    obs['id'] = 'synthetic-stress'
    obs['bullets'] = []
    tiles = obs['map']['tiles']
    for i in range(500):
        while True:
            x, y = rng.uniform(1, 39), rng.uniform(1, 29)
            if not tiles[int(y) * 40 + int(x)]:
                break
        dx, dy = DIRS[rng.choice(list(DIRS)[1:])]
        obs['bullets'].append({'id': 'b' + str(i), 'owner': 1 - obs['yourPlayer'], 'x': x, 'y': y, 'vx': dx * 8.5, 'vy': dy * 8.5, 'bounces': 0})
    agent = Agent()
    times = []
    for _ in range(5):
        start = time.perf_counter()
        out = agent.decide(obs)
        times.append(time.perf_counter() - start)
        assert len(out['inputs']) == 3
    assert max(times) < 5, times
    return {'enemy_bullets': 500, 'response_seconds': times, 'max_seconds': max(times), 'note': 'Synthetic latency case only; not a played match.'}


if __name__ == '__main__':
    result = {'physics_protocol': protocol_and_physics(), 'stress': stress()}
    print(json.dumps(result, indent=2))
    with open('verification_results.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)
