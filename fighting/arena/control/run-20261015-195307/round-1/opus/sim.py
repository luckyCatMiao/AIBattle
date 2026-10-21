# Python 移植的铁拳谱规则核心（仅用于 agent 内部前瞻搜索；以 simulation.js 为准）
import math

HZ = 20
GROUND = 500
WALL_L, WALL_R, WIDTH = 60, 1220, 1280
PUSH_W, PUSH_H = 56, 110
GUARD_MAX = 120
GUARD_REGEN = 0.12
COMBO_SCALE = [1.0, 0.90, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30]
THROW_SCALE = 0.45
JUMP_FRAMES, JUMP_HEIGHT = 34, 132
JUMP_FWD, JUMP_BACK = 210, 150
WAKE_INV = 6

AIR_MOVE = {
    'lp': dict(name='空中轻拳', startup=4, active=6, recovery=6, damage=60, chip=6, hitstun=12, blockstun=8, guard='overhead',
               hitbox=dict(x=54, y=-30, w=70, h=46), pushback=14, hitstop=4, meterGain=8, cancelable=False),
    'hp': dict(name='空中重拳', startup=8, active=6, recovery=10, damage=108, chip=12, hitstun=16, blockstun=10, guard='overhead',
               hitbox=dict(x=60, y=-34, w=84, h=52), pushback=22, hitstop=6, meterGain=10, cancelable=False),
    'lk': dict(name='空中轻腿', startup=4, active=6, recovery=6, damage=58, chip=6, hitstun=12, blockstun=8, guard='overhead',
               hitbox=dict(x=56, y=-28, w=72, h=48), pushback=14, hitstop=4, meterGain=8, cancelable=False),
    'hk': dict(name='空中重腿', startup=9, active=6, recovery=12, damage=114, chip=13, hitstun=17, blockstun=11, guard='overhead',
               hitbox=dict(x=62, y=-36, w=90, h=56), pushback=24, hitstop=6, meterGain=10, cancelable=False),
}
MOTIONS = {'qcf': ['D', 'DF', 'F'], 'qcb': ['D', 'DB', 'B'], 'dp': ['F', 'D', 'DF'], 'hcb': ['F', 'DF', 'D', 'DB', 'B']}
BTN_KEY = {'LP': 'lp', 'HP': 'hp', 'LK': 'lk', 'HK': 'hk'}


def sign(v):
    return -1 if v < 0 else 1


def clamp(v, a, b):
    return max(a, min(b, v))


def is_up(d): return d in ('U', 'UF', 'UB')
def is_down(d): return d in ('D', 'DF', 'DB')
def is_fwd(d): return d in ('F', 'UF', 'DF')
def is_back(d): return d in ('B', 'UB', 'DB')
def is_guard(d): return d in ('B', 'DB')


def overlaps(a, b):
    return a[0] < b[0] + b[2] and a[0] + a[2] > b[0] and a[1] < b[1] + b[3] and a[1] + a[3] > b[1]


class F:
    __slots__ = ('owner', 'char', 'd', 'x', 'y', 'vx', 'vy', 'facing', 'hp', 'meter', 'guard', 'state', 'stateAt',
                 'move', 'hist', 'held', 'hitTaken', 'hitTakenAt', 'hitstunLeft', 'blockstunLeft', 'invulnUntil',
                 'armorUntil', 'airborne', 'airMoveUsed', 'parryActive')

    def clone(self):
        n = F.__new__(F)
        for k in F.__slots__:
            setattr(n, k, getattr(self, k))
        n.hist = list(self.hist)
        if self.move is not None:
            n.move = dict(self.move)
        return n


class P:
    __slots__ = ('owner', 'x', 'y', 'vx', 'w', 'h', 'life', 'data', 'fuseAt', 'arc', 'arcFrame', 'dead')

    def clone(self):
        n = P.__new__(P)
        for k in P.__slots__:
            setattr(n, k, getattr(self, k))
        return n


class G:
    __slots__ = ('frames', 'hitstop', 'f', 'proj', 'over', 'roundFrames')

    def clone(self):
        n = G.__new__(G)
        n.frames = self.frames
        n.hitstop = self.hitstop
        n.f = [x.clone() for x in self.f]
        n.proj = [p.clone() for p in self.proj]
        n.over = self.over
        n.roundFrames = self.roundFrames
        return n


