import argparse
import json
import math
import random
import subprocess
import time
from agent import Agent, DIRS, AIMS


class Opponent(Agent):
    def __init__(self, mode, seed):
        super().__init__()
        self.mode = mode
        self.rng = random.Random(seed)
        self.turn = 'R'

    def decide(self, obs):
        if self.game != obs['id']:
            self.init_map(obs)
        me = obs['players'][obs['yourPlayer']]
        enemy = obs['players'][1 - obs['yourPlayer']]
        self.enemy_paths(obs, enemy)
        self.navigation(enemy['x'], enemy['y'])
        self.shot_cache = {}
        self.hazards(obs, enemy)
        x, y = me['x'], me['y']
        out = []
        cd = me['cooldown']
        if self.rng.random() < .15:
            self.turn = self.rng.choice(AIMS)
        for t in range(1, 4):
            best = (float('inf'), 'N', x, y)
            for d in DIRS:
                nx, ny = self.move(x, y, d)
                risk = 0.
                tx, ty = nx, ny
                for s in range(t, min(t + 6, self.horizon + 1)):
                    risk += self.risk(s, tx, ty)
                    tx, ty = self.move(tx, ty, d)
                if self.mode == 'stationary':
                    score = 0 if d == 'N' else 1
                elif self.mode == 'wander':
                    score = risk + (0 if d == self.turn else .3) + self.rng.random() * .02
                else:
                    distance = self.nav_distance(nx, ny)
                    desired = 1.0 if self.mode == 'rush' else 4.5
                    score = risk + .5 * abs(distance - desired)
                    if d == self.last_dir:
                        score -= .015
                    if cd == 0:
                        value, _ = self.shot_value(nx, ny, t)
                        score -= value * 4
                if score < best[0]:
                    best = score, d, nx, ny
            _, d, x, y = best
            if cd == 0:
                value, aim = self.shot_value(x, y, t, True)
                if value < .01:
                    aim = self.long_aim(x, y, t)
                cd = 16
            else:
                cd -= 1
                aim = None
            out.append({'dir': d, 'aim': aim, 'fire': True})
            self.last_dir = d
        return {'inputs': out}


def run(seed, mode, seat, max_frames=2400):
    server = subprocess.Popen(['node', 'test_server.js'], stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, text=True, encoding='utf-8')
    def request(obj):
        server.stdin.write(json.dumps(obj) + '\n')
        server.stdin.flush()
        return json.loads(server.stdout.readline())
    agents = [Agent(), Agent() if mode == 'mirror' else Opponent(mode, seed)]
    obs = request({'init': True, 'seed': seed})
    worst = 0.
    total = 0.
    windows = 0
    try:
        while obs['status'] == 'playing' and obs['frame'] < max_frames:
            inputs = [None, None]
            for index, agent in enumerate(agents):
                who = seat if index == 0 else 1 - seat
                obs['yourPlayer'] = who
                start = time.perf_counter()
                action = agent.decide(obs)
                elapsed = time.perf_counter() - start
                if index == 0:
                    worst = max(worst, elapsed)
                    total += elapsed
                inputs[who] = action['inputs']
                assert len(inputs[who]) == 3
                for f in inputs[who]:
                    assert f['dir'] in DIRS and (f['aim'] is None or f['aim'] in DIRS) and type(f['fire']) is bool
            windows += 1
            obs = request({'inputs': inputs})
        result = {'seed': seed, 'opponent': mode, 'seat': seat,
                  'frame': obs['frame'], 'winner': obs['winner'],
                  'result': 'draw' if obs['winner'] is None else ('win' if obs['winner'] == seat else 'loss'),
                  'bullets': len(obs['bullets']), 'shots': [p['shots'] for p in obs['players']],
                  'max_seconds': round(worst, 4), 'mean_seconds': round(total / windows, 4),
                  'positions': [[p['x'], p['y']] for p in obs['players']]}
        return result
    finally:
        server.terminate()
        server.wait()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--modes', default='stationary,wander,rush,kite,mirror')
    parser.add_argument('--seeds', default='7001,7002')
    parser.add_argument('--frames', type=int, default=2400)
    parser.add_argument('--output', default='test_results.jsonl')
    args = parser.parse_args()
    with open(args.output, 'w', encoding='utf-8') as f:
        for mode in args.modes.split(','):
            for k, seed in enumerate(map(int, args.seeds.split(','))):
                result = run(seed, mode, k % 2, args.frames)
                print(json.dumps(result), flush=True)
                f.write(json.dumps(result) + '\n')
                f.flush()
