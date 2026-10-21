#!/usr/bin/env python3
# 铁拳谱参赛程序：每个决策窗口用 Python 移植的规则引擎做「我方候选计划 × 对手候选计划」前瞻搜索。
import sys, os, json, time, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim

TIME_BUDGET = float(os.environ.get("AGENT_BUDGET", "2.0"))
N = 15
CONT = 30  # 窗口后的延续帧数（用来估计硬直被确反）


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------- 计划生成 ----------------

def pad(seq, fill=('DB', None)):
    seq = list(seq)[:N]
    while len(seq) < N:
        seq.append(fill)
    return seq


MOT = {'qcf': ['D', 'DF', 'F'], 'qcb': ['D', 'DB', 'B'], 'dp': ['F', 'D', 'DF'], 'hcb': ['F', 'DF', 'D', 'DB', 'B']}


def special_inputs(motion, btn, hold=1):
    m = MOT[motion]
    out = [(d, None) for d in m[:-1]] + [(m[-1], btn)]
    for _ in range(hold - 1):
        out.append((m[-1], btn))
    return out


def prefix(kind, k):
    if k <= 0:
        return []
    return [({'walk': 'F', 'block': 'DB', 'sblock': 'B', 'wait': 'N'}[kind], None)] * k


def normal_chain(c, start_pre, buttons, cancel=None):
    """buttons: 普通技按键序列；第二键起在前一招起手帧后交替按以命中链接。cancel=(motion,btn) 取消必杀。"""
    seq = list(start_pre)
    b1 = buttons[0]
    st1 = c['normals'][sim.BTN_KEY[b1]]['startup']
    if cancel:
        mo, cb = cancel
        m = MOT[mo]
        seq.append((m[0], b1))
        for d in m[1:]:
            seq.append((d, None))
        while len(seq) < len(start_pre) + st1:
            seq.append((m[-1], None))
        for _ in range(9):
            seq.append((m[-1], cb))
        return pad(seq)
    seq.append(('N', b1))
    prev_st = st1
    for b in buttons[1:]:
        for _ in range(prev_st - 1):
            seq.append(('N', None))
        for i in range(8):
            seq.append(('N', b if i % 2 == 0 else None))
        prev_st = c['normals'][sim.BTN_KEY[b]]['startup']
    return pad(seq)


def char_specials(c):
    """返回 [(tag, motion, button, kindinfo)]"""
    out = []
    for key, s in c['specials'].items():
        if s.get('airOnly'):
            continue
        out.append((key, s['motion'], s['button'], s))
    return out


def gen_plans(c, me, foe, full=True):
    plans = {}
    plans['block'] = [('B', None)] * N
    plans['cblock'] = [('DB', None)] * N
    plans['walkF'] = [('F', None)] * N
    plans['walk5'] = pad(prefix('walk', 5))
    plans['walk10'] = pad(prefix('walk', 10))
    plans['neutral'] = [('N', None)] * N
    if full:
        plans['backoff'] = [('B', None)] * N
        plans['jumpB'] = pad([('UB', None)] + [('N', None)] * 14, ('N', None))
    # 跳入（空中技为中段 overhead）
    for t in ((6, 10, 14) if full else (10,)):
        for b in (('HK', 'HP', 'LK') if full else ('HK',)):
            seq = [('UF', None)] + [('N', None)] * (t - 1) + [('N', b)]
            plans['jump%s%d' % (b, t)] = pad(seq, ('DB', None))
    spec = char_specials(c)
    # 普通技 & 连段
    for pre_kind, pre_n in ((None, 0), ('walk', 4), ('walk', 8), ('block', 4)) if full else ((None, 0),):
        pre = prefix(pre_kind, pre_n) if pre_kind else []
        tag = '' if not pre_kind else '_%s%d' % (pre_kind, pre_n)
        for b in ('LP', 'LK', 'HP', 'HK'):
            plans['n%s%s' % (b, tag)] = normal_chain(c, pre, [b])
        if full or pre_n == 0:
            plans['c_LP_LK_HP' + tag] = normal_chain(c, pre, ['LP', 'LK', 'HP'])
            plans['c_LK_LP_HK' + tag] = normal_chain(c, pre, ['LK', 'LP', 'HK'])
            for key, mo, bt, s in spec:
                if s.get('kind') in ('throw', 'stance', 'move'):
                    continue
                if 'projectile' in s and pre_n:
                    continue
                for b in ('LP', 'LK', 'HP'):
                    plans['x%s_%s%s' % (b, key, tag)] = normal_chain(c, pre, [b], cancel=(mo, bt))
    # 必杀
    for pre_kind, pre_n in ((None, 0), ('block', 5), ('block', 9), ('walk', 6)) if full else ((None, 0), ('block', 6)):
        pre = prefix(pre_kind, pre_n) if pre_kind else []
        tag = '' if not pre_kind else '_%s%d' % (pre_kind, pre_n)
        for key, mo, bt, s in spec:
            plans['s_%s%s' % (key, tag)] = pad(pre + special_inputs(mo, bt), ('DB', None))
    # 双发投射物
    for key, mo, bt, s in spec:
        if 'projectile' in s and s['projectile'].get('speed', 0) > 0:
            tot = s['startup'] + s['recovery']
            if tot + 3 <= 40:
                seq = special_inputs(mo, bt)
                seq += [('DB', None)] * (tot - 2)
                seq += special_inputs(mo, bt)
                plans['s2_' + key] = pad(seq)
    if me.meter >= 100:
        sp = c['super']
        for pre_n in (0, 4, 8):
            plans['super%d' % pre_n] = pad(prefix('block', pre_n) + special_inputs(sp['motion'], sp['button'], 3))
        for b in ('LP', 'LK'):
            plans['xs%s' % b] = normal_chain(c, [], [b], cancel=(sp['motion'], sp['button']))
    return plans