def new_fighter(cat, owner, char):
    f = F()
    f.owner = owner; f.char = char; f.d = cat[char]
    f.x = 420.0; f.y = float(GROUND); f.vx = 0.0; f.vy = 0.0; f.facing = 1
    f.hp = 1000.0; f.meter = 0.0; f.guard = 120.0
    f.state = 'stand'; f.stateAt = 0; f.move = None; f.hist = []; f.held = ('N', None)
    f.hitTaken = 0; f.hitTakenAt = -999; f.hitstunLeft = 0; f.blockstunLeft = 0
    f.invulnUntil = 0; f.armorUntil = 0; f.airborne = False; f.airMoveUsed = False; f.parryActive = 0
    return f


def hurtbox(f):
    h = PUSH_H * 0.72 if f.state == 'crouch' else PUSH_H
    return (f.x - PUSH_W / 2, f.y - h, PUSH_W, h)


def hitbox(f):
    m = f.move
    if not m or 'hitbox' not in m['data']:
        return None
    d = m['data']
    st = d.get('startup', 0); ac = d.get('active', 0)
    if m['frame'] < st or m['frame'] >= st + ac:
        return None
    h = d['hitbox']
    x = f.x + h['x'] - h['w'] / 2 if f.facing > 0 else f.x - h['x'] - h['w'] / 2
    return (x, f.y + h['y'], h['w'], h['h'])


def motion_matched(f, motion, btn):
    seq = MOTIONS.get(motion)
    h = f.hist
    if not seq or not h or h[-1][1] != btn:
        return False
    k = len(seq) - 1
    lb = 12
    i = len(h) - 1
    while i >= 0 and lb >= 0:
        if h[i][0] == seq[k]:
            k -= 1
            if k < 0:
                return True
        i -= 1; lb -= 1
    return False


def pressed_edge(f, btn):
    h = f.hist
    if not h or h[-1][1] != btn:
        return False
    return len(h) < 2 or h[-2][1] != btn


def start_move(g, f, name, data, kind):
    prev = (f.move or {}).get('linkDepth', 0) if f.move else 0
    f.state = 'stance' if kind == 'stance' else 'attack'
    f.stateAt = g.frames
    f.move = dict(kind=kind, name=name, data=data, frame=0, hasHit=False, projectileFired=False,
                  travelLeft=data['travel']['frames'] if 'travel' in data else 0,
                  hitsDone=0, hitsConsumed=0, canCancelUntil=None,
                  linkDepth=(prev or 1) if kind in ('normal', 'air') else 0, linkKey=None, teleported=False)
    if 'armor' in data:
        f.armorUntil = g.frames + data['armor'][1]
    if 'invuln' in data:
        f.invulnUntil = max(f.invulnUntil, g.frames + data['invuln'][1])


def opp(g, f):
    return g.f[1 - f.owner]


def try_start(g, f):
    c = f.d
    if not f.hist:
        return False
    btn = f.hist[-1][1]
    if f.airborne:
        if not btn or not pressed_edge(f, btn):
            return False
        for s in c['specials'].values():
            if not s.get('airOnly') or btn != s['button']:
                continue
            start_move(g, f, s['name'], s, 'special'); f.airMoveUsed = True; return True
        k = BTN_KEY.get(btn)
        if k:
            m = AIR_MOVE[k]
            start_move(g, f, m['name'], m, 'air'); f.airMoveUsed = True; return True
        return False
    if not btn:
        return False
    sp = c['super']
    if f.meter >= sp['cost'] and btn == sp['button'] and motion_matched(f, sp['motion'], btn):
        f.meter = 0
        start_move(g, f, sp['name'], sp, 'super'); return True
    for s in c['specials'].values():
        if s.get('airOnly') or btn != s['button'] or not motion_matched(f, s['motion'], btn):
            continue
        kind = s.get('kind')
        if kind == 'throw':
            if not pressed_edge(f, btn):
                continue
            o = opp(g, f)
            near = abs(o.x - f.x) <= s['range'] and not o.airborne and o.state not in ('down', 'ko') and o.invulnUntil <= g.frames
            if not near:
                continue
            f.state = 'attack'; f.stateAt = g.frames
            f.move = dict(kind='throw', name=s['name'], data=s, frame=0, hasHit=True, hitsDone=1, hitsConsumed=1,
                          canCancelUntil=None, linkDepth=0, travelLeft=0, projectileFired=False, teleported=False, linkKey=None)
            dmg = round(s['damage'] * THROW_SCALE)
            o.hp = max(0, o.hp - dmg)
            o.state = 'down'; o.stateAt = g.frames; o.airborne = False; o.vx = 0; o.vy = 0; o.move = None
            o.invulnUntil = g.frames + 36
            f.meter = min(100, f.meter + 16)
            if o.hp <= 0:
                ko(g, o)
            return True
        if kind == 'stance':
            if not pressed_edge(f, btn):
                continue
            start_move(g, f, s['name'], s, 'stance'); f.parryActive = g.frames + s['parryWindow']; return True
        if kind == 'move':
            if not pressed_edge(f, btn):
                continue
            start_move(g, f, s['name'], s, 'move'); return True
        start_move(g, f, s['name'], s, 'special'); return True
    k = BTN_KEY.get(btn)
    if k and pressed_edge(f, btn):
        m = c['normals'][k]
        start_move(g, f, m['name'], m, 'normal'); return True
    return False


