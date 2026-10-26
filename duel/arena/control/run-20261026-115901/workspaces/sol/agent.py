import sys
import json
import math
import heapq
import traceback

SQ = math.sqrt(0.5)
DIRS = {'N': (0., 0.), 'U': (0., -1.), 'D': (0., 1.),
        'L': (-1., 0.), 'R': (1., 0.), 'UL': (-SQ, -SQ),
        'UR': (SQ, -SQ), 'DL': (-SQ, SQ), 'DR': (SQ, SQ)}
AIMS = list(DIRS)[1:]
OFFSETS = [(math.cos(i * math.pi / 4) * .45,
            math.sin(i * math.pi / 4) * .45) for i in range(8)]


class Agent:
    def __init__(self):
        self.game = None
        self.previous = None
        self.last_dir = 'N'
        self.last_plan = []
        self.width = 40
        self.height = 30
        self.horizon = 15
        self.beam = 36

    def tile(self, x, y):
        if x < 0 or y < 0 or x >= self.width or y >= self.height:
            return 1
        return self.tiles[int(y) * self.width + int(x)]

    def blocked(self, x, y):
        if self.tile(x, y):
            return True
        return any(self.tile(x + dx, y + dy) for dx, dy in self.offsets)

    def move(self, x, y, direction):
        dx, dy = self.moves[direction]
        if dx and not self.blocked(x + dx, y):
            x += dx
        if dy and not self.blocked(x, y + dy):
            y += dy
        return x, y

    def bullet_step(self, x, y, vx, vy):
        for _ in range(3):
            nx, ny = x + vx / 60, y + vy / 60
            if self.tile(nx, y):
                vx = -vx
            else:
                x = nx
            if self.tile(x, ny):
                vy = -vy
            else:
                y = ny
        return x, y, vx, vy

    def init_map(self, obs):
        self.tiles = obs['map']['tiles']
        self.width, self.height = obs['map']['width'], obs['map']['height']
        r = obs.get('rules', {})
        self.speed = r.get('playerSpeed', 13) / r.get('hz', 20)
        self.bspeed = r.get('bulletSpeed', 8.5)
        self.radius = r.get('playerRadius', .45)
        self.hit_radius = self.radius + r.get('bulletRadius', .22)
        self.muzzle = self.hit_radius + .12
        self.offsets = [(math.cos(i * math.pi / 4) * self.radius,
                         math.sin(i * math.pi / 4) * self.radius) for i in range(8)]
        self.moves = {d: (x * self.speed, y * self.speed) for d, (x, y) in DIRS.items()}
        self.gw, self.gh = self.width * 2, self.height * 2
        self.free = set()
        for iy in range(self.gh):
            for ix in range(self.gw):
                if not self.blocked(ix / 2, iy / 2):
                    self.free.add(iy * self.gw + ix)
        self.edges = {}
        for k in self.free:
            ix, iy = k % self.gw, k // self.gw
            edges = []
            for dx, dy in DIRS.values():
                dx, dy = int(round(dx)), int(round(dy))
                j = (iy + dy) * self.gw + ix + dx
                if j not in self.free:
                    continue
                if dx and dy:
                    if k + dx not in self.free or k + dy * self.gw not in self.free:
                        continue
                if dx or dy:
                    edges.append((j, math.hypot(dx, dy) / 2))
            self.edges[k] = edges
        self.game = obs.get('id')
        self.previous = None
        self.last_plan = []
        self.last_dir = 'N'
        self.bw = (self.width + 1) // 2 + 1
        self.bh = (self.height + 1) // 2 + 1

    def navigation(self, ex, ey):
        dist = [1e4] * (self.gw * self.gh)
        heap = []
        ix, iy = round(ex * 2), round(ey * 2)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                j = (iy + dy) * self.gw + ix + dx
                if j in self.free:
                    d = math.hypot((ix + dx) / 2 - ex, (iy + dy) / 2 - ey)
                    dist[j] = d
                    heapq.heappush(heap, (d, j))
        while heap:
            d, k = heapq.heappop(heap)
            if d != dist[k]:
                continue
            for j, w in self.edges[k]:
                nd = d + w
                if nd < dist[j]:
                    dist[j] = nd
                    heapq.heappush(heap, (nd, j))
        self.dist = dist

    def nav_distance(self, x, y):
        ix, iy = round(x * 2), round(y * 2)
        k = iy * self.gw + ix
        best = self.dist[k] if 0 <= k < len(self.dist) else 1e4
        if best >= 1e4:
            best = min((self.dist[j] + .5 for j in
                        (k - 1, k + 1, k - self.gw, k + self.gw)
                        if 0 <= j < len(self.dist)), default=1e4)
        # Smooth the half-cell distance field without crossing walls.
        if 0 <= k < len(self.dist) and k in self.free:
            gx = (self.dist[k + 1] - self.dist[k - 1]) if k + 1 in self.free and k - 1 in self.free else 0
            gy = (self.dist[k + self.gw] - self.dist[k - self.gw]) if k + self.gw in self.free and k - self.gw in self.free else 0
            best += (x - ix / 2) * max(-1., min(1., gx)) + (y - iy / 2) * max(-1., min(1., gy))
        return max(0., best)

    def enemy_paths(self, obs, enemy):
        current = 'N'
        if self.previous and obs['frame'] > self.previous[0]:
            n = obs['frame'] - self.previous[0]
            vx = (enemy['x'] - self.previous[1]) / n
            vy = (enemy['y'] - self.previous[2]) / n
            current = min(DIRS, key=lambda d: (self.moves[d][0] - vx) ** 2 + (self.moves[d][1] - vy) ** 2)
        self.previous = (obs['frame'], enemy['x'], enemy['y'])
        paths = []
        for d in DIRS:
            weight = .05
            if d == current:
                weight += .45
            if d == 'N':
                weight += .10
            x, y = enemy['x'], enemy['y']
            path = [(x, y)]
            for t in range(self.horizon + 12):
                x, y = self.move(x, y, d)
                path.append((x, y))
            paths.append((weight, path, d))
        self.paths = paths
        self.enemy_dir = current

    def add_bucket(self, buckets, x, y, weight):
        ix, iy = int(x / 2), int(y / 2)
        for by in range(max(0, iy - 1), min(self.bh, iy + 2)):
            base = by * self.bw
            for bx in range(max(0, ix - 1), min(self.bw, ix + 2)):
                buckets[base + bx].append((x, y, weight))

    def hazards(self, obs, enemy):
        self.danger = [[[] for _ in range(self.bw * self.bh)] for _ in range(self.horizon + 1)]
        self.virtual = [[[] for _ in range(self.bw * self.bh)] for _ in range(self.horizon + 1)]
        for b in obs['bullets']:
            if b['owner'] == obs['yourPlayer']:
                continue
            x, y, vx, vy = b['x'], b['y'], b['vx'], b['vy']
            for t in range(1, self.horizon + 1):
                x, y, vx, vy = self.bullet_step(x, y, vx, vy)
                self.add_bucket(self.danger[t], x, y, 1.)
        shot_t = enemy['cooldown'] + 1
        if shot_t <= min(self.horizon, 9):
            for weight, path, _ in self.paths:
                ex, ey = path[shot_t]
                for aim in AIMS:
                    dx, dy = DIRS[aim]
                    x, y = ex + dx * self.muzzle, ey + dy * self.muzzle
                    if self.tile(x, y):
                        continue
                    vx, vy = dx * self.bspeed, dy * self.bspeed
                    for t in range(shot_t, self.horizon + 1):
                        x, y, vx, vy = self.bullet_step(x, y, vx, vy)
                        # Unknown aim is adversarial, movement is a weighted ensemble.
                        self.add_bucket(self.virtual[t], x, y, weight)

    def risk(self, t, x, y):
        k = int(y / 2) * self.bw + int(x / 2)
        cost = 0.
        rr = (self.hit_radius + .23 + max(0, t - 3) * .003) ** 2
        for bx, by, _ in self.danger[t][k]:
            d2 = (x - bx) ** 2 + (y - by) ** 2
            if d2 <= rr:
                cost += 1e6 if t <= 3 else 10000 / t
            elif d2 < 1.15:
                cost += .18 * (1.15 - d2)
            elif d2 < 2.56:
                cost += .006 * (2.56 - d2)
        vcost = 0.
        for bx, by, w in self.virtual[t][k]:
            d2 = (x - bx) ** 2 + (y - by) ** 2
            if d2 < (self.hit_radius + .03) ** 2:
                vcost += w * 6.
            elif d2 < 1.0:
                vcost += w * .18
        return cost + vcost * (10. if t <= 3 else 1.) * (.89 ** (t - 1))

    def shot_value(self, x, y, t, full=False):
        key = (round(x * 12), round(y * 12), t, full)
        if key in self.shot_cache:
            return self.shot_cache[key]
        best, bestaim = -1., 'R'
        steps = 12 if full else 5
        for aim in AIMS:
            dx, dy = DIRS[aim]
            bx, by = x + self.muzzle * dx, y + self.muzzle * dy
            if self.tile(bx, by):
                continue
            vx, vy = dx * self.bspeed, dy * self.bspeed
            value = 0.
            hit = set()
            for s in range(steps):
                bx, by, vx, vy = self.bullet_step(bx, by, vx, vy)
                for i, (w, path, _) in enumerate(self.paths):
                    if i in hit:
                        continue
                    ex, ey = path[min(t + s, len(path) - 1)]
                    d2 = (bx - ex) ** 2 + (by - ey) ** 2
                    if d2 <= (self.hit_radius - .02) ** 2:
                        value += w * (.94 ** s)
                        hit.add(i)
                    elif full and d2 < 2.25:
                        value += w * .001 * (2.25 - d2)
            if value > best:
                best, bestaim = value, aim
        result = (max(0., best), bestaim)
        self.shot_cache[key] = result
        return result

    def heuristic(self, x, y, t, me, enemy):
        distance = self.nav_distance(x, y)
        own_cd = max(0, me['cooldown'] - t)
        enemy_cd = max(0, enemy['cooldown'] - t)
        desired = 1.55 if own_cd <= 2 and enemy_cd >= 3 else 3.2
        if own_cd > 2:
            desired = 4.2
        euclid = math.hypot(x - enemy['x'], y - enemy['y'])
        result = .34 * max(0., distance - desired)
        if distance < euclid + 1.5:
            result += .30 * max(0., desired - euclid)
        return result

    def decide(self, obs):
        if self.game != obs.get('id') or not hasattr(self, 'tiles') or obs['frame'] == 0 and self.previous:
            self.init_map(obs)
        me = obs['players'][obs['yourPlayer']]
        enemy = obs['players'][1 - obs['yourPlayer']]
        self.enemy_paths(obs, enemy)
        self.navigation(enemy['x'], enemy['y'])
        self.hazards(obs, enemy)
        self.shot_cache = {}
        shot_t = me['cooldown'] + 1
        # Nodes carry cumulative danger, first-window inputs and previous direction.
        nodes = [(0., me['x'], me['y'], (), self.last_dir)]
        final = []
        for t in range(1, self.horizon + 1):
            candidates = {}
            for cost, x, y, path, prev in nodes:
                for d in DIRS:
                    nx, ny = self.move(x, y, d)
                    nc = cost + self.risk(t, nx, ny)
                    if d != prev:
                        nc += .002
                    if d != 'N' and abs(nx - x) + abs(ny - y) < .1:
                        nc += .015
                    if t == shot_t and t <= 3:
                        value, _ = self.shot_value(nx, ny, t)
                        nc -= 5.5 * value
                    np = path + (d,) if t <= 3 else path
                    score = nc + self.heuristic(nx, ny, t, me, enemy)
                    key = (round(nx * 2.5), round(ny * 2.5))
                    old = candidates.get(key)
                    if old is None or score < old[0]:
                        candidates[key] = (score, nc, nx, ny, np, d)
            final = heapq.nsmallest(self.beam, candidates.values())
            nodes = [(c, x, y, p, d) for _, c, x, y, p, d in final]
        path = final[0][4] if final else ('N', 'N', 'N')
        self.last_dir = path[-1]
        self.last_plan = list(path)
        result = []
        x, y = me['x'], me['y']
        cooldown = me['cooldown']
        for t, d in enumerate(path, 1):
            x, y = self.move(x, y, d)
            if cooldown == 0:
                value, aim = self.shot_value(x, y, t, full=True)
                if value < .015:
                    aim = self.long_aim(x, y, t)
                cooldown = 100
            else:
                cooldown -= 1
                aim = None
            result.append({'dir': d, 'aim': aim, 'fire': True})
        return {'inputs': result}

    def long_aim(self, x, y, t):
        # Score reflected rays against likely future enemy positions and nearby space.
        best, bestaim = -1., 'R'
        for aim in AIMS:
            dx, dy = DIRS[aim]
            bx, by = x + dx * self.muzzle, y + dy * self.muzzle
            if self.tile(bx, by):
                continue
            vx, vy = dx * self.bspeed, dy * self.bspeed
            value = 0.
            for s in range(1, 61):
                bx, by, vx, vy = self.bullet_step(bx, by, vx, vy)
                if s % 2:
                    continue
                for w, path, _ in self.paths:
                    ex, ey = path[min(t + s - 1, len(path) - 1)]
                    d2 = (bx - ex) ** 2 + (by - ey) ** 2
                    value += w * math.exp(-d2 / 5.) * (.97 ** s)
            if value > best:
                best, bestaim = value, aim
        return bestaim


def main():
    agent = Agent()
    for line in sys.stdin:
        try:
            obs = json.loads(line)
            result = agent.decide(obs)
        except Exception:
            traceback.print_exc(file=sys.stderr)
            result = {'inputs': [{'dir': 'N', 'aim': 'R', 'fire': True} for _ in range(3)]}
        print(json.dumps(result, separators=(',', ':')), flush=True)


if __name__ == '__main__':
    main()
