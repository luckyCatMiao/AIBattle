import sys
import json
import math
import heapq

DIRS = {'N': (0., 0.), 'U': (0., -1.), 'D': (0., 1.), 'L': (-1., 0.), 'R': (1., 0.),
        'UL': (-.7071067811865476, -.7071067811865476), 'UR': (.7071067811865476, -.7071067811865476),
        'DL': (-.7071067811865476, .7071067811865476), 'DR': (.7071067811865476, .7071067811865476)}
MOVES = list(DIRS)

def distance(a, b):
    return math.hypot(a[0]-b[0], a[1]-b[1])

def aimdir(dx, dy):
    if abs(dx)+abs(dy) < .001:
        return 'U'
    angle = math.atan2(dy, dx)
    return ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR'][int(round(angle/(math.pi/4))) % 8]


class Agent:
    def __init__(self):
        self.mapkey = None
        self.round = None
        self.memory = {}
        self.prev_bullets = {}
        self.previous = {}
        self.fields = {}
        self.lastmove = {}

    def init_map(self, obs):
        m = obs['map']
        key = (obs.get('seed'), tuple(m['tiles']))
        if key == self.mapkey:
            return
        self.mapkey = key
        self.w, self.h = m['width'], m['height']
        self.tiles = m['tiles']
        self.sites = m['sites']
        self.fields = {}
        self.neighbors = {}
        for y in range(self.h):
            for x in range(self.w):
                if self.wall(x, y):
                    continue
                idx = y*self.w+x
                ns = []
                for name, (dx, dy) in DIRS.items():
                    if name == 'N':
                        continue
                    xx, yy = x+round(dx), y+round(dy)
                    if self.wall(xx, yy):
                        continue
                    if xx != x and yy != y and (self.wall(x, yy) or self.wall(xx, y)):
                        continue
                    ns.append((yy*self.w+xx, 1.41421356237 if xx != x and yy != y else 1.))
                self.neighbors[idx] = ns

    def wall(self, x, y):
        return x < 0 or y < 0 or x >= self.w or y >= self.h or self.tiles[y*self.w+x] == 1

    def clear(self, x, y, radius=.301):
        for yy in range(math.floor(y-radius), math.floor(y+radius)+1):
            for xx in range(math.floor(x-radius), math.floor(x+radius)+1):
                if self.wall(xx, yy):
                    cx, cy = max(xx, min(x, xx+1)), max(yy, min(y, yy+1))
                    if (cx-x)**2+(cy-y)**2 < radius*radius:
                        return False
        return True

    def move(self, x, y, name):
        dx, dy = DIRS[name]
        nx, ny = x+dx*.15, y+dy*.15
        if self.clear(nx, y, .3):
            x = nx
        if self.clear(x, ny, .3):
            y = ny
        return x, y

    def los(self, a, b, thick=False):
        d = distance(a, b)
        steps = max(1, math.ceil(d/(.20 if thick else .16)))
        for i in range(1, steps+1):
            x = a[0]+(b[0]-a[0])*i/steps
            y = a[1]+(b[1]-a[1])*i/steps
            if thick:
                if not self.clear(x, y):
                    return False
            elif self.wall(math.floor(x), math.floor(y)):
                return False
        return True

    def nearest(self, p):
        x, y = math.floor(p[0]), math.floor(p[1])
        if not self.wall(x, y):
            return y*self.w+x
        candidates = [(distance(p, (xx+.5, yy+.5)), yy*self.w+xx)
                      for yy in range(max(0,y-4), min(self.h,y+5))
                      for xx in range(max(0,x-4), min(self.w,x+5)) if not self.wall(xx,yy)]
        return min(candidates)[1]

    def field(self, goal):
        idx = self.nearest(goal)
        if idx in self.fields:
            return self.fields[idx]
        ds = [1e9]*(self.w*self.h)
        ds[idx] = 0.
        q = [(0., idx)]
        while q:
            cost, cur = heapq.heappop(q)
            if cost != ds[cur]:
                continue
            for nxt, step in self.neighbors.get(cur, []):
                nc = cost+step
                if nc < ds[nxt]:
                    ds[nxt] = nc
                    heapq.heappush(q, (nc,nxt))
        if len(self.fields) > 160:
            self.fields.clear()
        self.fields[idx] = ds
        return ds

    def path(self, pos, goal):
        ds = self.field(goal)
        cur = self.nearest(pos)
        out = [(cur % self.w+.5, cur//self.w+.5)]
        for _ in range(180):
            if ds[cur] < .01:
                break
            ns = self.neighbors.get(cur, [])
            if not ns:
                break
            nxt = min(ns, key=lambda z: ds[z[0]]+z[1])[0]
            if ds[nxt] >= ds[cur]:
                break
            cur = nxt
            out.append((cur % self.w+.5, cur//self.w+.5))
        if self.clear(*goal) and distance(out[-1], goal) < 1.5:
            out.append(goal)
        return out

    def buy(self, obs):
        out = []
        weapons = obs['weapons']
        for u in obs['units']:
            money = u['money']
            cur = u['weapon']
            p = {'unit': u['index']}
            # Armor doubles effective health, while SMG supplies cheap sustained fire.
            if cur == 'pistol':
                choice = 'rifle' if money >= 3350 else 'smg' if money >= 1250 else 'pdw' if money >= 700 else None
            elif cur in ('pdw', 'shotgun'):
                choice = 'rifle' if money >= 3350 else 'smg' if money >= 1900 else None
            elif cur == 'smg':
                choice = 'rifle' if money >= 4000 else None
            else:
                choice = None
            if choice:
                p['weapon'] = choice
                money -= weapons[choice]['cost']
            if u.get('armor',0) < 65 and money >= 650:
                p['armor'] = True
                money -= 650
            if obs['side'] == 'defend' and not u.get('kit') and money >= 400:
                p['kit'] = True
            out.append(p)
        return {'buys': out}

    def site_point(self, label, origin):
        s = self.sites[label]
        ds = self.field(origin)
        choices = []
        for y in range(s['y1']+1,s['y2']):
            for x in range(s['x1']+1,s['x2']):
                if not self.wall(x,y):
                    # Prefer the near edge for a quick plant, but not the exact boundary.
                    choices.append((ds[y*self.w+x]+.07*abs(y-7), (x+.5,y+.5)))
        return min(choices)[1]

    def update_memory(self, obs):
        now = obs['frame']/20
        seen = {}
        for es in obs.get('visibleEnemies',{}).values():
            for e in es:
                seen[e['id']] = e
        for eid,e in seen.items():
            old = self.memory.get(eid)
            v = (0.,0.)
            if old and 0 < now-old['t'] <= 1.1:
                dt = now-old['t']
                v = ((e['x']-old['x'])/dt, (e['y']-old['y'])/dt)
                speed = math.hypot(*v)
                if speed > 3.1:
                    v = (v[0]*3/speed,v[1]*3/speed)
            self.memory[eid] = dict(e, t=now, velocity=v)
        self.memory = {k:e for k,e in self.memory.items() if now-e['t'] < 9}
        self.now = now
        return list(seen.values())

    def goals(self, obs, enemies):
        units = [u for u in obs['units'] if u['alive']]
        bomb = obs['bomb']
        attack = obs['side'] == 'attack'
        goals = {}
        locks = set()
        carrier = bomb.get('carrier')
        if attack and bomb['state'] != 'planted':
            if bomb['state'] == 'dropped':
                point = (bomb['x'],bomb['y'])
                picker = min(units, key=lambda u: self.field(point)[self.nearest((u['x'],u['y']))]) if units else None
                for u in units:
                    goals[u['id']] = point if u == picker else self.plantpoint
                return goals, locks
            for u in units:
                p = (u['x'],u['y'])
                if u['id'] == carrier:
                    s = self.sites[self.targetsite]
                    inside = s['x1'] <= math.floor(p[0]) <= s['x2'] and s['y1'] <= math.floor(p[1]) <= s['y2']
                    if inside:
                        goals[u['id']] = p
                        locks.add(u['id'])
                    else:
                        goals[u['id']] = self.plantpoint
                else:
                    # All five take one site; offset targets keep the firing line spread.
                    offsets = [(-1.,0.), (0.,-1.8), (1.6,0.), (0.,1.8), (-1.6,-1.)]
                    ox,oy = offsets[u['index']]
                    p = (self.plantpoint[0]+ox, self.plantpoint[1]+oy)
                    goals[u['id']] = p if self.clear(*p) else self.plantpoint
            return goals, locks
        if bomb['state'] == 'planted':
            b = (bomb['x'],bomb['y'])
            if not attack:
                defuser = min(units, key=lambda u: self.field(b)[self.nearest((u['x'],u['y']))]+(0 if u.get('kit') else 2)) if units else None
                for u in units:
                    p = (u['x'],u['y'])
                    if u == defuser:
                        goals[u['id']] = b
                        if distance(p,b) < .88:
                            locks.add(u['id'])
                    else:
                        goals[u['id']] = b
                return goals, locks
            for u in units:
                # Stay close enough to deny a defuse, never retreat to an unrelated site.
                idx = u['index']
                angle = (idx*.9+1.3)
                p = (b[0]+math.cos(angle)*3.5,b[1]+math.sin(angle)*3.5)
                goals[u['id']] = p if self.clear(*p) and self.los(p,b) else b
            return goals, locks
        # Two site anchors and three mobile midfield defenders.
        recent = [e for e in self.memory.values() if self.now-e['t'] < 4]
        for u in units:
            i = u['index']
            if recent:
                e = min(recent,key=lambda e: distance((u['x'],u['y']),(e['x'],e['y']))+.4*(self.now-e['t']))
                goals[u['id']] = (e['x'],e['y'])
            elif i in (0,4):
                label = 'A' if i == 0 else 'B'
                s = self.sites[label]
                goals[u['id']] = ((s['x1']+s['x2'])/2+.5,9.5)
                if not self.clear(*goals[u['id']]):
                    goals[u['id']] = ((s['x1']+s['x2'])/2+.5,7.5)
            else:
                goals[u['id']] = (26.5+(i-1)*1.5, 11.5+(i%2))
                if not self.clear(*goals[u['id']]):
                    goals[u['id']] = (27.5,12.5+i*.4)
        return goals, locks

    def combat(self, u, pos, enemies, goal, obs):
        # Evaluate whole-second trajectories, not a single frame: reversing into a
        # trailing projectile stream is much worse than continuing a lateral run.
        nearby = []
        for e in enemies:
            age = self.now-e['t']
            ep = (e['x'],e['y'])
            if age < 2.1 and distance(pos,ep) < 13 and self.los(pos,ep):
                nearby.append(e)
        if not nearby:
            return None
        nearby.sort(key=lambda e: distance(pos,(e['x'],e['y'])))
        nearby = nearby[:5]
        target = nearby[0]
        tp = (target['x'],target['y'])
        nearest = distance(pos,tp)
        olddir = self.lastmove.get(u['id'],'N')
        candidates = []
        for name in MOVES:
            x,y = pos
            risk = 0.
            attack = 0.
            travel = 0.
            for f in range(20):
                nx,ny = self.move(x,y,name)
                vx,vy = (nx-x)*20,(ny-y)*20
                travel += math.hypot(nx-x,ny-y)
                x,y = nx,ny
                if f % 4 != 3:
                    continue
                t = (f+1)/20
                for e in nearby:
                    ep = (e['x']+e['velocity'][0]*min(t,.65), e['y']+e['velocity'][1]*min(t,.65))
                    dx,dy = ep[0]-x,ep[1]-y
                    d = max(.3,math.hypot(dx,dy))
                    if not self.los((x,y),ep):
                        continue
                    lateral = abs(vx*dy-vy*dx)/d
                    # At long range non-leading bullets miss a moving lateral target.
                    speed = obs['weapons'][e['weapon']]['speed']
                    dodge = lateral*max(0,d-.45)/speed
                    hitrisk = math.exp(-2.9*dodge*dodge)
                    risk += hitrisk*(1.0+2.0/max(1,d))
                    if e['t'] < self.now-.1:
                        risk *= .98
                    if not u.get('reloading') and u['mag'] > 0:
                        enemy_lat = abs(e['velocity'][0]*dy-e['velocity'][1]*dx)/d
                        own_speed = obs['weapons'][u['weapon']]['speed']
                        attack += math.exp(-2.3*(enemy_lat*max(0,d-.45)/own_speed)**2)
            end = (x,y)
            d = distance(end,tp)
            # Close on moving targets; orbit stationary targets from medium range.
            moving = math.hypot(*target['velocity']) > 1.2
            desired = 2.0 if moving else 4.2
            if u.get('reloading'):
                desired = 7.5
            score = 1.6*attack - 2.8*risk - .48*abs(d-desired)
            score -= .08*distance(end,goal)
            if name != 'N':
                score += .22*travel
                if travel < 1.7:
                    score -= 2.
            else:
                score -= 1.0
            if name == olddir:
                score += .38
            # Avoid teammates' exact positions (no collision, but shared hitbox exposure).
            for ally in obs['units']:
                if ally['id'] != u['id'] and ally['alive']:
                    ad = distance(end,(ally['x'],ally['y']))
                    if ad < 1.:
                        score -= .5*(1.-ad)
            for bullet in self.threats:
                bx,by,bvx,bvy,damage = bullet
                # Approximate linear own trajectory for bullets already in flight.
                uvx,uvy = (x-pos[0]),(y-pos[1])
                rx,ry = bx-pos[0],by-pos[1]
                rvx,rvy = bvx-uvx,bvy-uvy
                den = rvx*rvx+rvy*rvy
                t = max(0.,min(1.,-(rx*rvx+ry*rvy)/den)) if den else 0
                miss = math.hypot(rx+rvx*t,ry+rvy*t)
                if miss < .8:
                    score -= damage/18*max(0.,1-miss/.8)*2.5
            candidates.append((score,name))
        name = max(candidates)[1]
        # Aim every frame is recomputed from the predicted own position.
        return name, target

    def bullet_threats(self, obs):
        threats = []
        for b in obs.get('bullets',[]):
            if b['team'] == obs['yourTeam']:
                continue
            old = self.prev_bullets.get(b['id'])
            vx,vy = None,None
            if old:
                dt = (obs['tick']-old[2])/20
                if dt > 0:
                    vx,vy = (b['x']-old[0])/dt,(b['y']-old[1])/dt
            else:
                e = self.memory.get(b.get('unit'))
                if e:
                    dx,dy = b['x']-e['x'],b['y']-e['y']
                    d = math.hypot(dx,dy)
                    if d > .35:
                        speed = obs['weapons'][b['weapon']]['speed']
                        vx,vy = dx/d*speed,dy/d*speed
            if vx is not None:
                threats.append((b['x'],b['y'],vx,vy,obs['weapons'][b['weapon']]['damage']))
        self.prev_bullets = {b['id']:(b['x'],b['y'],obs['tick']) for b in obs.get('bullets',[])}
        return threats

    def act(self, obs):
        self.init_map(obs)
        if obs['round'] != self.round:
            self.round = obs['round']
            self.memory = {}
            self.prev_bullets = {}
            self.lastmove = {}
            # Deterministic side variation across halves and seeds.
            self.targetsite = 'A' if (obs.get('seed',1)+obs['round'])%2 == 0 else 'B'
            origin = (27.5,30.5)
            self.plantpoint = self.site_point(self.targetsite,origin)
        if obs['phase'] == 'buy':
            return self.buy(obs)
        self.update_memory(obs)
        self.threats = self.bullet_threats(obs)
        goals,locks = self.goals(obs,list(self.memory.values()))
        result = [[{'dir':'N','aim':'N'} for _ in range(5)] for _ in range(20)]
        for u in obs['units']:
            if not u['alive']:
                continue
            uid = u['id']
            pos = (u['x'],u['y'])
            goal = goals.get(uid,pos)
            route = self.path(pos,goal)
            combat = None if uid in locks else self.combat(u,pos,list(self.memory.values()),goal,obs)
            if combat:
                direction,target = combat
                self.lastmove[uid] = direction
            else:
                target = None
            # Navigators consult team observations for facing, not hidden truth.
            known = [e for e in self.memory.values() if self.now-e['t'] < 3.]
            for f in range(20):
                if uid in locks:
                    direction = 'N'
                elif not combat:
                    if distance(pos,goal) < .20:
                        direction = 'N'
                    else:
                        waypoint = route[0]
                        for p in route:
                            if distance(pos,p) < 5.0 and self.los(pos,p,True):
                                waypoint = p
                        # Choose a legal quantized step that reduces waypoint distance.
                        options = []
                        for name in MOVES[1:]:
                            p = self.move(*pos,name)
                            options.append((distance(p,waypoint)+(.15 if distance(p,pos)<.05 else 0),name))
                        direction = min(options)[1]
                newpos = self.move(*pos,direction)
                aimtarget = None
                if target:
                    t = min((f+1)/20,.65)
                    aimtarget = (target['x']+target['velocity'][0]*t,target['y']+target['velocity'][1]*t)
                elif known:
                    closest = min(known,key=lambda e: distance(pos,(e['x'],e['y'])))
                    if distance(pos,(closest['x'],closest['y'])) < 20 and self.los(pos,(closest['x'],closest['y'])):
                        aimtarget = (closest['x'],closest['y'])
                if aimtarget:
                    aim = aimdir(aimtarget[0]-newpos[0],aimtarget[1]-newpos[1])
                elif direction != 'N':
                    aim = direction
                    # While traversing the defensive backfield, watch incoming lanes.
                    if obs['side']=='defend' and newpos[1]<12:
                        aim = 'D' if f%10 < 7 else direction
                else:
                    # Sweeps also allow the automatic fire system to acquire long lanes.
                    scan = ['D','DL','L','UL','U','UR','R','DR']
                    aim = scan[(int(self.now*2)+f//10+u['index']*2)%8]
                    if obs['side']=='defend' and obs['bomb']['state']!='planted':
                        aim = ['DL','D','DR','D'][(int(self.now)+f//10+u['index'])%4]
                result[f][u['index']] = {'dir':direction,'aim':aim}
                pos = newpos
        return {'inputs':result}


def main():
    agent = Agent()
    for line in sys.stdin:
        try:
            obs = json.loads(line)
            action = agent.act(obs)
            print(json.dumps(action,separators=(',',':')),flush=True)
        except Exception as exc:
            print('agent error: '+repr(exc),file=sys.stderr,flush=True)
            print(json.dumps({'buys':[]} if 'obs' in locals() and obs.get('phase')=='buy' else {'inputs':[[{'dir':'N','aim':'D'} for _ in range(5)] for _ in range(20)]}),flush=True)

if __name__ == '__main__':
    main()