def scale_for(i):
    return COMBO_SCALE[i] if i < len(COMBO_SCALE) else 0.3


def ko(g, v):
    v.state = 'ko'; v.move = None; v.airborne = False; v.vx = 0; v.vy = 0
    g.over = True


def apply_hit(g, a, v, d):
    now = g.frames
    if now - v.hitTakenAt > 45:
        v.hitTaken = 0
    dmg = max(1, round(d.get('damage', 0) * scale_for(v.hitTaken)))
    v.hp = max(0, v.hp - dmg)
    v.hitTaken += 1; v.hitTakenAt = now
    g.hitstop = max(g.hitstop, d.get('hitstop', 4))
    a.meter = min(100, a.meter + d.get('meterGain', 0))
    v.meter = min(100, v.meter + d.get('meterGainOnHitAsVictim', 5))
    if d.get('knockup') or d.get('launcher'):
        v.state = 'hitstun'; v.stateAt = now; v.airborne = True
        v.vx = -v.facing * 2.0; v.vy = -(d.get('knockup') or 12); v.move = None
    elif d.get('hardKnockdown'):
        v.state = 'down'; v.stateAt = now; v.move = None; v.airborne = False
        v.invulnUntil = now + 26 + WAKE_INV
    else:
        v.state = 'hitstun'; v.stateAt = now; v.move = None; v.airborne = False
    v.hitstunLeft = d.get('hitstun') or 12
    pushback(a, v, d.get('pushback') or 20)
    if v.hp <= 0:
        ko(g, v)


def apply_block(g, a, v, d):
    chip = max(0, round(d.get('chip', 0)))
    if chip:
        v.hp = max(1, v.hp - chip)
    v.guard = max(0, v.guard - (4 if chip else 2))
    v.state = 'blockstun'; v.stateAt = g.frames
    v.blockstunLeft = d.get('blockstun') or 7
    v.move = None
    g.hitstop = max(g.hitstop, min(4, d.get('hitstop', 4)))
    a.meter = min(100, a.meter + d.get('meterGainOnBlock', 3))
    v.meter = min(100, v.meter + 2)
    pushback(a, v, d.get('guardPushback') or 14)
    if v.guard <= 0:
        v.guard = GUARD_MAX * 0.35
        v.state = 'hitstun'; v.stateAt = g.frames; v.hitstunLeft = 30; v.move = None


def pushback(a, v, amt):
    dr = sign(v.x - a.x) or -v.facing
    v.vx += dr * amt * 0.16
    a.vx += -dr * amt * 0.07


def step(g):
    if g.over:
        return
    if g.hitstop > 0:
        g.hitstop -= 1
    else:
        upd_proj(g)
        for f in g.f:
            upd_fighter(g, f)
        resolve(g)
        separate(g)
    g.frames += 1
    g.roundFrames += 1
    if g.roundFrames >= 1200:
        g.over = True


