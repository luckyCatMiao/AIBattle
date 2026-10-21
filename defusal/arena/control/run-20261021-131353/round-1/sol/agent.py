#!/usr/bin/env python3
import sys
import json
import math
import heapq
from collections import deque

DIRS = {'N': (0., 0.), 'U': (0., -1.), 'D': (0., 1.), 'L': (-1., 0.), 'R': (1., 0.),
        'UL': (-2**-.5, -2**-.5), 'UR': (2**-.5, -2**-.5),
        'DL': (-2**-.5, 2**-.5), 'DR': (2**-.5, 2**-.5)}
MOVES = list(DIRS)
VECTORS = list(DIRS.values())
SPEED = .15


def distance(a, b):
    return math.hypot(a[0]-b[0], a[1]-b[1])


def aim_at(dx, dy):
    if abs(dx)+abs(dy) < 1e-6:
        return 'U'
    return ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR'][int(math.floor(math.atan2(dy, dx)/(math.pi/4)+.5)) % 8]


class Arena:
    def __init__(self, m):
        self.w, self.h = m['width'], m['height']
        self.tiles = m['tiles']
        self.sites = m['sites']
        self.fields = {}
        self.open = [i for i, t in enumerate(self.tiles) if not t]
        self.neighbors = [[] for _ in self.tiles]
        for i in self.open:
            x, y = i % self.w, i // self.w
            for k, (dx, dy) in enumerate([(0,-1),(0,1),(-1,0),(1,0),(-1,-1),(1,-1),(-1,1),(1,1)]):
                nx, ny = x+dx, y+dy
                if self.wall(nx, ny):
                    continue
                if dx and dy and (self.wall(x+dx,y) or self.wall(x,y+dy)):
                    continue
                self.neighbors[i].append((ny*self.w+nx, 1.41421356237 if dx and dy else 1.))

    def wall(self, x, y):
        return x < 0 or y < 0 or x >= self.w or y >= self.h or self.tiles[y*self.w+x] == 1

    def collision(self, x, y, r=.3):
        for ty in range(math.floor(y-r), math.floor(y+r)+1):
            for tx in range(math.floor(x-r), math.floor(x+r)+1):
                if self.wall(tx,ty):
                    cx, cy = min(max(x,tx),tx+1), min(max(y,ty),ty+1)
                    if (x-cx)**2+(y-cy)**2 < r*r-1e-10:
                        return True
        return False

    def move(self, x, y, dx, dy):
        if not self.collision(x+dx,y):
            x += dx
        if not self.collision(x,y+dy):
            y += dy
        return x,y

    def los(self, x, y, ex, ey):
        # Grid traversal; walls, unlike units, stop both vision and projectiles.
        dx, dy = ex-x, ey-y
        ix, iy, endx, endy = int(x), int(y), int(ex), int(ey)
        sx, sy = (1 if dx > 0 else -1), (1 if dy > 0 else -1)
        tx = ((ix+1-x) if dx > 0 else (x-ix))/abs(dx) if dx else 1e20
        ty = ((iy+1-y) if dy > 0 else (y-iy))/abs(dy) if dy else 1e20
        stepx, stepy = 1/abs(dx) if dx else 1e20, 1/abs(dy) if dy else 1e20
        for _ in range(100):
            if ix == endx and iy == endy:
                return True
            if tx < ty:
                ix += sx
                tx += stepx
            else:
                iy += sy
                ty += stepy
            if self.wall(ix,iy):
                return False
        return False

    def cell(self, p):
        x, y = int(p[0]), int(p[1])
        if not self.wall(x,y):
            return y*self.w+x
        return min(self.open, key=lambda i: (i%self.w+.5-p[0])**2+(i//self.w+.5-p[1])**2)

    def field(self, target):
        key = self.cell(target)
        if key not in self.fields:
            d = [1e6]*len(self.tiles)
            d[key] = 0.
            q = [(0.,key)]
            while q:
                cost,i = heapq.heappop(q)
                if cost > d[i]+1e-7:
                    continue
                for j,c in self.neighbors[i]:
                    v = cost+c
                    if v < d[j]:
                        d[j] = v
                        heapq.heappush(q,(v,j))
            if len(self.fields) > 180:
                self.fields.clear()
            self.fields[key] = d
        return self.fields[key]

    def navdist(self, p, target):
        return self.field(target)[self.cell(p)]

    def waypoint(self, p, target):
        if distance(p,target) < 4 and self.clear_walk(p,target):
            return target
        f = self.field(target)
        i = self.cell(p)
        route = [(i%self.w+.5,i//self.w+.5)]
        for _ in range(7):
            ns = self.neighbors[i]
            if not ns:
                break
            j,c = min(ns, key=lambda jc:f[jc[0]]+jc[1])
            if f[j] >= f[i]-.01:
                break
            i = j
            route.append((i%self.w+.5,i//self.w+.5))
        for pt in reversed(route):
            if self.clear_walk(p,pt):
                return pt
        return route[0]

    def clear_walk(self, p, q):
        dx,dy = q[0]-p[0],q[1]-p[1]
        n = max(1,math.ceil(math.hypot(dx,dy)/.22))
        for k in range(1,n+1):
            if self.collision(p[0]+dx*k/n,p[1]+dy*k/n,.32):
                return False
        return True

    def nav_step(self, x, y, target, stop=.15):
        if distance((x,y),target) < stop:
            return 0
        wx,wy = self.waypoint((x,y),target)
        best,score = 0,1e9
        for k,(dx,dy) in enumerate(VECTORS):
            nx,ny = self.move(x,y,dx*SPEED,dy*SPEED)
            s = math.hypot(wx-nx,wy-ny)
            if k and abs(nx-x)+abs(ny-y)<.04:
                s += 1
            if s < score:
                best,score = k,s
        return best


class Agent:
    def __init__(self, style='main'):
        self.style = style
        self.arena = None
        self.round = None
        self.history = {}
        self.bullet_history = {}
        self.last_dirs = {}
        self.seen = {}
        self.site = 'A'
        self.plan = {}
        self.shot_id = 0
        self.shot_hints = {}

    def reset(self, o):
        if self.arena is None:
            self.arena = Arena(o['map'])
        if self.round != o['round']:
            self.round = o['round']
            self.history = {}
            self.bullet_history = {}
            self.seen = {}
            self.last_dirs = {}
            self.shot_hints = {}
            self.plan = {}
            # Alternate the chosen flank between rounds, keeping the team concentrated.
            self.site = 'A' if (o['seed']+o['round'])%2 == 0 else 'B'

    def buy(self, o):
        buys = []
        for u in o['units']:
            money = u['money']
            p = {'unit':u['index']}
            current = u['weapon']
            # Armor has higher opening-round value than a PDW in moving duels.
            if self.style=='pdw' and current=='pistol' and money>=700:
                p['weapon']='pdw'; money-=700
            elif self.style=='sniper' and money>=4750:
                p['weapon']='sniper'; money-=4750
            elif current in ('pistol','pdw','shotgun'):
                if money >= 3350:
                    p['weapon'] = 'rifle'; money -= 2700
                elif money >= 1900:
                    p['weapon'] = 'smg'; money -= 1250
                elif money >= 1350:
                    p['weapon'] = 'pdw'; money -= 700
            elif current == 'smg' and money >= 3350:
                p['weapon'] = 'rifle'; money -= 2700
            if u.get('armor',0) < 70 and money >= 650:
                p['armor'] = True; money -= 650
            if o['side'] == 'defend' and money >= 400 and not u.get('kit'):
                p['kit'] = True; money -= 400
            buys.append(p)
        return {'buys':buys}

    def information(self, o):
        tick = o['tick']
        enemies = {}
        for es in o.get('visibleEnemies',{}).values():
            for e in es:
                enemies[e['id']] = dict(e)
        for eid,e in enemies.items():
            prev = self.history.get(eid)
            vx=vy=0.
            if prev and tick > prev[0] and tick-prev[0] <= 40:
                dt = (tick-prev[0])/20
                vx,vy = (e['x']-prev[1])/dt,(e['y']-prev[2])/dt
                speed = math.hypot(vx,vy)
                if speed > 3.05:
                    vx *= 3/speed; vy *= 3/speed
            e['vx'],e['vy'] = vx,vy
            self.history[eid] = (tick,e['x'],e['y'])
            self.seen[eid] = (tick,dict(e))
        # Own automatic shots are legal observations, also useful down long corridors.
        for ev in o.get('events',[]):
            if ev['type']=='shot' and ev['id']>self.shot_id and ev.get('frame',-100)>=o['frame']-22:
                self.shot_hints[ev['unit']] = (tick,ev['angle'],ev['from']['x'],ev['from']['y'])
            self.shot_id = max(self.shot_id,ev['id'])
        return list(enemies.values())

    def site_target(self, name, p=None):
        a = self.arena
        s = a.sites[name]
        cells = [(i%a.w+.5,i//a.w+.5) for i in a.open if s['x1'] <= i%a.w <= s['x2'] and s['y1'] <= i//a.w <= s['y2']]
        if p is None:
            return min(cells,key=lambda pt:distance(pt,((s['x1']+s['x2']+1)/2,(s['y1']+s['y2']+1)/2)))
        f = a.field(p)
        return min(cells,key=lambda pt:f[a.cell(pt)])

    def goals(self, o, enemies):
        a = self.arena
        alive = [u for u in o['units'] if u['alive']]
        bomb = o['bomb']
        goals = {}
        fixed = set()
        t = o['frame']/20
        carrier = next((u for u in alive if u['id']==bomb.get('carrier')),None)
        if o['side']=='attack':
            if bomb['state']=='planted':
                bx,by = bomb['x'],bomb['y']
                for u in alive:
                    idx=u['index']
                    # Keep multiple firing angles near the bomb rather than chase across the map.
                    if idx not in self.plan or self.plan[idx][0]!='post':
                        candidates = [(i%a.w+.5,i//a.w+.5) for i in a.open if 2.5 < distance((i%a.w+.5,i//a.w+.5),(bx,by)) < 5.5 and a.los(i%a.w+.5,i//a.w+.5,bx,by)]
                        want = (bx+(idx-2)*1.1,by+(2 if idx%2 else -2))
                        pt = min(candidates,key=lambda p:distance(p,want)+.1*a.navdist((u['x'],u['y']),p)) if candidates else (bx,by)
                        self.plan[idx]=('post',pt)
                    goals[idx]=self.plan[idx][1]
            elif bomb['state']=='dropped':
                pt=(bomb['x'],bomb['y'])
                for u in alive:
                    goals[u['index']]=pt
            else:
                if carrier:
                    cp=(carrier['x'],carrier['y'])
                    if 'plant' not in self.plan:
                        self.plan['plant']=self.site_target(self.site,cp)
                    pt=self.plan['plant']
                    s=a.sites[self.site]
                    ins = s['x1']<=int(cp[0])<=s['x2'] and s['y1']<=int(cp[1])<=s['y2']
                    for u in alive:
                        idx=u['index']
                        if u is carrier:
                            goals[idx]=pt
                            if ins:
                                fixed.add(idx)
                        else:
                            # A tight entry group: helpers enter first, carrier arrives behind them.
                            goals[idx]=pt
                    if ins:
                        self.plan['plant']=cp
                    if 'entry' not in self.plan:
                        # Use the flank crossing instead of funneling all five into mid.
                        gaps=[(xx+.5,18.7) for xx in range(2,a.w-2)
                              if not a.wall(xx,16) and not a.wall(xx,17) and not a.collision(xx+.5,18.7)]
                        candidates=[p for p in gaps if (p[0]<24 if self.site=='A' else p[0]>32)]
                        self.plan['entry']=min(candidates or gaps,key=lambda p:a.navdist(cp,p)+a.navdist(p,pt)) if gaps else cp
                    entry=self.plan['entry']
                    for u in alive:
                        key=('cross',u['index'])
                        if u['y']<16 or distance((u['x'],u['y']),entry)<.7:
                            self.plan[key]=True
                        if self.style=='main' and not self.plan.get(key) and u['index'] not in fixed:
                            goals[u['index']]=entry
                else:
                    for u in alive:
                        goals[u['index']]=self.site_target(self.site)
        else:
            if bomb['state']=='planted':
                pt=(bomb['x'],bomb['y'])
                nearest = min(alive,key=lambda u:a.navdist((u['x'],u['y']),pt)+(0 if u.get('kit') else 2)) if alive else None
                for u in alive:
                    idx=u['index']
                    goals[idx]=pt
                    if distance((u['x'],u['y']),pt)<.93:
                        fixed.add(idx)
            elif self.style=='rush':
                for u in alive:
                    goals[u['index']]=(27.5,25.5)
            else:
                # Two pairs on the sites, a central rotator; visible contact calls support.
                contacts=[e for e in enemies if e['y']<22]
                if not contacts:
                    contacts=[e for last,e in self.seen.values() if o['tick']-last < 100 and e['y']<20]
                for u in alive:
                    idx=u['index']
                    if contacts:
                        e = min(contacts,key=lambda e:a.navdist((u['x'],u['y']),(e['x'],e['y'])))
                        goals[idx]=(e['x'],e['y'])
                    else:
                        side='A' if idx<2 else 'B'
                        if idx==4:
                            goals[idx]=(27.5,12.5)
                        else:
                            pt=self.site_target(side)
                            goals[idx]=(pt[0]+(.7 if idx%2 else -.7),pt[1]+2.5)
                            if a.collision(*goals[idx]):
                                goals[idx]=pt
        return goals,fixed

    def incoming(self,o,enemies):
        tick=o['tick']
        incoming=[]
        team=o.get('yourTeam',o['yourPlayer'])
        for b in o.get('bullets',[]):
            if b['team']==team:
                continue
            prev=self.bullet_history.get(b['id'])
            vel=None
            if prev and tick>prev[0]:
                dt=tick-prev[0]
                vel=((b['x']-prev[1])/dt,(b['y']-prev[2])/dt)
            else:
                e=next((e for e in enemies if e['id']==b['unit']),None)
                if e:
                    dx,dy=b['x']-e['x'],b['y']-e['y']
                    length=math.hypot(dx,dy)
                    if length>.5:
                        speed=o['weapons'][b['weapon']]['speed']/20
                        vel=(dx/length*speed,dy/length*speed)
            if vel:
                incoming.append((b['x'],b['y'],vel[0],vel[1],o['weapons'][b['weapon']]['damage']))
        self.bullet_history={b['id']:(tick,b['x'],b['y']) for b in o.get('bullets',[])}
        return incoming

    def combat_move(self,u,es,target,o,incoming):
        a=self.arena
        x,y=u['x'],u['y']
        idx=u['index']
        old=self.last_dirs.get(idx,0)
        oldx,oldy=VECTORS[old]
        best,bestscore=0,-1e30
        # Evaluate sustained movement; direct auto-aimed projectiles cannot lead strafing.
        for k,(dx,dy) in enumerate(VECTORS):
            path=[(x,y)]
            px,py=x,y
            for f in range(20):
                px,py=a.move(px,py,dx*SPEED,dy*SPEED)
                path.append((px,py))
            actual=(px-x,py-y)
            moved=math.hypot(*actual)
            score=0.
            ownweapon=o['weapons'][u['weapon']]
            bestattack=0.
            risk=0.
            for e in es:
                ex,ey=e['x'],e['y']
                d0=math.hypot(ex-x,ey-y)
                evx,evy=e.get('vx',0),e.get('vy',0)
                # Short extrapolation avoids committing to a disappearing enemy's old trajectory.
                nex,ney=a.move(ex,ey,evx*.45,evy*.45)
                d1=math.hypot(nex-px,ney-py)
                los=a.los(px,py,nex,ney)
                weapon=o['weapons'][e['weapon']]
                if not a.los(x,y,ex,ey) and not los:
                    continue
                cross=abs((ex-x)*actual[1]-(ey-y)*actual[0])/max(d0,.1)
                # At range, transverse movement beats standing or radial charging.
                threat=weapon['damage']/max(.1,round(weapon['interval']*20)/20)
                dodge=min(1.,cross/max(.5,weapon['speed']*.4/max(d0,1.)))
                near=max(0.,(2.4-min(d0,d1))/2.4)
                risk += threat*(.12+.88*(1-dodge))*(.3+.7*float(los))*(.6+.4*near)
                ecross=abs((ex-x)*evy-(ey-y)*evx)/max(d0,.1)
                hit=max(.10,1-ecross*max(d1-.4,0)/max(ownweapon['speed']*.55,1))
                attack=hit*ownweapon['damage']/max(.1,round(ownweapon['interval']*20)/20)
                # Pressure moving opponents into short-range fights instead of endless orbiting.
                attack += (d0-d1)*10
                attack += max(0,4-d1)*4
                if not los:
                    attack *= .18
                bestattack=max(bestattack,attack)
            score += bestattack*.55 - risk*(.85 if u['hp']>35 else 1.2)
            for bx,by,bvx,bvy,damage in incoming:
                if math.hypot(bx-x,by-y)>15:
                    continue
                for f,(cx,cy) in enumerate(path[1:],1):
                    qx,qy=bx+bvx*f,by+bvy*f
                    if (qx-cx)**2+(qy-cy)**2 < .55**2 and a.los(bx,by,qx,qy):
                        score-=damage*2.3
                        break
            if moved < 1.5:
                score-=12*(1.5-moved)
            if k:
                score+=2*(dx*oldx+dy*oldy)
                if es:
                    e=es[0]
                    ex,ey=e['x']-x,e['y']-y
                    signed=(ex*dy-ey*dx)/max(math.hypot(ex,ey),.1)
                    score+=signed*(1 if idx%2 else -1)*2.5
            # Mission progress matters but must not overwhelm the need to sidestep.
            wp=a.waypoint((x,y),target)
            score+=(distance((x,y),wp)-distance((px,py),wp))*2.5
            if score>bestscore:
                best,bestscore=k,score
        return best

    def live(self,o):
        a=self.arena
        enemies=self.information(o)
        goals,fixed=self.goals(o,enemies)
        incoming=self.incoming(o,enemies)
        windows=[[{'dir':'N','aim':'N'} for _ in range(5)] for _ in range(20)]
        for u in o['units']:
            if not u['alive']:
                continue
            idx=u['index']
            x,y=u['x'],u['y']
            target=goals.get(idx,(x,y))
            es=[e for e in enemies if math.hypot(e['x']-x,e['y']-y)<12 and a.los(x,y,e['x'],e['y'])]
            # The public engine's automatic fire test uses weapon range, not the
            # eight-tile observation range. A recent own shot is a bearing only,
            # never an exact hidden enemy position.
            hint=self.shot_hints.get(u['id'])
            if not es and hint and o['tick']-hint[0]<=20:
                hx,hy=math.cos(hint[1]),math.sin(hint[1])
                reach=7.
                while reach>1 and not a.los(x,y,x+hx*reach,y+hy*reach):
                    reach-=.5
                es=[{'id':'bearing','x':x+hx*reach,'y':y+hy*reach,'weapon':'rifle','vx':0.,'vy':0.}]
            k=None
            if es and idx not in fixed and self.style!='plain':
                k=self.combat_move(u,es,target,o,incoming)
                self.last_dirs[idx]=k
            for f in range(20):
                if idx in fixed:
                    move=0
                elif k is not None:
                    move=k
                else:
                    move=a.nav_step(x,y,target,.3)
                dx,dy=VECTORS[move]
                nx,ny=a.move(x,y,dx*SPEED,dy*SPEED)
                if es:
                    e=min(es,key=lambda e:math.hypot(e['x']-nx,e['y']-ny))
                    ax,ay=e['x']+e.get('vx',0)*min(f/20,.4)-nx,e['y']+e.get('vy',0)*min(f/20,.4)-ny
                    aim=aim_at(ax,ay)
                elif o['bomb']['state']=='planted' and distance((nx,ny),target)<1:
                    b=o['bomb']
                    aim=aim_at(27.5-nx,16.5-ny) if o['side']=='attack' else aim_at(b['x']-nx,b['y']-ny)
                else:
                    hint=self.shot_hints.get(u['id'])
                    if hint and o['tick']-hint[0]<=20:
                        aim=aim_at(math.cos(hint[1]),math.sin(hint[1]))
                    elif move:
                        aim=MOVES[move]
                    else:
                        aim=aim_at(27.5-nx,25-ny) if o['side']=='defend' else 'U'
                    # Scan lateral sectors occasionally without giving up the main movement view.
                    if f in (8,9) and not hint:
                        aim=aim_at(1 if idx%2 else -1,0)
                windows[f][idx]={'dir':MOVES[move],'aim':aim}
                x,y=nx,ny
        return {'inputs':windows}

    def act(self,o):
        self.reset(o)
        if o['phase']=='buy':
            return self.buy(o)
        return self.live(o)


def main():
    agent=Agent(sys.argv[1] if len(sys.argv)>1 else 'main')
    for line in sys.stdin:
        try:
            obs=json.loads(line)
            answer=agent.act(obs)
            print(json.dumps(answer,separators=(',',':')),flush=True)
        except Exception as ex:
            print(str(ex),file=sys.stderr,flush=True)
            raise


if __name__=='__main__':
    main()
