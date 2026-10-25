#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""横版闯关竞速 agent：复刻规则物理 + 前向搜索决策。"""
import sys, json, math, os, time
DEBUG = bool(os.environ.get('PLAT_DEBUG'))
# 消融开关（比赛环境不设置，使用默认值）
WAIT_FIRST = os.environ.get('PF_WAIT', '0') == '1'
SUPPORT_PRUNE = os.environ.get('PF_SUPPORT', '0') == '1'
BOUND_CHECK = os.environ.get('PF_BOUND', '1') == '1'   # 默认开启：量化边界复核（r1-g1 R2 坑沿 0.005 格失分）
PUSH_LOGIC = os.environ.get('PF_PUSH', '1') == '1'
REAR_MODEL = os.environ.get('PF_REAR', '1') == '1'   # 我方在后时的追尾夹速模型
RISK_MODE = os.environ.get('PF_RISK', '0') == '1'
RISK = 1.0
FAST_MODE = False   # 上一窗口耗时过长时由 main() 置位，跳过量化的边界复核

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
# 观察量化误差（两位小数）下的安全余量，避免“差 0.004 格”的临界死亡
M_SPIKE, M_PLANT_X, M_PLANT_H, M_SAW, M_MON = 0.05, 0.04, 0.08, 0.05, 0.05
if os.environ.get('PF_MARGIN', '1') != '1':
    M_SPIKE = M_PLANT_X = M_PLANT_H = M_SAW = M_MON = 0.0
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
def _supported(geom, prects, x, y, gone=None):
    """双脚都踩在实心方块/移动平台上。规划时用它淘汰“只搭住坑沿 0.0x 格”的落地：
    两位小数观测会产生 ~0.03 格误差，身后对手每帧还能推 0.2 格，边缘落点并不可靠。"""
    half = PW * 0.5
    ty = geom[1] - 1 - int(math.floor(y - 0.15))
    if 0 <= ty < geom[1]:
        n = 0
        for xx in (x - half + 0.05, x + half - 0.05):
            tx = int(math.floor(xx))
            if 0 <= tx < geom[0]:
                k = ty * geom[0] + tx
                if not (gone and k in gone) and geom[2][k] in (T_GROUND, T_BRICK, T_CRUMBLE):
                    n += 1
        if n == 2:
            return True
    for pr in (prects or []):
        if (x + half) > pr['x'] and (x - half) < pr['x'] + pr['w'] and abs(y - pr['top']) < 0.12:
            return True
    return False


def step_player(x, y, vx, vy, og, move, jump, geom, prects, gone):
    was_og = og
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
    if SUPPORT_PRUNE and og and not was_og and not _supported(geom, prects, x, y, gone):
        return None
    return (x, y, vx, vy, og)


def hazard_hit(x, y, geom, fd, mask=None, safe=True):
    h = geom[1]
    w = geom[0]
    tiles = geom[2]
    if not safe:
        m_spike = m_plant_x = m_plant_h = m_saw = m_mon = 0.0
    else:
        k = RISK
        m_spike, m_plant_x, m_plant_h, m_saw, m_mon = (M_SPIKE * k, M_PLANT_X * k,
                                                       M_PLANT_H * k, M_SAW * k, M_MON * k)
    # 观察里的 x/y/vx/time 都只保留两位小数，2 秒预测累积误差可达 ~0.02 格，
    # 在食人花刚冒头 / 锯齿贴边时正好能翻转判定。这里统一留一点安全余量。
    # 地刺
    x0 = int(math.floor(x - 0.32 - m_spike)); x1 = int(math.floor(x + 0.32 + m_spike))
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
        if pl[2] < 0.25 - m_plant_h:
            continue
        if abs(x - pl[0]) < 0.71 + m_plant_x and y < pl[1] + pl[2] and y + PH > pl[1]:
            return True
    for (sx, sy) in fd['saws']:
        cx = sx
        if cx < x - 0.36: cx = x - 0.36
        elif cx > x + 0.36: cx = x + 0.36
        cy = sy
        if cy < y: cy = y
        elif cy > y + PH: cy = y + PH
        dx = sx - cx; dy = sy - cy
        if dx * dx + dy * dy < (0.53 + m_saw) * (0.53 + m_saw):
            return True
    for (mx, my) in fd['monsters']:
        if abs(x - mx) < 0.72 + m_mon and y < my + MON_H and y + PH > my:
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


def _hazard_front(geom, fd, x, y, span=1.2):
    """对手在 x 处继续前进前是否会急刹。只用锯齿做判据：地刺/坑对手会跳过去，
    食人花/怪物也常被跳过去，把它们算成“必刹车”会产生大量假阳性（我方平白让位）。
    锯齿贴地扫过、起跳时机不对就会死，是实测里前车最容易急刹的机关。"""
    for (sx, sy) in fd['saws']:
        if 0.0 < sx - x <= span and y - 0.5 <= sy <= y + PH + 0.5:
            return True
    return False


def _predict_opp(geom, fds, ox, oy, ovx, n, span=1.2):
    """预测前车未来 n 帧的水平位置：按当前速度前进，前方出现危险物就急刹。
    y 保持观测值（不做垂直外推——对手若跳起，我们用其当前高度已足够保守）。"""
    v = clamp(ovx, 0.0, MOVE_SPEED)
    x = ox
    out = []
    for k in range(n):
        if v > 0.0 and _hazard_front(geom, fds[k], x, oy, span):
            v = 0.0
        x += v * DT
        out.append((x, oy))
    return out


