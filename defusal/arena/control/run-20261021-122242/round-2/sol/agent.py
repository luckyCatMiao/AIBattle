import sys
import json
import math
import heapq

DIRS = {'N': (0, 0), 'U': (0, -1), 'D': (0, 1), 'L': (-1, 0), 'R': (1, 0),
        'UL': (-2**-0.5, -2**-0.5), 'UR': (2**-0.5, -2**-0.5),
        'DL': (-2**-0.5, 2**-0.5), 'DR': (2**-0.5, 2**-0.5)}
MOVES = list(DIRS)[1:]
COST = {'pistol': 0, 'pdw': 700, 'shotgun': 1000, 'smg': 1250, 'rifle': 2700, 'lmg': 4000, 'sniper': 4750}


def distance(a, b):
    return math.hypot(a[0]-b[0], a[1]-b[1])


def direction(dx, dy):
    if abs(dx)+abs(dy) < 1e-7:
        return 'N'
    return max(MOVES, key=lambda k: dx*DIRS[k][0]+dy*DIRS[k][1])


class Agent:
    def __init__(self, style='main'):
        self.style = style
        self.round = None
        self.memory = {}
        self.paths = {}
        self.navcache = {}
        self.focus = None
        self.focus_time = -100
        self.side_choice = 0

    def setup(self, o):
        self.w = o['map']['width']
        self.h = o['map']['height']
        self.tiles = o['map']['tiles']
        self.neighbors = {}
        for y in range(1, self.h-1):
            for x in range(1, self.w-1):
                if self.wall(x, y):
                    continue
                edges = []
                for k in MOVES:
                    dx, dy = DIRS[k]
                    nx, ny = x+round(dx), y+round(dy)
                    if self.wall(nx, ny):
                        continue
                    if nx != x and ny != y and (self.wall(nx, y) or self.wall(x, ny)):
                        continue
                    edges.append(((nx, ny), math.hypot(nx-x, ny-y)))
                self.neighbors[x, y] = edges

    def wall(self, x, y):
        return x < 0 or y < 0 or x >= self.w or y >= self.h or self.tiles[y*self.w+x] == 1

    def collision(self, x, y, r=.301):
        for ty in range(math.floor(y-r), math.floor(y+r)+1):
            for tx in range(math.floor(x-r), math.floor(x+r)+1):
                if self.wall(tx, ty):
                    cx = max(tx, min(x, tx+1))
                    cy = max(ty, min(y, ty+1))
                    if (x-cx)**2+(y-cy)**2 < r*r:
                        return True
        return False

    def los(self, a, b, radius=False):
        d = distance(a, b)
        n = max(1, math.ceil(d/(.18 if radius else .1)))
        for i in range(1, n+1):
            t = i/n
            x, y = a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t
            if self.collision(x, y) if radius else self.wall(math.floor(x), math.floor(y)):
                return False
        return True

    def route(self, start, goal):
        s = (math.floor(start[0]), math.floor(start[1]))
        g = (math.floor(goal[0]), math.floor(goal[1]))
        if g not in self.neighbors:
            g = min(self.neighbors, key=lambda p: distance((p[0]+.5, p[1]+.5), goal))
            goal = (g[0]+.5, g[1]+.5)
        key = (s, g)
        if key not in self.navcache:
            queue = [(0, 0, s)]
            costs = {s: 0}
            parents = {}
            while queue:
                _, cost, p = heapq.heappop(queue)
                if p == g:
                    break
                if cost > costs[p]+1e-8:
                    continue
                for q, step in self.neighbors.get(p, []):
                    nc = cost+step
                    if nc < costs.get(q, 1e9):
                        costs[q] = nc
                        parents[q] = p
                        heapq.heappush(queue, (nc+distance(q, g), nc, q))
            path = []
            cur = g
            while cur != s and cur in parents:
                path.append((cur[0]+.5, cur[1]+.5))
                cur = parents[cur]
            self.navcache[key] = path[::-1]
        return self.navcache[key]+[goal]

    def buy(self, o):
        purchases = []
        for u in o['units']:
            cash = u['money']
            cur = u['weapon']
            p = {'unit': u['index']}
            # Armor doubles the effective health in the initial pistol round.
            armorcost = 650 if u['armor'] < 60 else 0
            if self.style == 'cheap':
                choice = 'rifle' if cash >= 2700 else 'smg' if cash >= 1250 else 'pdw' if cash >= 700 else None
            else:
                choice = 'rifle' if cash >= 2700+armorcost else 'smg' if cash >= 1250+armorcost else None
                if not choice and cash >= 2700 and cur == 'pistol' and u['armor'] >= 40:
                    choice = 'rifle'
            if choice and COST[choice] > COST[cur]:
                p['weapon'] = choice
                cash -= COST[choice]
            if u['armor'] < 60 and cash >= 650:
                p['armor'] = True
                cash -= 650
            if o['side'] == 'defend' and not u['kit'] and cash >= 400:
                p['kit'] = True
            purchases.append(p)
        return {'buys': purchases}

    def observe(self, o):
        t = o['frame']/20
        seen = {}
        for es in o.get('visibleEnemies', {}).values():
            for e in es:
                seen[e['id']] = e
        for eid, e in seen.items():
            prev = self.memory.get(eid)
            vx = vy = 0
            if prev and .1 < t-prev['t'] <= 1.1:
                dt = t-prev['t']
                vx = max(-3, min(3, (e['x']-prev['x'])/dt))
                vy = max(-3, min(3, (e['y']-prev['y'])/dt))
            self.memory[eid] = dict(e, t=t, vx=vx, vy=vy)
        self.memory = {eid: e for eid, e in self.memory.items() if t-e['t'] < 9}
        return seen

    def get_goals(self, o, seen):
        units = o['units']
        alive = [u for u in units if u['alive']]
        t = o['frame']/20
        bomb = o['bomb']
        attack = o['side'] == 'attack'
        # Tests use independent tactical styles, not privileged state.
        if self.style in ('rushA', 'rushB', 'cheap', 'mid'):
            self.side_choice = 1 if self.style == 'rushB' else 0
        site_x = 9.5 if self.side_choice == 0 else 30.5
        if bomb['state'] == 'planted':
            bx, by = bomb['x'], bomb['y']
            if attack:
                # Keep overlapping sightlines on the bomb and approaches.
                # Cover the northern retake route as well as the southern choke.
                posts = [(bx, by)] * 5
                goals = {u['id']: posts[u['index']] for u in alive}
                for u in alive:
                    if self.collision(*goals[u['id']]):
                        goals[u['id']] = (bx, by)
                return goals, None
            # All defenders retake; nearest kit unit has priority.
            defuser = min(alive, key=lambda u: distance((u['x'], u['y']), (bx, by)) + (0 if u['kit'] else 1.7)) if alive else None
            goals = {u['id']: (bx, by) for u in alive}
            return goals, defuser['id'] if defuser else None
        if attack:
            if bomb['state'] == 'dropped':
                p = (bomb['x'], bomb['y'])
                picker = min(alive, key=lambda u: distance((u['x'], u['y']), p)) if alive else None
                return {u['id']: p for u in alive}, picker['id'] if picker else None
            carrier = next((u for u in alive if u['id'] == bomb.get('carrier')), None)
            goals = {}
            # Compact 5-person execute; no unit collision or friendly-fire.
            for u in alive:
                if self.style == 'main' and t < 5:
                    goals[u['id']] = (site_x, 21.5)
                elif self.style == 'main' and t < 8.5:
                    goals[u['id']] = (site_x, 13.65)
                elif self.style == 'mid' and u['y'] > 10:
                    goals[u['id']] = (19.5, 8.5)
                else:
                    goals[u['id']] = (site_x, 7.45)
            return goals, carrier['id'] if carrier else None
        # Defense covers all three crossings, rotating on actual contact.
        if seen:
            threat = min(seen.values(), key=lambda e: e['y'])
            self.focus = (threat['x'], threat['y'])
            self.focus_time = t
        if self.style in ('rushA', 'rushB', 'cheap', 'mid'):
            if self.style == 'mid':
                posts = [(18.6, 8.5), (19.3, 8.5), (20, 8.5), (20.7, 8.5), (21.4, 8.5)]
            else:
                posts = [(site_x+(u['index']-2)*.25, 8.5) for u in units]
            if self.focus and t-self.focus_time < 8:
                return {u['id']: self.focus for u in alive}, None
            return {u['id']: posts[u['index']] for u in alive}, None
        posts = [(18.7+i*.4, 8.4) for i in range(5)]
        if self.focus and t-self.focus_time < 9:
            fx, fy = self.focus
            # Reinforce the engaged entrance; keep a distant anchor briefly.
            for u in alive:
                if t-self.focus_time < 5:
                    posts[u['index']] = (fx, max(6.8, min(9.0, fy-2)))
        if bomb['state'] == 'dropped' and 'x' in bomb:
            posts = [(bomb['x'], max(7, bomb['y']-2))]*5
        return {u['id']: posts[u['index']] for u in alive}, None

    def window(self, o):
        if not hasattr(self, 'tiles'):
            self.setup(o)
        if self.round != o['round']:
            self.round = o['round']
            self.memory = {}
            self.focus = None
            self.focus_time = -100
            self.paths = {}
            self.side_choice = (o['round']+o.get('yourTeam', 0)) % 2
        if o['phase'] == 'buy':
            return self.buy(o)
        seen = self.observe(o)
        goals, objective = self.get_goals(o, seen)
        lastshots = {}
        now = o.get('tick', 0)/20
        for event in o.get('events', []):
            if event.get('type') == 'shot' and now-event.get('t', -100) < (1.1 if o['side'] == 'attack' else .35):
                lastshots[event['unit']] = (event['to']['x'], event['to']['y'])
        attack = o['side'] == 'attack'
        bomb = o['bomb']
        t = o['frame']/20
        state = []
        for u in o['units']:
            p = (u['x'], u['y'])
            goal = goals.get(u['id'], p)
            # Plant immediately upon reaching the selected site rectangle.
            planting = attack and bomb.get('carrier') == u['id'] and any(
                s['x1'] <= math.floor(p[0]) <= s['x2'] and s['y1'] <= math.floor(p[1]) <= s['y2']
                for s in o['map']['sites'].values())
            if planting:
                goal = p
            path = self.route(p, goal) if u['alive'] and distance(p, goal) > .1 else []
            state.append({'u': u, 'p': p, 'goal': goal, 'path': path, 'plant': planting})
        inputs = []
        for f in range(20):
            frame = []
            for st in state:
                u = st['u']
                if not u['alive']:
                    frame.append({'dir': 'N', 'aim': 'N'})
                    continue
                p = st['p']
                goal = st['goal']
                path = st['path']
                while path and distance(p, path[0]) < .2:
                    path.pop(0)
                if f % 5 == 0 and path:
                    # String pull through open space, with circular clearance.
                    for j in range(len(path)-1, 0, -1):
                        if distance(p, path[j]) < 9 and self.los(p, path[j], True):
                            del path[:j]
                            break
                targetpos = path[0] if path else goal
                move = 'N'
                stop = .12
                if bomb['state'] == 'planted' and not attack and distance(p, (bomb['x'], bomb['y'])) < .85:
                    targetpos = p
                if distance(p, targetpos) > stop and not st['plant']:
                    move = direction(targetpos[0]-p[0], targetpos[1]-p[1])
                # Aim at contacts, including recent team reports. Engine verifies shots.
                candidates = []
                for e in self.memory.values():
                    age = t-e['t']
                    if age > 3:
                        continue
                    dt = min(.55, f/20+age)
                    ep = (e['x']+e['vx']*dt, e['y']+e['vy']*dt)
                    if self.wall(math.floor(ep[0]), math.floor(ep[1])):
                        ep = (e['x'], e['y'])
                    d = distance(p, ep)
                    if d < 24 and self.los(p, ep):
                        candidates.append((d+age*2, ep))
                if candidates:
                    _, ep = min(candidates)
                    aim = direction(ep[0]-p[0], ep[1]-p[1])
                    d = distance(p, ep)
                    # Fight as a team rather than walking into crossfire.
                    if d < 8.0 and not st['plant']:
                        urgent = bomb['state'] == 'planted' and not attack and bomb.get('timer', 40) < 12
                        if not urgent and not (attack and u['id'] == objective and p[1] < 9):
                            move = 'N'
                else:
                    if u['id'] in lastshots and distance(p, lastshots[u['id']]) > .5:
                        shotpoint = lastshots[u['id']]
                        aim = direction(shotpoint[0]-p[0], shotpoint[1]-p[1])
                        if not st['plant'] and not (bomb['state'] == 'planted' and not attack):
                            move = 'N'
                    elif attack:
                        if p[1] > 13:
                            aim = 'U'
                        elif p[1] > 8:
                            aim = 'U'
                        elif bomb['state'] == 'planted':
                            aim = ('UR', 'R', 'DR', 'D', 'U')[(f // 2 + u['index']) % 5] if p[0] < 20 else ('UL', 'L', 'DL', 'D', 'U')[(f // 2 + u['index']) % 5]
                        else:
                            aim = 'UR' if p[0] < 20 else 'UL'
                    else:
                        aim = 'D'
                        if self.focus and t-self.focus_time < 6:
                            aim = direction(self.focus[0]-p[0], self.focus[1]-p[1])
                        elif bomb['state'] == 'planted':
                            aim = direction(bomb['x']-p[0], bomb['y']-p[1])
                    # A short full-sector sweep also covers flanks during movement.
                    if not candidates and u['id'] not in lastshots and not attack:
                        sectors = ('D', 'DL', 'DR', 'L', 'R')
                        aim = sectors[(f + u['index']) % len(sectors)]
                if move != 'N':
                    dx, dy = DIRS[move]
                    nx = p[0]+dx*.15
                    if self.collision(nx, p[1], .30):
                        nx = p[0]
                    ny = p[1]+dy*.15
                    if self.collision(nx, ny, .30):
                        ny = p[1]
                    if distance(p, (nx, ny)) < .001:
                        # Recover by following the next grid center.
                        options = []
                        for k in MOVES:
                            vx, vy = DIRS[k]
                            q = (p[0]+vx*.15, p[1]+vy*.15)
                            if not self.collision(*q):
                                options.append((distance(q, targetpos), k, q))
                        if options:
                            _, move, (nx, ny) = min(options)
                    st['p'] = (nx, ny)
                frame.append({'dir': move, 'aim': aim})
            inputs.append(frame)
        return {'inputs': inputs}


def main():
    a = Agent(sys.argv[1] if len(sys.argv) > 1 else 'main')
    for line in sys.stdin:
        try:
            obs = json.loads(line)
            result = a.window(obs)
            print(json.dumps(result, separators=(',', ':')), flush=True)
        except Exception as exc:
            print('agent error: '+repr(exc), file=sys.stderr, flush=True)
            # Maintain a valid protocol response on malformed optional observations.
            print(json.dumps({'buys': []} if 'obs' in locals() and obs.get('phase') == 'buy' else
                             {'inputs': [[{'dir': 'N', 'aim': 'U'} for _ in range(5)] for _ in range(20)]}), flush=True)


if __name__ == '__main__':
    main()