def upd_fighter(g, f):
    now = g.frames
    o = opp(g, f)
    if not f.airborne and f.state not in ('attack', 'hitstun', 'stance'):
        f.facing = sign(o.x - f.x) if o.x != f.x else f.facing
    if f.state not in ('blockstun', 'hitstun', 'down'):
        f.guard = min(GUARD_MAX, f.guard + GUARD_REGEN)
    s = f.state
    if s == 'ko':
        return
    if s == 'attack':
        return tick_attack(g, f)
    if s == 'stance':
        m = f.move
        if not m:
            f.state = 'stand'; return
        m['frame'] += 1
        if m['frame'] >= m['data']['stance']:
            f.state = 'stand'; f.stateAt = now; f.move = None; f.parryActive = 0
        return
    if s == 'hitstun':
        if f.airborne:
            f.vy += 0.85; f.x += f.vx; f.y += f.vy; f.vx *= 0.985
            if f.y >= GROUND:
                f.y = GROUND; f.vy = 0; f.airborne = False; f.state = 'down'; f.stateAt = now
                f.invulnUntil = max(f.invulnUntil, now + 4 + WAKE_INV)
        else:
            f.vx *= 0.86; f.x += f.vx
            f.hitstunLeft -= 1
            if f.hitstunLeft <= 0:
                f.state = 'stand'; f.stateAt = now
        f.x = clamp(f.x, WALL_L, WALL_R)
        return
    if s == 'blockstun':
        f.blockstunLeft -= 1; f.vx *= 0.85
        if f.blockstunLeft <= 0:
            f.state = 'stand'; f.stateAt = now
        return phys(f)
    if s == 'down':
        f.vx *= 0.9
        if now - f.stateAt > 26 and not f.airborne:
            f.state = 'wakeup'; f.stateAt = now; f.invulnUntil = max(f.invulnUntil, now + WAKE_INV)
        return phys(f)
    if s == 'wakeup':
        f.vx *= 0.8
        if now - f.stateAt > 6:
            f.state = 'stand'; f.stateAt = now
        return phys(f)
    if s in ('jump', 'air'):
        if f.airborne:
            if f.state == 'jump' and not f.airMoveUsed and now - f.stateAt >= 2:
                try_start(g, f)
            f.vy += 0.62; f.x += f.vx; f.y += f.vy
            if f.y >= GROUND and f.vy > 0:
                f.y = GROUND; f.vy = 0; f.airborne = False; f.airMoveUsed = False; f.state = 'stand'; f.stateAt = now
            f.x = clamp(f.x, WALL_L, WALL_R)
            return
        f.state = 'stand'
    tick_ground(g, f)


def phys(f):
    f.x += f.vx; f.vx *= 0.86; f.x = clamp(f.x, WALL_L, WALL_R)


def tick_ground(g, f):
    d = f.held[0]
    if try_start(g, f):
        return
    if is_up(d):
        f.state = 'jump'; f.stateAt = g.frames; f.airborne = True; f.airMoveUsed = False
        f.vy = -math.sqrt(2 * 0.62 * JUMP_HEIGHT)
        if is_fwd(d):
            f.vx = f.facing * (JUMP_FWD / JUMP_FRAMES)
        elif is_back(d):
            f.vx = -f.facing * (JUMP_BACK / JUMP_FRAMES)
        else:
            f.vx = 0
        f.x = clamp(f.x, WALL_L, WALL_R)
        return
    if is_down(d):
        f.state = 'crouch'; f.stateAt = g.frames; return
    f.state = 'stand'
    if is_fwd(d):
        f.x += f.facing * f.d['speed']
    elif is_back(d):
        f.x -= f.facing * f.d['speed'] * 0.78
    f.x = clamp(f.x, WALL_L, WALL_R)


