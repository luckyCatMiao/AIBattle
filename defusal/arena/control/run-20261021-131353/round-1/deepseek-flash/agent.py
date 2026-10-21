#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""爆破模式 5v5 参赛程序。

协议：stdin 每行一个 JSON 观察；stdout 每行一个 JSON 响应。
  phase == "buy"  -> {"buys":[...]}
  phase == "live" -> {"inputs":[[20 帧 x 5 单位]]}

策略概要：
  * 进攻：5 人选择 A/B 一点，携带者进点下包，其余人占据包点四周掩护；
    下包后围绕炸弹防守，发现拆包进度则集火靠近。
  * 防守：2-2-1 分布（A 两人、B 两人、中路一人），中路依情报轮转；
    下包后由最近/带拆包器的两人站定拆包，其余人在炸弹外围架枪掩护，
    避免全队涌入包点被逐个击破。
  * 每个单位独立视野，但指挥官可融合全队 sightings 做朝向/集火决策。
  * 自动开火由服务器完成（自动瞄准最近可开火敌人），此处只需把朝向
    对准目标；因此走位用侧移躲子弹，射击用瞄准锁定。
"""

import sys
import json
import math
import heapq
import os

DEBUG = bool(os.environ.get('AGENT_DEBUG'))

SQ = math.sqrt(0.5)
DIRS = {
    'N': (0.0, 0.0),
    'U': (0.0, -1.0), 'D': (0.0, 1.0), 'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-SQ, -SQ), 'UR': (SQ, -SQ), 'DL': (-SQ, SQ), 'DR': (SQ, SQ),
}
AIM_DIRS = ['U', 'UR', 'R', 'DR', 'D', 'DL', 'L', 'UL']
DIR_ANG = {n: math.atan2(v[1], v[0]) for n, v in DIRS.items() if n != 'N'}

DT = 1.0 / 20.0
SPEED = 3.0
RADIUS = 0.30
VISION_RANGE = 8.0
HALF_ANGLE = math.radians(50.0)
PROXIMITY = 2.0
NEUTRAL = {'dir': 'N', 'aim': 'N'}


def clamp(v, a, b):
    return max(a, min(b, v))


class GameMap(object):
    __slots__ = ('w', 'h', 't')

    def __init__(self, w, h, tiles):
        self.w = int(w)
        self.h = int(h)
        self.t = tiles

    def wall(self, tx, ty):
        if tx < 0 or ty < 0 or tx >= self.w or ty >= self.h:
            return True
        return self.t[ty * self.w + tx] == 1

    def tile_wall(self, x, y):
        return self.wall(int(math.floor(x)), int(math.floor(y)))

    def circle_hits(self, x, y, r=RADIUS):
        minx = int(math.floor(x - r))
        maxx = int(math.floor(x + r))
        miny = int(math.floor(y - r))
        maxy = int(math.floor(y + r))
        rr = r * r
        for ty in range(miny, maxy + 1):
            for tx in range(minx, maxx + 1):
                if tx < 0 or ty < 0 or tx >= self.w or ty >= self.h:
                    continue
                if self.t[ty * self.w + tx] != 1:
                    continue
                cx = clamp(x, float(tx), float(tx + 1))
                cy = clamp(y, float(ty), float(ty + 1))
                if (x - cx) ** 2 + (y - cy) ** 2 < rr:
                    return True
        return False

    def los(self, x1, y1, x2, y2):
        dx = x2 - x1
        dy = y2 - y1
        d = math.hypot(dx, dy)
        if d < 1e-6:
            return True
        steps = max(1, int(math.ceil(d / 0.1)))
        for i in range(1, steps):
            t = i / steps
            if self.tile_wall(x1 + dx * t, y1 + dy * t):
                return False
        return True


def move_unit(mp, x, y, dirname):
    dx, dy = DIRS[dirname]
    if dx == 0.0 and dy == 0.0:
        return x, y
    l = math.hypot(dx, dy)
    step = SPEED * DT
    nx = x + dx / l * step
    if not mp.circle_hits(nx, y):
        x = nx
    ny = y + dy / l * step
    if not mp.circle_hits(x, ny):
        y = ny
    return x, y


def angle_of(dx, dy):
    return math.atan2(dy, dx)


def angle_diff(a, b):
    d = (a - b + math.pi) % (2.0 * math.pi)
    if d < 0:
        d += 2.0 * math.pi
    return abs(d - math.pi)


def quantize_dir(ang):
    best = 'U'
    bd = 1e9
    for n in AIM_DIRS:
        d = angle_diff(DIR_ANG[n], ang)
        if d < bd:
            bd = d
            best = n
    return best


def dist(ax, ay, bx, by):
    return math.hypot(ax - bx, ay - by)


# ---------------------------------------------------------------- 寻路

def nearest_open(mp, tx, ty, maxr=12):
    if not mp.wall(tx, ty):
        return tx, ty
    best = None
    for r in range(1, maxr + 1):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if max(abs(dx), abs(dy)) != r:
                    continue
                nx, ny = tx + dx, ty + dy
                if 0 <= nx < mp.w and 0 <= ny < mp.h and not mp.wall(nx, ny):
                    d = dx * dx + dy * dy
                    if best is None or d < best[0]:
                        best = (d, nx, ny)
        if best is not None:
            return best[1], best[2]
    return tx, ty


def astar(mp, start, goal):
    """8 方向 A*，禁止切墙角；返回格子中心点列表（不含起点）。"""
    sx, sy = int(math.floor(start[0])), int(math.floor(start[1]))
    gx, gy = int(math.floor(goal[0])), int(math.floor(goal[1]))
    sx, sy = nearest_open(mp, sx, sy)
    gx, gy = nearest_open(mp, gx, gy)
    if (sx, sy) == (gx, gy):
        return [(gx + 0.5, gy + 0.5)]
    sq2 = math.sqrt(2.0)
    moves = ((1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0),
             (1, 1, sq2), (1, -1, sq2), (-1, 1, sq2), (-1, -1, sq2))

    def h(x, y):
        dx = abs(x - gx)
        dy = abs(y - gy)
        return (dx + dy) + (sq2 - 2.0) * min(dx, dy)

    openl = [(h(sx, sy), 0.0, sx, sy)]
    gscore = {(sx, sy): 0.0}
    came = {}
    closed = set()
    found = False
    while openl:
        f, gcur, x, y = heapq.heappop(openl)
        if (x, y) in closed:
            continue
        closed.add((x, y))
        if (x, y) == (gx, gy):
            found = True
            break
        for dx, dy, c in moves:
            nx, ny = x + dx, y + dy
            if mp.wall(nx, ny):
                continue
            if dx and dy and (mp.wall(x + dx, y) or mp.wall(x, y + dy)):
                continue
            ng = gcur + c
            if ng < gscore.get((nx, ny), 1e18) - 1e-12:
                gscore[(nx, ny)] = ng
                came[(nx, ny)] = (x, y)
                heapq.heappush(openl, (ng + h(nx, ny), ng, nx, ny))
    if not found:
        return []
    path = []
    cur = (gx, gy)
    while cur != (sx, sy):
        path.append((cur[0] + 0.5, cur[1] + 0.5))
        cur = came[cur]
    path.reverse()
    return path


class Path(object):
    __slots__ = ('pts', 'i')

    def __init__(self, pts):
        self.pts = pts
        self.i = 0

    def arrived(self, x, y):
        while self.i < len(self.pts) and dist(x, y, self.pts[self.i][0], self.pts[self.i][1]) < 0.32:
            self.i += 1
        return self.i >= len(self.pts)

    def waypoint(self):
        if self.i < len(self.pts):
            return self.pts[self.i]
        return None


def pref_dirs(dx, dy):
    ang = math.atan2(dy, dx)
    return sorted(AIM_DIRS, key=lambda n: angle_diff(DIR_ANG[n], ang))


def follow(mp, x, y, path):
    """朝下一个路点走一步；返回 dir。到达/无路可走时返回 N。"""
    if path is None or path.arrived(x, y):
        return 'N', 0.0, 0.0
    wp = path.waypoint()
    if wp is None:
        return 'N', 0.0, 0.0
    wx, wy = wp
    oldd = (x - wx) ** 2 + (y - wy) ** 2
    best = None
    bestd = oldd
    for n in pref_dirs(wx - x, wy - y):
        nx, ny = move_unit(mp, x, y, n)
        d = (nx - wx) ** 2 + (ny - wy) ** 2
        if d < bestd - 1e-12:
            best = (n, nx, ny)
            bestd = d
    if best is None:
        return 'N', x, y
    return best


# ---------------------------------------------------------------- 记忆/预测

class Brain(object):
    def __init__(self):
        self.enemies = {}      # id -> dict(x,y,vx,vy,frame,hp?)
        self.round = None
        self.last_site = None
        self.chosen_site = None
        self.unit_meta = {}    # index -> role/post data

    def reset_round(self, obs):
        self.enemies = {}
        self.unit_meta = {}

    def update_enemies(self, obs):
        frame = obs.get('frame', 0)
        for u in obs.get('units', []):
            if not u.get('alive'):
                continue
            for e in (obs.get('visibleEnemies', {}) or {}).get(u.get('id'), []) or []:
                eid = e.get('id')
                if not eid:
                    continue
                px, py = float(e['x']), float(e['y'])
                tr = self.enemies.get(eid)
                if tr is None:
                    self.enemies[eid] = {'x': px, 'y': py, 'vx': 0.0, 'vy': 0.0,
                                         'frame': frame, 'weapon': e.get('weapon')}
                else:
                    dt = (frame - tr['frame']) * DT
                    if dt > 1e-6:
                        nvx = (px - tr['x']) / dt
                        nvy = (py - tr['y']) / dt
                        sp = math.hypot(nvx, nvy)
                        if sp < 8.0:  # 合理速度才更新
                            tr['vx'] = 0.5 * tr['vx'] + 0.5 * nvx if tr['frame'] != frame else tr['vx']
                            tr['vy'] = 0.5 * tr['vy'] + 0.5 * nvy if tr['frame'] != frame else tr['vy']
                    tr['x'], tr['y'] = px, py
                    tr['frame'] = frame
        # 丢弃过旧
        for eid in list(self.enemies.keys()):
            if frame - self.enemies[eid]['frame'] > 60:
                del self.enemies[eid]

    def predict(self, eid, t_frames):
        tr = self.enemies[eid]
        return tr['x'] + tr['vx'] * t_frames * DT, tr['y'] + tr['vy'] * t_frames * DT


# ---------------------------------------------------------------- 购买

def decide_buys(obs):
    weapons = obs.get('weapons', {})
    side = obs.get('side', 'attack')
    buys = []

    def wcost(n):
        w = weapons.get(n)
        return int(w.get('cost', 0)) if w else 0

    for u in obs.get('units', []):
        if not u.get('alive', True):
            continue
        money = int(u.get('money', 0))
        cur = u.get('weapon', 'pistol')
        curcost = wcost(cur)
        choice = None
        order = ('rifle', 'smg')
        for name in order:
            c = wcost(name)
            if c > 0 and money >= c and c > curcost:
                choice = name
                break
        b = {'unit': int(u.get('index', 0))}
        spent = 0
        if choice:
            b['weapon'] = choice
            spent = wcost(choice)
        armor_price = int(obs.get('buy', {}).get('armorPrice', 650))
        kit_price = int(obs.get('buy', {}).get('kitPrice', 400))
        if int(u.get('armor', 0)) < 100 and money - spent >= armor_price:
            b['armor'] = True
            spent += armor_price
        if choice is None and cur == 'pistol' and int(u.get('armor', 0)) < 100 and money - spent >= wcost('pdw'):
            b['weapon'] = 'pdw'
            spent += wcost('pdw')
        if side == 'defend' and not u.get('kit', False) and money - spent >= kit_price:
            b['kit'] = True
            spent += kit_price
        if 'weapon' in b or b.get('armor') or b.get('kit'):
            buys.append(b)
    return {'buys': buys}


# ---------------------------------------------------------------- 计划

def site_rects(obs):
    sites = obs.get('map', {}).get('sites', {})
    return sites


def site_center(site):
    return ((site['x1'] + site['x2'] + 1) / 2.0, (site['y1'] + site['y2'] + 1) / 2.0)


def snap_target(mp, x, y):
    tx, ty = int(math.floor(x)), int(math.floor(y))
    ox, oy = nearest_open(mp, tx, ty, 8)
    return ox + 0.5, oy + 0.5


def choose_attack_site(obs, brain):
    seed = int(obs.get('seed', 0) or 0)
    rnd = int(obs.get('round', 1) or 1)
    team = int(obs.get('yourTeam', 0) or 0)
    v = (seed * 1103515245 + rnd * 12345 + team * 77 + 17) & 0x7fffffff
    return 'A' if (v % 2 == 0) else 'B'


def enemy_reference(obs, brain, bx, by):
    """估计“来敌方向”的参考点：优先用最近看到的敌人平均位置，
    没有情报时退化为防守方出生点（规则固定 26~30,y=3）。"""
    frame = int(obs.get('frame', 0) or 0)
    sx = sy = 0.0
    k = 0
    for eid, tr in brain.enemies.items():
        if frame - tr['frame'] <= 100:
            sx += tr['x']; sy += tr['y']; k += 1
    if k:
        rx, ry = sx / k, sy / k
        # 参考点离炸弹太近（刚在包点交火完/残敌就在包点）时不可靠，退回出生点
        if dist(rx, ry, bx, by) >= 8.0:
            return rx, ry
    return 28.0, 3.5


def postplant_positions(mp, bx, by, refx, refy, n=5):
    """下包后的架枪点：站在炸弹“背向来敌”的一侧（敌人参考点 -> 炸弹 的方向再往外），
    离炸弹 2.5~4 格且有视线。拆包者必须贴到炸弹，我们就在炸弹后方近距离架住：
    实体子弹在 2~4 格命中率很高，而且我们不在敌人进点的走廊正面。"""
    vx, vy = bx - refx, by - refy  # 敌人 -> 炸弹
    L = math.hypot(vx, vy) or 1.0
    ux, uy = vx / L, vy / L
    out = []
    # 角度以“敌人->炸弹”方向为 0°：0° 是炸弹正后方，±35/70° 为侧后交叉火力
    pairs = [(0, 2.6), (35, 3.2), (-35, 3.2), (70, 3.9), (-70, 3.9),
             (0, 3.9), (90, 3.2), (-90, 3.2)]
    for adeg, r in pairs * 3:
        if len(out) >= n:
            break
        a = math.radians(adeg)
        dx = ux * math.cos(a) - uy * math.sin(a)
        dy = ux * math.sin(a) + uy * math.cos(a)
        cx = bx + dx * r
        cy = by + dy * r
        tx, ty = int(math.floor(cx)), int(math.floor(cy))
        if mp.wall(tx, ty):
            continue
        p = (tx + 0.5, ty + 0.5)
        if dist(p[0], p[1], bx, by) < 1.6:
            continue
        if not mp.los(p[0], p[1], bx, by):
            continue
        if any(dist(p[0], p[1], q[0], q[1]) < 1.3 for q in out):
            continue
        out.append(p)
    k = 0
    while len(out) < n and k < 48:
        ang = k * math.pi / 24.0
        k += 1
        r = 3.0 if k % 2 else 2.4
        p = snap_target(mp, bx + r * math.cos(ang), by + r * math.sin(ang))
        if dist(p[0], p[1], bx, by) < 1.4:
            continue
        if all(dist(p[0], p[1], q[0], q[1]) > 0.7 for q in out):
            out.append(p)
    return out


def build_plan(obs, brain, mp):
    """返回 {targets: {idx:(x,y) or None}, roles: {idx:str}, watch: {idx:[dirs]}, posts:{idx:(x,y)}}"""
    side = obs.get('side', 'attack')
    units = obs.get('units', [])
    myteam = int(obs.get('yourTeam', 0) or 0)
    sites = site_rects(obs)
    bomb = obs.get('bomb') or {}
    plan = {'targets': {}, 'roles': {}, 'watch': {}, 'posts': {}, 'stand': set()}

    alive_idx = [u['index'] for u in units if u.get('alive')]

    # 敌方最新行踪（用于判断威胁方向）
    frame = obs.get('frame', 0)
    fresh = []
    for eid, tr in brain.enemies.items():
        if frame - tr['frame'] <= 10:
            fresh.append((eid, tr['x'], tr['y']))

    if side == 'attack':
        site_name = brain.chosen_site
        if site_name is None or brain.round != obs.get('round'):
            site_name = choose_attack_site(obs, brain)
            brain.chosen_site = site_name
        site = sites.get(site_name)
        if not site:
            site_name = 'A'
            site = sites.get('A', {'x1': 7, 'y1': 5, 'x2': 14, 'y2': 10})
        cx, cy = site_center(site)
        dir_c = 1.0 if site_name == 'A' else -1.0  # 指向地图中心的方向

        center_target = snap_target(mp, cx, cy)
        # 紧凑队形：5 人抱团进点，集火同一目标；子弹只命中第一个单位，
        # 抱团可让伤害分摊在多个人身上，同时集中火力快速减员。
        posts = [
            snap_target(mp, cx + dir_c * 1.6, cy - 1.1),
            snap_target(mp, cx + dir_c * 1.6, cy + 1.1),
            snap_target(mp, cx - dir_c * 1.2, cy - 1.1),
            snap_target(mp, cx - dir_c * 1.2, cy + 1.1),
        ]
        watch_posts = [
            ['R' if dir_c > 0 else 'L', 'D'],
            ['R' if dir_c > 0 else 'L', 'D'],
            ['R' if dir_c > 0 else 'L', 'DR' if dir_c > 0 else 'DL'],
            ['R' if dir_c > 0 else 'L', 'D'],
        ]

        bomb_state = bomb.get('state')
        carrier_idx = None
        if bomb_state == 'carried' and bomb.get('carrier'):
            cid = str(bomb['carrier'])
            try:
                carrier_idx = int(cid.split('u')[-1])
            except Exception:
                carrier_idx = 0

        # 下包后：在炸弹后方架枪（炸弹与来敌都在正前方）；
        # 有人拆包时原地朝炸弹方向开火，不离开掩体去送。
        if bomb_state == 'planted':
            bx, by = float(bomb.get('x', cx)), float(bomb.get('y', cy))
            refx, refy = enemy_reference(obs, brain, bx, by)
            hold = postplant_positions(mp, bx, by, refx, refy, 5)
            for u in units:
                i = u['index']
                plan['roles'][i] = 'postplant'
                p = hold[i % len(hold)] if hold else (bx, by)
                plan['posts'][i] = p
                plan['targets'][i] = p
                # 朝向取“炸弹方向”和“来敌方向”的角平分线：
                # 100° 视锥可同时覆盖拆包者与正面上来的防守方。
                # 若两者夹角过大（站位在两者之间），直接朝来敌方向。
                a1 = angle_of(bx - p[0], by - p[1])
                a2 = angle_of(refx - p[0], refy - p[1])
                dd = abs((a1 - a2 + math.pi) % (2 * math.pi) - math.pi)
                bis = a1 if dd > 2.0 else math.atan2(math.sin(a1) + math.sin(a2),
                                                     math.cos(a1) + math.cos(a2))
                plan['watch'][i] = [quantize_dir(bis), quantize_dir(bis + 0.45)]
            return plan

        if bomb_state == 'dropped' and 'x' in bomb and 'y' in bomb:
            bx, by = float(bomb['x']), float(bomb['y'])
            pick = None
            bd = 1e18
            for u in units:
                if not u.get('alive'):
                    continue
                d = dist(u['x'], u['y'], bx, by)
                if d < bd:
                    bd = d
                    pick = u['index']
            for u in units:
                i = u['index']
                if i == pick:
                    plan['roles'][i] = 'pickup'
                    plan['targets'][i] = (bx, by)
                else:
                    plan['roles'][i] = 'escort'
                    j = 0 if i == 0 else (i - 1)
                    plan['targets'][i] = posts[j % len(posts)]
                    plan['watch'][i] = watch_posts[j % len(watch_posts)]
                    plan['posts'][i] = plan['targets'][i]
            return plan

        # 未下包：携带者进点，其余掩护
        for u in units:
            i = u['index']
            if i == carrier_idx:
                plan['roles'][i] = 'carrier'
                plan['targets'][i] = center_target
                plan['posts'][i] = center_target
                plan['watch'][i] = ['R' if dir_c > 0 else 'L', 'D']
            else:
                j = 0 if i == 0 else i - 1
                if i == 0:
                    plan['roles'][i] = 'escort'
                    plan['targets'][i] = center_target
                    plan['posts'][i] = center_target
                    plan['watch'][i] = ['R' if dir_c > 0 else 'L', 'D']
                else:
                    plan['roles'][i] = 'escort'
                    p = posts[j % len(posts)]
                    plan['targets'][i] = p
                    plan['posts'][i] = p
                    plan['watch'][i] = watch_posts[j % len(watch_posts)]
        return plan

    # ---------------- 防守 ----------------
    bomb_state = bomb.get('state')
    if bomb_state == 'planted':
        # 拆包分工：最近的两人（优先带拆包器）去拆包，其余在炸弹外围
        # 架枪掩护——不再五人一起冲包点，避免被守包的进攻方逐个点掉。
        bx, by = float(bomb.get('x', 0.0)), float(bomb.get('y', 0.0))
        alive_units = [u for u in units if u.get('alive')]
        order = sorted(alive_units, key=lambda u: (0 if u.get('kit') else 1,
                                                   dist(u['x'], u['y'], bx, by)))
        defuser_ids = set(u['index'] for u in order[:2])
        cover_slots = []
        for u in order:
            i = u['index']
            if i in defuser_ids:
                plan['roles'][i] = 'defuse'
                plan['targets'][i] = (bx, by)
                plan['watch'][i] = ['D']
                plan['stand'].add(i)
                continue
            # 掩护位：从炸弹沿该防守者来路方向外推，左右错开并保持对包点的视野
            base = angle_of(u['x'] - bx, u['y'] - by)
            placed = None
            for off in (0.55, -0.55, 1.0, -1.0, 0.0):
                ang = base + off
                for rr in (5.6, 4.9, 4.2):
                    p = snap_target(mp, bx + rr * math.cos(ang), by + rr * math.sin(ang))
                    if dist(p[0], p[1], bx, by) < 3.4:
                        continue
                    if not mp.los(p[0], p[1], bx, by):
                        continue
                    if any(dist(p[0], p[1], q[0], q[1]) < 2.0 for q in cover_slots):
                        continue
                    placed = p
                    break
                if placed is not None:
                    break
            if placed is None:
                plan['roles'][i] = 'defuse'
                plan['targets'][i] = (bx, by)
                plan['watch'][i] = ['D']
                plan['stand'].add(i)
                continue
            cover_slots.append(placed)
            plan['roles'][i] = 'cover'
            plan['targets'][i] = placed
            plan['posts'][i] = placed
            wa = quantize_dir(angle_of(bx - placed[0], by - placed[1]))
            plan['watch'][i] = [wa, quantize_dir(angle_of(bx - placed[0], by - placed[1]) + 0.5)]
        return plan

    A = sites.get('A')
    B = sites.get('B')
    if not A or not B:
        return plan
    acx, acy = site_center(A)
    bcx, bcy = site_center(B)
    # 包点纵深处设防：进攻方多从地图中心方向（走廊）进入，退到包点远端、
    # 面朝入口，让对手必须穿过包点空地，同时自己不易被首轮集火秒掉。
    positions = {
        0: snap_target(mp, A['x1'] + 1.0, acy - 1.6),
        1: snap_target(mp, A['x1'] + 1.0, acy + 1.6),
        2: snap_target(mp, B['x2'] - 1.0, bcy - 1.6),
        3: snap_target(mp, B['x2'] - 1.0, bcy + 1.6),
        4: snap_target(mp, (mp.w - 1) / 2.0, 7.5),
    }
    watches = {
        0: ['R', 'DR'],
        1: ['R', 'DR'],
        2: ['L', 'DL'],
        3: ['L', 'DL'],
        4: ['D', 'R', 'L'],
    }
    # 威胁计数：靠近某包点的最新敌踪
    threat = {'A': 0, 'B': 0}
    for eid, ex, ey in fresh:
        if dist(ex, ey, acx, acy) < 13.0:
            threat['A'] += 1
        if dist(ex, ey, bcx, bcy) < 13.0:
            threat['B'] += 1
    a_alive = sum(1 for u in units if u.get('alive') and u['index'] in (0, 1))
    b_alive = sum(1 for u in units if u.get('alive') and u['index'] in (2, 3))

    # 中路单位：看到成规模敌情就撤向离敌人更远的包点纵深，保存人数等待拆包期，
    # 不要 1v5 送死。
    mid_retreat_pos = None
    mid_u = next((u for u in units if u['index'] == 4 and u.get('alive')), None)
    if mid_u is not None:
        near = [(ex, ey) for (eid, ex, ey) in fresh if dist(mid_u['x'], mid_u['y'], ex, ey) < 11.0]
        if len(near) >= 1:
            ex_mean = sum(p[0] for p in near) / len(near)
            far_site = 'A' if ex_mean > (mp.w - 1) / 2.0 else 'B'
            if far_site == 'A':
                mid_retreat_pos = snap_target(mp, A['x1'] + 1.0, acy)
            else:
                mid_retreat_pos = snap_target(mp, B['x2'] - 1.0, bcy)

    for u in units:
        i = u['index']
        plan['roles'][i] = 'hold'
        pos = positions[i]
        wd = watches[i]
        if i == 4 and mid_retreat_pos is not None:
            pos = mid_retreat_pos
            wd = ['D', 'R', 'L']
        plan['targets'][i] = pos
        plan['posts'][i] = pos
        plan['watch'][i] = wd
    return plan


# ---------------------------------------------------------------- live 主逻辑

def weapon_range(obs, wid):
    w = obs.get('weapons', {}).get(wid) or {}
    return float(w.get('range', 18.0))


def pick_target(brain, obs, mp, idx, x, y, frame_off, wrange):
    """选择朝向目标；返回 (px,py,dist,age) 或 None。
    朝向只需把敌人放进 100° 视锥（服务端会自动精确瞄准最近敌人），
    所以用“最近观测位置 + 很小的限幅提前量”，避免速度噪声/侧移导致朝向甩出视锥。"""
    frame = obs.get('frame', 0)
    best = None
    bd = 1e18
    for eid, tr in brain.enemies.items():
        age = frame - tr['frame']
        if age > 24:  # 1.2s 内的情报
            continue
        ox, oy = tr['x'], tr['y']
        d = dist(x, y, ox, oy)
        if d > wrange:
            continue
        if d > 0.001 and not mp.los(x, y, ox, oy):
            continue
        # 提前量最多 0.12*d（角度误差 <7°），且最多 0.3s 的预测
        lead = min(0.3, 0.12 * d / max(1.0, math.hypot(tr['vx'], tr['vy']) or 1.0))
        px = ox + tr['vx'] * lead
        py = oy + tr['vy'] * lead
        # 更偏好新鲜目标
        score = d + age * 0.4
        if score < bd:
            bd = score
            best = (px, py, d, age)
    return best


def live(obs, brain):
    mp = GameMap(obs['map']['width'], obs['map']['height'], obs['map']['tiles'])
    frame0 = int(obs.get('frame', 0) or 0)
    brain.update_enemies(obs)
    rnd = obs.get('round')
    if brain.round != rnd:
        brain.round = rnd
        brain.reset_round(obs)
        brain.chosen_site = None
        brain.update_enemies(obs)
    plan = build_plan(obs, brain, mp)

    units = obs.get('units', [])
    units_by_idx = {u['index']: u for u in units}
    alive = {u['index']: bool(u.get('alive')) for u in units}
    sim = {u['index']: (float(u['x']), float(u['y'])) for u in units}
    paths = {}
    for u in units:
        i = u['index']
        tgt = plan['targets'].get(i)
        if alive[i] and tgt is not None:
            paths[i] = Path(astar(mp, sim[i], tgt))
        else:
            paths[i] = Path([])

    out = []
    dbg = []
    for f in range(20):
        row = [dict(NEUTRAL) for _ in range(5)]
        t_off = f + 1
        for u in units:
            i = u['index']
            if not alive[i]:
                continue
            x, y = sim[i]
            ud = units_by_idx[i]
            wr = weapon_range(obs, ud.get('weapon', 'pistol'))
            role = plan['roles'].get(i, 'hold')
            post = plan['posts'].get(i)
            watch = plan['watch'].get(i) or ['D']
            # 目标选择（用全队视野融合后的敌踪）
            tgt = pick_target(brain, obs, mp, i, x, y, t_off, wr)

            # 默认按路径移动
            dname, nx, ny = follow(mp, x, y, paths[i])
            holding = (paths[i].i >= len(paths[i].pts))

            # 站定类角色
            must_stand = False
            if role == 'carrier' and holding:
                must_stand = True
            elif role == 'defuse':
                b = obs.get('bomb') or {}
                if b.get('state') == 'planted':
                    bd = dist(x, y, float(b.get('x', 0)), float(b.get('y', 0)))
                    if bd <= 1.0:
                        must_stand = True

            # 瞄准：有目标打目标；否则行进时优先朝目标方向（避免背对包点），
            # 到达岗位后按观察方向慢扫。
            if tgt is not None:
                aim = quantize_dir(angle_of(tgt[0] - x, tgt[1] - y))
            else:
                obj = plan['targets'].get(i)
                if (not holding) and obj is not None and dist(x, y, obj[0], obj[1]) < 18.0:
                    aim = quantize_dir(angle_of(obj[0] - x, obj[1] - y))
                    # 每 2 秒轻微侧扫，扩大视野
                    if ((frame0 + f) // 40) % 2 == 1:
                        aim = quantize_dir(angle_of(obj[0] - x, obj[1] - y) + 0.6)
                elif (not holding) and dname != 'N':
                    aim = dname
                else:
                    wd = watch[((frame0 + f) // 50) % len(watch)] if watch else 'D'
                    aim = wd

            # 移动决策
            if must_stand:
                dname = 'N'
            elif tgt is not None:
                td = tgt[2]
                # 交火：只有“驻守/已到位”的单位才原地侧移；进攻途中继续推进，
                # 移动本身就能躲子弹，且能缩短弹道、提高命中。
                engage_move = td < 8.5
                can_strafe = holding or role in ('hold', 'postplant', 'cover')
                if engage_move and can_strafe:
                    if post is None or dist(x, y, post[0], post[1]) <= 2.0:
                        base = angle_of(tgt[0] - x, tgt[1] - y)
                        perp = base + (math.pi / 2.0 if ((frame0 + f) // 20) % 2 == 0 else -math.pi / 2.0)
                        sd = quantize_dir(perp)
                        tx2, ty2 = move_unit(mp, x, y, sd)
                        if abs(tx2 - x) + abs(ty2 - y) > 1e-9:
                            dname = sd
                        else:
                            sd2 = quantize_dir(perp + math.pi)
                            tx2, ty2 = move_unit(mp, x, y, sd2)
                            if abs(tx2 - x) + abs(ty2 - y) > 1e-9:
                                dname = sd2
                            else:
                                dname = 'N'
                elif holding and role in ('hold', 'postplant', 'cover'):
                    base_ang = DIR_ANG.get(aim, 0.0)
                    perp = base_ang + (math.pi / 2.0 if ((frame0 + f) // 14) % 2 == 0 else -math.pi / 2.0)
                    sd = quantize_dir(perp)
                    tx2, ty2 = move_unit(mp, x, y, sd)
                    if abs(tx2 - x) + abs(ty2 - y) > 1e-9 and (post is None or dist(tx2, ty2, post[0], post[1]) <= 2.2):
                        dname = sd
                elif td < 14.0 and dname != 'N':
                    # 进攻途中之字形推进：一半速度向前 + 横向摆动躲弹
                    ring = ['U', 'UR', 'R', 'DR', 'D', 'DL', 'L', 'UL']
                    try:
                        k = ring.index(dname)
                    except ValueError:
                        k = -1
                    if k >= 0:
                        side = 1 if ((frame0 + f) // 10) % 2 == 0 else -1
                        cand = ring[(k + side) % 8]
                        tx2, ty2 = move_unit(mp, x, y, cand)
                        if abs(tx2 - x) + abs(ty2 - y) > 1e-9:
                            dname = cand
            elif holding and role in ('hold', 'postplant'):
                # 无目标时小范围横向踱步，降低被远程预瞄命中的概率
                base_ang = DIR_ANG.get(aim, 0.0)
                perp = base_ang + (math.pi / 2.0 if ((frame0 + f) // 14) % 2 == 0 else -math.pi / 2.0)
                sd = quantize_dir(perp)
                tx2, ty2 = move_unit(mp, x, y, sd)
                if abs(tx2 - x) + abs(ty2 - y) > 1e-9 and (post is None or dist(tx2, ty2, post[0], post[1]) <= 2.2):
                    dname = sd
            # 执行移动并同步位置
            nx, ny = move_unit(mp, x, y, dname)
            sim[i] = (nx, ny)
            row[i] = {'dir': dname, 'aim': aim}
            if f == 19 and DEBUG:
                dbg.append('u%d %s pos=%.1f,%.1f tgt=%s aim=%s dir=%s hold=%s' % (
                    i, role, nx, ny, (('%d@%.1f' % (tgt[3], tgt[2])) if tgt is not None else '-'), aim, dname, holding))
        out.append(row)
    if DEBUG:
        sys.stderr.write('WIN f%d %s\n' % (frame0, ' | '.join(dbg)))
    return {'inputs': out}


# ---------------------------------------------------------------- 主循环

def neutral_window():
    return {'inputs': [[dict(NEUTRAL) for _ in range(5)] for _ in range(20)]}


def main():
    brain = Brain()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
        except Exception:
            print(json.dumps(neutral_window()), flush=True)
            continue
        phase = obs.get('phase')
        try:
            if phase == 'buy':
                resp = decide_buys(obs)
            elif phase == 'live':
                resp = live(obs, brain)
            else:
                resp = neutral_window()
        except Exception as exc:
            try:
                sys.stderr.write('agent error: %r\n' % (exc,))
            except Exception:
                pass
            resp = neutral_window() if phase != 'buy' else {'buys': []}
        sys.stdout.write(json.dumps(resp, separators=(',', ':')) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