def _clamp_rear(r, prev_x, ox, oy):
    """复刻 resolvePush 的“后方被前方挡住”：水平重叠且垂直重叠 > 0.3 时，
    后方最多只能顶到 ox-0.72，且 vx 被压到 4.2。这是我方在后追尾时的真实约束。"""
    x, y, vx, vy, og = r
    if min(y + PH, oy + PH) - max(y, oy) <= 0.3:
        return r
    if prev_x > ox:
        return r
    lim = ox - PW - 1e-3
    if x > lim:
        x = prev_x if prev_x > lim else lim
        if vx > PUSH_SPEED:
            vx = PUSH_SPEED
    return (x, y, vx, vy, og)


def search_survive(geom, fds, start, init, horizon, mask, beam=600, opp_traj=None):
    """只允许 move=1，跳跃/不跳；返回存活的 (state, first5 actions)。
    opp_traj: 前车逐帧预测位置；给定后按 resolvePush 约束把“我方在后”的追尾夹住，
    避免规划出“靠贴住减速前车才能过坑”的线路。"""
    x, y, vx, vy, og = init
    states = [(x, y, vx, vy, og, ())]
    for k in range(horizon):
        fd = fds[start + k]
        prects = fd['prects']; gone = fd['gone']
        op = opp_traj[k] if opp_traj is not None and k < len(opp_traj) else None
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
                if op is not None:
                    r = _clamp_rear(r, sx, op[0], op[1])
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
                    if hazard_hit(r[0], r[1], geom, fd, mask, safe=False):
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


def search_survive_air(geom, fds, start, init, horizon, mask, beam=600, opp_traj=None):
    """地面只前进/起跳，空中允许 1/0/-1 修正落点。
    仅在“全速前进必死且被对手尾随、不能原地等待/后退”时作为兜底：
    用空中刹车缩短跳跃距离，落到危险物之前，而不是继续全速跳进锯齿/食人花。"""
    x, y, vx, vy, og = init
    states = [(x, y, vx, vy, og, (), x)]
    for k in range(horizon):
        fd = fds[start + k]
        prects = fd['prects']; gone = fd['gone']
        op = opp_traj[k] if opp_traj is not None and k < len(opp_traj) else None
        nxt = {}
        for (sx, sy, svx, svy, sog, acts, mx) in states:
            moves = (1.0,) if sog else (1.0, 0.0, -1.0)
            opts = (0, 1) if sog else (0,)
            for mv in moves:
                for jump in opts:
                    r = step_player(sx, sy, svx, svy, sog, mv, jump, geom, prects, gone)
                    if r is None:
                        continue
                    if op is not None:
                        r = _clamp_rear(r, sx, op[0], op[1])
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
    return search_longest2(geom, fds, start, init, horizon, mask, beam, moves)[1]


def search_longest2(geom, fds, start, init, horizon, mask, beam=500, moves=(1.0, 0.0, -1.0)):
    """同 search_longest，但返回 (存活帧数, 前 5 帧动作)。"""
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
    return best[0], best[2]


def search_survive_ladder(geom, fds, start, init, mask, horizons=(40, 30, 22)):
    """按由长到短的视界依次搜索“全速前进能活下来”的方案。
    视界末端被远处的动态机关（锯齿/食人花相位）卡住时，40 帧搜索会失败，
    旧版就此原地等待——其实那机关还在 8 格以外，继续跑再重规划才对。
    缩短视界后仍能保证看到 7.5 格内的一切（足够躲坑、起跳）。"""
    for hz in horizons:
        st = search_survive(geom, fds, start, init, hz, mask)
        if st is not None:
            return st
    return None


def plan_jump_over(geom, fds, init, mask, horizon=40):
    """从慢速对手头顶跳过：先前进 d 帧，再在最早的安全帧起跳，之后按全速存活方案走。
    只在与对手贴身（被 4.2 上限压速）时使用；跳跃不损失水平速度，安全时严格优于被顶。"""
    x0, y0, vx0, vy0, og0 = init
    best = None
    bestx = None
    for d in range(3):
        x, y, vx, vy, og = x0, y0, vx0, vy0, og0
        pre = []
        ok = True
        for i in range(d):
            r = step_player(x, y, vx, vy, og, 1.0, 0, geom, fds[i]['prects'], fds[i]['gone'])
            if r is None or hazard_hit(r[0], r[1], geom, fds[i], mask):
                ok = False
                break
            x, y, vx, vy, og = r
            pre.append((1.0, False))
        if not ok or not og:
            continue
        r = step_player(x, y, vx, vy, og, 1.0, 1, geom, fds[d]['prects'], fds[d]['gone'])
        if r is None or hazard_hit(r[0], r[1], geom, fds[d], mask):
            continue
        pre.append((1.0, True))
        st = search_survive_ladder(geom, fds, d + 1, r, mask, (horizon - d - 1, 24))
        if st is None:
            continue
        plan = pre + [(1.0, bool(a)) for a in st[5]]
        if best is None or st[0] > bestx:
            best = plan
            bestx = st[0]
    return best


