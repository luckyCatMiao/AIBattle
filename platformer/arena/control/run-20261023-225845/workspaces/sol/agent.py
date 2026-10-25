import json
import math
import sys


class Agent:
    def __init__(self):
        self.key = None

    def setup(self, obs):
        level = obs['level']
        key = (obs.get('seed'), obs.get('round'), level['width'])
        if key != self.key or level['tiles'] != self.tiles:
            self.key = key
            self.w = level['width']
            self.h = level['height']
            self.tiles = level['tiles']
            self.base = self.h - 13
            self.goal = level['goalX']
            self.rival_bunny = False

    def solid(self, x, y):
        if x < 0 or x >= self.w:
            return True
        row = self.h - 1 - y
        return 0 <= row < self.h and self.tiles[row * self.w + x] != 0

    def box(self, x, y):
        for tx in range(math.floor(x - .36), math.floor(x + .36 - 1e-9) + 1):
            for ty in range(math.floor(y), math.floor(y + 1.35 - 1e-9) + 1):
                if self.solid(tx, ty):
                    return True
        return False

    def runner(self, p):
        y = p['y']
        if p['onGround'] and abs(y - round(y)) < .015:
            y = round(y) + .0001
        return (p['x'], y, p['vx'], p['vy'], p['onGround'], p.get('invuln', 0))

    def physics(self, p, move, jump):
        x, y, vx, vy, ground, inv = p
        accel = 3.5 if ground else 2.0
        if move:
            vx += max(-accel, min(accel, move * 6.8 - vx))
        elif ground:
            vx *= .0907179532894125
            if abs(vx) < .05:
                vx = 0
        if ground and jump:
            vy = 14
        vy = max(-26, vy - 2.1)
        x += vx * .05
        if self.box(x, y):
            if vx > 0:
                x = math.floor(x + .36) - .3601
            elif vx < 0:
                x = math.floor(x - .36) + 1.3601
            vx = 0
        y += vy * .05
        if self.box(x, y):
            if vy <= 0:
                y = math.floor(y) + 1.0001
                ground = True
            else:
                y = math.floor(y + 1.35) - 1.3501
                ground = False
            vy = 0
        else:
            ground = False
        return (x, y, vx, vy, ground, max(0, inv - .05))

    def heuristic(self, p):
        x, y, vx, vy, ground, inv = p
        jump = self.rival_bunny
        if ground and not jump:
            # A public-information, conservative model of an advancing rival.
            reach = x + max(.8, vx * .19)
            jump = (self.box(reach, y) or
                    not self.solid(math.floor(x + max(.4, vx * .12)), math.floor(y - .1)))
        return 1, jump

    def push(self, p, q, px, qx):
        overlap = .72 - abs(p[0] - q[0])
        if overlap <= 0 or min(p[1] + 1.35, q[1] + 1.35) - max(p[1], q[1]) <= .3:
            return p, q
        swap = p[0] > q[0]
        rear, front = (q, p) if swap else (p, q)
        prev = qx if swap else px
        rear, front = list(rear), list(front)
        nx = front[0] + min(overlap, .21)
        if not self.box(nx, front[1]):
            front[0] = nx
            if front[4]:
                front[2] = max(front[2], 1.6)
        if rear[0] > front[0] - .721:
            rear[0] = max(prev, front[0] - .721)
            if rear[2] > 0:
                rear[2] = min(rear[2], 4.2)
        if front[0] < rear[0] + .721:
            front[0] = rear[0] + .721
            if front[2] < 0:
                front[2] = 0
        return (tuple(front), tuple(rear)) if swap else (tuple(rear), tuple(front))

    def monster_paths(self, obs, horizon):
        monsters = [(m['x'], m['y'], m['dir']) for m in obs['monsters']]
        paths = []
        for _ in range(horizon):
            nxt = []
            for x, y, direction in monsters:
                nx = x + direction * .085
                if (self.solid(math.floor(nx + direction * .5), math.floor(y + .4)) or
                        not self.solid(math.floor(nx + direction * .6), math.floor(y - .2))):
                    nxt.append((x, y, -direction))
                else:
                    nxt.append((nx, y, direction))
            monsters = nxt
            paths.append(monsters)
        return paths

    def decide(self, obs):
        self.setup(obs)
        if obs.get('phase') != 'race':
            return {'inputs': [[{'move': 1, 'jump': False}] for _ in range(5)]}
        team = obs['yourPlayer']
        p0 = self.runner(obs['runners'][team])
        q0 = self.runner(obs['runners'][1 - team])
        # An early jump on clear starting ground is evidence of a held-jump
        # opponent; unlike the obstacle heuristic, that rival bounces on landing.
        if q0[0] < 10 and q0[1] > self.base + .3 and q0[3] > 0:
            self.rival_bunny = True
        horizon = 32
        monsters = self.monster_paths(obs, horizon)
        # score, runner, rival, first five actions, accumulated jump/brake cost
        beam = [(p0[0], p0, q0, (), 0)]
        best = beam[0]
        for depth in range(horizon):
            candidates = {}
            for _, p, q, actions, cost in beam:
                choices = [(1, False)]
                if p[4]:
                    choices.append((1, True))
                # Braking is useful when a monster occupies a landing zone or a jump
                # must start later. Reversing is reserved for recovery, not racing.
                choices.append((0, False))
                if p[4]:
                    choices.append((0, True))
                qm, qj = self.heuristic(q)
                qn = self.physics(q, qm, qj)
                for move, jump in choices:
                    pn = self.physics(p, move, jump)
                    pn, qq = self.push(pn, qn, p[0], q[0])
                    x, y, vx, vy, ground, inv = pn
                    if y < self.base - .035 and vy <= 0:
                        continue
                    if inv <= 0 and any(abs(x - mx) < .765 and y < my + .665 and y + 1.35 > my
                                        for mx, my, _ in monsters[depth]):
                        continue
                    nc = cost + (.024 if jump else 0) + (.004 if move == 0 else 0)
                    score = x + .045 * vx - nc
                    # Prefer a grounded terminal state only weakly: real jumps
                    # must never be rejected just because they cross the horizon.
                    score -= .006 * max(0, y - self.base)
                    na = actions + ((move, jump),) if depth < 5 else actions
                    key = (round(x * 12), round(y * 10), round(vx * 2), round(vy), ground,
                           round(qq[0] * 5), round(qq[1] * 4))
                    old = candidates.get(key)
                    if old is None or score > old[0]:
                        candidates[key] = (score, pn, qq, na, nc)
            if not candidates:
                break
            beam = sorted(candidates.values(), key=lambda v: v[0], reverse=True)[:36]
            best = beam[0]
        actions = list(best[3])
        if not actions:
            actions = [(1, bool(p0[4]))] * 5
        while len(actions) < 5:
            actions.append(actions[-1])
        return {'inputs': [[{'move': m, 'jump': j}] for m, j in actions[:5]]}


def main():
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    agent = Agent()
    for line in sys.stdin:
        try:
            obs = json.loads(line)
            output = agent.decide(obs)
            print(json.dumps(output, separators=(',', ':')), flush=True)
        except Exception as exc:
            print(str(exc), file=sys.stderr, flush=True)
            print('{"inputs":[[{"move":1,"jump":true}],[{"move":1,"jump":true}],[{"move":1,"jump":true}],[{"move":1,"jump":true}],[{"move":1,"jump":true}]]}', flush=True)


if __name__ == '__main__':
    main()