# ---------------- 状态重建 ----------------

def get_cat(obs):
    c = obs.get('catalog') or {}
    if isinstance(c, dict) and isinstance(c.get('characters'), dict):
        return c['characters']
    return c


def find_move_data(c, name):
    for k, m in c['normals'].items():
        if m['name'] == name:
            return m, 'normal'
    for k, m in c['specials'].items():
        if m['name'] == name:
            return m, ('stance' if m.get('kind') == 'stance' else 'move' if m.get('kind') == 'move' else 'throw' if m.get('kind') == 'throw' else 'special')
    if c['super']['name'] == name:
        return c['super'], 'super'
    for m in sim.AIR_MOVE.values():
        if m['name'] == name:
            return m, 'air'
    if 'parry' in c['specials'] and name == '架式反击':
        r = dict(c['specials']['parry']['riposte']); r['kind'] = 'strike'
        return r, 'special'
    return None, None


class Tracker:
    def __init__(self):
        self.my_hist = []
        self.prev_proj = {}
        self.opp_hist = []  # 观察到的对手行为（用于调权）

    def build(self, obs):
        cat = get_cat(obs)
        me_id = obs['yourPlayer']
        now = obs['frame']
        g = sim.G()
        g.frames = now
        g.hitstop = 0
        g.over = False
        g.roundFrames = obs.get('roundFrame', 0)
        events = obs.get('events', [])
        fs = []
        for fo in obs['fighters']:
            f = sim.new_fighter(cat, fo['owner'], fo['char'])
            f.x = float(fo['x']); f.y = float(fo['y']); f.vx = float(fo['vx']); f.vy = float(fo['vy'])
            f.facing = fo['facing']; f.hp = float(fo['hp']); f.meter = float(fo['meter']); f.guard = float(fo['guard'])
            f.state = fo['state']; f.airborne = fo['airborne']; f.hitTaken = fo.get('combo', 0)
            f.stateAt = now - 3
            if fo.get('invulnerable'):
                f.invulnUntil = now + 4
            # 从事件推测进入当前状态的时间
            last_hit = None; last_block = None; last_down = None; last_jump = None
            for e in events:
                if e.get('type') == 'hit' and e.get('owner') == 1 - f.owner:
                    last_hit = e['frame']
                if e.get('type') == 'block' and e.get('owner') == f.owner:
                    last_block = e['frame']
                if e.get('type') == 'down' and e.get('owner') == f.owner:
                    last_down = e['frame']
                if e.get('type') == 'jump' and e.get('owner') == f.owner:
                    last_jump = e['frame']
            if f.state == 'hitstun':
                el = now - (last_hit if last_hit is not None else now)
                f.hitstunLeft = max(1, 17 - max(0, el - 6))
                f.hitTakenAt = last_hit if last_hit is not None else now
            elif f.state == 'blockstun':
                el = now - (last_block if last_block is not None else now)
                f.blockstunLeft = max(1, 10 - max(0, el - 3))
            elif f.state == 'down':
                st = last_down if last_down is not None else (last_hit if last_hit is not None else now)
                f.stateAt = st
                f.invulnUntil = max(f.invulnUntil, st + 32)
            elif f.state == 'wakeup':
                f.invulnUntil = now + 6
            elif f.state in ('jump', 'air'):
                f.stateAt = last_jump if last_jump is not None else now - 10
                f.airMoveUsed = f.state == 'air'
            if fo.get('combo') and f.state == 'hitstun':
                f.hitTakenAt = last_hit if last_hit is not None else now
            mv = fo.get('move')
            if mv:
                data, kind = find_move_data(f.d, mv['name'])
                if data is None:
                    f.move = None
                    if f.state in ('attack', 'stance'):
                        f.state = 'stand'
                else:
                    kind = mv.get('kind') or kind
                    st = data.get('startup', 0)
                    fr = mv['frame']
                    f.move = dict(kind=kind, name=mv['name'], data=data, frame=fr,
                                  hasHit=fr >= st + data.get('active', 0) or fr >= st,
                                  projectileFired=('projectile' in data and fr >= st),
                                  travelLeft=max(0, data['travel']['frames'] - fr) if 'travel' in data else 0,
                                  hitsDone=0, hitsConsumed=0, canCancelUntil=None, linkDepth=1, linkKey=None,
                                  teleported=fr >= 1)
                    if 'hits' in data and data['hits'] > 1:
                        per = max(1, (data.get('active') or 1) // data['hits'])
                        t = min(data['hits'], max(0, fr - st) // per)
                        f.move['hitsDone'] = t; f.move['hitsConsumed'] = t
                        f.move['hasHit'] = False
                    if kind == 'stance':
                        f.parryActive = now + max(0, data['parryWindow'] - fr)
                    if 'armor' in data:
                        f.armorUntil = now + max(0, data['armor'][1] - fr)
                    if 'invuln' in data:
                        f.invulnUntil = max(f.invulnUntil, now + max(0, data['invuln'][1] - fr))
            if f.owner == me_id:
                f.hist = [tuple(x) for x in self.my_hist[-30:]]
                if f.hist:
                    f.held = f.hist[-1]
            fs.append(f)
        fs.sort(key=lambda f: f.owner)
        g.f = fs
        # 投射物
        projs = []
        newprev = {}
        for po in obs.get('projectiles', []):
            owner = po['owner']
            src = fs[owner].d
            pd = None
            for s in src['specials'].values():
                if 'projectile' in s and s['projectile']['w'] == po['w'] and s['projectile']['h'] == po['h']:
                    pd = s['projectile']
            if pd is None:
                for c2 in cat.values():
                    for s in c2['specials'].values():
                        if 'projectile' in s and s['projectile']['w'] == po['w'] and s['projectile']['h'] == po['h']:
                            pd = s['projectile']
            if pd is None:
                continue
            p = sim.P()
            p.owner = owner; p.x = float(po['x']); p.y = float(po['y']); p.w = po['w']; p.h = po['h']
            p.data = pd; p.life = 80; p.dead = False
            p.fuseAt = po.get('fuse', 0) or 0
            prev = self.prev_proj.get(po['id'])
            if prev is not None and prev != p.x:
                dr = sim.sign(p.x - prev)
            else:
                dr = sim.sign(fs[1 - owner].x - p.x)
            p.vx = pd['speed'] * dr
            p.arc = None; p.arcFrame = 0
            if pd.get('arc') and p.fuseAt > 0 and p.y < sim.GROUND - 25:
                p.arc = pd['arc']; p.arcFrame = pd['fuse'] - p.fuseAt
                if p.vx == 0:
                    p.vx = dr
            newprev[po['id']] = p.x
            projs.append(p)
        self.prev_proj = newprev
        g.proj = projs
        return g


# ---------------- 评估 ----------------

def reach(c, key):
    h = c['normals'][key]['hitbox']
    return h['x'] + h['w'] / 2 + 28


def remaining_busy(f):
    if f.state == 'attack' and f.move:
        d = f.move['data']
        return d.get('startup', 0) + d.get('active', 0) + d.get('recovery', 0) + d.get('cinematic', 0) - f.move['frame']
    if f.state == 'stance' and f.move:
        return f.move['data']['stance'] - f.move['frame']
    if f.state == 'hitstun':
        return 30 if f.airborne else f.hitstunLeft
    if f.state == 'blockstun':
        return f.blockstunLeft
    return 0


def cont_plan(g, me):
    """延续阶段：对手处于可确反硬直且在射程内就出最重的可确反普通技，否则蹲防。"""
    f = g.f[me]; o = g.f[1 - me]
    if f.state not in ('stand', 'crouch', 'blockstun') or o.state in ('down', 'wakeup', 'ko') or o.airborne:
        return [('DB', None)] * CONT
    busy = remaining_busy(o) - (f.blockstunLeft if f.state == 'blockstun' else 0) - g.hitstop
    dist = abs(o.x - f.x)
    best = None
    if o.state == 'attack' and busy > 0:
        for k, b in (('hk', 'HK'), ('hp', 'HP'), ('lk', 'LK'), ('lp', 'LP')):
            n = f.d['normals'][k]
            if n['startup'] + 1 <= busy and reach(f.d, k) >= dist:
                if best is None or n['damage'] > best[0]:
                    best = (n['damage'], b)
    if best:
        return [('N', best[1])] + [('DB', None)] * (CONT - 1)
    return [('DB', None)] * CONT


def evaluate(g0, g, me, prefs):
    f = g.f[me]; o = g.f[1 - me]
    f0 = g0.f[me]; o0 = g0.f[1 - me]
    dmy = f0.hp - f.hp
    dop = o0.hp - o.hp
    s = dop - dmy * prefs['risk']
    if o.hp <= 0:
        s += 3000
    if f.hp <= 0:
        s -= 3000
    s += 0.6 * (f.meter - f0.meter) - 0.3 * (o.meter - o0.meter)
    # 距离偏好
    dist = abs(o.x - f.x)
    lo, hi = prefs['range']
    if dist < lo:
        s -= (lo - dist) * prefs['range_w']
    elif dist > hi:
        s -= (dist - hi) * prefs['range_w']
    # 角落
    wall = min(f.x - sim.WALL_L, sim.WALL_R - f.x)
    if wall < 80:
        s -= (80 - wall) * 0.15
    # 仍在飞行、朝对手去的我方投射物：按削血计价值
    for p in g.proj:
        if p.data.get('arc'):
            v = 0.5 * p.data.get('damage', 0)
        else:
            v = p.data.get('chip', 0) * 1.0
        toward = (o.x - p.x) * (p.vx or 0) > 0
        if p.owner == me and toward:
            s += v
        elif p.owner != me and (f.x - p.x) * (p.vx or 0) > 0:
            s -= v
    # 防御槽
    s += 0.3 * (f.guard - o.guard) - 0.3 * (f0.guard - o0.guard)
    return s


PREFS = {
    'kestrel': dict(range=(230, 520), range_w=0.06, risk=1.0),
    'aegis': dict(range=(150, 450), range_w=0.04, risk=1.0),
    'torv': dict(range=(60, 300), range_w=0.04, risk=1.0),
    'vex': dict(range=(60, 220), range_w=0.05, risk=1.0),
    'nyx': dict(range=(250, 450), range_w=0.05, risk=1.0),
    'sable': dict(range=(150, 400), range_w=0.04, risk=1.0),
}


def simulate(g0, me, my_plan, op_plan):
    g = g0.clone()
    plans = [None, None]
    plans[me] = my_plan; plans[1 - me] = op_plan
    sim.run(g, plans, N)
    if not g.over:
        c = [None, None]
        c[me] = cont_plan(g, me); c[1 - me] = cont_plan(g, 1 - me)
        sim.run(g, c, CONT)
    return g


class Agent:
    def __init__(self):
        self.tr = Tracker()
        self.opp_stats = {}  # 对手计划匹配统计（简单）
        self.last_round = None
        self.rng = random.Random(7)
        self.last_event = 0
        self.recent = []  # 对手近期行为标签（每窗口一个列表）

    def observe(self, obs, me):
        tags = []
        cat = get_cat(obs)
        ochar = None
        for fo in obs['fighters']:
            if fo['owner'] != me:
                ochar = fo['char']
        for e in obs.get('events', []):
            if e['id'] <= self.last_event:
                continue
            if e.get('owner') == 1 - me and ochar:
                c = cat[ochar]
                if e['type'] == 'move':
                    nm = e.get('name')
                    for k, m in c['normals'].items():
                        if m['name'] == nm:
                            tags.append('n' + k.upper())
                    for k, m in c['specials'].items():
                        if m['name'] == nm:
                            tags.append('s_' + k)
                    if c['super']['name'] == nm:
                        tags.append('super')
                    if nm and nm.startswith('空中'):
                        tags.append('jump')
                elif e['type'] == 'jump':
                    tags.append('jump')
                elif e['type'] == 'block':
                    tags.append('block')
        if obs.get('events'):
            self.last_event = max(self.last_event, max(e['id'] for e in obs['events']))
        self.recent.append(tags)
        self.recent = self.recent[-10:]

    def opp_weight(self, name):
        cnt = {}
        total = 0
        for i, tags in enumerate(self.recent):
            w = 0.6 + 0.4 * i / max(1, len(self.recent) - 1)
            for t in set(tags):
                cnt[t] = cnt.get(t, 0) + w
            total += w
        if total == 0:
            return 1.0
        w = 1.0
        if name in ('block', 'cblock'):
            w = 1.5 + 3 * cnt.get('block', 0) / total
        elif name.startswith('walk'):
            w = 1.5
        elif name.startswith('jump'):
            w = 0.8 + 3 * cnt.get('jump', 0) / total
        else:
            best = 0
            for t, v in cnt.items():
                if t in ('block', 'jump'):
                    continue
                if (t.startswith('s_') and (t + '_') in (name + '_')) or (t.startswith('s_') and name.startswith('x') and name.split('_')[1] == t[2:]) \
                        or (t.startswith('n') and name.startswith(t)) or (t == 'super' and name.startswith('super')):
                    best = max(best, v / total)
            w = 0.7 + 4 * best
        return w

    def decide(self, obs):
        t0 = time.time()
        me = obs['yourPlayer']
        if obs.get('status') != 'playing' or len(obs.get('fighters', [])) < 2:
            return [{'dir': 'DB', 'btn': None}] * N, 'idle'
        self.observe(obs, me)
        if obs.get('round') != self.last_round:
            self.last_round = obs.get('round')
            self.tr.my_hist = []
            self.tr.prev_proj = {}
        g0 = self.tr.build(obs)
        f = g0.f[me]; o = g0.f[1 - me]
        myp = gen_plans(f.d, f, o, full=True)
        opp = gen_plans(o.d, o, f, full=False)
        names = list(myp.keys())
        onames = list(opp.keys())
        prefs = dict(PREFS.get(f.char, PREFS['aegis']))
        # 领先且时间不多 -> 更保守
        left = 1200 - obs.get('roundFrame', 0)
        lead = f.hp - o.hp
        if lead > 0 and left < 300:
            prefs['risk'] = 1.6
        elif lead < 0 and left < 300:
            prefs['risk'] = 0.7
        # 对手权重：防御/靠近类计划更常见
        ow = {n: self.opp_weight(n) for n in onames}
        wsum = sum(ow.values())
        results = {}
        # 先评估一遍我方的所有计划对每个对手计划
        order = names[:]
        for n in order:
            if time.time() - t0 > TIME_BUDGET:
                break
            vals = []
            for on in onames:
                if time.time() - t0 > TIME_BUDGET + 0.8:
                    break
                g = simulate(g0, me, myp[n], opp[on])
                vals.append((evaluate(g0, g, me, prefs), ow[on]))
            if len(vals) < len(onames):
                break
            mean = sum(v * w for v, w in vals) / wsum
            worst = min(v for v, w in vals)
            results[n] = 0.6 * mean + 0.4 * worst
        if not results:
            plan = myp['cblock']; best = 'cblock'
        else:
            best = max(results, key=lambda k: results[k])
            plan = myp[best]
        self.tr.my_hist = (self.tr.my_hist + list(plan))[-30:]
        log('[agent] r%s f%d %s vs %s dist=%d hp %d/%d best=%s %.1f (%d plans, %.2fs)' % (
            obs.get('round'), obs['frame'], f.char, o.char, abs(o.x - f.x), f.hp, o.hp, best,
            results.get(best, 0), len(results), time.time() - t0))
        return [{'dir': d, 'btn': b} for d, b in plan], best


def main():
    ag = Agent()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
            inputs, note = ag.decide(obs)
        except Exception as e:  # 永远输出合法窗口
            log('[agent] error', repr(e))
            inputs, note = [{'dir': 'DB', 'btn': None}] * N, 'fallback'
        sys.stdout.write(json.dumps({'inputs': inputs[:N], 'note': note}, ensure_ascii=False) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