def plan_escape_back(geom, fds, init, mask, horizon=34):
    """被对手顶在身后又必须等待时，向后起跳脱离接触（后跳前者推前者，脱离后可以后退）。
    只在全速前冲最多只能活很短时间时作为保命手段。"""
    x0, y0, vx0, vy0, og0 = init
    if not og0:
        return None
    x, y, vx, vy, og = x0, y0, vx0, vy0, og0
    pre = []
    for i in range(3):
        r = step_player(x, y, vx, vy, og, -1.0, 1 if i == 0 else 0,
                        geom, fds[i]['prects'], fds[i]['gone'])
        if r is None or hazard_hit(r[0], r[1], geom, fds[i], mask):
            return None
        x, y, vx, vy, og = r
        pre.append((-1.0, i == 0))
    st = search_survive(geom, fds, 3, (x, y, vx, vy, og), horizon - 3, mask)
    if st is None:
        return None
    return pre + [(1.0, bool(a)) for a in st[5]]


# ---------------- 决策 ----------------
def _pad5(plan):
    out = list(plan[:5])
    while len(out) < 5:
        out.append((1.0, False))
    return out


def sim_plan_end(geom, fds, init, plan, mask=None):
    """按计划推进最多 5 帧，返回结束状态；中途死亡返回 None。"""
    x, y, vx, vy, og = init
    for i, (m, j) in enumerate(plan[:5]):
        r = step_player(x, y, vx, vy, og, float(m), 1 if j else 0,
                        geom, fds[i]['prects'], fds[i]['gone'])
        if r is None or hazard_hit(r[0], r[1], geom, fds[i], mask):
            return None
        x, y, vx, vy, og = r
    return (x, y, vx, vy, og)


def _spike_near(geom, x, y, span=0.55):
    w, h, tiles = geom
    x0 = int(math.floor(x - span)); x1 = int(math.floor(x + span))
    y0 = int(math.floor(y + 0.02)); y1 = int(math.floor(y + PH - 0.08))
    for tx in range(x0, x1 + 1):
        if tx < 0 or tx >= w:
            continue
        for yy in range(y0, y1 + 1):
            ty = h - 1 - yy
            if 0 <= ty < h and tiles[ty * w + tx] == T_SPIKE:
                return True
    return False


def _unsafe_stand(ctx, geom, fd, x, y):
    """这个位置能不能安全地原地等待：塌陷砖上不行；食人花/锯齿的巡逻范围里不行；
    地刺上方不行（跳一半落地就死，等待时相位一变就危险）；怪物贴身不行。"""
    if _standing_crumble(geom, x, y):
        return True
    if _spike_near(geom, x, y):
        return True
    gen = ctx.get('gen') if ctx.get('gen_valid') else None
    if gen is not None:
        for pl in gen['plants']:
            if abs(pl['x'] - x) < 1.05:
                return True
        for s in gen['saws']:
            lo = min(s['fromx'], s['tox']) - 0.95
            hi = max(s['fromx'], s['tox']) + 0.95
            if lo <= x <= hi and (y - 0.3) <= s['fromy'] <= (y + PH + 0.3):
                return True
    else:
        for pl in (fd.get('plants') or []):
            if abs(pl[0] - x) < 1.05:
                return True
        for (sx, sy) in (fd.get('saws') or []):
            if abs(sx - x) < 1.6 and (y - 0.3) <= sy <= (y + PH + 0.3):
                return True
    for (mx, my) in (fd.get('monsters') or []):
        if abs(mx - x) < 1.6 and (y - 0.4) <= my <= (y + PH + 0.4):
            return True
    return False


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


def _standing_crumble(geom, x, y, gone=None):
    """脚下是否是塌陷砖。gone 只用于“还没踩上去”的阶段；一旦脚踩在塌陷砖上，
    无论模型里是否已经判定为 gone，都必须当成危险落脚点——真实规则是逐层塌，
    站在上面等 = 跟着一起沉下去。"""
    w, h, tiles = geom
    half = PW * 0.5
    ty = h - 1 - int(math.floor(y - 0.15))
    if ty < 0 or ty >= h:
        return False
    for xx in (x - half + 0.05, x + half - 0.05):
        tx = int(math.floor(xx))
        if 0 <= tx < w:
            if tiles[ty * w + tx] == T_CRUMBLE:
                return True
    return False


def _safe_behind(geom, x):
    """后退落点是否安全：不能是坑、塌陷砖（退到另一块塌陷砖同样会沉）、地刺列。"""
    w, h, tiles = geom
    for tx in range(int(math.floor(x - 2.6)), int(math.floor(x - 0.2)) + 1):
        if tx < 0:
            return False
        if column_top(geom, tx) <= -90:
            return False
        for ty in range(h):
            tt = tiles[ty * w + tx]
            if tt == T_CRUMBLE or tt == T_SPIKE:
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


