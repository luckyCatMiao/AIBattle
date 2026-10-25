#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""横版闯关竞速 agent：复刻规则物理 + 前向搜索决策。"""
import sys, json, math, os
DEBUG = bool(os.environ.get('PLAT_DEBUG'))

DT = 0.05
TAU = math.tau

MIN_W, MAX_W, H = 150, 200, 16
GROUND_Y = 13
PW, PH = 0.72, 1.35
GRAV, MOVE_SPEED, ACCEL, AIR_ACCEL, FRICTION = 42.0, 6.8, 70.0, 40.0, 48.0
JUMP_SPEED, MAX_FALL, PUSH_SPEED = 14.0, 26.0, 4.2
MON_SPEED, MON_W, MON_H = 1.7, 0.72, 0.62
CRUMBLE_DELAY, CRUMBLE_RESPAWN = 0.55, 3.2
PLATFORM_W, PLATFORM_H = 2.4, 0.36
PLANT_HEIGHT, PLANT_OUT = 1.15, 1.25
SAW_R = 0.48
T_EMPTY, T_GROUND, T_BRICK, T_SPIKE, T_CRUMBLE = 0, 1, 2, 3, 4
G_TOP = H - GROUND_Y  # 3


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


class RNG:
    __slots__ = ('s',)

    def __init__(self, seed):
        v = seed if seed else 1
        self.s = int(v) & 0xFFFFFFFF
        if self.s == 0:
            self.s = 1

    def __call__(self):
        self.s = (self.s * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.s / 4294967296.0


def generate_level(seed):
    """精确复刻 catalog/simulation 的 generateLevel。"""
    base = int(seed) if seed else 1
    rng = RNG(((base * 7919 + 104729) & 0xFFFFFFFF))
    w = MIN_W + int(math.floor(rng() * (MAX_W - MIN_W + 1)))
    h = H
    tiles = [T_EMPTY] * (w * h)
    platforms, plants, saws = [], [], []
    G = h - GROUND_Y

    def put(x, y, t=T_GROUND):
        if 0 <= x < w and 0 <= y < h:
            tiles[y * w + x] = t

    def fill_ground(x0, x1, top=GROUND_Y):
        for x in range(x0, x1 + 1):
            for y in range(top, h):
                put(x, y, T_GROUND)

    def spike_at(x):
        put(x, GROUND_Y - 1, T_SPIKE)

    fill_ground(0, 11)
    fill_ground(w - 14, w - 1)

    x = 12
    last_saw = -99
    while x < w - 18:
        r = rng()
        if r < 0.26:
            ln = 5 + int(math.floor(rng() * 5))
            fill_ground(x, x + ln - 1)
            if ln >= 8 and rng() < 0.6:
                sw = 1 + int(math.floor(rng() * 3))
                sx = x + 2 + int(math.floor(rng() * (ln - sw - 4)))
                for k in range(sw):
                    spike_at(sx + k)
            if ln >= 8 and rng() < 0.4:
                plants.append({'x': x + ln - 2.5, 'y': G,
                               'period': 3.0 + rng() * (4.6 - 3.0), 'phase': rng() * TAU})
            x += ln
        elif r < 0.60:
            ln = 2 + int(math.floor(rng() * 3))
            if ln >= 4:
                cond = True
            else:
                cond = rng() < 0.45
            if cond:
                platforms.append({'fromx': x - 1.0, 'fromy': G + 1.5,
                                  'tox': x + ln + 0.2, 'toy': G + 1.5,
                                  'w': PLATFORM_W, 'h': PLATFORM_H,
                                  'period': 3.0 + rng() * 2.0, 'phase': rng() * TAU})
            elif rng() < 0.6:
                for k in range(ln):
                    for y in range(GROUND_Y, h):
                        put(x + k, y, T_CRUMBLE)
            x += ln
            fill_ground(x, x + 4)
            x += 5
        elif r < 0.78:
            fill_ground(x, x + 2, GROUND_Y - 1)
            x += 3
            fill_ground(x, x + 4)
            x += 5
        else:
            fill_ground(x, x + 7)
            plants.append({'x': x + 3.5, 'y': G,
                           'period': 3.0 + rng() * (4.6 - 3.0), 'phase': rng() * TAU})
            x += 8
        if rng() < 0.32 and x - last_saw > 20:
            last_saw = x
            saws.append({'fromx': x - 4.5, 'fromy': G + 1.0,
                         'tox': x + 3.5, 'toy': G + 1.0, 'r': SAW_R,
                         'period': 2.6 + rng() * 2.0, 'phase': rng() * TAU})
    fill_ground(w - 14, w - 1)
    return {'w': w, 'h': h, 'tiles': tiles, 'goalX': w - 4, 'startX': 2.5,
            'platforms': platforms, 'plants': plants, 'saws': saws}


# ---------------- 动态机关公式 ----------------
def platform_rect(pf, t, prev_t):
    def at(tt):
        k = 0.5 - 0.5 * math.cos(TAU * (tt / pf['period']) + pf['phase'])
        return (pf['fromx'] + (pf['tox'] - pf['fromx']) * k,
                pf['fromy'] + (pf['toy'] - pf['fromy']) * k)
    x, y = at(t)
    px, _ = at(prev_t)
    return {'x': x, 'y': y, 'w': pf['w'], 'h': pf['h'], 'top': y + pf['h'], 'dx': x - px}


def plant_height(pl, t):
    per = pl['period']
    ph = (t + pl['phase']) % per
    out = PLANT_OUT
    if ph >= out:
        return 0.0
    rise = min(1.0, ph / 0.25)
    fall = min(1.0, (out - ph) / 0.25)
    return PLANT_HEIGHT * clamp(min(rise, fall), 0.0, 1.0)


def saw_pos(s, t):
    k = 0.5 - 0.5 * math.cos(TAU * (t / s['period']) + s['phase'])
    return (s['fromx'] + (s['tox'] - s['fromx']) * k,
            s['fromy'] + (s['toy'] - s['fromy']) * k)


# ---------------- 静态几何 ----------------
def solid_at(geom, tx, ty, gone=None):
    w, h, tiles = geom
    if tx < 0 or tx >= w:
        return True
    if ty < 0 or ty >= h:
        return False
    k = ty * w + tx
    if gone and k in gone:
        return False
    t = tiles[k]
    return t == T_GROUND or t == T_BRICK or t == T_CRUMBLE


def solid_world(geom, x, y, gone=None):
    tx = int(math.floor(x))
    ty = geom[1] - 1 - int(math.floor(y))
    return solid_at(geom, tx, ty, gone)


def solid_box(geom, l, b, r, t, gone=None):
    w, h, _ = geom
    x0 = int(math.floor(l)); x1 = int(math.floor(r - 1e-9))
    y0 = int(math.floor(b)); y1 = int(math.floor(t - 1e-9))
    for x in range(x0, x1 + 1):
        if x < 0 or x >= w:
            if x < 0 or x >= w:
                return True
        for y in range(y0, y1 + 1):
            ty = h - 1 - y
            if ty < 0 or ty >= h:
                continue
            k = ty * w + x
            if gone and k in gone:
                continue
            tt = geom[2][k]
            if tt == T_GROUND or tt == T_BRICK or tt == T_CRUMBLE:
                return True
    return False


# ---------------- 玩家物理（逐帧复刻 updateRunner） ----------------
def step_player(x, y, vx, vy, og, move, jump, geom, prects, gone):
    accel = ACCEL if og else AIR_ACCEL
    if move != 0.0:
        target = move * MOVE_SPEED
        d = target - vx
        lim = accel * DT
        if d > lim:
            d = lim
        elif d < -lim:
            d = -lim
        vx += d
    elif og:
        vx *= math.exp(-FRICTION * DT)
        if abs(vx) < 0.05:
            vx = 0.0
    if jump and og:
        vy = JUMP_SPEED
        og = False
    vy = max(-MAX_FALL, vy - GRAV * DT)
    half = PW * 0.5
    x += vx * DT
    if solid_box(geom, x - half, y, x + half, y + PH, gone):
        if vx > 0:
            x = math.floor(x + half) - half - 1e-4
        elif vx < 0:
            x = math.floor(x - half) + 1 + half + 1e-4
        vx = 0.0
    y += vy * DT
    if solid_box(geom, x - half, y, x + half, y + PH, gone):
        if vy <= 0:
            y = math.floor(y) + 1 + 1e-4
            vy = 0.0
            og = True
        else:
            y = math.floor(y + PH) - PH - 1e-4
            vy = 0.0
    else:
        og = False
    for pr in prects:
        if (x + half) > pr['x'] and (x - half) < pr['x'] + pr['w']:
            if vy <= 0 and y <= pr['top'] + 0.28 and y >= pr['top'] - 0.4:
                y = pr['top']; vy = 0.0; og = True; x += pr['dx']
            elif y < pr['top'] and y + PH > pr['y']:
                if x < pr['x'] + pr['w'] * 0.5:
                    x = pr['x'] - half - 1e-4
                else:
                    x = pr['x'] + pr['w'] + half + 1e-4
                vx = 0.0
    if not (x == x and y == y) or y < -3.0:
        return None
    return (x, y, vx, vy, og)


def hazard_hit(x, y, geom, fd, mask=None):
    h = geom[1]
    w = geom[0]
    tiles = geom[2]
    # 地刺
    x0 = int(math.floor(x - 0.32)); x1 = int(math.floor(x + 0.32))
    y0 = int(math.floor(y + 0.02)); y1 = int(math.floor(y + PH - 0.08))
    for tx in range(x0, x1 + 1):
        if tx < 0 or tx >= w:
            continue
        if mask is not None and mask[0] <= tx < mask[1]:
            continue
        for yy in range(y0, y1 + 1):
            ty = h - 1 - yy
            if 0 <= ty < h and tiles[ty * w + tx] == T_SPIKE:
                return True
    for pl in fd['plants']:
        if pl[2] < 0.25:
            continue
        if abs(x - pl[0]) < 0.71 and y < pl[1] + pl[2] and y + PH > pl[1]:
            return True
    for (sx, sy) in fd['saws']:
        cx = sx
        if cx < x - 0.36: cx = x - 0.36
        elif cx > x + 0.36: cx = x + 0.36
        cy = sy
        if cy < y: cy = y
        elif cy > y + PH: cy = y + PH
        dx = sx - cx; dy = sy - cy
        if dx * dx + dy * dy < 0.53 * 0.53:
            return True
    for (mx, my) in fd['monsters']:
        if abs(x - mx) < 0.72 and y < my + MON_H and y + PH > my:
            return True
    return False


# ---------------- 关卡静态分析 ----------------
def spike_runs(geom):
    w, h, tiles = geom
    cols = []
    for x in range(w):
        hit = False
        for y in range(h):
            if tiles[y * w + x] == T_SPIKE:
                hit = True
                break
        cols.append(hit)
    runs = []
    s = -1
    for i in range(w + 1):
        v = i < w and cols[i]
        if v and s < 0:
            s = i
        elif not v and s >= 0:
            runs.append((s, i - s))
            s = -1
    return runs


def column_top(geom, x):
    w, h, tiles = geom
    for y in range(h):
        t = tiles[y * w + x]
        if t == T_GROUND or t == T_BRICK or t == T_CRUMBLE:
            return h - y
    return -99


# ---------------- 帧数据（动态机关预测） ----------------
def build_frame_data(ctx, obs, t0, nframes):
    """ctx: 每局缓存（gen、回退速度等）。返回 nframes 帧的机关状态，第 i 帧时间 t0+(i+1)*DT。"""
    geom = ctx['geom']
    gen = ctx.get('gen')
    valid = ctx.get('gen_valid', False)
    L = obs['level']
    w = geom[0]; h = geom[1]
    obs_plats = obs.get('platforms') or []
    obs_saws = obs.get('saws') or []
    obs_plants = obs.get('plants') or []
    if valid:
        plats = gen['platforms']
        saws = gen['saws']
        plants = gen['plants']
    else:
        plats = None
        saws = None
        plants = []
        for p in obs_plants:
            plants.append({'x': p['x'], 'y': p['y'], 'period': p.get('period') or 3.5,
                           'phase': p.get('phase') or 0.0})
        # 回退：平台/锯齿用观测值 + 速度外推
        ctx.setdefault('fb_plat', {})
        ctx.setdefault('fb_saw', {})
        for i, p in enumerate(obs_plats):
            ctx['fb_plat'][i] = (p['x'], p['y'], p['w'], p['h'], p.get('dx') or 0.0)
        tprev = ctx.get('last_t')
        prev_saw = ctx.get('last_saws') or []
        for i, s in enumerate(obs_saws):
            vx = 0.0
            if tprev is not None and i < len(prev_saw) and t0 > tprev + 1e-9:
                vx = (s['x'] - prev_saw[i][0]) / (t0 - tprev)
            ctx['fb_saw'][i] = (s['x'], s['y'], s.get('r', SAW_R), vx)
    ctx['last_t'] = t0
    if not valid:
        ctx['last_saws'] = [(s['x'], s['y']) for s in obs_saws]

    # 怪物前推
    mons = [[m['x'], m['y'], m['dir']] for m in (obs.get('monsters') or [])]
    # 钉刺 run（用于卡死图遮蔽）
    stuck = ctx.get('stuck')
    mask = None
    if stuck is not None:
        mask = (stuck[0], stuck[0] + stuck[1])

    # 定时塌陷砖：一列中只要有一块已塌/将塌，就把该列所有塌陷砖视为同步失效。
    # 真实规则里踩过 0.55s 后逐层塌落，留在残坑里最终会掉下去，规划时按整列空洞处理。
    col_win = {}
    for g in (obs.get('gone') or []):
        x = int(g['x'])
        end = t0 + float(g['left'])
        s, e = col_win.get(x, (float('-inf'), float('-inf')))
        col_win[x] = (s, max(e, end))
    for g in (obs.get('crumbling') or []):
        x = int(g['x'])
        c = t0 + float(g['left'])
        s, e = col_win.get(x, (float('inf'), float('-inf')))
        col_win[x] = (min(s, c), max(e, c + CRUMBLE_RESPAWN))
    timed = {}
    for x, (s, e) in col_win.items():
        if 0 <= x < w:
            for yy in range(h):
                if geom[2][yy * w + x] == T_CRUMBLE:
                    timed[yy * w + x] = (s, e)

    fds = []
    for i in range(nframes):
        t = t0 + (i + 1) * DT
        # 平台
        prects = []
        if valid:
            for pf in plats:
                prects.append(platform_rect(pf, t, t - DT))
        else:
            for idx, (px, py, pw, ph, dx) in ctx['fb_plat'].items():
                prects.append({'x': px + dx * (i + 1), 'y': py, 'w': pw, 'h': ph,
                               'top': py + ph, 'dx': dx})
        # 植物
        plist = []
        for pl in plants:
            plist.append((pl['x'], pl['y'], plant_height(pl, t)))
        # 锯齿
        slist = []
        if valid:
            for s in saws:
                slist.append(saw_pos(s, t))
        else:
            for idx, (sx, sy, r, vx) in ctx['fb_saw'].items():
                slist.append((sx + vx * (i + 1) * DT, sy))
        # 怪物
        mpos = []
        for m in mons:
            nx = m[0] + m[2] * MON_SPEED * DT
            wall = solid_world(geom, nx + m[2] * 0.5, m[1] + 0.4)
            gap = not solid_world(geom, nx + m[2] * 0.6, m[1] - 0.2)
            if wall or gap:
                m[2] = -m[2]
            else:
                m[0] = nx
            mpos.append((m[0], m[1]))
        # 塌陷
        gone = set()
        for k, (s, e) in timed.items():
            if s <= t < e:
                gone.add(k)
        fds.append({'prects': prects, 'plants': plist, 'saws': slist,
                    'monsters': mpos, 'gone': frozenset(gone), 't': t})
    return fds, mask


# ---------------- 搜索 ----------------
def _key(x, y, vx, vy, og):
    return (int(round(x * 20.0)), int(round(y * 100.0)), int(round(vx * 20.0)),
            int(round(vy * 100.0)), 1 if og else 0)


def project_landing(geom, fds, start, x, y, vx, vy, og, mask, maxf=28):
    n = len(fds)
    for k in range(maxf):
        idx = start + k
        if idx >= n:
            return None
        fd = fds[idx]
        r = step_player(x, y, vx, vy, og, 1.0, 0, geom, fd['prects'], fd['gone'])
        if r is None:
            return None
        if hazard_hit(r[0], r[1], geom, fd, mask):
            return None
        x, y, vx, vy, og = r
        if og:
            return (x, y, vx, vy, og)
    return None


def search_survive(geom, fds, start, init, horizon, mask, beam=600):
    """只允许 move=1，跳跃/不跳；返回存活的 (state, first5 actions)。"""
    x, y, vx, vy, og = init
    states = [(x, y, vx, vy, og, ())]
    for k in range(horizon):
        fd = fds[start + k]
        prects = fd['prects']; gone = fd['gone']
        nxt = {}
        for (sx, sy, svx, svy, sog, acts) in states:
            if sog:
                opts = (0, 1)
            else:
                opts = (0,)
            for jump in opts:
                r = step_player(sx, sy, svx, svy, sog, 1.0, jump, geom, prects, gone)
                if r is None:
                    continue
                if hazard_hit(r[0], r[1], geom, fd, mask):
                    continue
                key = _key(r[0], r[1], r[2], r[3], r[4])
                if key in nxt:
                    continue
                na = acts if len(acts) >= 5 else acts + (jump,)
                nxt[key] = (r[0], r[1], r[2], r[3], r[4], na)
        states = list(nxt.values())
        if not states:
            return None
        if len(states) > beam:
            states.sort(key=lambda s: (s[0], 1 if s[4] else 0, s[2]), reverse=True)
            states = states[:beam]
    best = None
    bestsc = None
    for st in states:
        if st[4]:
            sc = (st[0], 1, st[2])
        else:
            proj = project_landing(geom, fds, start + horizon, st[0], st[1], st[2], st[3], st[4], mask)
            if proj is None:
                continue
            sc = (st[0], 0, st[2])
        if bestsc is None or sc > bestsc:
            bestsc = sc
            best = st
    return best


def search_maxx(geom, fds, start, init, horizon, mask, beam=400):
    """最大化到达过的最大 x（允许死亡）。返回 (maxx, first5 actions)。"""
    x, y, vx, vy, og = init
    states = [(x, y, vx, vy, og, (), x)]
    best = (x, ())
    for k in range(horizon):
        fd = fds[start + k]
        prects = fd['prects']; gone = fd['gone']
        nxt = {}
        for (sx, sy, svx, svy, sog, acts, mx) in states:
            moves = (1.0, 0.0, -1.0)
            opts = (0, 1) if sog else (0,)
            for mv in moves:
                for jump in opts:
                    r = step_player(sx, sy, svx, svy, sog, mv, jump, geom, prects, gone)
                    if r is None:
                        # 掉坑：真实规则先复活再更新 maxX，故不计本帧 x
                        a = acts if len(acts) >= 5 else acts + ((mv, jump),)
                        if mx > best[0]:
                            best = (mx, a)
                        continue
                    nmx = mx if mx > r[0] else r[0]
                    if hazard_hit(r[0], r[1], geom, fd, mask):
                        # 危险物：updateRunner 先更新 maxX，再判定命中，故计入本帧 x
                        a = acts if len(acts) >= 5 else acts + ((mv, jump),)
                        if nmx > best[0]:
                            best = (nmx, a)
                        continue
                    key = _key(r[0], r[1], r[2], r[3], r[4])
                    old = nxt.get(key)
                    if old is not None and old[6] >= nmx:
                        continue
                    na = acts if len(acts) >= 5 else acts + ((mv, jump),)
                    nxt[key] = (r[0], r[1], r[2], r[3], r[4], na, nmx)
        states = list(nxt.values())
        if not states:
            break
        if len(states) > beam:
            states.sort(key=lambda s: (s[6], s[0]), reverse=True)
            states = states[:beam]
    for st in states:
        if st[6] > best[0]:
            best = (st[6], st[5])
    return best


def search_survive_air(geom, fds, start, init, horizon, mask, beam=600):
    """地面只前进/起跳，空中允许 1/0/-1 修正落点。
    仅在“全速前进必死且被对手尾随、不能原地等待/后退”时作为兜底：
    用空中刹车缩短跳跃距离，落到危险物之前，而不是继续全速跳进锯齿/食人花。"""
    x, y, vx, vy, og = init
    states = [(x, y, vx, vy, og, (), x)]
    for k in range(horizon):
        fd = fds[start + k]
        prects = fd['prects']; gone = fd['gone']
        nxt = {}
        for (sx, sy, svx, svy, sog, acts, mx) in states:
            moves = (1.0,) if sog else (1.0, 0.0, -1.0)
            opts = (0, 1) if sog else (0,)
            for mv in moves:
                for jump in opts:
                    r = step_player(sx, sy, svx, svy, sog, mv, jump, geom, prects, gone)
                    if r is None:
                        continue
                    if hazard_hit(r[0], r[1], geom, fd, mask):
                        continue
                    key = _key(r[0], r[1], r[2], r[3], r[4])
                    old = nxt.get(key)
                    nmx = mx if mx > r[0] else r[0]
                    if old is not None and old[6] >= nmx:
                        continue
                    na = acts if len(acts) >= 5 else acts + ((mv, jump),)
                    nxt[key] = (r[0], r[1], r[2], r[3], r[4], na, nmx)
        states = list(nxt.values())
        if not states:
            return None
        if len(states) > beam:
            states.sort(key=lambda s: (s[6], s[0]), reverse=True)
            states = states[:beam]
    best = max(states, key=lambda s: (s[6], s[0]))
    return [(float(m), bool(j)) for (m, j) in best[5]]


def search_longest(geom, fds, start, init, horizon, mask, beam=500, moves=(1.0, 0.0, -1.0)):
    """无法完整存活时的兜底：最大化存活帧数，其次最大化最远 x。返回前 5 帧动作。"""
    x, y, vx, vy, og = init
    states = [(x, y, vx, vy, og, (), x)]
    best = (0, x, ())
    for k in range(horizon):
        fd = fds[start + k]
        prects = fd['prects']; gone = fd['gone']
        nxt = {}
        for (sx, sy, svx, svy, sog, acts, mx) in states:
            for mv in moves:
                for jump in ((0, 1) if sog else (0,)):
                    r = step_player(sx, sy, svx, svy, sog, mv, jump, geom, prects, gone)
                    na = acts if len(acts) >= 5 else acts + ((mv, jump),)
                    if r is None:
                        if (k, mx) > (best[0], best[1]):
                            best = (k, mx, na)
                        continue
                    nmx = mx if mx > r[0] else r[0]
                    if hazard_hit(r[0], r[1], geom, fd, mask):
                        if (k, nmx) > (best[0], best[1]):
                            best = (k, nmx, na)
                        continue
                    key = _key(r[0], r[1], r[2], r[3], r[4])
                    old = nxt.get(key)
                    if old is not None:
                        continue
                    nxt[key] = (r[0], r[1], r[2], r[3], r[4], na, nmx)
        states = list(nxt.values())
        if not states:
            break
        if len(states) > beam:
            states.sort(key=lambda s: (s[0], 1 if s[4] else 0), reverse=True)
            states = states[:beam]
    for st in states:
        if (horizon, st[6]) > (best[0], best[1]):
            best = (horizon, st[6], st[5])
    return best[2]


# ---------------- 决策 ----------------
def _pad5(plan):
    out = list(plan[:5])
    while len(out) < 5:
        out.append((1.0, False))
    return out


def _static_ahead(geom, x, mask, span=3):
    w, h, tiles = geom
    base = column_top(geom, int(math.floor(x)))
    x0 = int(math.floor(x + 0.4))
    for tx in range(x0, x0 + span):
        if tx < 0 or tx >= w:
            continue
        if mask is not None and mask[0] <= tx < mask[1]:
            continue
        top = column_top(geom, tx)
        if top <= -90:
            return True
        if top > base:
            return True
        if tiles[(GROUND_Y - 1) * w + tx] == T_SPIKE:
            return True
    return False


def _standing_crumble(geom, x, y, gone):
    w, h, tiles = geom
    half = PW * 0.5
    ty = h - 1 - int(math.floor(y - 0.15))
    if ty < 0 or ty >= h:
        return False
    for xx in (x - half + 0.05, x + half - 0.05):
        tx = int(math.floor(xx))
        if 0 <= tx < w:
            k = ty * w + tx
            if tiles[k] == T_CRUMBLE and k not in gone:
                return True
    return False


def _safe_behind(geom, x):
    w, h, tiles = geom
    for tx in range(int(math.floor(x - 2.0)), int(math.floor(x - 0.2)) + 1):
        if tx < 0:
            return False
        if column_top(geom, tx) <= -90:
            return False
    return True


def _dyn_near(fd, x, lo, hi):
    for (sx, sy) in fd['saws']:
        if lo <= sx - x <= hi:
            return True
    for (px, py, ph) in fd['plants']:
        if ph > 0.2 and lo <= px - x <= hi:
            return True
    for (mx, my) in fd['monsters']:
        if lo <= mx - x <= hi:
            return True
    return False


def _air_choice(geom, fds, init, mask, allow_brake=True):
    """空中无法等待：枚举「先刹车 k 帧再前进」几种短动作，选能安全落地且最远的。"""
    best = None
    bestsc = None
    for k in range(0, 6 if allow_brake else 1):
        x, y, vx, vy, og = init
        ok = True
        landed = None
        alive = 0
        for i in range(26):
            fd = fds[i]
            mv = -1.0 if i < k else 1.0
            r = step_player(x, y, vx, vy, og, mv, 0, geom, fd['prects'], fd['gone'])
            if r is None or hazard_hit(r[0], r[1], geom, fd, mask):
                ok = False
                break
            x, y, vx, vy, og = r
            alive = i + 1
            if og:
                landed = x
                break
        n = 26
        if landed is not None:
            sc = (1, landed)
        else:
            sc = (0, alive)
        if bestsc is None or sc > bestsc:
            bestsc = sc
            best = tuple(((-1.0 if i < k else 1.0), False) for i in range(5))
    return list(best) if best else [(1.0, False)] * 5


def choose_actions(ctx, obs, runner):
    geom = ctx['geom']
    t0 = float(obs.get('time') or 0.0)
    fds, mask = build_frame_data(ctx, obs, t0, 112)
    x = float(runner['x']); y = float(runner['y'])
    vx = float(runner['vx']); vy = float(runner['vy'])
    og = bool(runner['onGround'])
    yp = int(obs.get('yourPlayer') or 0)
    opp = obs['runners'][1 - yp] if len(obs.get('runners') or []) > 1 else None
    tailgated = False
    if opp is not None:
        gap = float(opp['x']) - x
        if -1.7 < gap < -0.15 and abs(float(opp['y']) - y) < 1.25:
            tailgated = True
    stuck = ctx.get('stuck')
    if stuck is not None:
        sx, sw = stuck
        if x >= sx - 8.0:
            best = search_maxx(geom, fds, 0, (x, y, vx, vy, og), 44, None)
            if DEBUG:
                print(f"MAXX x={x:.2f} y={y:.2f} maxX={runner.get('maxX')} bestmx={best[0]:.2f} acts={best[1]}", file=sys.stderr)
            ctx['stall'] = 0
            return _pad5([(float(m), bool(j)) for (m, j) in best[1]])
        if float(runner.get('maxX') or 0.0) >= sx + 2.8 and x < sx - 8.0:
            if DEBUG:
                print(f"IDLE maxX={runner.get('maxX')} sx={sx}", file=sys.stderr)
            return [(0.0, False)] * 5
        mask_use = mask
    else:
        mask_use = None

    init = (x, y, vx, vy, og)
    st = search_survive(geom, fds, 0, init, 40, mask_use)
    if DEBUG and stuck is not None:
        print(f"NORM x={x:.2f} stuck={stuck} ok={st is not None}", file=sys.stderr)
    if st is not None:
        ctx['stall'] = 0
        return _pad5([(1.0, bool(a)) for a in st[5]])

    # 尝试等待 / 后退前缀；站在塌陷砖上时不要原地等待
    on_crumble = og and _standing_crumble(geom, x, y, fds[0]['gone'])
    dirs = (1.0,) if (tailgated or on_crumble) else (0.0, -1.0)
    if on_crumble and not tailgated:
        dirs = (-1.0,)
    for direction in dirs:
        s = init
        for k in range(1, 6):
            fd = fds[k - 1]
            r = step_player(s[0], s[1], s[2], s[3], s[4], direction, 0,
                            geom, fd['prects'], fd['gone'])
            if r is None or hazard_hit(r[0], r[1], geom, fd, mask_use):
                s = None
                break
            s = r
            if s is None:
                break
            st2 = search_survive(geom, fds, k, s, 36, mask_use)
            if st2 is not None:
                ctx['stall'] = 0
                if DEBUG:
                    print(f"PREFIX dir={direction} k={k} x={x:.2f} y={y:.2f} og={og}", file=sys.stderr)
                plan = [(direction, False)] * k + [(1.0, bool(a)) for a in st2[5]]
                return _pad5(plan)
    # 都失败
    ctx['stall'] = ctx.get('stall', 0) + 1
    if not og:
        # 空中优先找“逐帧 1/0/-1 修正”的完整存活方案；旧版只试“连续刹车 k 帧”，
        # 对锯齿这种需要交替微调的落点不够（g2 第 2 局即因此撞锯）。
        air = search_survive_air(geom, fds, 0, init, 26, mask_use)
        if air is not None:
            if DEBUG:
                print(f"FALLBACK-AIR-SEARCH x={x:.2f} y={y:.2f} acts={air}", file=sys.stderr)
            return _pad5(air)
        if DEBUG:
            print(f"FALLBACK-AIR x={x:.2f} y={y:.2f} vy={vy:.2f}", file=sys.stderr)
        return _air_choice(geom, fds, init, mask_use, allow_brake=not tailgated)
    if on_crumble and not tailgated:
        if DEBUG:
            print(f"FALLBACK-CRUMBLE x={x:.2f} y={y:.2f}", file=sys.stderr)
        if _safe_behind(geom, x) and not _dyn_near(fds[0], x, -3.0, 0.4):
            return [(-1.0, False)] * 5
        return [(1.0, False)] * 5
    if tailgated:
        # 被对手尾随时不能原地等待/后退（会被顶进危险物），但也不能像旧版那样
        # 只按 move=1 找“活得最久”的路线——那会全速跳进锯齿。
        # 先尝试“起跳后空中刹车修正落点”的完整存活方案。
        air = search_survive_air(geom, fds, 0, init, 24, mask_use)
        if air is not None:
            if DEBUG:
                print(f"FALLBACK-TAIL-AIR x={x:.2f} acts={air}", file=sys.stderr)
            return _pad5(air)
        acts = search_longest(geom, fds, 0, init, 24, mask_use, moves=(1.0,))
        if DEBUG:
            print(f"FALLBACK-TAIL x={x:.2f} acts={acts}", file=sys.stderr)
        return _pad5([(float(m), bool(j)) for (m, j) in acts]) if acts else [(1.0, False)] * 5
    fd0 = fds[0]
    if (ctx['stall'] >= 4 and _static_ahead(geom, x, mask_use)
            and not _dyn_near(fd0, x, -0.3, 4.0)
            and _safe_behind(geom, x)
            and not _dyn_near(fd0, x, -3.0, 0.4)):
        if DEBUG:
            print(f"FALLBACK-BACK x={x:.2f} stall={ctx['stall']}", file=sys.stderr)
        return [(-1.0, False)] * 5
    if DEBUG:
        print(f"FALLBACK-WAIT x={x:.2f} og={og} stall={ctx['stall']}", file=sys.stderr)
    return [(0.0, False)] * 5


# ---------------- 主循环 ----------------
def _neutral():
    return [(0.0, False)] * 5


def reset_ctx(obs):
    L = obs['level']
    geom = (int(L['width']), int(L['height']), list(L['tiles']))
    seed = int(obs.get('seed') or 1)
    rnd = int(obs.get('round') or 1)
    lvl_seed = obs.get('levelSeed')
    if lvl_seed is None:
        lvl_seed = seed * 131 + rnd * 977
    gen = generate_level(int(lvl_seed))
    valid = (gen['w'] == geom[0] and gen['tiles'] == geom[2]
             and len(gen['platforms']) == len(obs.get('platforms') or [])
             and len(gen['saws']) == len(obs.get('saws') or [])
             and len(gen['plants']) == len(obs.get('plants') or []))
    if not valid:
        print('WARN level gen mismatch, fallback dynamics', file=sys.stderr)
    stuck = None
    for (s, n) in spike_runs(geom):
        if n >= 3:
            stuck = (s, n)
            break
    return {'geom': geom, 'gen': gen, 'gen_valid': valid, 'stuck': stuck,
            'round': rnd, 'seed': seed, 'stall': 0, 'last_t': None, 'last_saws': [],
            'fb_plat': {}, 'fb_saw': {}}


def handle(obs, ctx):
    if obs.get('status') != 'playing':
        return _neutral()
    if obs.get('phase') != 'race':
        # 准备阶段输入不生效；提前按向右跑，避免开赛恰好落在窗口中间时损失帧
        return [(1.0, False)] * 5
    rnd = int(obs.get('round') or 1)
    seed = int(obs.get('seed') or 1)
    if ctx.get('round') != rnd or ctx.get('seed') != seed or 'geom' not in ctx:
        ctx.clear()
        ctx.update(reset_ctx(obs))
    yp = int(obs.get('yourPlayer') or 0)
    runner = obs['runners'][yp]
    plan = choose_actions(ctx, obs, runner)
    if DEBUG:
        d = runner.get('deaths', 0)
        if d > ctx.get('last_deaths', 0):
            print(f"DEATH#{d} t={obs.get('time')} x={runner['x']} y={runner['y']} maxX={runner.get('maxX')} hist={ctx.get('hist')}", file=sys.stderr)
        ctx['last_deaths'] = d
        h = ctx.setdefault('hist', [])
        h.append((round(float(obs.get('time') or 0), 2), runner['x'], runner['y'], runner['vx'], runner['vy'], runner['onGround'], plan))
        if len(h) > 10:
            h.pop(0)
    return plan


def main():
    ctx = {}
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
            plan = handle(obs, ctx)
        except Exception as exc:
            import traceback
            traceback.print_exc(file=sys.stderr)
            plan = [(1.0, False)] * 5
        frames = [[{'move': float(m), 'jump': bool(j)}] for (m, j) in plan]
        sys.stdout.write(json.dumps({'inputs': frames}) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