def tick_attack(g, f):
    m = f.move
    if not m:
        f.state = 'stand'; return
    m['frame'] += 1
    d = m['data']
    if 'travel' in d and m['travelLeft'] > 0:
        f.x += f.facing * (d['travel']['distance'] / d['travel']['frames'])
        f.vx = 0; m['travelLeft'] -= 1; f.x = clamp(f.x, WALL_L, WALL_R)
    if 'teleport' in d and not m.get('teleported'):
        m['teleported'] = True
        t = d['teleport']
        o = opp(g, f)
        if t.get('toBehind'):
            f.x = clamp(o.x - o.facing * abs(t['distance']), WALL_L, WALL_R)
        else:
            f.x = clamp(f.x + f.facing * t['distance'], WALL_L, WALL_R)
        f.facing = sign(o.x - f.x) if o.x != f.x else f.facing
    if 'projectile' in d and not m['projectileFired'] and m['frame'] >= d.get('startup', 0):
        spawn(g, f, d['projectile']); m['projectileFired'] = True
    hits = d.get('hits', 1)
    if hits > 1:
        per = max(1, (d.get('active') or 1) // hits)
        tgt = min(hits, max(0, m['frame'] - d.get('startup', 0)) // per)
        if tgt > m['hitsDone']:
            m['hitsDone'] = tgt
    if m['kind'] in ('normal', 'air') and m['canCancelUntil'] is not None and g.frames <= m['canCancelUntil']:
        if try_cancel(g, f):
            return
    if m['kind'] in ('normal', 'air') and m['frame'] >= d.get('startup', 0):
        if try_link(g, f):
            return
    total = d.get('startup', 0) + d.get('active', 0) + d.get('recovery', 0) + d.get('cinematic', 0)
    if m['frame'] >= total:
        f.state = 'stand'; f.stateAt = g.frames; f.move = None
        if f.airborne:
            f.state = 'air'


def try_cancel(g, f):
    c = f.d
    if not f.hist or not f.hist[-1][1]:
        return False
    btn = f.hist[-1][1]
    sp = c['super']
    if f.meter >= sp['cost'] and btn == sp['button'] and motion_matched(f, sp['motion'], btn):
        f.meter = 0; start_move(g, f, sp['name'], sp, 'super'); return True
    for s in c['specials'].values():
        if s.get('airOnly') or s.get('kind') in ('throw', 'stance', 'move'):
            continue
        if btn != s['button'] or not motion_matched(f, s['motion'], btn):
            continue
        start_move(g, f, s['name'], s, 'special'); return True
    return False


def try_link(g, f):
    m = f.move
    if not m or not m['hasHit'] or not f.hist:
        return False
    btn = f.hist[-1][1]
    if not btn or not pressed_edge(f, btn):
        return False
    k = BTN_KEY.get(btn)
    if not k or m['linkDepth'] >= 3 or (m['linkKey'] or '') == k:
        return False
    if opp(g, f).state != 'hitstun':
        return False
    nd = f.d['normals'][k]
    depth = m['linkDepth'] or 1
    start_move(g, f, nd['name'], nd, 'normal')
    f.move['linkDepth'] = depth + 1
    f.move['linkKey'] = k
    return True


def spawn(g, f, pd):
    p = P()
    p.owner = f.owner; p.x = f.x + f.facing * 72; p.y = f.y - 62; p.vx = pd['speed'] * f.facing
    p.w = pd['w']; p.h = pd['h']; p.life = pd.get('life', 120); p.data = pd
    p.fuseAt = pd.get('fuse', 0); p.arc = pd.get('arc'); p.arcFrame = 0; p.dead = False
    g.proj.append(p)


def upd_proj(g):
    for p in g.proj:
        if p.dead:
            continue
        if p.arc:
            p.arcFrame += 1
            p.x += (p.arc['distance'] / p.arc['frames']) * sign(p.vx or 1)
            p.y = GROUND - 62 - math.sin(math.pi * min(1, p.arcFrame / p.arc['frames'])) * p.arc['height']
            if p.arcFrame >= p.arc['frames']:
                p.arc = None; p.vx = 0; p.y = GROUND - 20
        else:
            p.x += p.vx
        if p.fuseAt > 0:
            p.fuseAt -= 1
            if p.fuseAt <= 0:
                p.dead = True; explode(g, p); continue
        p.life -= 1
        if p.life <= 0 or p.x < 0 or p.x > WIDTH:
            p.dead = True
    g.proj = [p for p in g.proj if not p.dead]


def explode(g, p):
    box = (p.x - p.w, p.y - p.h, p.w * 2, p.h * 2)
    for f in g.f:
        if f.owner == p.owner or f.hp <= 0 or f.invulnUntil > g.frames:
            continue
        if overlaps(box, hurtbox(f)):
            apply_hit(g, g.f[p.owner], f, p.data)


def resolve(g):
    for atk in g.f:
        if atk.hp <= 0:
            continue
        m = atk.move
        if not m or m['kind'] in ('throw', 'move', 'stance'):
            continue
        df = opp(g, atk)
        if df.hp <= 0:
            continue
        box = hitbox(atk)
        if not box:
            continue
        d = m['data']
        multi = d.get('hits', 1) > 1
        if not multi and m['hasHit']:
            continue
        if multi and m['hitsDone'] <= m['hitsConsumed']:
            continue
        if not overlaps(box, hurtbox(df)):
            continue
        if multi:
            m['hitsConsumed'] = m['hitsDone']
        else:
            m['hasHit'] = True
        if df.invulnUntil > g.frames:
            continue
        if df.state == 'stance' and df.parryActive > g.frames and df.move:
            sp = df.d['specials']['parry']
            df.hp = max(1, df.hp - round(d.get('damage', 0) * sp['channelDamage']))
            df.parryActive = 0
            df.meter = min(100, df.meter + sp.get('meterOnParry', 20))
            g.hitstop = max(g.hitstop, 8)
            r = dict(sp['riposte']); r['kind'] = 'strike'
            start_move(g, df, '架式反击', r, 'special')
            continue
        if df.armorUntil > g.frames and df.state == 'attack':
            df.hp = max(1, df.hp - round(d.get('damage', 0) * 0.5))
            g.hitstop = max(g.hitstop, 4)
            continue
        gt = d.get('guard', 'mid')
        blocking = df.state in ('stand', 'crouch', 'blockstun') and is_guard(df.held[0])
        cb = df.held[0] == 'DB'
        guarded = False
        if blocking:
            guarded = True if gt == 'mid' else (cb if gt == 'low' else not cb)
        if guarded:
            apply_block(g, atk, df, d); m['hasHit'] = True
        else:
            apply_hit(g, atk, df, d); m['hasHit'] = True
            m['canCancelUntil'] = g.frames + 10
        if g.over:
            return
    for p in g.proj:
        if p.dead:
            continue
        if p.data.get('fuse') and (p.arc or p.fuseAt > 0):
            continue
        box = (p.x - p.w / 2, p.y - p.h / 2, p.w, p.h)
        for f in g.f:
            if f.owner == p.owner or f.hp <= 0:
                continue
            if not overlaps(box, hurtbox(f)) or f.invulnUntil > g.frames:
                continue
            a = g.f[p.owner]
            mv = f.move
            if f.state == 'attack' and mv and mv['data'].get('reflect') and mv['data'].get('startup', 0) <= mv['frame'] < mv['data'].get('startup', 0) + mv['data'].get('active', 0):
                p.owner = f.owner; p.vx = -p.vx * 1.35
                continue
            blocking = f.state in ('stand', 'crouch', 'blockstun') and is_guard(f.held[0])
            cb = f.held[0] == 'DB'
            guarded = blocking and (cb if p.data.get('low') else True)
            if guarded:
                apply_block(g, a, f, p.data)
            else:
                apply_hit(g, a, f, p.data)
            p.dead = True
            break
    g.proj = [p for p in g.proj if not p.dead]


def separate(g):
    a, b = g.f
    if a.hp <= 0 or b.hp <= 0:
        return
    d = b.x - a.x
    ad = abs(d)
    if ad >= PUSH_W or ad < 0.001:
        return
    push = (PUSH_W - ad) / 2
    dr = sign(d)
    if a.airborne and not b.airborne:
        b.x += dr * push * 2
    elif b.airborne and not a.airborne:
        a.x -= dr * push * 2
    else:
        a.x -= dr * push; b.x += dr * push
    a.x = clamp(a.x, WALL_L, WALL_R); b.x = clamp(b.x, WALL_L, WALL_R)


def push_input(f, inp):
    f.hist.append(inp)
    if len(f.hist) > 30:
        del f.hist[0]
    f.held = inp


def run(g, plans, n):
    """plans: [list of (dir,btn)] x2; runs n frames (plans shorter -> neutral)."""
    for i in range(n):
        if g.over:
            break
        for o in (0, 1):
            f = g.f[o]
            if f.hp <= 0:
                continue
            pl = plans[o]
            push_input(f, pl[i] if i < len(pl) else ('N', None))
        step(g)