def search_survive_wait(geom, fds, start, init, horizon, mask, beam=420, strict=False,
                        opp_traj=None):
    """允许地面 1/0/-1 + 起跳的完整存活搜索。
    主搜索只允许全速前进，遇到“必须等移动平台横跨宽坑”“必须等食人花缩回”时
    会整体失败，只能落到空中刹车兜底；而这两类场景恰恰要求在地面上停下来等。
    strict=True 时末状态必须双脚有支撑（身后有对手会被推，坑沿不可靠）。
    返回 (末状态, 前 5 帧动作对) 或 None。"""
    x, y, vx, vy, og = init
    states = [(x, y, vx, vy, og, (), x)]
    for k in range(horizon):
        fd = fds[start + k]
        prects = fd['prects']; gone = fd['gone']
        op = opp_traj[k] if opp_traj is not None and k < len(opp_traj) else None
        nxt = {}
        for (sx, sy, svx, svy, sog, acts, mx) in states:
            for mv in (1.0, 0.0, -1.0):
                for jump in ((0, 1) if sog else (0,)):
                    r = step_player(sx, sy, svx, svy, sog, mv, jump, geom, prects, gone)
                    if r is None:
                        continue
                    if op is not None:
                        r = _clamp_rear(r, sx, op[0], op[1])
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
    best = None
    bestsc = None
    lastfd = fds[start + horizon - 1] if start + horizon - 1 < len(fds) else fds[-1]
    for st in states:
        if strict:
            if st[4]:
                if not _grounded_at(geom, lastfd, st[0], st[1], lastfd['gone']):
                    continue
            else:
                proj = project_landing(geom, fds, start + horizon, st[0], st[1], st[2], st[3], st[4], mask)
                if proj is None or not _grounded_at(geom, None, proj[0], proj[1]):
                    continue
        sc = (st[0], 1 if st[4] else 0, st[2])
        if bestsc is None or sc > bestsc:
            bestsc = sc
            best = st
    if best is None:
        return None
    return best[:6], best[5]


def _round2(v):
    """与 JS Math.round(v*100)/100 对齐（两位小数观察量化）。"""
    return math.floor(v * 100.0 + 0.5) / 100.0


def _grounded_at(geom, fd, x, y, gone=None):
    """双脚都踩在实心地面/移动平台上（fd 可为 None，仅查静态方块）。"""
    return _supported(geom, (fd.get('prects') if fd is not None else None), x, y, gone)


def _project_landing_move(geom, fds, start, x, y, vx, vy, mv, mask, maxf=26):
    n = len(fds)
    for k in range(maxf):
        idx = start + k
        if idx >= n:
            return None
        fd = fds[idx]
        r = step_player(x, y, vx, vy, False, mv, 0, geom, fd['prects'], fd['gone'])
        if r is None:
            return None
        if hazard_hit(r[0], r[1], geom, fd, mask):
            return None
        x, y, vx, vy, og = r
        if og:
            return (x, y, k)
    return None


def boundary_ok(geom, fds, init, plan, mask, horizon=22, strict=False):
    """重规划边界检查：按计划走 5 帧后，把状态量化成下一次观察的样子，
    再从这个量化状态做一次短存活搜索。若量化后无解，说明这个计划只靠
    “观测看不到的 0.005 格支撑”活着，下一窗口就会翻车（r1 第 2 局掉坑）。
    strict=True 时还要求落点（含被推 0.35 格后的落点）双脚有支撑：
    身后有对手时会被推 0.2~0.6 格，只搭住坑沿的计划会被直接顶进坑里。"""
    end = sim_plan_end(geom, fds, init, plan, mask)
    if end is None:
        return False
    q = (_round2(end[0]), _round2(end[1]), _round2(end[2]), _round2(end[3]), end[4])
    if strict:
        if q[4]:
            if not (_grounded_at(geom, fds[5], q[0], q[1])
                    and _grounded_at(geom, fds[5], q[0] + 0.35, q[1])):
                return False
        else:
            # 空中端点：竞速默认会继续全速，检查全速落点（含被推 0.35 格）是否有支撑
            pl = _project_landing_move(geom, fds, 5, q[0], q[1], q[2], q[3], 1.0, mask)
            if pl is None:
                return False
            pfd = fds[min(5 + pl[2], len(fds) - 1)]
            if not (_grounded_at(geom, pfd, pl[0], pl[1])
                    and _grounded_at(geom, pfd, pl[0] + 0.35, pl[1])):
                return False
    if search_survive(geom, fds, 5, q, horizon, mask) is not None:
        return True
    if search_survive_wait(geom, fds, 5, q, horizon + 10, mask, beam=260, strict=strict) is not None:
        return True
    return False


def _slow_prefix(plan, n=3):
    for (m, j) in plan[:n]:
        if float(m) < 0.99:
            return True
    return False


def plan_defensive_jump(geom, fds, init, mask, horizon=40):
    """被身后对手贴身时，若计划里有减速/等待帧，改成起跳脱离。
    push 要求垂直重叠 > 0.3 格，起跳后不再被推；跳跃本身不损失水平速度。"""
    x, y, vx, vy, og = init
    if not og:
        return None
    best = None
    bestx = None
    for mv in (1.0, 0.0):
        r = step_player(x, y, vx, vy, og, mv, 1, geom, fds[0]['prects'], fds[0]['gone'])
        if r is None or hazard_hit(r[0], r[1], geom, fds[0], mask):
            continue
        st = search_survive_ladder(geom, fds, 1, r, mask, (horizon - 1, 26))
        cand = None
        if st is not None:
            cand = [(mv, True)] + [(1.0, bool(a)) for a in st[5]]
        else:
            w = search_survive_wait(geom, fds, 1, r, min(horizon - 1, 34), mask, beam=260)
            if w is not None:
                cand = [(mv, True)] + [(float(m), bool(j)) for (m, j) in w[1]]
        if cand is None:
            continue
        cand = _pad5(cand)
        if not boundary_ok(geom, fds, init, cand, mask, horizon=20):
            continue
        end = sim_plan_end(geom, fds, init, cand, mask)
        if end is None:
            continue
        if bestx is None or end[0] > bestx:
            bestx = end[0]
            best = cand
    return best


