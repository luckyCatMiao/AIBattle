import sys
import json
import math
import heapq
import traceback

DIR = {'N': (0, 0), 'U': (0, -1), 'D': (0, 1), 'L': (-1, 0), 'R': (1, 0),
       'UL': (-2**-0.5, -2**-0.5), 'UR': (2**-0.5, -2**-0.5),
       'DL': (-2**-0.5, 2**-0.5), 'DR': (2**-0.5, 2**-0.5)}
MOVES = list(DIR)

def aim(dx, dy):
    if abs(dx)+abs(dy) < 1e-6:
        return 'U'
    a = math.atan2(dy, dx)
    return ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR'][round(a/(math.pi/4)) % 8]


class Agent:
    def __init__(self, style='main'):
        self.style = style
        self.mapkey = None
        self.roundkey = None
        self.fields = {}
        self.memory = {}
        self.oldbullets = {}
        self.lastmoves = {}
        self.enemy_vel = {}

    def wall(self, x, y):
        x, y = int(math.floor(x)), int(math.floor(y))
        return x < 0 or y < 0 or x >= self.w or y >= self.h or self.tiles[y*self.w+x] != 0

    def collision(self, x, y):
        for ty in range(math.floor(y-.3), math.floor(y+.3)+1):
            for tx in range(math.floor(x-.3), math.floor(x+.3)+1):
                if self.wall(tx+.5, ty+.5):
                    cx, cy = max(tx, min(tx+1, x)), max(ty, min(ty+1, y))
                    if (cx-x)**2+(cy-y)**2 < .09-1e-10:
                        return True
        return False

    def move(self, x, y, d):
        dx, dy = DIR[d]
        nx = x+.15*dx
        if not self.collision(nx, y):
            x = nx
        ny = y+.15*dy
        if not self.collision(x, ny):
            y = ny
        return x, y

    def los(self, x, y, xx, yy):
        n = max(1, math.ceil(math.hypot(xx-x, yy-y)/.18))
        for i in range(1, n):
            t = i/n
            if self.wall(x+(xx-x)*t, y+(yy-y)*t):
                return False
        return True

    def field(self, goal):
        gx, gy = int(goal[0]), int(goal[1])
        key = (gx, gy)
        if key in self.fields:
            return self.fields[key]
        if self.wall(gx+.5, gy+.5):
            cells = [(abs(x-gx)+abs(y-gy), x, y) for y in range(self.h) for x in range(self.w) if not self.wall(x+.5, y+.5)]
            _, gx, gy = min(cells)
        ds = [1e6]*(self.w*self.h)
        start = gy*self.w+gx
        ds[start] = 0
        q = [(0, gx, gy)]
        while q:
            cost, x, y = heapq.heappop(q)
            if cost != ds[y*self.w+x]:
                continue
            for dx, dy in [(1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)]:
                nx, ny = x+dx, y+dy
                if self.wall(nx+.5, ny+.5):
                    continue
                if dx and dy and (self.wall(x+dx+.5, y+.5) or self.wall(x+.5, y+dy+.5)):
                    continue
                nc = cost+(1.41421356 if dx and dy else 1)
                j = ny*self.w+nx
                if nc < ds[j]:
                    ds[j] = nc
                    heapq.heappush(q, (nc,nx,ny))
        if len(self.fields) > 180:
            self.fields.clear()
        self.fields[key] = ds
        return ds

    def distance(self, x, y, field):
        # Interpolate via reachable neighboring cell centers, avoiding corner cutting.
        ix, iy = math.floor(x), math.floor(y)
        best = 1e6
        for yy in range(iy-1, iy+2):
            for xx in range(ix-1, ix+2):
                if self.wall(xx+.5, yy+.5):
                    continue
                if xx != ix and self.wall(xx+.5, iy+.5):
                    continue
                if yy != iy and self.wall(ix+.5, yy+.5):
                    continue
                val = field[yy*self.w+xx]+math.hypot(xx+.5-x, yy+.5-y)
                best = min(best, val)
        return best

    def navigate(self, x, y, goal, stop=.25):
        if math.hypot(x-goal[0], y-goal[1]) < stop:
            return 'N'
        field = self.field(goal)
        best, bd = 1e9, 'N'
        for d in MOVES[1:]:
            nx, ny = self.move(x,y,d)
            if math.hypot(nx-x,ny-y) < .04:
                continue
            # Longer preview makes movement follow diagonal paths smoothly.
            px, py = nx, ny
            for _ in range(3):
                px, py = self.move(px,py,d)
            score = self.distance(px,py,field)
            if score < best:
                best, bd = score, d
        return bd

    def buy(self, obs):
        buys = []
        for u in obs['units']:
            cash = u['money']
            p = {'unit':u['index']}
            weapon = u['weapon']
            if self.style == 'assault':
                choice = next((w for w in ('rifle','smg','pdw') if cash >= obs['weapons'][w]['cost'] and obs['weapons'][w]['cost'] > obs['weapons'][weapon]['cost']), None)
                if choice:
                    p['weapon'] = choice
                    cash -= obs['weapons'][choice]['cost']
                    weapon = choice
            # Armor doubles effective health; favor it over small gun upgrades.
            if u['armor'] < 65 and cash >= 650:
                p['armor'] = True
                cash -= 650
            if weapon in ('pistol','pdw','shotgun','smg'):
                new = None
                if cash >= 2700 and weapon != 'rifle':
                    new = 'rifle'
                elif cash >= 1250 and weapon in ('pistol','pdw','shotgun'):
                    new = 'smg'
                elif cash >= 700 and weapon == 'pistol':
                    new = 'pdw'
                if new:
                    p['weapon'] = new
                    cash -= obs['weapons'][new]['cost']
            if obs['side'] == 'defend' and not u['kit'] and cash >= 400:
                p['kit'] = True
            buys.append(p)
        return {'buys':buys}

    def setup(self, obs):
        key = (obs.get('id'), obs.get('seed'))
        if key != self.mapkey:
            self.mapkey = key
            self.w, self.h = obs['map']['width'], obs['map']['height']
            self.tiles = obs['map']['tiles']
            self.fields = {}
        rk = (key,obs['round'])
        if rk != self.roundkey:
            self.roundkey = rk
            self.memory = {}
            self.oldbullets = {}
            self.lastmoves = {}
            self.enemy_vel = {}
            self.contact = None
            self.chosen = None
        self.obs = obs
        self.team = obs.get('yourTeam',obs.get('yourPlayer',0))
        self.tick = obs.get('frame',0)
        self.alive = [u for u in obs['units'] if u['alive']]
        self.seen = {}
        for es in obs.get('visibleEnemies',{}).values():
            for e in es:
                self.seen[e['id']] = e
        for eid, e in self.seen.items():
            old = self.memory.get(eid)
            vx, vy = 0, 0
            if old and self.tick-old[0] <= 20 and self.tick > old[0]:
                dt = (self.tick-old[0])/20
                vx,vy = (e['x']-old[1]['x'])/dt,(e['y']-old[1]['y'])/dt
                if math.hypot(vx,vy)>3.1:
                    vx,vy=0,0
            self.enemy_vel[eid] = (vx,vy)
            self.memory[eid] = (self.tick, e)
        self.recent = [e for t,e in self.memory.values() if self.tick-t<=100]
        self.threats = []
        for b in obs.get('bullets',[]):
            if b['team'] == self.team:
                continue
            old = self.oldbullets.get(b['id'])
            if old and self.tick > old[0]:
                vx = (b['x']-old[1])/(self.tick-old[0])
                vy = (b['y']-old[2])/(self.tick-old[0])
            else:
                shooter = self.memory.get(b['unit'])
                if not shooter:
                    continue
                e=shooter[1]
                dx,dy=b['x']-e['x'],b['y']-e['y']
                dd=math.hypot(dx,dy)
                if dd<.2:
                    continue
                speed=obs['weapons'][b['weapon']]['speed']/20
                vx,vy=dx/dd*speed,dy/dd*speed
            self.threats.append((b['x'],b['y'],vx,vy,obs['weapons'][b['weapon']]['damage']))
        self.oldbullets={b['id']:(self.tick,b['x'],b['y']) for b in obs.get('bullets',[])}

    def goals(self):
        obs=self.obs
        bomb=obs['bomb']
        attack=obs['side']=='attack'
        sites=obs['map']['sites']
        centers={k:((s['x1']+s['x2']+1)/2,(s['y1']+s['y2']+1)/2) for k,s in sites.items()}
        if self.chosen is None:
            carrier=self.alive[0] if self.alive else obs['units'][0]
            self.chosen=min(centers,key=lambda k:self.distance(carrier['x'],carrier['y'],self.field(centers[k]))+(0 if k=='A' else .05))
        target=centers[self.chosen]
        goals={}
        if bomb['state']=='planted':
            bp=(bomb['x'],bomb['y'])
            for u in self.alive:
                if not attack:
                    goals[u['id']]=(bp,.72,'defuse')
                else:
                    # Maintain crossfire near the objective, not a distant hunt.
                    offsets=[(0,2.5),(-2.2,0),(2.2,0),(-1.5,-2),(1.5,-2)]
                    ox,oy=offsets[u['index']]
                    gp=(bp[0]+ox,bp[1]+oy)
                    if self.wall(*gp):
                        gp=bp
                    goals[u['id']]=(gp,.5,'guard')
            return goals
        if attack:
            carrier=next((u for u in self.alive if u['id']==bomb.get('carrier')),None)
            for u in self.alive:
                gp=target
                mode='advance'
                if bomb['state']=='dropped':
                    picker=min(self.alive,key=lambda v:self.distance(v['x'],v['y'],self.field((bomb['x'],bomb['y']))))
                    if picker['id']==u['id']:
                        gp=(bomb['x'],bomb['y'])
                        mode='pickup'
                if carrier and carrier['id']==u['id']:
                    s=sites[self.chosen]
                    if any(int(u['x'])>=ss['x1'] and int(u['x'])<=ss['x2'] and int(u['y'])>=ss['y1'] and int(u['y'])<=ss['y2'] for ss in sites.values()):
                        gp=(u['x'],u['y'])
                        mode='plant'
                elif carrier:
                    # Slightly different terminal positions keep a five-person stack from overlapping.
                    gp=(target[0]+(u['index']%3-1)*1.2,target[1]+(u['index']//3)*1.4)
                    if self.wall(*gp):
                        gp=target
                goals[u['id']]=(gp,.32,mode)
        else:
            contacts=list(self.seen.values())
            if contacts:
                # Respond to the closest incursion, all information is from own observations.
                e=min(contacts,key=lambda e:e['y'])
                self.contact=(self.tick,(e['x'],e['y']))
            hot=self.contact and self.tick-self.contact[0]<180
            for u in self.alive:
                i=u['index']
                if self.style=='rush':
                    gp=(27.5,25.5)
                elif hot:
                    gp=self.contact[1]
                elif self.style=='main':
                    side='A' if i<3 else 'B'
                    cx,cy=centers[side]
                    gp=(cx+(i%3-1)*1.1,cy+1.5)
                    if self.wall(*gp):
                        gp=centers[side]
                elif i==2:
                    gp=(27.5,10.5)
                else:
                    side='A' if i<2 else 'B'
                    cx,cy=centers[side]
                    gp=(cx+(1 if i%2 else -1),cy+1.7)
                    if self.wall(*gp):
                        gp=centers[side]
                goals[u['id']]=(gp,.45,'hold')
        return goals

    def combat_move(self,u,goal,mode):
        x,y=u['x'],u['y']
        enemies=[e for e in self.recent if math.hypot(e['x']-x,e['y']-y)<15 and self.los(x,y,e['x'],e['y'])]
        if not enemies:
            return None
        nearest=min(enemies,key=lambda e:(e['x']-x)**2+(e['y']-y)**2)
        ex,ey=nearest['x'],nearest['y']
        dd=math.hypot(ex-x,ey-y)
        if dd>11 and not self.threats:
            return None
        if self.style in ('camp','rush'):
            return 'N' if dd<7 else self.navigate(x,y,(ex,ey))
        scores=[]
        navfield=self.field(goal)
        startdist=self.distance(x,y,navfield)
        friends=sum(1 for v in self.alive if math.hypot(v['x']-x,v['y']-y)<5)
        desired=3.0 if friends>len(enemies) else 5.0
        if u['hp']<40 or u['reloading']:
            desired=7.0
        for d in MOVES:
            px,py=x,y
            path=[]
            for f in range(20):
                px,py=self.move(px,py,d)
                path.append((px,py))
            moved=math.hypot(px-x,py-y)
            if d!='N' and moved<.6:
                continue
            endd=math.hypot(px-ex,py-ey)
            score=abs(endd-desired)*.65
            score+=max(-2,min(4,self.distance(px,py,navfield)-startdist))*(.65 if mode in ('advance','pickup','defuse') else .15)
            # Lateral movement evades automatically aimed, non-leading projectiles.
            lateral=abs((px-x)*(ey-y)-(py-y)*(ex-x))/max(dd,.1)
            score-=lateral*1.25
            if d=='N':
                score+=2
            # Do not reverse into the previous second's projectile stream.
            prev=self.lastmoves.get(u['id'])
            if prev and d!='N':
                ax,ay=DIR[prev]
                bx,by=DIR[d]
                score-=.55*(ax*bx+ay*by)
            if not self.los(px,py,ex,ey):
                score+=.4 if u['hp']>40 and not u['reloading'] else -2
            for bx,by,vx,vy,damage in self.threats:
                if math.hypot(bx-x,by-y)>10:
                    continue
                risk=0
                for f,(xx,yy) in enumerate(path):
                    tx,ty=bx+vx*(f+1),by+vy*(f+1)
                    delta=math.hypot(xx-tx,yy-ty)
                    if delta<.62:
                        risk=max(risk,(.62-delta)/.3)
                score+=min(risk,1.5)*damage*.13
            # Estimate the initial aimed volley from known enemies, assuming no leading.
            for e in enemies:
                dx,dy=x-e['x'],y-e['y']
                dist=math.hypot(dx,dy)
                speed=self.obs['weapons'][e['weapon']]['speed']/20
                if dist<.1:
                    continue
                risk=0
                for f,(xx,yy) in enumerate(path):
                    travel=.38+speed*(f+1)
                    tx,ty=e['x']+dx/dist*travel,e['y']+dy/dist*travel
                    delta=math.hypot(xx-tx,yy-ty)
                    if delta<.55:
                        risk=max(risk,(.55-delta)/.3)
                score+=risk*3
            # Small separation prevents multiple units from catching one stream.
            for v in self.alive:
                if v['id']!=u['id']:
                    sep=math.hypot(px-v['x'],py-v['y'])
                    score+=max(0,1-sep)*.35
            scores.append((score,d))
        return min(scores)[1] if scores else 'N'

    def act(self,obs):
        self.setup(obs)
        if obs['phase']=='buy':
            return self.buy(obs)
        if obs['phase']!='live':
            return {'inputs':[[{'dir':'N','aim':'N'} for _ in range(5)] for _ in range(20)]}
        goals=self.goals()
        plans={}
        for u in self.alive:
            goal,stop,mode=goals[u['id']]
            force=mode=='plant' or (mode=='defuse' and math.hypot(u['x']-goal[0],u['y']-goal[1])<.88)
            combat=None if force else self.combat_move(u,goal,mode)
            plans[u['id']]=(goal,stop,mode,force,combat)
        pos={u['id']:(u['x'],u['y']) for u in self.alive}
        window=[]
        for f in range(20):
            frame=[{'dir':'N','aim':'N'} for _ in range(5)]
            for u in self.alive:
                uid=u['id']
                x,y=pos[uid]
                goal,stop,mode,force,combat=plans[uid]
                if force:
                    d='N'
                elif mode=='defuse' and math.hypot(x-goal[0],y-goal[1])<.85:
                    d='N'
                elif combat is not None:
                    d=combat
                else:
                    d=self.navigate(x,y,goal,stop)
                nx,ny=self.move(x,y,d)
                # Shared sightings may guide orientation, never fabricate hidden coordinates.
                targets=[e for e in self.recent if math.hypot(e['x']-nx,e['y']-ny)<24 and self.los(nx,ny,e['x'],e['y'])]
                if targets:
                    e=min(targets,key=lambda e:(e['x']-nx)**2+(e['y']-ny)**2)
                    a=aim(e['x']-nx,e['y']-ny)
                elif obs['side']=='attack' and obs['bomb']['state']=='planted':
                    a='R' if nx<27.5 else 'L'
                elif d=='N' and obs['side']=='defend':
                    a='D' if f<15 else ('R' if nx<27.5 else 'L')
                else:
                    # Scan while traversing known routes, keeping most frames on the travel axis.
                    a=d if d!='N' else ('U' if obs['side']=='attack' else 'D')
                    if f in (7,8,9):
                        a='U' if obs['side']=='attack' else 'D'
                frame[u['index']]={'dir':d,'aim':a}
                pos[uid]=(nx,ny)
                if f==0:
                    self.lastmoves[uid]=d
            window.append(frame)
        return {'inputs':window}


if __name__=='__main__':
    agent=Agent(sys.argv[1] if len(sys.argv)>1 else 'main')
    for line in sys.stdin:
        try:
            obs=json.loads(line)
            result=agent.act(obs)
            print(json.dumps(result,separators=(',',':')),flush=True)
        except Exception:
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({'inputs':[[{'dir':'N','aim':'N'} for _ in range(5)] for _ in range(20)]}),flush=True)
