#!/usr/bin/env python3
# 灰烬王座 控制程序：烬焰法师 + 盾卫海 + 防御塔，主场决战后反推。
import sys, json, math, time

def dist(a, b):
    return math.hypot(a['x'] - b['x'], a['y'] - b['y'])

def log(*a):
    print(*a, file=sys.stderr, flush=True)

class Agent:
    def __init__(self):
        self.me = None
        self.mem = {}      # unit id -> (order sig, time)
        self.built = {}    # tag -> time issued
        self.phase = 'farm'
        self.camp_target = None
        self.attacking = False
        self.lastAttackCheck = 0
        self.garrison = {}  # node id -> [unit ids]

    # ---------- helpers ----------
    def setup(self, s):
        self.me = s['yourPlayer']
        cat = s['catalog']
        self.cat = cat
        th = [b for b in s['buildings'] if b['owner'] == self.me and b['type'] == 'townhall']
        self.home = {'x': th[0]['x'], 'y': th[0]['y']}
        self.dir = 1 if self.home['x'] < s['map']['width'] / 2 else -1
        self.W = s['map']['width']; self.H = s['map']['height']
        self.obst = s['map']['obstacles']

    def blocked(self, s, x, y, r):
        if x < r + 8 or y < r + 8 or x > self.W - r - 8 or y > self.H - r - 8:
            return True
        for o in self.obst:
            if o['x'] - r < x < o['x'] + o['w'] + r and o['y'] - r < y < o['y'] + o['h'] + r:
                return True
        for b in s['buildings']:
            if b['hp'] > 0 and math.hypot(b['x'] - x, b['y'] - y) < b['r'] + r + 4:
                return True
        return False

    def can_build(self, s, btype, x, y):
        d = self.cat['buildings'][btype]
        r = d['r']
        if self.blocked(s, x, y, r + 12 + 2):
            return False
        for res in s['resources']:
            if res['amount'] > 0 and math.hypot(res['x'] - x, res['y'] - y) < res['r'] + r + 24:
                return False
        for n in s['nodes']:
            if math.hypot(n['x'] - x, n['y'] - y) < n['r'] + r + 4:
                return False
        for u in s['units']:
            if u['owner'] != self.me and math.hypot(u['x'] - x, u['y'] - y) < u['r'] + r + 4:
                return False
        return True

    def find_spot(self, s, btype, cx, cy, maxr=420):
        for ring in range(0, 18):
            rr = ring * 28
            if rr > maxr:
                break
            n = max(1, ring * 6)
            for i in range(n):
                a = i * 2 * math.pi / n
                x = cx + math.cos(a) * rr; y = cy + math.sin(a) * rr
                if self.can_build(s, btype, x, y):
                    return x, y
        return None

    def afford(self, p, g, w):
        return p['gold'] >= g + self.reserve_g and p['wood'] >= w + self.reserve_w

    def order_sig(self, u):
        o = u.get('order') or {}
        return o.get('type'), o.get('target'), round(o.get('x', 0) / 60), round(o.get('y', 0) / 60)

    # ---------- main ----------
    def decide(self, s):
        self.t0 = time.time()
        if self.me is None:
            self.setup(s)
        me = self.me
        now = s['now']
        cmds = []
        p = s['players'][me]
        self.reserve_g = 0; self.reserve_w = 0
        mine = [u for u in s['units'] if u['owner'] == me]
        myb = [b for b in s['buildings'] if b['owner'] == me]
        enemies = [u for u in s['units'] if u['owner'] not in (me, -1)]
        eb = [b for b in s['buildings'] if b['owner'] not in (me, -1)]
        workers = [u for u in mine if u['type'] == 'worker']
        hero = next((u for u in mine if u.get('hero') and u['type'] == 'pyromancer'), None)
        heroes = [u for u in mine if u.get('hero')]
        army = [u for u in mine if u['type'] != 'worker' and not u.get('hero') and not u.get('summoned')]
        cat = self.cat
        ths = [b for b in myb if b['type'] == 'townhall']
        if ths:
            self.home = {'x': ths[0]['x'], 'y': ths[0]['y']}
        home = self.home
        D = self.dir
        def cnt(t, complete=None):
            return sum(1 for b in myb if b['type'] == t and (complete is None or b['complete'] == complete))
        queued = lambda t: sum(1 for b in myb for q in b['queue'] if q['type'] == t)

        # ===== economy =====
        th = ths[0] if ths else None
        nworkers = len(workers) + queued('worker')
        target_workers = 18
        if th and th['complete'] and nworkers < target_workers and len(th['queue']) < 2 and p['gold'] >= 60:
            if p['population'] + 1 <= p['popCap']:
                cmds.append({'type': 'train', 'unit': 'worker', 'building': th['id']})
                p['gold'] -= 60

        # wood assignment: keep ~4 on wood
        woodres = [r for r in s['resources'] if r['kind'] == 'wood' and r['amount'] > 0]
        goldres = [r for r in s['resources'] if r['kind'] == 'gold' and r['amount'] > 0]
        def gk(u):
            o = u.get('order') or {}
            if o.get('type') != 'gather':
                return None
            t = o.get('target', '')
            r = next((r for r in s['resources'] if r['id'] == t), None)
            return r['kind'] if r else u.get('gatherKind')
        wood_w = [u for u in workers if gk(u) == 'wood']
        idle_w = [u for u in workers if (u.get('order') or {}).get('type') == 'hold']
        want_wood = 5 if p['wood'] < 150 else 4 if p['wood'] < 400 else 3 if p['wood'] < 700 else 1
        for u in idle_w:
            if len(wood_w) < want_wood and woodres:
                r = min(woodres, key=lambda r: dist(r, u)); wood_w.append(u)
            elif goldres:
                r = min(goldres, key=lambda r: dist(r, home))
            else:
                continue
            cmds.append({'type': 'gather', 'units': [u['id']], 'target': r['id']})
        gold_w = [u for u in workers if gk(u) == 'gold']
        if len(wood_w) > want_wood + 1 and goldres and now - self.built.get('goldfix', -99) > 2:
            u = next((u for u in wood_w if u['cargo']['wood'] < 1), None)
            if u:
                r = min(goldres, key=lambda r: dist(r, home))
                cmds.append({'type': 'gather', 'units': [u['id']], 'target': r['id']})
                self.built['goldfix'] = now
        if len(wood_w) < want_wood and gold_w and woodres and now - self.built.get('woodfix', -99) > 3:
            u = gold_w[0]
            if u['cargo']['gold'] < 1:
                r = min(woodres, key=lambda r: dist(r, home))
                cmds.append({'type': 'gather', 'units': [u['id']], 'target': r['id']})
                self.built['woodfix'] = now

        busy_builders = set()
        for u in workers:
            if (u.get('order') or {}).get('type') == 'build':
                busy_builders.add(u['id'])

        def builder():
            cands = [u for u in workers if u['id'] not in busy_builders and gk(u) == 'gold' and u['cargo']['gold'] + u['cargo']['wood'] < 8]
            if not cands:
                cands = [u for u in workers if u['id'] not in busy_builders]
            if not cands:
                return None
            u = min(cands, key=lambda u: dist(u, home))
            busy_builders.add(u['id'])
            return u

        def try_build(tag, btype, cx, cy, mintime_gap=6):
            if now - self.built.get(tag, -99) < mintime_gap:
                return False
            c = cat['buildings'][btype]['cost']
            if p['gold'] < c['gold'] or p['wood'] < c['wood']:
                self.reserve_g += c['gold']; self.reserve_w += c['wood']
                return False
            if time.time() - self.t0 > 1.5:
                return False
            spot = self.find_spot(s, btype, cx, cy)
            if not spot:
                self.built[tag] = now
                return False
            b = builder()
            if not b:
                return False
            cmds.append({'type': 'build', 'building': btype, 'units': [b['id']], 'x': round(spot[0], 1), 'y': round(spot[1], 1)})
            p['gold'] -= c['gold']; p['wood'] -= c['wood']
            self.built[tag] = now
            return True

        farms_building = cnt('farm', False)
        # farm when close to cap
        if p['popCap'] < 120 and p['popCap'] - p['population'] < 8 + 2 * cnt('barracks', True) and farms_building < (3 if p['popCap'] > 60 else 2 if p['popCap'] > 36 else 1):
            try_build('farm', 'farm', home['x'] - D * 150, home['y'] + (220 if cnt('farm') % 2 else -260), 4)
        nr = cnt('range')
        if nr == 0 and now > 8:
            try_build('range', 'range', home['x'] + D * 200, home['y'] - 200, 5)
        elif nr == 1 and now > 50:
            try_build('range2', 'range', home['x'] + D * 140, home['y'] + 330, 6)
        elif nr == 2 and now > 95:
            try_build('range3', 'range', home['x'] + D * 20, home['y'] - 360, 6)
        elif nr < 5 and now > 170 and p['gold'] > 600:
            try_build('range4', 'range', home['x'] + D * 260, home['y'] + 260, 6)
        if cnt('lumbermill') == 0 and now > 30 and woodres:
            wr = min(woodres, key=lambda r: dist(r, home))
            try_build('mill', 'lumbermill', (wr['x'] + home['x']) / 2, (wr['y'] + home['y']) / 2, 8)
        if cnt('tower') < 1 and now > 90:
            try_build('tower', 'tower', home['x'] + D * 300, home['y'], 8)
        if cnt('forge') == 0 and now > 110:
            try_build('forge', 'forge', home['x'] - D * 120, home['y'] - 220, 8)
        if cnt('arcane') == 0 and now > 40:
            try_build('arcane', 'arcane', home['x'] + D * 80, home['y'] + 300, 8)
        if cnt('tower') < 2 and now > 160:
            try_build('tower2', 'tower', home['x'] + D * 280, home['y'] - 180, 8)
        mill = next((b for b in myb if b['type'] == 'lumbermill' and b['complete']), None)
        if mill and not mill['queue']:
            lvl = p['tech']['gathering']
            tc = cat['techs']['gathering']['cost']
            g, w = tc['gold'] + lvl * 70, tc['wood'] + lvl * 50
            if lvl < 2 and now > 45 + lvl * 50 and p['gold'] >= g + 60 and p['wood'] >= w:
                cmds.append({'type': 'research', 'tech': 'gathering', 'building': mill['id']}); p['gold'] -= g; p['wood'] -= w
        forge_done = cnt('forge', True) > 0
        if forge_done and p['tier'] < 2 and th and not any(q['type'] == 'tier2' for q in th['queue']) and now > 150 and p['gold'] >= 350 + 250 and p['wood'] >= 220:
            cmds.append({'type': 'research', 'tech': 'tier2'}); p['gold'] -= 350; p['wood'] -= 220
        if p['gold'] > 700 and cnt('forge') == 0 and now > 60:
            try_build('forge', 'forge', home['x'] - D * 120, home['y'] - 220, 8)
        if forge_done:
            for tech in ('armor', 'weapons'):
                lvl = p['tech'][tech]
                busy = any(q['type'] == tech for b in myb for q in b['queue'])
                tc = cat['techs'][tech]['cost']
                g, w = tc['gold'] + lvl * 70, tc['wood'] + lvl * 50
                if not busy and lvl < p['tier'] and p['gold'] >= g + 150 and p['wood'] >= w:
                    cmds.append({'type': 'research', 'tech': tech}); p['gold'] -= g; p['wood'] -= w

        # ===== hero management =====
        rec = next((h for h in p['heroes'] if h['type'] == 'pyromancer'), None)
        if rec and rec['dead'] and not rec.get('queued') and now >= rec['respawnAt']:
            cost = 150 + 40 * rec['level']
            if p['gold'] >= cost and p['population'] + 5 <= p['popCap']:
                cmds.append({'type': 'revive', 'hero': 'pyromancer'}); p['gold'] -= cost
        # extra heroes: every hero gets full XP from nearby kills, so 5 heroes scale hard
        have = {h['type'] for h in p['heroes']}
        order = [h for h in ('frost', 'oracle', 'druid', 'ranger', 'vanguard') if h not in have and h in cat['heroes']]
        due = [30, 65, 100, 135, 999][min(len(p['heroes']) - 1, 4)]
        if order and len(p['heroes']) < 5 and now > due:
            if p['gold'] >= 360 and p['wood'] >= 80 and p['population'] + 5 <= p['popCap']:
                cmds.append({'type': 'summon', 'hero': order[0]}); p['gold'] -= 360; p['wood'] -= 80
            else:
                self.reserve_g += 360; self.reserve_w += 80
        for hr in p['heroes']:
            if hr['type'] != 'pyromancer' and hr['dead'] and not hr.get('queued') and now >= hr['respawnAt']:
                cost = 150 + 40 * hr['level']
                if p['gold'] >= cost and p['population'] + 5 <= p['popCap']:
                    cmds.append({'type': 'revive', 'hero': hr['type']}); p['gold'] -= cost
                else:
                    self.reserve_g += cost

        # ===== army production =====
        for b in myb:
            nfoot = sum(1 for u in army if u['type'] == 'footman') + queued('footman')
            if b['type'] == 'barracks' and b['complete'] and len(b['queue']) < 1 and nfoot < (6 if now < 120 else 10):
                if p['gold'] >= 90 + self.reserve_g and p['wood'] >= 10 and p['population'] + 2 <= p['popCap']:
                    cmds.append({'type': 'train', 'unit': 'footman', 'building': b['id']})
                    p['gold'] -= 90; p['wood'] -= 10; p['population'] += 2
            if b['type'] == 'range' and b['complete'] and len(b['queue']) < 2:
                nfoot = sum(1 for u in army if u['type'] == 'footman') + queued('footman')
                narch = sum(1 for u in army if u['type'] == 'archer') + queued('archer')
                if p['gold'] >= 95 + self.reserve_g and p['wood'] >= 25 + self.reserve_w and p['population'] + 2 <= p['popCap']:
                    cmds.append({'type': 'train', 'unit': 'archer', 'building': b['id']})
                    p['gold'] -= 95; p['wood'] -= 25; p['population'] += 2
            if b['type'] == 'arcane' and b['complete'] and len(b['queue']) < 1:
                npriest = sum(1 for u in army if u['type'] == 'priest') + queued('priest')
                if npriest < 6 and p['gold'] >= 110 + self.reserve_g and p['wood'] >= 50 + self.reserve_w and p['population'] + 2 <= p['popCap']:
                    cmds.append({'type': 'train', 'unit': 'priest', 'building': b['id']})
                    p['gold'] -= 110; p['wood'] -= 50; p['population'] += 2

        # ===== military =====
        nodes = s['nodes']
        cx_mid = self.W / 2
        own_node = min(nodes, key=lambda n: dist(n, home)) if nodes else None
        rally = {'x': own_node['x'] - D * 40, 'y': own_node['y']} if own_node and dist(own_node, home) < 800 else {'x': home['x'] + D * 330, 'y': home['y']}
        boss_alive = any(u['type'] == 'ancient' and u['hp'] > 0 for u in s['units'])
        outer = [n for n in nodes if abs(n['x'] - cx_mid) < 60 and abs(n['y'] - self.H / 2) > 500]
        # ---- garrisons on outer shrines (north/south) ----
        alive_ids = {u['id']: u for u in army}
        for nid in list(self.garrison):
            self.garrison[nid] = [i for i in self.garrison[nid] if i in alive_ids]
        gset = set(i for v in self.garrison.values() for i in v)
        camps_left = [c for c in s['camps'] if not c['cleared'] and c['id'] != 'boss' and dist(c, home) < 900]
        def foes_near(pt, r):
            return [e for e in enemies if e['type'] != 'worker' and dist(e, pt) < r]
        home_threat = any(dist(e, home) < 900 and e['type'] != 'worker' for e in enemies)
        if now > 20 and (not camps_left or now > 60) and not home_threat and not self.attacking:
            for n in outer:
                g = self.garrison.setdefault(n['id'], [])
                if len(g) >= 2:
                    continue
                if len(foes_near(n, 450)) > 2:
                    continue
                pool = [u for u in army if u['type'] == 'footman' and u['id'] not in gset]
                if len(pool) < (2 if now < 60 else 8):
                    continue
                u = min(pool, key=lambda u: dist(u, n))
                g.append(u['id']); gset.add(u['id'])
        army_main = [u for u in army if u['id'] not in gset]
        threats = [e for e in enemies if dist(e, home) < 900]
        enemy_army = [e for e in enemies if e['type'] != 'worker']
        def power(us):
            t = 0
            for u in us:
                if u['type'] == 'worker':
                    continue
                t += u['hp'] / 300.0 * (2.5 if u.get('hero') else 1)
            return t
        mypow = power(army) + power(heroes)
        epow = power(enemy_army)
        maxed = p['population'] >= min(p['popCap'], 120) - 6 and p['popCap'] >= 100
        if not self.attacking and now > 150 and (mypow > epow * 1.3 + 3 or maxed and mypow > epow * 0.9) and len(army) >= 14:
            self.attacking = True
        if self.attacking and (mypow < epow * 1.0 or len(army) < 7):
            self.attacking = False

        camps = [c for c in s['camps'] if not c['cleared'] and c['id'] != 'boss']
        mycamps = sorted([c for c in camps if dist(c, home) < 900], key=lambda c: dist(c, home))

        target_pt = None; mode = 'hold'
        if threats:
            # defend: closest threat to the hall
            t = min(threats, key=lambda e: dist(e, home))
            target_pt = {'x': t['x'], 'y': t['y']}; mode = 'defend'
        elif self.attacking and eb:
            ths_e = [b for b in eb if b['type'] == 'townhall'] or eb
            # nearest enemy building to our army centroid, prioritizing towers near path
            tgt = min(ths_e, key=lambda b: dist(b, home))
            target_pt = {'x': tgt['x'], 'y': tgt['y']}; mode = 'attack'
        elif mycamps and now < 140 and hero and len(army_main) >= 3:
            c = mycamps[0]
            target_pt = {'x': c['x'], 'y': c['y']}; mode = 'camp'
        else:
            target_pt = rally; mode = 'hold'
            mainpow = power(army_main) + power(heroes)
            cands = []
            for n in nodes:
                if n['owner'] == me and n.get('capturer') in (None, me):
                    continue
                if boss_alive and abs(n['x'] - cx_mid) < 60 and abs(n['y'] - self.H / 2) < 500:
                    continue
                ep = power(foes_near(n, 550))
                if len(army_main) < 4 or ep > mainpow * 0.7:
                    continue
                if dist(n, home) > self.W * 0.55 and mypow < epow * 1.2:
                    continue
                cands.append(n)
            if cands:
                n = min(cands, key=lambda n: dist(n, home))
                target_pt = {'x': n['x'], 'y': n['y']}; mode = 'node'

        fighters = army_main + [h for h in heroes if h['type'] != 'pyromancer']
        foe_units = [e for e in enemies if e['type'] != 'worker' or mode == 'defend']
        if mode == 'camp':
            foe_units = foe_units + [u for u in s['units'] if u['owner'] == -1 and u['type'] == 'sentinel' and dist(u, target_pt) < 350]
        ent = {e['id']: e for e in s['units'] + s['buildings']}
        etown = None
        if mode == 'attack':
            etown = min([b for b in eb if b['type'] == 'townhall'] or eb, key=lambda b: dist(b, home))
        for u in fighters:
            if u['type'] == 'priest':
                # priests follow behind the army
                o = u.get('order') or {}
                want = self.route(s, u, target_pt)
                if not (o.get('type') == 'attackMove' and math.hypot(o.get('x', -999) - want['x'], o.get('y', -999) - want['y']) < 150) and now - self.mem.get(u['id'], -99) > 2:
                    self.mem[u['id']] = now
                    cmds.append({'type': 'attackMove', 'units': [u['id']], 'x': round(want['x'], 1), 'y': round(want['y'], 1)})
                continue
            o = u.get('order') or {}
            if u.get('attack') or u.get('casting'):
                continue
            near = [e for e in foe_units if dist(e, u) < (520 if mode != 'hold' else 380)]
            if mode == 'hold' and near:
                near = [e for e in near if dist(e, home) < 1100]
            cur = ent.get(o.get('target')) if o.get('type') == 'attack' else None
            if near:
                if cur and cur.get('owner') != -1 and 'queue' not in cur and dist(cur, u) < 450:
                    continue
                if cur and mode == 'camp' and dist(cur, u) < 450:
                    continue
                if now - self.mem.get(u['id'], -99) < 0.75:
                    continue
                t = min(near, key=lambda e: dist(e, u) * (0.7 if e['type'] in ('archer', 'priest', 'crossbow', 'sorceress') else 1) * (0.8 if e.get('hero') else 1))
                if cur and cur['id'] == t['id']:
                    continue
                self.mem[u['id']] = now
                cmds.append({'type': 'attack', 'units': [u['id']], 'target': t['id']})
                continue
            if etown is not None:
                if cur and dist(cur, u) < 300:
                    continue
                if o.get('type') == 'attack' and o.get('target') == etown['id']:
                    continue
                if now - self.mem.get(u['id'], -99) < 1.0:
                    continue
                self.mem[u['id']] = now
                wp = self.route(s, u, etown)
                if wp is not etown:
                    if o.get('type') == 'attackMove' and math.hypot(o.get('x', -999) - wp['x'], o.get('y', -999) - wp['y']) < 100:
                        continue
                    cmds.append({'type': 'attackMove', 'units': [u['id']], 'x': round(wp['x'], 1), 'y': round(wp['y'], 1)})
                else:
                    cmds.append({'type': 'attack', 'units': [u['id']], 'target': etown['id']})
                continue
            want = self.route(s, u, target_pt)
            if o.get('type') == 'attackMove' and math.hypot(o.get('x', -999) - want['x'], o.get('y', -999) - want['y']) < 120:
                continue
            if o.get('type') == 'hold' and mode == 'hold' and dist(u, want) < 160:
                continue
            if now - self.mem.get(u['id'], -99) < 1.5:
                continue
            self.mem[u['id']] = now
            cmds.append({'type': 'attackMove', 'units': [u['id']], 'x': round(want['x'], 1), 'y': round(want['y'], 1)})
        # group attack commands with same target
        merged = []; gt = {}
        for c in cmds:
            if c['type'] == 'attack':
                if c['target'] in gt:
                    gt[c['target']]['units'] += c['units']; continue
                gt[c['target']] = c
            merged.append(c)
        cmds = merged
        # group commands to save command slots
        cmds = self.merge(cmds)

        # garrison control
        for nid, ids in self.garrison.items():
            n = next((x for x in nodes if x['id'] == nid), None)
            if not n:
                continue
            fz = foes_near(n, 380)
            for i in ids:
                u = alive_ids[i]
                if u.get('attack') or now - self.mem.get(i, -99) < 1.5:
                    continue
                o = u.get('order') or {}
                if fz:
                    t = min(fz, key=lambda e: dist(e, u))
                    if o.get('type') == 'attack' and o.get('target') == t['id']:
                        continue
                    self.mem[i] = now
                    cmds.append({'type': 'attack', 'units': [i], 'target': t['id']})
                elif dist(u, n) > 70 and not (o.get('type') in ('attackMove', 'move') and math.hypot(o.get('x', -999) - n['x'], o.get('y', -999) - n['y']) < 60):
                    self.mem[i] = now
                    wp = self.route(s, u, n)
                    cmds.append({'type': 'attackMove', 'units': [i], 'x': round(wp['x'], 1), 'y': round(wp['y'], 1)})
        # footman shield when being hit by many
        for u in army:
            if u['type'] == 'footman' and u['hp'] < u['maxHp'] * 0.8 and (u['cooldowns'].get('u_guard', 0) <= now):
                near = [e for e in enemy_army if dist(e, u) < 300]
                if len(near) >= 2:
                    cmds.append({'type': 'cast', 'unit': u['id'], 'skill': 'u_guard'})
                    if len(cmds) > 16: break

        # ===== heroes (priority over unit orders) =====
        hc = []
        if hero:
            hc += self.hero_ctl(s, hero, enemies, eb, army_main, mode, target_pt, rally)
        for h in heroes:
            if h['type'] == 'vanguard':
                hc += self.vanguard_ctl(s, h, enemies, army + heroes)
            elif h['type'] != 'pyromancer':
                hc += self.generic_ctl(s, h, enemies, army + heroes, mode)
        casters = {c['unit'] for c in hc if c['type'] == 'cast'}
        rest = []
        for c in cmds:
            if 'units' in c and c['type'] in ('attack', 'attackMove', 'move', 'hold', 'stop'):
                us = [i for i in c['units'] if i not in casters]
                if not us:
                    continue
                c = dict(c, units=us)
            rest.append(c)
        # archers: rapid fire when engaged
        for u in army:
            if u['type'] == 'archer' and u['cooldowns'].get('u_rapid', 0) <= now and u.get('attack'):
                rest.append({'type': 'cast', 'unit': u['id'], 'skill': 'u_rapid'})
        return (hc + rest)[:20]

    def route(self, s, u, tgt):
        boss = next((b for b in s['units'] if b['type'] == 'ancient' and b['hp'] > 0), None)
        if not boss:
            return tgt
        dx, dy = tgt['x'] - u['x'], tgt['y'] - u['y']
        L = dx * dx + dy * dy or 1
        t = max(0, min(1, ((boss['x'] - u['x']) * dx + (boss['y'] - u['y']) * dy) / L))
        if math.hypot(u['x'] + t * dx - boss['x'], u['y'] + t * dy - boss['y']) > 480:
            return tgt
        side = -1 if u['y'] < boss['y'] else 1
        return {'x': boss['x'], 'y': boss['y'] + side * 680}

    def merge(self, cmds):
        out = []; groups = {}
        for c in cmds:
            if c['type'] in ('attackMove', 'move'):
                k = (c['type'], c['x'], c['y'])
                if k in groups:
                    groups[k]['units'] += c['units']; continue
                groups[k] = c
            out.append(c)
        return out

    def cluster(self, pts, radius):
        best = None; bc = 0
        for a in pts:
            c = sum(1 for b in pts if dist(a, b) < radius)
            if c > bc:
                bc = c; best = a
        if best is None:
            return None, 0
        near = [b for b in pts if dist(best, b) < radius]
        cx = sum(b['x'] for b in near) / len(near); cy = sum(b['y'] for b in near) / len(near)
        return {'x': cx, 'y': cy}, bc

    def ready(self, h, sk, now):
        sd = self.cat['skills'][sk]
        return h['cooldowns'].get(sk, 0) <= now and h['mana'] >= sd['mana'] and h['level'] >= sd['requiredLevel']

    def hero_ctl(self, s, h, enemies, eb, army, mode, target_pt, rally):
        now = s['now']; cmds = []
        if h.get('casting') or h['statuses'].get('stun', 0) > now or h['statuses'].get('silence', 0) > now:
            return cmds
        foes = [e for e in enemies if e['hp'] > 0]
        creeps = [u for u in s['units'] if u['owner'] == -1 and u['type'] == 'sentinel' and dist(u, h) < 700]
        targets = foes + (creeps if mode == 'camp' else [])
        near = [e for e in targets if dist(e, h) < 620]
        threat_close = [e for e in foes if dist(e, h) < 200 and e['type'] != 'worker']
        # blink away if in danger
        if h['hp'] < h['maxHp'] * 0.35 and threat_close and self.ready(h, 'p_blink', now):
            dx, dy = self.home['x'] - h['x'], self.home['y'] - h['y']; d = math.hypot(dx, dy) or 1
            x, y = h['x'] + dx / d * 320, h['y'] + dy / d * 320
            if not self.blocked(s, x, y, 20):
                return [{'type': 'cast', 'unit': h['id'], 'skill': 'p_blink', 'x': round(x, 1), 'y': round(y, 1)}]
        # dodge enemy zones
        for z in s.get('zones', []):
            if z['owner'] != self.me and z['kind'] != 'sanctuary' and dist(z, h) < z['radius'] + 25 and z['endsAt'] > now:
                dx, dy = h['x'] - z['x'], h['y'] - z['y']; d = math.hypot(dx, dy) or 1
                x = h['x'] + dx / d * (z['radius'] + 60 - d); y = h['y'] + dy / d * (z['radius'] + 60 - d)
                x = min(max(x, 40), self.W - 40); y = min(max(y, 40), self.H - 40)
                return [{'type': 'move', 'units': [h['id']], 'x': round(x, 1), 'y': round(y, 1)}]
        units_only = [e for e in near if e['type'] != 'worker' or len(near) < 3]
        if units_only:
            if self.ready(h, 'p_meteor', now):
                c, n = self.cluster([e for e in units_only if dist(e, h) < 540], 160)
                if c and (n >= 4 or any(e.get('hero') for e in units_only if dist(e, c) < 120) and n >= 2) and dist(c, h) <= 545:
                    return [{'type': 'cast', 'unit': h['id'], 'skill': 'p_meteor', 'x': round(c['x'], 1), 'y': round(c['y'], 1)}]
            if self.ready(h, 'p_flame', now):
                c, n = self.cluster([e for e in units_only if dist(e, h) < 540], 120)
                if c and (n >= 3 or mode == 'camp' and n >= 2) and dist(c, h) <= 545:
                    return [{'type': 'cast', 'unit': h['id'], 'skill': 'p_flame', 'x': round(c['x'], 1), 'y': round(c['y'], 1)}]
            if self.ready(h, 'p_bolt', now):
                inr = [e for e in units_only if dist(e, h) < 650]
                best = None; bn = 0
                for e in inr:
                    dx, dy = e['x'] - h['x'], e['y'] - h['y']; d = math.hypot(dx, dy) or 1
                    n = 0
                    for f in inr:
                        t = ((f['x'] - h['x']) * dx + (f['y'] - h['y']) * dy) / d
                        if 0 < t < 700:
                            px = h['x'] + dx / d * t; py = h['y'] + dy / d * t
                            if math.hypot(f['x'] - px, f['y'] - py) < 32 + f['r'] - 6:
                                n += 1
                    if n > bn:
                        bn = n; best = e
                if best and (bn >= 2 or best.get('hero') or mode == 'camp'):
                    return [{'type': 'cast', 'unit': h['id'], 'skill': 'p_bolt', 'x': round(best['x'], 1), 'y': round(best['y'], 1)}]
        if mode == 'attack':
            bl = [b for b in eb if dist(b, h) < 540]
            if bl:
                b = min(bl, key=lambda b: (b['type'] != 'townhall', b['type'] != 'tower', b['hp']))
                if dist(b, h) < 540:
                    for sk in ('p_meteor', 'p_flame'):
                        if self.ready(h, sk, now) and (sk == 'p_flame' or h['mana'] > 160):
                            return [{'type': 'cast', 'unit': h['id'], 'skill': sk, 'x': round(b['x'], 1), 'y': round(b['y'], 1)}]
        # positioning: stay behind army
        o = h.get('order') or {}
        if h.get('attack'):
            return cmds
        if army:
            ax = sum(u['x'] for u in army) / len(army); ay = sum(u['y'] for u in army) / len(army)
        else:
            ax, ay = rally['x'], rally['y']
        tp = target_pt or rally
        dx, dy = tp['x'] - ax, tp['y'] - ay; d = math.hypot(dx, dy) or 1
        # stand 120 behind army centroid towards target
        want = {'x': ax - dx / d * 110 if d > 50 else ax - self.dir * 100, 'y': ay - dy / d * 110 if d > 50 else ay}
        close_foe = min(foes, key=lambda e: dist(e, h)) if foes else None
        if close_foe and dist(close_foe, h) < 240 and close_foe['type'] != 'worker' and h['hp'] < h['maxHp'] * 0.6:
            dx, dy = h['x'] - close_foe['x'], h['y'] - close_foe['y']; d = math.hypot(dx, dy) or 1
            want = {'x': h['x'] + dx / d * 150, 'y': h['y'] + dy / d * 150}
            typ = 'move'
        else:
            typ = 'attackMove'
        want['x'] = min(max(want['x'], 40), self.W - 40); want['y'] = min(max(want['y'], 40), self.H - 40)
        if self.blocked(s, want['x'], want['y'], 22):
            want = {'x': ax, 'y': ay}
        last = self.mem.get(h['id'], -99)
        if (o.get('type') == 'hold' and dist(h, want) > 90) or (math.hypot(o.get('x', -999) - want['x'], o.get('y', -999) - want['y']) > 140 and now - last > 1.0) or typ == 'move' and now - last > 0.5:
            if not (typ == 'attackMove' and o.get('type') == 'hold' and dist(h, want) < 90):
                self.mem[h['id']] = now
                cmds.append({'type': typ, 'units': [h['id']], 'x': round(want['x'], 1), 'y': round(want['y'], 1)})
        return cmds

    def generic_ctl(self, s, h, enemies, friends, mode):
        now = s['now']; out = []
        if h.get('casting') or h['statuses'].get('stun', 0) > now or h['statuses'].get('silence', 0) > now:
            return out
        foes = [e for e in enemies if e['hp'] > 0 and e['type'] != 'worker' and dist(e, h) < 700]
        if mode == 'camp':
            foes += [u for u in s['units'] if u['owner'] == -1 and u['hp'] > 0 and u['type'] == 'sentinel' and dist(u, h) < 600]
        # dodge enemy zones
        for z in s.get('zones', []):
            if z['owner'] != self.me and z['kind'] != 'sanctuary' and dist(z, h) < z['radius'] + 20 and z['endsAt'] > now:
                dx, dy = h['x'] - z['x'], h['y'] - z['y']; d = math.hypot(dx, dy) or 1
                x = h['x'] + dx / d * (z['radius'] + 60 - d); y = h['y'] + dy / d * (z['radius'] + 60 - d)
                x = min(max(x, 40), self.W - 40); y = min(max(y, 40), self.H - 40)
                return [{'type': 'move', 'units': [h['id']], 'x': round(x, 1), 'y': round(y, 1)}]
        # low hp retreat
        close = [e for e in foes if dist(e, h) < 260]
        if h['hp'] < h['maxHp'] * 0.3 and close and now - self.mem.get(('ret', h['id']), -99) > 1:
            self.mem[('ret', h['id'])] = now
            dx, dy = self.home['x'] - h['x'], self.home['y'] - h['y']; d = math.hypot(dx, dy) or 1
            sk = next((k for k in self.cat['heroes'][h['type']]['skills'] if self.cat['skills'][k]['effect'] == 'blink'), None)
            if sk and self.ready(h, sk, now):
                r = self.cat['skills'][sk]['range'] - 10
                x, y = h['x'] + dx / d * r, h['y'] + dy / d * r
                if not self.blocked(s, x, y, 22):
                    return [{'type': 'cast', 'unit': h['id'], 'skill': sk, 'x': round(x, 1), 'y': round(y, 1)}]
            return [{'type': 'move', 'units': [h['id']], 'x': round(h['x'] + dx / d * 250, 1), 'y': round(h['y'] + dy / d * 250, 1)}]
        allies = [f for f in friends if f['hp'] > 0 and dist(f, h) < 650]
        for sk in self.cat['heroes'][h['type']]['skills']:
            if not self.ready(h, sk, now):
                continue
            sd = self.cat['skills'][sk]; eff = sd['effect']; rng = sd['range']; rad = sd.get('radius', 100)
            tgt = sd['target']
            if eff in ('blink', 'dash', 'repairArea', 'evade'):
                continue
            if eff in ('line', 'cone', 'blast', 'zone') and tgt == 'point':
                inr = [e for e in foes if dist(e, h) < rng - 10]
                c, n = self.cluster(inr, min(rad, 150))
                big = sd['mana'] >= 90
                hero_hit = c and any(e.get('hero') for e in inr if dist(e, c) < rad * 0.7)
                if c and (n >= (4 if big else 2) or hero_hit or (mode == 'camp' and n >= 1)) and dist(c, h) < rng:
                    return [{'type': 'cast', 'unit': h['id'], 'skill': sk, 'x': round(c['x'], 1), 'y': round(c['y'], 1)}]
            elif eff in ('blastTarget', 'drain', 'strike', 'dot', 'execute') and tgt == 'enemy':
                inr = [e for e in foes if dist(e, h) < rng + e['r'] - 5]
                if inr:
                    t = min(inr, key=lambda e: (not e.get('hero'), e['hp']))
                    return [{'type': 'cast', 'unit': h['id'], 'skill': sk, 'target': t['id']}]
            elif not foes and mode != 'camp':
                if eff == 'heal' and tgt == 'ally':
                    hurt = [f for f in allies if f['maxHp'] - f['hp'] > sd['amount'] and dist(f, h) < rng]
                    if hurt:
                        t = max(hurt, key=lambda f: f['maxHp'] - f['hp'])
                        return [{'type': 'cast', 'unit': h['id'], 'skill': sk, 'target': t['id']}]
                continue
            elif eff == 'heal' and tgt == 'ally':
                hurt = [f for f in allies if f['maxHp'] - f['hp'] > sd['amount'] * 0.8 and dist(f, h) < rng]
                if hurt:
                    t = max(hurt, key=lambda f: (1.5 if f.get('hero') else 1) * (f['maxHp'] - f['hp']))
                    return [{'type': 'cast', 'unit': h['id'], 'skill': sk, 'target': t['id']}]
            elif eff == 'healArea' or (eff == 'shield' and tgt == 'point') or eff == 'sanctuary':
                hurt = [f for f in allies if f['hp'] < f['maxHp'] * (0.65 if eff != 'shield' else 0.85) and dist(f, h) < rng]
                c, n = self.cluster(hurt, min(rad, 200))
                need = 5 if sd['mana'] >= 100 else 3
                if c and (n >= need or (eff != 'shield' and any(f.get('hero') and f['hp'] < f['maxHp'] * 0.4 for f in hurt if dist(f, c) < rad))):
                    return [{'type': 'cast', 'unit': h['id'], 'skill': sk, 'x': round(c['x'], 1), 'y': round(c['y'], 1)}]
            elif eff == 'shield' and tgt == 'ally':
                hurt = [f for f in allies if dist(f, h) < rng and f['hp'] < f['maxHp'] * 0.7 and any(dist(e, f) < 300 for e in foes)]
                if hurt:
                    t = max(hurt, key=lambda f: (2 if f.get('hero') else 1) * (f['maxHp'] - f['hp']))
                    return [{'type': 'cast', 'unit': h['id'], 'skill': sk, 'target': t['id']}]
            elif eff == 'shield' and tgt == 'self':
                if h['hp'] < h['maxHp'] * 0.8 and close:
                    return [{'type': 'cast', 'unit': h['id'], 'skill': sk}]
            elif eff == 'taunt':
                if len(close) >= 3 and h['hp'] > h['maxHp'] * 0.5:
                    return [{'type': 'cast', 'unit': h['id'], 'skill': sk}]
            elif eff == 'summon':
                near = [e for e in foes if dist(e, h) < rng + 150]
                if near:
                    e = min(near, key=lambda e: dist(e, h)); d = dist(e, h) or 1
                    k = min(1, (rng - 20) / d)
                    x, y = h['x'] + (e['x'] - h['x']) * k, h['y'] + (e['y'] - h['y']) * k
                    if not self.blocked(s, x, y, 18):
                        return [{'type': 'cast', 'unit': h['id'], 'skill': sk, 'x': round(x, 1), 'y': round(y, 1)}]
            elif eff == 'buff' and tgt == 'point':
                c, n = self.cluster([f for f in allies if dist(f, h) < rng], min(rad, 200))
                if c and n >= 6 and len(foes) >= 4:
                    return [{'type': 'cast', 'unit': h['id'], 'skill': sk, 'x': round(c['x'], 1), 'y': round(c['y'], 1)}]
            elif eff == 'dispel':
                sm = [e for e in foes if e.get('summoned') or e.get('shield', 0) > 50]
                c, n = self.cluster([e for e in sm if dist(e, h) < rng], rad)
                if c and n >= 2:
                    return [{'type': 'cast', 'unit': h['id'], 'skill': sk, 'x': round(c['x'], 1), 'y': round(c['y'], 1)}]
        return out

    def vanguard_ctl(self, s, h, enemies, friends):
        now = s['now']
        if h.get('casting') or h['statuses'].get('stun', 0) > now or h['statuses'].get('silence', 0) > now:
            return []
        foes = [e for e in enemies if dist(e, h) < 500 and e['type'] != 'worker']
        if not foes:
            return []
        if self.ready(h, 'v_sanctuary', now):
            c, n = self.cluster([f for f in friends if dist(f, h) < 520], 180)
            if c and n >= 6:
                return [{'type': 'cast', 'unit': h['id'], 'skill': 'v_sanctuary', 'x': round(c['x'], 1), 'y': round(c['y'], 1)}]
        if self.ready(h, 'v_shield', now):
            c, n = self.cluster([f for f in friends if dist(f, h) < 400 and f['hp'] < f['maxHp'] * 0.9], 140)
            if c and n >= 3:
                return [{'type': 'cast', 'unit': h['id'], 'skill': 'v_shield', 'x': round(c['x'], 1), 'y': round(c['y'], 1)}]
        if self.ready(h, 'v_heal', now):
            hurt = [f for f in friends if dist(f, h) < 560 and f['maxHp'] - f['hp'] > 220]
            if hurt:
                t = max(hurt, key=lambda f: (2 if f.get('hero') else 1) * (f['maxHp'] - f['hp']))
                return [{'type': 'cast', 'unit': h['id'], 'skill': 'v_heal', 'target': t['id']}]
        if self.ready(h, 'v_charge', now):
            tg = [e for e in foes if 150 < dist(e, h) < 420]
            c, n = self.cluster(tg, 90)
            if c and n >= 3 and not self.blocked(s, c['x'], c['y'], 20):
                return [{'type': 'cast', 'unit': h['id'], 'skill': 'v_charge', 'x': round(c['x'], 1), 'y': round(c['y'], 1)}]
        return []


def main():
    ag = Agent()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            s = json.loads(line)
            if s.get('lastErrors'):
                log('errors', s['now'], json.dumps(s['lastErrors'], ensure_ascii=False)[:400])
            cmds = ag.decide(s) if s.get('status') == 'playing' else []
        except Exception as e:
            import traceback; traceback.print_exc(file=sys.stderr)
            cmds = []
        sys.stdout.write(json.dumps({'commands': cmds}, ensure_ascii=False) + '\n')
        sys.stdout.flush()

if __name__ == '__main__':
    main()