def _step_pushed(geom, x, y, vx, vy, og, mv, jump, fd, push_dx):
    r = step_player(x, y, vx, vy, og, mv, jump, geom, fd['prects'], fd['gone'])
    if r is None:
        return None
    x, y, vx, vy, og = r
    if push_dx > 0.0:
        nx = x + push_dx
        if not solid_box(geom, nx - PW * 0.5, y, nx + PW * 0.5, y + PH, fd['gone']):
            x = nx
    return (x, y, vx, vy, og)


def search_survive_push(geom, fds, start, init, horizon, mask, beam=400,
                        push_dx=0.20, push_frames=5, require_support=True):
    """身后对手贴身时的稳健规划：同一套动作同时在没有 push 和“每帧被前推 push_dx”
    两种世界里模拟，只有两边都存活、且两个末状态都有双脚支撑/安全落地才算通过。
    这样既不会依赖 push 才能过坑（push 不发生就死），也不会选被 push 推进危险物的线。"""
    states = [(init, init, (), init[0])]
    for k in range(horizon):
        fd = fds[start + k]
        prects = fd['prects']; gone = fd['gone']
        pd = push_dx if k < push_frames else 0.0
        nxt = {}
        for (s0, s1, acts, mx) in states:
            # 只在无 push 状态上决定动作是否合法（起跳/移动）
            if s0[4]:
                moves = (1.0,)
            else:
                moves = (1.0, 0.0, -1.0)
            for mv in moves:
                for jump in ((0, 1) if s0[4] else (0,)):
                    r0 = step_player(s0[0], s0[1], s0[2], s0[3], s0[4], mv, jump, geom, prects, gone)
                    if r0 is None or hazard_hit(r0[0], r0[1], geom, fd, mask):
                        continue
                    r1 = _step_pushed(geom, s1[0], s1[1], s1[2], s1[3], s1[4], mv, jump, fd, pd)
                    if r1 is None or hazard_hit(r1[0], r1[1], geom, fd, mask):
                        continue
                    key = (r0[0], r0[1], r0[2], r0[3], r0[4], r1[0], r1[1], r1[2], r1[3], r1[4])
                    old = nxt.get(key)
                    nmx = mx if mx > r0[0] else r0[0]
                    if old is not None and old[3] >= nmx:
                        continue
                    na = acts if len(acts) >= 5 else acts + ((mv, jump),)
                    nxt[key] = (r0, r1, na, nmx)
        states = list(nxt.values())
        if not states:
            return None
        if len(states) > beam:
            states.sort(key=lambda t: (t[3], t[0][0]), reverse=True)
            states = states[:beam]
    lastfd = fds[start + horizon - 1] if start + horizon - 1 < len(fds) else fds[-1]
    best = None
    bestsc = None
    for (s0, s1, acts, mx) in states:
        ok = True
        if require_support:
            for st in (s0, s1):
                if st[4]:
                    if not _grounded_at(geom, lastfd, st[0], st[1], lastfd['gone']):
                        ok = False
                        break
                else:
                    proj = project_landing(geom, fds, start + horizon, st[0], st[1], st[2], st[3], st[4], mask)
                    if proj is None or not _grounded_at(geom, None, proj[0], proj[1]):
                        ok = False
                        break
        if not ok:
            continue
        sc = (s0[0], 1 if s0[4] else 0, s0[2])
        if bestsc is None or sc > bestsc:
            bestsc = sc
            best = acts
    if best is None:
        return None
    return [(float(m), bool(j)) for (m, j) in best]


def _finalize(geom, fds, init, plan, mask, allow_wait=True, strict=False, opp_traj=None):
    """统一出口：先做重规划边界的量化可行性检查；不过关就改用“允许停下等待”的
    完整存活方案（移动平台宽坑、食人花相位），再不过关才保持原计划。"""
    plan = _pad5(plan)
    if not BOUND_CHECK or FAST_MODE:
        return plan
    if boundary_ok(geom, fds, init, plan, mask, strict=strict):
        return plan
    if allow_wait:
        w = search_survive_wait(geom, fds, 0, init, 52, mask, strict=strict, opp_traj=opp_traj)
        if w is not None:
            alt = _pad5([(float(m), bool(j)) for (m, j) in w[1]])
            if boundary_ok(geom, fds, init, alt, mask, strict=strict):
                return alt
    return plan


def _defend(geom, fds, init, plan, mask, tailgated):
    """身后有对手贴身时，计划里的减速/等待帧会把自己送进 push 的 4.2 格/秒。
    改为起跳脱离（垂直分离后 push 不生效）。"""
    if tailgated and _slow_prefix(plan, 3):
        jp = plan_defensive_jump(geom, fds, init, mask, 40)
        if jp is not None:
            return jp
    return plan


def choose_actions(ctx, obs, runner):
    global RISK
    RISK = 1.0
    geom = ctx['geom']
    t0 = float(obs.get('time') or 0.0)
    fds, mask = build_frame_data(ctx, obs, t0, 112)
    x = float(runner['x']); y = float(runner['y'])
    vx = float(runner['vx']); vy = float(runner['vy'])
    og = bool(runner['onGround'])
    yp = int(obs.get('yourPlayer') or 0)
    stuck = ctx.get('stuck')
    if stuck is not None:
        sx, sw = stuck
        if x >= sx - 8.0:
            best = search_maxx(geom, fds, 0, (x, y, vx, vy, og), 44, None)
            if DEBUG:
                print(f"MAXX x={x:.2f} y={y:.2f} maxX={runner.get('maxX')} bestmx={best[0]:.2f} acts={best[1]}", file=sys.stderr)
            ctx['stall'] = 0
            return _pad5([(float(m), bool(j)) for (m, j) in best[1]])
        if float(runner.get('maxX') or 0.0) >= sx + 2.95 and x < sx - 8.0:
            # 已拿到卡死图的理论 maxX，通常回起点等超时。但对手如果在身后
            # 贴身推进，站着不动会被一路顶进起点前的食人花/地刺（r1-g2 第 1 局
            # 就是这样被从 x=3.4 顶到 x=15.2 的花上）。跳跃时两人垂直重叠不足
            # 0.3 格，push 不生效；原地跳既不改 maxX，也不会被推进危险物。
            o = None
            if len(obs.get('runners') or []) > 1:
                o = obs['runners'][1 - yp]
            if o is not None:
                odx = float(o.get('x') or 0.0) - x
                oy = float(o.get('y') or 0.0)
                ovx = float(o.get('vx') or 0.0)
                if -6.0 < odx < -0.4 and abs(oy - y) < 1.25 and ovx > 0.8:
                    if DEBUG:
                        print(f"IDLE-ANTIPUSH x={x:.2f} oppdx={odx:.2f} ovx={ovx:.2f} og={og}", file=sys.stderr)
                    if og:
                        return [(0.0, True)] + [(0.0, False)] * 4
                    return [(0.0, False)] * 5
            if DEBUG:
                print(f"IDLE maxX={runner.get('maxX')} sx={sx}", file=sys.stderr)
            return [(0.0, False)] * 5
        mask_use = mask
    else:
        mask_use = None

    init = (x, y, vx, vy, og)
    # 对手状态（推挤只依赖相对前后与垂直重叠）
    opp = None
    tailgated = False
    if len(obs.get('runners') or []) > 1:
        o = obs['runners'][1 - yp]
        ox = float(o.get('x') or 0.0); oy = float(o.get('y') or 0.0)
        opp = {'x': ox, 'y': oy, 'vx': float(o.get('vx') or 0.0),
               'dx': ox - x, 'ygap': min(y + PH, oy + PH) - max(y, oy)}
        if opp['vx'] < 5.0:
            ctx['opp_slow'] = ctx.get('opp_slow', 0) + 1
        else:
            ctx['opp_slow'] = 0
        if -1.7 < opp['dx'] < -0.15 and abs(oy - y) < 1.25:
            tailgated = True
    # 身后 2 格内、垂直方向有重叠 -> 接下来 5 帧可能被推 0.2~0.6 格；
    # 落点必须双脚有支撑，不能靠坑沿最后 0.01 格。
    if RISK_MODE and opp is not None:
        # 落后 1.5 格以上：缩小危险物安全余量，换取更贴边的快线（领先时仍保守）
        RISK = 0.0 if opp['dx'] > 1.5 else 1.0
    push_risk = bool(PUSH_LOGIC and opp is not None and -2.0 < opp['dx'] < -0.02 and opp['ygap'] > -0.35)
    # 已经贴身（1.5 格内）：对手每帧都能推，按实测 0.2 格/帧重规划
    push_close = bool(PUSH_LOGIC and opp is not None and -1.05 < opp['dx'] < -0.02 and opp['ygap'] > -0.1)
    # 我方在对手身后 4 格内：把“前车可能为躲机关急刹、我方追尾后被 resolvePush
    # 卡在 ox-0.72 且 vx 压到 4.2”建模进搜索。否则会规划出“贴住减速前车过坑”
    # 的线路——前车一刹车，我方就被卡在半空掉进坑里（r2-g1 R1 的失分模式）。
    opp_traj = None
    # 只有“已经在前方 2 格内”或“对手当前已经明显减速”时才启用追尾夹速预测：
    # 2~4 格外的全速前车若其实会跳过锯齿，按急刹预测会让我方无谓让位。
    if (REAR_MODEL and opp is not None and 0.02 < opp['dx'] < 4.0
            and (opp['dx'] < 2.0 or opp['vx'] < 5.5)):
        opp_traj = _predict_opp(geom, fds, opp['x'], opp['y'], opp['vx'], 112)
    st = search_survive(geom, fds, 0, init, 40, mask_use, opp_traj=opp_traj)
    if DEBUG and stuck is not None:
        print(f"NORM x={x:.2f} stuck={stuck} ok={st is not None}", file=sys.stderr)
    if st is not None:
        ctx['stall'] = 0
        # 被慢速对手贴身挡住：后推只能把他往前送、自己还被压到 4.2 速；跳过去更划算。
        if (opp is not None and og and ctx.get('opp_slow', 0) >= 2
                and 0.02 < opp['dx'] < 1.05 and opp['ygap'] > 0.3
                and opp['vx'] < vx - 0.9):
            jp = plan_jump_over(geom, fds, init, mask_use, 40)
            if jp is not None:
                if DEBUG:
                    print(f"JUMP-OVER x={x:.2f} gap={opp['dx']:.2f} myvx={vx:.2f} oppvx={opp['vx']:.2f}", file=sys.stderr)
                return _pad5(jp)
        plan = _finalize(geom, fds, init, [(1.0, bool(a)) for a in st[5]], mask_use, strict=push_risk, opp_traj=opp_traj)
        if push_close and not boundary_ok(geom, fds, init, plan, mask_use, strict=True):
            pp = search_survive_push(geom, fds, 0, init, 34, mask_use)
            if pp is not None:
                if DEBUG:
                    print(f"PUSH-PLAN x={x:.2f} dx={opp['dx']:.2f} acts={pp}", file=sys.stderr)
                plan = _pad5(pp)
        return _defend(geom, fds, init, plan, mask_use, tailgated)

    # 主搜索（地面只允许全速）失败后，优先用“允许地面停下/后退”的完整规划：
    # 锯齿走廊、移动平台宽坑、食人花相位都需要停下来等时机，全速搜索做不到，
    # 而空中修正只能赌落点。等待方案要求末状态双脚有支撑，比空中 witness 稳健。
    w0 = search_survive_wait(geom, fds, 0, init, 48, mask_use, strict=push_risk, opp_traj=opp_traj) if WAIT_FIRST else None
    if w0 is not None:
        ctx['stall'] = 0
        plan = _pad5([(float(m), bool(j)) for (m, j) in w0[1]])
        if DEBUG:
            print(f"WAIT-FIRST x={x:.2f} y={y:.2f} og={og} acts={plan}", file=sys.stderr)
        if push_close and not boundary_ok(geom, fds, init, plan, mask_use, strict=True):
            pp = search_survive_push(geom, fds, 0, init, 34, mask_use)
            if pp is not None:
                if DEBUG:
                    print(f"PUSH-WAIT x={x:.2f} dx={opp['dx']:.2f} acts={pp}", file=sys.stderr)
                plan = _pad5(pp)
        return _defend(geom, fds, init, plan, mask_use, tailgated)

    # 兜底：地面全速 + 空中 1/0/-1 逐帧修正落点。
    air0 = search_survive_air(geom, fds, 0, init, 34, mask_use, opp_traj=opp_traj)
    if air0 is not None:
        ctx['stall'] = 0
        if DEBUG:
            print(f"AIR-FIRST x={x:.2f} y={y:.2f} acts={air0}", file=sys.stderr)
        plan = _finalize(geom, fds, init, air0, mask_use, strict=push_risk, opp_traj=opp_traj)
        if push_close and not boundary_ok(geom, fds, init, plan, mask_use, strict=True):
            pp = search_survive_push(geom, fds, 0, init, 34, mask_use)
            if pp is not None:
                if DEBUG:
                    print(f"PUSH-AIR x={x:.2f} dx={opp['dx']:.2f} acts={pp}", file=sys.stderr)
                plan = _pad5(pp)
        return _defend(geom, fds, init, plan, mask_use, tailgated)

    # WAIT_FIRST=0 时的消融顺序：先空中修正，再允许等待
    if not WAIT_FIRST:
        w1 = search_survive_wait(geom, fds, 0, init, 48, mask_use, strict=push_risk, opp_traj=opp_traj)
        if w1 is not None:
            ctx['stall'] = 0
            plan = _pad5([(float(m), bool(j)) for (m, j) in w1[1]])
            if DEBUG:
                print(f"WAIT-SECOND x={x:.2f} y={y:.2f} og={og} acts={plan}", file=sys.stderr)
            if push_close and not boundary_ok(geom, fds, init, plan, mask_use, strict=True):
                pp = search_survive_push(geom, fds, 0, init, 34, mask_use)
                if pp is not None:
                    plan = _pad5(pp)
            return _defend(geom, fds, init, plan, mask_use, tailgated)

    # 40 帧内找不到“全速一直跑”的方案时，先看全速最多能跑多久：
    # 若必死点在 1.3 秒以外（锯齿/食人花相位还远），原地等只会白白浪费时间，
    # 这一窗口按“活得最久”的前进方案跑，0.25 秒后带着新相位重新规划。
    on_crumble = og and _standing_crumble(geom, x, y)
    sf0, acts0 = search_longest2(geom, fds, 0, init, 40, mask_use, moves=(1.0,))
    if sf0 >= 26 and acts0:
        plan0 = [(float(m), bool(j)) for (m, j) in acts0]
        end = sim_plan_end(geom, fds, init, plan0, mask_use)
        # 不许把“这一窗口”跑成“停在塌陷砖 / 食人花或锯齿巡逻带里”：
        # 那些位置没法等，下一窗口只能硬冲，等于自己把退路跑没了。
        if end is not None and not _unsafe_stand(ctx, geom, fds[5], end[0], end[1]):
            ctx['stall'] = ctx.get('stall', 0) + 1
            if DEBUG:
                print(f"KEEP-RUN x={x:.2f} sf={sf0} acts={acts0}", file=sys.stderr)
            return _pad5(plan0)

    # 允许地面停留/后退的完整存活方案：移动平台横跨的宽坑、食人花相位
    # 需要“停下来等”，而全速搜索和空中修正都做不到。放在 KEEP-RUN 之后，
    # 避免在“远处才有危险”时过早停下等待而损失速度。
    w0 = search_survive_wait(geom, fds, 0, init, 48, mask_use, opp_traj=opp_traj)
    if w0 is not None:
        plan = _pad5([(float(m), bool(j)) for (m, j) in w0[1]])
        if DEBUG:
            print(f"WAIT-FIRST x={x:.2f} y={y:.2f} og={og} acts={plan}", file=sys.stderr)
        return _defend(geom, fds, init, plan, mask_use, tailgated)

    if on_crumble and not tailgated:
        # 站在塌陷砖上且全速跑不通：优先“起跳脱离”（跳出去接着跑），
        # 绝不能原地等——真实规则是逐层塌，站着等会跟着一起沉下去。
        jp = plan_jump_over(geom, fds, init, mask_use, 40)
        if jp is not None:
            ctx['stall'] = 0
            if DEBUG:
                print(f"CRUMBLE-JUMP x={x:.2f} y={y:.2f}", file=sys.stderr)
            return _pad5(jp)
        ctx['stall'] = ctx.get('stall', 0) + 1
        if DEBUG:
            print(f"FALLBACK-CRUMBLE x={x:.2f} y={y:.2f}", file=sys.stderr)
        if _safe_behind(geom, x) and not _dyn_near(fds[0], x, -3.0, 0.4):
            return [(-1.0, False)] * 5
        return [(1.0, False)] * 5

    # 尝试等待 / 后退前缀
    dirs = (1.0,) if tailgated else (0.0, -1.0)
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
        air = search_survive_air(geom, fds, 0, init, 26, mask_use, opp_traj=opp_traj)
        if air is not None:
            if DEBUG:
                print(f"FALLBACK-AIR-SEARCH x={x:.2f} y={y:.2f} acts={air}", file=sys.stderr)
            return _pad5(air)
        if DEBUG:
            print(f"FALLBACK-AIR x={x:.2f} y={y:.2f} vy={vy:.2f}", file=sys.stderr)
        return _air_choice(geom, fds, init, mask_use, allow_brake=not tailgated)
    if on_crumble and not tailgated:
        if DEBUG:
            print(f"FALLBACK-CRUMBLE2 x={x:.2f} y={y:.2f}", file=sys.stderr)
        if _safe_behind(geom, x) and not _dyn_near(fds[0], x, -3.0, 0.4):
            return [(-1.0, False)] * 5
        return [(1.0, False)] * 5
    if tailgated:
        # 被对手尾随时不能原地等待/后退（会被顶进危险物），但也不能像旧版那样
        # 只按 move=1 找“活得最久”的路线——那会全速跳进锯齿。
        # 先尝试“起跳后空中刹车修正落点”的完整存活方案。
        air = search_survive_air(geom, fds, 0, init, 24, mask_use, opp_traj=opp_traj)
        if air is not None:
            if DEBUG:
                print(f"FALLBACK-TAIL-AIR x={x:.2f} acts={air}", file=sys.stderr)
            return _pad5(air)
        sf, acts = search_longest2(geom, fds, 0, init, 40, mask_use, moves=(1.0,))
        if sf < 24:
            # 全速前冲 1.2 秒内必死：与其被顶着送进危险物，不如后跳脱身保住命。
            esc = plan_escape_back(geom, fds, init, mask_use)
            if esc is not None:
                if DEBUG:
                    print(f"FALLBACK-TAIL-ESCAPE x={x:.2f} sf={sf}", file=sys.stderr)
                return _pad5(esc)
        if DEBUG:
            print(f"FALLBACK-TAIL x={x:.2f} sf={sf} acts={acts}", file=sys.stderr)
        return _pad5([(float(m), bool(j)) for (m, j) in acts]) if acts else [(1.0, False)] * 5
    fd0 = fds[0]
    if (ctx['stall'] >= 4 and _static_ahead(geom, x, mask_use)
            and not _dyn_near(fd0, x, -0.3, 4.0)
            and _safe_behind(geom, x)
            and not _dyn_near(fd0, x, -3.0, 0.4)):
        if DEBUG:
            print(f"FALLBACK-BACK x={x:.2f} stall={ctx['stall']}", file=sys.stderr)
        return [(-1.0, False)] * 5
    # 最后才原地等；但如果脚下这个点本身就在“迟早会被打到”的位置
    # （食人花/锯齿巡逻带/地刺），等下去等于赌命：能退就退，退不了就挑一条
    # “活得最久”的前进路线硬闯，至少还有机会。
    if _unsafe_stand(ctx, geom, fd0, x, y):
        if _safe_behind(geom, x) and not _dyn_near(fd0, x, -3.0, 0.4):
            if DEBUG:
                print(f"FALLBACK-UNSAFE-STAND x={x:.2f} y={y:.2f} back", file=sys.stderr)
            return [(-1.0, False)] * 5
        if acts0:
            if DEBUG:
                print(f"FALLBACK-UNSAFE-STAND x={x:.2f} y={y:.2f} forward sf={sf0}", file=sys.stderr)
            return _pad5([(float(m), bool(j)) for (m, j) in acts0])
        if DEBUG:
            print(f"FALLBACK-UNSAFE-STAND x={x:.2f} y={y:.2f} forward", file=sys.stderr)
        return [(1.0, False)] * 5
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
        t_start = time.monotonic()
        try:
            obs = json.loads(line)
            plan = handle(obs, ctx)
        except Exception as exc:
            import traceback
            traceback.print_exc(file=sys.stderr)
            plan = [(1.0, False)] * 5
        # 安全阀：单窗口接近硬上限时，接下来两个窗口跳过量化的边界复核，优先保证按时返回。
        global FAST_MODE
        elapsed = time.monotonic() - t_start
        if elapsed > 2.5:
            ctx['fast_left'] = 2
        elif ctx.get('fast_left', 0) > 0:
            ctx['fast_left'] -= 1
        FAST_MODE = ctx.get('fast_left', 0) > 0
        frames = [[{'move': float(m), 'jump': bool(j)}] for (m, j) in plan]
        sys.stdout.write(json.dumps({'inputs': frames}) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
