#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""爆破模式 5v5 参赛程序。

协议：stdin 每行一个 JSON 观察；stdout 每行一个 JSON 响应。
  phase == "buy"  -> {"buys":[...]}
  phase == "live" -> {"inputs":[[20 帧 x 5 单位]]}

策略概要：
  * 进攻：5 人抱团打 A/B 一点；携带者先在后 7 格等待，4 名护卫进点后
    再上前下包，避免携带者第一个被集火掉包。下包后 5 人占据炸弹周围
    有掩体、对炸弹有视线的错开点位，朝“炸弹—来敌”的角平分线架枪。
  * 防守：默认 5 人重堆 B（依据第 1 轮公开战报：对手 4 次进攻 3 次打 B），
    其中 1 人兼顾侧翼/背面入口；A 点不设常驻，靠下包后的集结回防。
    下包后先集结到炸弹 8.8 格外，再 2 人拆包、其余人外围架枪，避免逐个送。
    （环境变量 AGENT_STACK 仅用于本地对照，正式默认保持 B。）
  * 每个单位独立视野，但指挥官可融合全队 sightings 做朝向/集火决策。
  * 自动开火由服务器完成（自动瞄准最近可开火敌人），此处只需把朝向
    对准目标；因此走位用侧移躲子弹，射击用瞄准锁定。
"""

import sys
import json
import math
import heapq
import os
from collections import deque

DEBUG = bool(os.environ.get('AGENT_DEBUG'))
COLLAPSE = os.environ.get('AGENT_COLLAPSE', '0') == '1'
STACK_SITE = os.environ.get('AGENT_STACK', 'auto')  # 'auto' / 'A' / 'B'
STACK_N = int(os.environ.get('AGENT_STACK_N', '5') or 5)
# 实验开关（正式运行不设置 -> 默认值）
FORCE_SITE = os.environ.get('AGENT_FORCE_SITE', '').upper()
DEF_SCHEME = os.environ.get('AGENT_DEF_SCHEME', 'stack')
RETAK_EARLY = os.environ.get('AGENT_RETAKE_EARLY', '0') == '1'
POSTPLANT = os.environ.get('AGENT_POSTPLANT', 'close')
TURTLE = os.environ.get('AGENT_TURTLE', '0') == '1'
ATK_POLICY = os.environ.get('AGENT_ATK_POLICY', 'repeat')  # repeat / alt
RETAKE_MODE = os.environ.get('AGENT_RETAKE_MODE', 'flank')  # flank / split
RUSH_T = float(os.environ.get('AGENT_RUSH_T', '16') or 16)
# 防守消融开关（正式运行不设置 -> 新默认）
EXPOSURE_W = float(os.environ.get('AGENT_EXPOSURE_W', '0.24') or 0)
WATCH_MODE = os.environ.get('AGENT_WATCH', 'all')  # all / legacy
FLANK_WATCH = os.environ.get('AGENT_FLANK_WATCH', '0') == '1'   # 实验项，默认关闭
# 双路进攻实验：3 人走主入口、2 人走方位差最大的副入口，两边到位后同时进点。
SPLIT_ATK = os.environ.get('AGENT_ATK_SPLIT', '0') == '1'
# 下包紧迫度（秒）：剩余时间低于该值时携带者不再因附近敌情而拒绝站定下包。
# 0 = 关闭（旧行为）。
PLANT_URGENT = float(os.environ.get('AGENT_PLANT_URGENT', '0') or 0)
# 携带者是否在后 7 格等待护卫进点（1=旧行为，0=与队伍一起进点）。
CARRIER_WAIT = os.environ.get('AGENT_CARRIER_WAIT', '1') == '1'
# 携带者等待点与包点的距离（格）。
CARRIER_GAP = float(os.environ.get('AGENT_CARRIER_GAP', '7') or 7)
# 下包危险判定是否要求敌人与我方有视线（1=墙后敌人不阻止下包）。
PLANT_LOS = os.environ.get('AGENT_PLANT_LOS', '0') == '1'

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
        self.def_commit = None # (site, until_frame)
        self.map_cache = {}    # (match id, seed) -> 静态防守点位，避免每窗口重算
        # 跨回合情报（reset_round 不清空）
        self.round_sides = {}  # round -> 'attack'/'defend'
        self.round_site = {}   # round -> 我方本回合选择的进攻点
        self.round_plant_site = {}  # round -> 实际下包点（我方进攻时）
        self.round_seen = {}   # round -> {'A': 在该点 14 格内见过的不同敌人数, 'B': ...}
        self.round_seen_ids = {}  # round -> set(见过的敌人 id)
        self._cur_sites = {}   # 当前帧的包点中心缓存
        self.match_id = None
        # 弹道反推：敌方子弹 id -> (x, y, frame)；以及由弹道方向估计的威胁射线
        self.ebullets = {}
        self.threats = []      # [(angle_toward_shooter, frame, bx, by)]
        self.strafe = {}       # unit idx -> {'sign': +-1, 'ang': float}
        self.split_field = {}  # (match key) -> 进攻出生点 BFS 距离场
        self.split_go = {}     # (round, site) -> 双路进攻是否已同时压上

    def reset_match(self):
        """换局（id 变化）时清空跨回合情报，避免上一局的数据污染本局预测。"""
        self.enemies = {}
        self.unit_meta = {}
        self.def_commit = None
        self.round = None
        self.chosen_site = None
        self.round_sides = {}
        self.round_site = {}
        self.round_plant_site = {}
        self.round_seen = {}
        self.round_seen_ids = {}
        self.ebullets = {}
        self.threats = []
        self.strafe = {}
        self.split_field = {}
        self.split_go = {}

    def reset_round(self, obs):
        self.enemies = {}
        self.unit_meta = {}
        self.def_commit = None
        self.ebullets = {}
        self.threats = []
        self.strafe = {}
        self.split_go = {}

    def update_bullets(self, obs):
        """用敌方子弹的位移方向反推射手方位。

        引擎只把「己方视野内」的敌方子弹放进观察，而且没有速度字段；用相邻
        两个观察窗口（间隔 1 秒）里同一发子弹的位移即可得到弹道方向。子弹飞向
        我们，所以反方向就是射手所在的方向。单位视野只有 8 格、而武器射程可到
        24 格：被 20 格外的步枪点名时，这是唯一能立刻朝射手转向、并让自动开火
        反击的信息来源。
        """
        frame = int(obs.get('frame', 0) or 0)
        myteam = int(obs.get('yourTeam', 0) or 0)
        seen = {}
        for b in obs.get('bullets') or []:
            try:
                if int(b.get('team', -1)) == myteam:
                    continue
                bid = b.get('id')
                bx, by = float(b['x']), float(b['y'])
            except Exception:
                continue
            prev = self.ebullets.get(bid)
            if prev is not None:
                dt = (frame - prev[2]) * DT
                if dt > 0.05:
                    vx = (bx - prev[0]) / dt
                    vy = (by - prev[1]) / dt
                    sp = math.hypot(vx, vy)
                    # 步枪/狙击的弹速 9.5~13 格/秒，允许一定误差
                    if 4.0 <= sp <= 22.0:
                        self.threats.append((math.atan2(-vy, -vx), frame, bx, by))
            seen[bid] = (bx, by, frame)
        self.ebullets = seen
        self.threats = [t for t in self.threats if frame - t[1] <= 40][-60:]

    def update_enemies(self, obs):
        frame = obs.get('frame', 0)
        rnd = int(obs.get('round', 0) or 0)
        sites = ((obs.get('map') or {}).get('sites') or {})
        if sites:
            self._cur_sites = {}
            for k in ('A', 'B'):
                v = sites.get(k)
                if v:
                    self._cur_sites[k] = ((float(v['x1']) + float(v['x2'])) / 2.0,
                                          (float(v['y1']) + float(v['y2'])) / 2.0)
            seen = self.round_seen.setdefault(rnd, {'A': set(), 'B': set()})
            ids = self.round_seen_ids.setdefault(rnd, set())
        else:
            seen = ids = None
        for u in obs.get('units', []):
            if not u.get('alive'):
                continue
            for e in (obs.get('visibleEnemies', {}) or {}).get(u.get('id'), []) or []:
                eid = e.get('id')
                if not eid:
                    continue
                px, py = float(e['x']), float(e['y'])
                if seen is not None:
                    ids.add(eid)
                    for sn, (sx, sy) in self._cur_sites.items():
                        if dist(px, py, sx, sy) <= 14.0:
                            seen[sn].add(eid)
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
    """CS 式购买：先保证“买得起枪之后还留得下护甲钱”，再买护甲/拆弹器。

    关键点（引擎按 武器 -> 护甲 -> 拆弹器 的顺序逐条结算，买不起的条目
    直接忽略）：
      * $800 手枪局：只买护甲（$650），留 $150；护甲吸收 50% 伤害，
        手枪局里等于把有效生命翻倍。
      * 胜一回合后约 $3400：步枪($2700)+护甲($650)=$3350，正好一套。
      * 输一回合后约 $2050：冲锋枪($1250)+护甲($650)=$1900，比裸步枪稳
        （裸步枪没有护甲，对枪时会被冲锋枪+护甲反杀）。
      * 防守方在武器+护甲之后仍有 $400 时买拆弹器（拆包 5s -> 2.5s）。
    """
    weapons = obs.get('weapons', {})
    side = obs.get('side', 'attack')
    buyinfo = obs.get('buy') or {}
    armor_price = int(buyinfo.get('armorPrice', 650))
    kit_price = int(buyinfo.get('kitPrice', 400))

    def wc(n):
        w = weapons.get(n) or {}
        return int(w.get('cost', 9999))

    buys = []
    for u in obs.get('units', []):
        if not u.get('alive', True):
            continue
        i = int(u.get('index', 0))
        money = int(u.get('money', 0))
        cur = u.get('weapon', 'pistol')
        curcost = wc(cur)
        armor = int(u.get('armor', 0) or 0)
        budget = money
        b = {'unit': i}

        want = None
        for name in ('rifle', 'smg', 'pdw'):
            c = wc(name)
            if c <= curcost:
                continue
            need = c + (armor_price if armor < 100 else 0)
            if budget >= need:
                want = name
                break
        # 已有护甲、钱刚好够裸步枪时也可以升级
        if want is None and cur == 'pistol' and armor >= 100 and budget >= wc('rifle'):
            want = 'rifle'
        if want:
            b['weapon'] = want
            budget -= wc(want)
        if armor < 100 and budget >= armor_price:
            b['armor'] = True
            budget -= armor_price
        if side == 'defend' and not u.get('kit', False) and budget >= kit_price:
            if b.get('weapon') or cur != 'pistol' or armor >= 100:
                b['kit'] = True
                budget -= kit_price
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


def _site_from_log(obs, round_no):
    """从 roundLog 读某回合实际下包点（下包点对该回合双方都是公开信息）。"""
    for r in obs.get('roundLog') or []:
        try:
            if int(r.get('round', -1)) != int(round_no):
                continue
        except Exception:
            continue
        b = r.get('bomb') or {}
        if b.get('site') in ('A', 'B'):
            return b.get('site')
    return None


def choose_attack_site(obs, brain):
    """进攻选点：首个进攻回合按每局种子弱随机；之后“下包成功就复点，失败就换点”。

    复点的依据：引擎的 canFire 不看 8 格视野，防守方一旦重堆某点，从正面
    进去几乎必然在长通道被预瞄；而如果上一回合能在该点顺利下包，说明那里
    防守薄弱（通常是空点或单人哨），继续打这里比换到对方重堆点更划算。
    """
    if FORCE_SITE in ('A', 'B'):
        return FORCE_SITE
    rnd = int(obs.get('round', 1) or 1)
    prev = None
    for r in range(rnd - 1, 0, -1):
        if brain.round_sides.get(r) == 'attack':
            prev = r
            break
    if prev is not None:
        site = brain.round_site.get(prev)
        planted = brain.round_plant_site.get(prev) in ('A', 'B')
        if ATK_POLICY == 'repeat':
            if planted and site in ('A', 'B') and brain.round_plant_site.get(prev) == site:
                return site
        if site in ('A', 'B'):
            return 'B' if site == 'A' else 'A'
    # 本局第一进攻回合：不受 seed/round 的奇偶规律支配，避免被对手反推
    seed = int(obs.get('seed', 0) or 0)
    team = int(obs.get('yourTeam', 0) or 0)
    h = (seed * 2654435761 + team * 2246822519 + rnd * 3266489917
         + (seed >> 7) * 40503) & 0xffffffff
    h ^= h >> 13
    return 'A' if (h & 1) == 0 else 'B'


def defense_stack_site(obs, brain):
    """防守重堆点：优先按对手本局历史进攻点预测。

    - 固定重堆（AGENT_STACK=A/B）用于实验；
    - auto：取本局此前“我方防守回合”的对手进攻点。两点相同 -> 继续压该点；
      两点不同 -> 按交替规律压更早出现的那个（A,B -> 再压 A）；
    - 首个防守回合没有本局情报。第 2 轮两场里，sol 在**两次首个防守回合**
      （r2-g1 第 4 回合、r2-g2 第 1 回合）都打 A 并成功下包，2/2；
      因此把无情报先验从 B 改为 A，之后仍由本局实际攻点自适应纠正。
    """
    if STACK_SITE in ('A', 'B'):
        return STACK_SITE
    rnd = int(obs.get('round', 1) or 1)
    hist = []
    for r in range(1, rnd):
        if brain.round_sides.get(r) != 'defend':
            continue
        site = _site_from_log(obs, r)
        if site is None:
            seen = brain.round_seen.get(r) or {}
            a = len(seen.get('A') or ())
            b = len(seen.get('B') or ())
            if a != b:
                site = 'A' if a > b else 'B'
        if site in ('A', 'B'):
            hist.append(site)
    if not hist:
        return 'A'
    if len(hist) >= 2 and hist[-1] != hist[-2]:
        return hist[-2]  # 交替规律：A,B -> A；B,A -> B
    return hist[-1]


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
    """下包后的架枪点：以炸弹为中心、朝敌人来向的一侧布置交叉火力，
    优先有掩体、能看见炸弹的位置；保留一个 2~3 格的近点贴包反拆。"""
    base = angle_of(bx - refx, by - refy)
    cands = []
    for adeg in range(-90, 91, 15):
        for r in (2.4, 3.0, 3.8, 4.6, 5.4, 6.2):
            a = base + math.radians(adeg)
            tx = int(math.floor(bx + r * math.cos(a)))
            ty = int(math.floor(by + r * math.sin(a)))
            if mp.wall(tx, ty):
                continue
            p = (tx + 0.5, ty + 0.5)
            dd = dist(p[0], p[1], bx, by)
            if dd < 2.0 or dd > 6.6:
                continue
            if not mp.los(p[0], p[1], bx, by):
                continue
            cover = 0
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    if mp.wall(tx + dx, ty + dy):
                        cover += 1
            score = (0.9 * cover
                     + 1.6 * (1.0 if 2.8 <= dd <= 5.2 else 0.0)
                     + 0.9 * math.cos(math.radians(adeg))
                     - 0.20 * abs(dd - 3.6))
            cands.append((score, p, dd, adeg))
    cands.sort(key=lambda c: -c[0])
    out = []
    for c in cands:
        if c[2] <= 3.1:
            out.append(c[1])
            break
    for c in cands:
        if len(out) >= n:
            break
        p = c[1]
        if any(dist(p[0], p[1], q[0], q[1]) < 1.7 for q in out):
            continue
        out.append(p)
    # 兜底：炸弹周围被墙挡住时，用更小的半径补足点位
    k = 0
    while len(out) < n and k < 64:
        ang = k * math.pi / 32.0
        k += 1
        r = 3.0 if k % 2 else 2.4
        p = snap_target(mp, bx + r * math.cos(ang), by + r * math.sin(ang))
        if dist(p[0], p[1], bx, by) < 1.8:
            continue
        if not mp.los(p[0], p[1], bx, by):
            continue
        if any(dist(p[0], p[1], q[0], q[1]) < 1.2 for q in out):
            continue
        out.append(p)
    return out


# ---------------------------------------------------------------- 防守站位

SIDE_ANG = {'E': 0.0, 'S': math.pi / 2.0, 'W': math.pi, 'N': -math.pi / 2.0}


def site_rect(site):
    return int(site['x1']), int(site['y1']), int(site['x2']), int(site['y2'])


def in_site_rect(site, x, y):
    x1, y1, x2, y2 = site_rect(site)
    return x1 <= int(math.floor(x)) <= x2 and y1 <= int(math.floor(y)) <= y2


def site_entrances(mp, site):
    """包点边界外的可通行入口格，按方位分组。"""
    x1, y1, x2, y2 = site_rect(site)
    out = {}
    def add(x, y, side):
        if 0 <= x < mp.w and 0 <= y < mp.h and not mp.wall(x, y):
            out.setdefault(side, []).append((x + 0.5, y + 0.5))
    for x in range(x1, x2 + 1):
        add(x, y1 - 1, 'N')
        add(x, y2 + 1, 'S')
    for y in range(y1, y2 + 1):
        add(x1 - 1, y, 'W')
        add(x2 + 1, y, 'E')
    for k in out:
        out[k] = sorted(set(out[k]))
    return out


def approach_side(mp, site, sx=27.5, sy=30.5):
    """从进攻出生点到包点的最短路线，最后从哪一侧进入包点。"""
    cx, cy = site_center(site)
    path = astar(mp, (sx, sy), (cx, cy))
    if not path:
        return None
    x1, y1, x2, y2 = site_rect(site)
    prev = (sx, sy)
    for p in path:
        tx, ty = int(math.floor(p[0])), int(math.floor(p[1]))
        if x1 <= tx <= x2 and y1 <= ty <= y2:
            px, py = prev
            if py < y1:
                return 'N'
            if py > y2:
                return 'S'
            if px < x1:
                return 'W'
            if px > x2:
                return 'E'
            return None
        prev = p
    return None


def bfs_field(mp, sx, sy):
    """从进攻出生点出发的 4 邻域 BFS 距离场（格数），不可达为 -1。"""
    W, H = mp.w, mp.h
    d = [-1] * (W * H)
    ox, oy = nearest_open(mp, int(math.floor(sx)), int(math.floor(sy)), 12)
    start = oy * W + ox
    d[start] = 0
    q = deque([start])
    while q:
        p = q.popleft()
        x, y = p % W, p // W
        nd = d[p] + 1
        if x + 1 < W and d[p + 1] < 0 and mp.t[p + 1] != 1:
            d[p + 1] = nd; q.append(p + 1)
        if x > 0 and d[p - 1] < 0 and mp.t[p - 1] != 1:
            d[p - 1] = nd; q.append(p - 1)
        if y + 1 < H and d[p + W] < 0 and mp.t[p + W] != 1:
            d[p + W] = nd; q.append(p + W)
        if y > 0 and d[p - W] < 0 and mp.t[p - W] != 1:
            d[p - W] = nd; q.append(p - W)
    return d


SIDE_ANG2 = {'E': 0.0, 'S': math.pi / 2.0, 'W': math.pi, 'N': -math.pi / 2.0}


def attack_split_points(mp, site, field):
    """每个入口方位选一个离出生点最近的入口格，并给出入口外 3.5 格的集结点。
    返回 [(side, entry, bfs_dist, staging)]，按离出生点的距离排序。"""
    cx, cy = site_center(site)
    ents = site_entrances(mp, site)
    out = []
    W = mp.w
    for side, pts in ents.items():
        best = None
        for ex, ey in pts:
            dd = field[int(math.floor(ey)) * W + int(math.floor(ex))]
            if dd < 0:
                continue
            if best is None or dd < best[0]:
                best = (dd, ex, ey)
        if best is None:
            continue
        dd, ex, ey = best
        a = angle_of(ex - cx, ey - cy)
        st = snap_target(mp, ex + 3.5 * math.cos(a), ey + 3.5 * math.sin(a))
        out.append((side, (ex, ey), dd, st))
    out.sort(key=lambda t: t[2])
    return out



def exposure_dirs(mp, px, py, rmin=17.5, rmax=24.5, n=32):
    """统计从该点向外、在 17.5~24.5 格上仍有一条直线通路的方向数。

    步枪射程 24，冲锋枪只有 17：如果某个架枪点在这段距离上能被看见，
    步枪可以在冲锋枪射程之外先手开火（引擎的 canFire 只看射程/视线/朝向，
    不看 8 格视野）。数值越大，这个点越容易被远程预瞄。"""
    cnt = 0
    step = 0.5
    for k in range(n):
        a = 2.0 * math.pi * k / n
        dx, dy = math.cos(a), math.sin(a)
        d = step
        open_to = 0.0
        while d <= rmax:
            if mp.tile_wall(px + dx * d, py + dy * d):
                break
            open_to = d
            d += step
        if open_to >= rmin:
            cnt += 1
    return cnt


def defense_post_info(mp, site):
    """在包点内挑选有掩体、能看见多个入口的架枪点。
    返回按优先级排序的列表；每项含位置、可见入口方位和朝向。"""
    cx, cy = site_center(site)
    ents = site_entrances(mp, site)
    x1, y1, x2, y2 = site_rect(site)
    cands = []
    for tx in range(x1, x2 + 1):
        for ty in range(y1, y2 + 1):
            if mp.wall(tx, ty):
                continue
            px, py = tx + 0.5, ty + 0.5
            vis = {}
            for side, pts in ents.items():
                for ex, ey in pts:
                    if mp.los(px, py, ex, ey):
                        vis.setdefault(side, []).append((ex, ey))
            if not vis:
                continue
            cover = 0
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    if mp.wall(tx + dx, ty + dy):
                        cover += 1
            d = dist(px, py, cx, cy)
            exp = exposure_dirs(mp, px, py)
            # 第 2 轮 r2-g2：我方防守回合出现 0 杀被 5 人清空，且对方是
            # 步枪、我方是冲锋枪。除“能看见入口”外，还必须惩罚 18~24 格
            # 上暴露的直线枪线，否则会被步枪在射程外逐个点名。
            score = (4.0 * len(vis) + 0.55 * cover - 0.30 * abs(d - 3.0)
                     - EXPOSURE_W * exp)
            angs = {}
            for side, pts in vis.items():
                ax = sum(q[0] for q in pts) / len(pts)
                ay = sum(q[1] for q in pts) / len(pts)
                angs[side] = angle_of(ax - px, ay - py)
            allpts = [(q[0], q[1], sd) for sd, pts in ents.items() for q in pts]
            near_side = min(allpts, key=lambda q: dist(px, py, q[0], q[1]))[2] if allpts else None
            cands.append({'p': (px, py), 'vis': vis, 'angs': angs, 'near_side': near_side,
                          'cover': cover, 'd': d, 'exp': exp, 'score': score})
    if not cands:
        return [{'p': (cx, cy), 'vis': {}, 'angs': {}, 'cover': 0, 'd': 0.0, 'score': 0.0}]
    cands.sort(key=lambda c: -c['score'])
    chosen = [cands[0]]
    while len(chosen) < 6:
        best = None
        bs = -1e9
        for c in cands:
            if c in chosen:
                continue
            sep = min(dist(c['p'][0], c['p'][1], q['p'][0], q['p'][1]) for q in chosen)
            if sep < 1.6:
                continue
            covered = set()
            for q in chosen:
                covered |= set(q['vis'].keys())
            new = len(set(c['vis'].keys()) - covered)
            score = c['score'] + 2.6 * new + min(sep, 4.0) * 0.35
            if score > bs:
                bs = score
                best = c
        if best is None:
            break
        chosen.append(best)
    return chosen


def pick_secondary_side(ents, primary):
    if not ents:
        return primary
    best = None
    bd = -1.0
    for side in ents:
        if side == primary:
            continue
        d = abs((SIDE_ANG[side] - SIDE_ANG.get(primary, 0.0) + math.pi) % (2 * math.pi) - math.pi)
        if d > bd:
            bd = d
            best = side
    return best or primary


def site_probe_points(mp, site):
    """包点内部用于“能否看到这个点”的采样点。"""
    x1, y1, x2, y2 = site_rect(site)
    pts = []
    for fx in (0.2, 0.5, 0.8):
        for fy in (0.2, 0.5, 0.8):
            px = x1 + fx * (x2 - x1 + 1)
            py = y1 + fy * (y2 - y1 + 1)
            if not mp.circle_hits(px, py, 0.31):
                pts.append((px, py))
    cx, cy = site_center(site)
    if not pts:
        pts = [(cx, cy)]
    return pts


def overwatch_positions(mp, site, n=5, dmin=7.0, dmax=20.5, dpref=12.5):
    """包点外围的长枪架点：对包点内部多个采样点有视线、有掩体、
    离包点 7~20 格。射击判定只看射程/视线/朝向（不看 8 格视野），
    因此这些点可以在对手视野外先手开火。"""
    cx, cy = site_center(site)
    probes = site_probe_points(mp, site)
    x1, y1, x2, y2 = site_rect(site)
    need = max(2, len(probes) - 2)
    cands = []
    for ty in range(1, mp.h - 1):
        for tx in range(1, mp.w - 1):
            if mp.wall(tx, ty):
                continue
            if x1 <= tx <= x2 and y1 <= ty <= y2:
                continue
            px, py = tx + 0.5, ty + 0.5
            d = dist(px, py, cx, cy)
            if d < dmin or d > dmax:
                continue
            vis = 0
            for q in probes:
                if mp.los(px, py, q[0], q[1]):
                    vis += 1
            if vis < need:
                continue
            cover = 0
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    if mp.wall(tx + dx, ty + dy):
                        cover += 1
            score = 3.0 * vis + 0.65 * cover - 0.35 * abs(d - dpref)
            cands.append((score, px, py, d, cover, vis))
    cands.sort(key=lambda c: -c[0])
    if not cands:
        return []
    chosen = [cands[0]]
    while len(chosen) < n:
        best = None
        bs = -1e9
        for c in cands:
            if any(dist(c[1], c[2], q[1], q[2]) < 3.0 for q in chosen):
                continue
            ang = math.atan2(c[2] - cy, c[1] - cx)
            sep = min(abs((ang - math.atan2(q[2] - cy, q[1] - cx) + math.pi)
                          % (2 * math.pi) - math.pi) for q in chosen)
            sc = c[0] + 2.4 * min(math.degrees(sep), 90.0) / 90.0
            if sc > bs:
                bs = sc
                best = c
        if best is None:
            break
        chosen.append(best)
    return [(c[1], c[2]) for c in chosen]


def ring_positions(mp, bx, by, n=5, dmin=5.0, dmax=16.0, dpref=9.0):
    """围绕一个点（炸弹）的长枪架点：有视线、有掩体、离点 5~16 格。"""
    cands = []
    for ty in range(1, mp.h - 1):
        for tx in range(1, mp.w - 1):
            if mp.wall(tx, ty):
                continue
            px, py = tx + 0.5, ty + 0.5
            d = dist(px, py, bx, by)
            if d < dmin or d > dmax:
                continue
            if not mp.los(px, py, bx, by):
                continue
            cover = 0
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    if mp.wall(tx + dx, ty + dy):
                        cover += 1
            score = 0.75 * cover - 0.30 * abs(d - dpref)
            cands.append((score, px, py, d))
    cands.sort(key=lambda c: -c[0])
    if not cands:
        return []
    chosen = [cands[0]]
    while len(chosen) < n:
        best = None
        bs = -1e9
        for c in cands:
            if any(dist(c[1], c[2], q[1], q[2]) < 3.0 for q in chosen):
                continue
            ang = math.atan2(c[2] - by, c[1] - bx)
            sep = min(abs((ang - math.atan2(q[2] - by, q[1] - bx) + math.pi)
                          % (2 * math.pi) - math.pi) for q in chosen)
            sc = c[0] + 2.6 * min(math.degrees(sep), 90.0) / 90.0
            if sc > bs:
                bs = sc
                best = c
        if best is None:
            break
        chosen.append(best)
    return [(c[1], c[2]) for c in chosen]


def turtle_positions(mp, bx, by, n=5, dmin=1.8, dmax=5.0):
    """下包后的“龟缩”点位：贴着炸弹 2~5 格、对炸弹有视线，
    并且朝外一侧有墙/掩体挡远距离枪线。朝向炸弹，敌方必须贴近才能拆。"""
    probe = (bx, by)
    cands = []
    for ty in range(1, mp.h - 1):
        for tx in range(1, mp.w - 1):
            if mp.wall(tx, ty):
                continue
            px, py = tx + 0.5, ty + 0.5
            d = dist(px, py, bx, by)
            if d < dmin or d > dmax:
                continue
            if not mp.los(px, py, probe[0], probe[1]):
                continue
            ux, uy = (px - bx) / (d or 1.0), (py - by) / (d or 1.0)
            # 背向炸弹一侧的遮蔽：在该方向 0.6~2.2 格内的墙体数
            shield = 0
            for rr in (0.7, 1.3, 2.0):
                wx = int(math.floor(px + ux * rr))
                wy = int(math.floor(py + uy * rr))
                if mp.wall(wx, wy):
                    shield += 1
            for perp in (1, -1):
                wx = int(math.floor(px + ux * 1.2 + (-uy) * perp * 1.0))
                wy = int(math.floor(py + uy * 1.2 + ux * perp * 1.0))
                if mp.wall(wx, wy):
                    shield += 0.6
            cover = 0
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    if mp.wall(tx + dx, ty + dy):
                        cover += 1
            score = 1.3 * shield + 0.45 * cover - 0.55 * abs(d - 2.7)
            cands.append((score, px, py, d))
    cands.sort(key=lambda c: -c[0])
    if not cands:
        return []
    chosen = [cands[0]]
    while len(chosen) < n:
        best = None
        bs = -1e9
        for c in cands:
            if any(dist(c[1], c[2], q[1], q[2]) < 1.5 for q in chosen):
                continue
            ang = math.atan2(c[2] - by, c[1] - bx)
            sep = min(abs((ang - math.atan2(q[2] - by, q[1] - bx) + math.pi)
                          % (2 * math.pi) - math.pi) for q in chosen)
            sc = c[0] + 2.2 * min(math.degrees(sep), 90.0) / 90.0
            if sc > bs:
                bs = sc
                best = c
        if best is None:
            break
        chosen.append(best)
    return [(c[1], c[2]) for c in chosen]


def make_watch(info, primary, secondary):
    """主看最可能的入口，同时把该点能看见的其他入口也排进慢扫循环。

    旧版只排 primary/secondary：r2-g2 防守回合被 5 人 0 杀清空，
    怀疑对手从第三个入口进入时我方 5 人全部背对。现在最多轮扫 4 个
    可见方位，并让主入口出现两次以保留先手权重。"""
    vis = info.get('angs') or {}
    if WATCH_MODE == 'legacy':
        seq = []
        for side in (primary, primary, secondary, primary, secondary):
            if side in vis:
                seq.append(quantize_dir(vis[side]))
        if not seq:
            for side in vis:
                seq.append(quantize_dir(vis[side]))
        return seq or ['D', 'R', 'L']
    order = []
    for side in (primary, secondary):
        if side in vis and side not in order:
            order.append(side)
    for side in sorted(vis):
        if side not in order:
            order.append(side)
    if not order:
        return ['D', 'R', 'L']
    seq = [quantize_dir(vis[s]) for s in order[:4]]
    seq.append(quantize_dir(vis[order[0]]))
    return seq


def flank_posts(mp, site_name, bx, by, n=3):
    """回防/拆包时从守包方“背后”接近：A 点从西侧、B 点从东侧
    （守包方的默认预瞄方向是防守方出生点一侧）。"""
    far_ang = math.pi if site_name == 'A' else 0.0
    cands = []
    for adeg in range(-75, 76, 10):
        for r in (2.6, 3.4, 4.2, 5.2, 6.2):
            a = far_ang + math.radians(adeg)
            p = snap_target(mp, bx + r * math.cos(a), by + r * math.sin(a))
            d = dist(p[0], p[1], bx, by)
            if d < 2.2 or d > 7.0:
                continue
            if not mp.los(p[0], p[1], bx, by):
                continue
            tx, ty = int(math.floor(p[0])), int(math.floor(p[1]))
            cv = 0
            for ddx in (-1, 0, 1):
                for ddy in (-1, 0, 1):
                    if ddx == 0 and ddy == 0:
                        continue
                    if mp.wall(tx + ddx, ty + ddy):
                        cv += 1
            sc = cv * 0.8 - 0.22 * abs(d - 4.2) - 0.35 * abs(adeg) / 75.0
            cands.append((sc, p, d, adeg))
    cands.sort(key=lambda c: -c[0])
    out = []
    for c in cands:
        if any(dist(c[1][0], c[1][1], q[0], q[1]) < 1.8 for q in out):
            continue
        out.append(c[1])
        if len(out) >= n:
            break
    return out


def team_attack_alive(obs):
    sides = obs.get('sides') or {}
    my = int(obs.get('yourTeam', 0) or 0)
    atk = my if obs.get('side') == 'attack' else 1 - my
    ta = obs.get('teamAlive') or {}
    v = ta.get(atk, ta.get(str(atk), 5))
    try:
        return int(v)
    except Exception:
        return 5


def plan_defense_planted(obs, brain, mp, plan, units, sites, fresh):
    bomb = obs.get('bomb') or {}
    bx, by = float(bomb.get('x', 0.0) or 0.0), float(bomb.get('y', 0.0) or 0.0)
    timer = float(bomb.get('timer', 40.0) or 40.0)
    site_name = bomb.get('site')
    if site_name not in ('A', 'B'):
        site_name = 'A' if bx < (mp.w - 1) / 2.0 else 'B'
    alive_units = [u for u in units if u.get('alive')]
    if not alive_units:
        return plan
    atk_alive = team_attack_alive(obs)
    # 进攻方已全灭：全体直接拆包
    if atk_alive <= 0:
        for u in alive_units:
            i = u['index']
            plan['roles'][i] = 'defuse'
            plan['targets'][i] = (bx, by)
            plan['watch'][i] = ['D']
            plan['stand'].add(i)
        return plan

    near_n = len(fresh)
    avg_d = sum(dist(u['x'], u['y'], bx, by) for u in alive_units) / len(alive_units)
    order = sorted(alive_units, key=lambda u: (0 if u.get('kit') else 1,
                                               dist(u['x'], u['y'], bx, by)))
    defusers = order[:2]
    def_ids = set(u['index'] for u in defusers)
    posts = flank_posts(mp, site_name, bx, by, max(3, len(alive_units) - 2))

    # 是否已经守在炸弹附近（重防点被打）：此时不需要绕外圈
    close_def = avg_d <= 13.0

    def add_waypoints(i, u, post, force_flank):
        if not force_flank:
            return
        wps = []
        # 顶部开放带 y≈1.6：必须 snap 到可走格。旧版直接写 (x,1.6)，
        # 一旦该格是墙 astar 返回空，整段绕后路线被静默丢弃，
        # 单位就沿直线穿过开阔地送死（r2-g2 第 1 回合回防即如此）。
        if u['y'] > 3.0:
            wps.append(snap_target(mp, u['x'], 1.6))
        if abs(post[0] - u['x']) > 3.0:
            band = snap_target(mp, post[0], 1.6)
            if not wps or dist(band[0], band[1], wps[-1][0], wps[-1][1]) > 1.0:
                wps.append(band)
        if not wps or dist(post[0], post[1], wps[-1][0], wps[-1][1]) > 1.0:
            wps.append(post)
        plan['waypoints'][i] = wps

    rush = timer <= RUSH_T or near_n == 0 and timer <= RUSH_T + 8
    cover_k = 0
    for u in alive_units:
        i = u['index']
        ud = dist(u['x'], u['y'], bx, by)
        if i in def_ids and rush:
            # 最后阶段：压上去拆包
            plan['roles'][i] = 'defuse'
            plan['targets'][i] = (bx, by)
            plan['watch'][i] = ['D']
            plan['stand'].add(i)
            if not close_def:
                add_waypoints(i, u, (bx, by), True)
            continue
        if i in def_ids:
            # 先到守包方背后 4~6 格的掩体等待，等倒计时/队友拉开再拆
            p = posts.pop(0) if posts else snap_target(mp, bx + (5.0 if site_name == 'A' else -5.0), by)
            plan['roles'][i] = 'defuse_wait'
            plan['targets'][i] = p
            plan['posts'][i] = p
            a = angle_of(bx - p[0], by - p[1])
            plan['watch'][i] = [quantize_dir(a), quantize_dir(a + 0.5)]
            if not close_def:
                add_waypoints(i, u, p, True)
            continue
        # 掩护位：守包方背后 3~7 格，对炸弹有视线
        if posts:
            p = posts.pop(0)
        else:
            p = snap_target(mp, bx + (5.5 if site_name == 'A' else -5.5), by)
        is_front = False
        if RETAKE_MODE == 'split' and (cover_k % 2 == 1):
            # 一半掩护位翻到炸弹正面（我们出生点一侧），与绕后组形成夹击
            p = snap_target(mp, 2.0 * bx - p[0], 2.0 * by - p[1])
            is_front = True
        cover_k += 1
        plan['roles'][i] = 'cover'
        plan['targets'][i] = p
        plan['posts'][i] = p
        a = angle_of(bx - p[0], by - p[1])
        plan['watch'][i] = [quantize_dir(a), quantize_dir(a + 0.5)]
        if not close_def:
            add_waypoints(i, u, p, not is_front)
    return plan


def build_plan(obs, brain, mp):
    """返回 {targets: {idx:(x,y) or None}, roles: {idx:str}, watch: {idx:[dirs]}, posts:{idx:(x,y)}}"""
    side = obs.get('side', 'attack')
    units = obs.get('units', [])
    myteam = int(obs.get('yourTeam', 0) or 0)
    sites = site_rects(obs)
    bomb = obs.get('bomb') or {}
    plan = {'targets': {}, 'roles': {}, 'watch': {}, 'posts': {}, 'stand': set(), 'waypoints': {}}

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
        brain.round_site[int(obs.get('round', 1) or 1)] = site_name
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
            if POSTPLANT == 'far':
                far = ring_positions(mp, bx, by, 5, 5.0, 16.0, 9.0)
                near = postplant_positions(mp, bx, by, refx, refy, 1)
                hold = (near[:1] + far)[:5] if near else far
                for u in units:
                    i = u['index']
                    plan['roles'][i] = 'postplant_far'
                    p = hold[i % len(hold)] if hold else (bx, by)
                    plan['posts'][i] = p
                    plan['targets'][i] = p
                    a = angle_of(bx - p[0], by - p[1])
                    plan['watch'][i] = [quantize_dir(a), quantize_dir(a + 0.5),
                                        quantize_dir(a - 0.5)]
                return plan
            if TURTLE:
                hold = turtle_positions(mp, bx, by, 5)
                for u in units:
                    i = u['index']
                    plan['roles'][i] = 'postplant_turtle'
                    p = hold[i % len(hold)] if hold else (bx, by)
                    plan['posts'][i] = p
                    plan['targets'][i] = p
                    a = angle_of(bx - p[0], by - p[1])
                    plan['watch'][i] = [quantize_dir(a), quantize_dir(a + 0.5),
                                        quantize_dir(a - 0.5)]
                return plan
            hold = postplant_positions(mp, bx, by, refx, refy, 5)
            # 只让“最靠侧翼”的 1 个架枪点兼看远侧绕后（A 西侧 / B 东侧）。
            # 全员都分心看侧翼会削弱正面火力：60 种子自测里全队加侧翼朝向
            # 让进攻胜率从 0.844 掉到 0.656；改成单人兼看以兼顾两者。
            flank_idx = None
            if FLANK_WATCH and hold:
                ux, uy = refx - bx, refy - by
                L = math.hypot(ux, uy) or 1.0
                ux, uy = ux / L, uy / L
                best = -1.0
                for k, p in enumerate(hold):
                    lat = abs((p[0] - bx) * uy - (p[1] - by) * ux)
                    if lat > best:
                        best = lat
                        flank_idx = k
            flank_from = math.pi if site_name == 'A' else 0.0
            fpx = bx + 8.0 * math.cos(flank_from)
            fpy = by + 8.0 * math.sin(flank_from)
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
                if flank_idx is not None and i % len(hold) == flank_idx:
                    flank_aim = angle_of(fpx - p[0], fpy - p[1])
                    plan['watch'][i] = [quantize_dir(bis), quantize_dir(flank_aim),
                                        quantize_dir(bis + 0.45)]
                else:
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

        # ---- 双路进攻（实验开关）：3 人主入口、2 人方位差最大的副入口 ----
        # 5 人从单一入口进点时，防守方 5 把枪只需要盯一个方向；两路同时压上
        # 可以逼防守方分火/转枪，主队正面吸引、副队从侧后切入。
        if SPLIT_ATK:
            mk = brain.match_id or int(obs.get('seed', 0) or 0)
            field = brain.split_field.get(mk)
            if field is None:
                field = bfs_field(mp, 27.5, 30.5)
                brain.split_field[mk] = field
            opts = attack_split_points(mp, site, field)
            prim = opts[0] if opts else None
            sec = None
            sep = -1.0
            if prim is not None:
                for o in opts[1:]:
                    if o[2] > prim[2] + 16:
                        continue
                    da = abs((SIDE_ANG2[o[0]] - SIDE_ANG2[prim[0]] + math.pi)
                             % (2.0 * math.pi) - math.pi)
                    if da > sep:
                        sep = da
                        sec = o
            if prim is not None and sec is not None and sep >= math.pi / 2.0 - 0.01:
                ud = {u['index']: u for u in units}
                g1 = [0, 1, 2]
                g2 = [3, 4]
                if carrier_idx is not None and carrier_idx in g2:
                    g1[-1], g2[g2.index(carrier_idx)] = carrier_idx, g1[-1]
                alive_g1 = [u for u in units if u.get('alive') and u['index'] in g1]
                alive_g2 = [u for u in units if u.get('alive') and u['index'] in g2]
                g1_esc = [u for u in alive_g1 if u['index'] != carrier_idx]
                rnd = int(obs.get('round', 1) or 1)
                gk = (rnd, site_name)
                go = brain.split_go.get(gk, False)
                tl = float(obs.get('timeLeft', 100) or 100)

                def staged(lst, st):
                    return bool(lst) and all(
                        dist(u['x'], u['y'], st[0], st[1]) <= 4.2 for u in lst)

                if not go:
                    if ((not g1_esc or staged(g1_esc, prim[3]))
                            and (not alive_g2 or staged(alive_g2, sec[3]))):
                        go = True
                    elif tl <= 70:      # 一路被卡住/绕远时不能一直等
                        go = True
                if go:
                    brain.split_go[gk] = True

                pa = SIDE_ANG2[prim[0]]
                sa = SIDE_ANG2[sec[0]]
                stage1 = [snap_target(mp, prim[3][0] + o * math.cos(pa + math.pi / 2.0),
                                      prim[3][1] + o * math.sin(pa + math.pi / 2.0))
                          for o in (-1.1, 0.0, 1.1)]
                stage2 = [snap_target(mp, sec[3][0] + o * math.cos(sa + math.pi / 2.0),
                                      sec[3][1] + o * math.sin(sa + math.pi / 2.0))
                          for o in (-1.1, 1.1)]
                # 进点后的落位：主队压包点正面（沿用原 4 个架点中的 2 个），
                # 副队停在副入口内侧 2~3 格，形成交叉火力。
                in1 = [posts[0], posts[1], center_target]
                ip = snap_target(mp, sec[1][0] + (cx - sec[1][0]) * 0.5,
                                 sec[1][1] + (cy - sec[1][1]) * 0.5)
                in2 = [ip, snap_target(mp, ip[0] + 1.2 * math.cos(sa + math.pi / 2.0),
                                       ip[1] + 1.2 * math.sin(sa + math.pi / 2.0))]
                # 交叉掩护：主队看副入口方向，副队看主入口方向。
                w1 = [quantize_dir(sa), quantize_dir(pa)]
                w2 = [quantize_dir(pa), quantize_dir(sa)]
                escort_in1 = any(dist(u['x'], u['y'], cx, cy) <= 5.5 for u in g1_esc)

                for k, i in enumerate(g1):
                    plan['watch'][i] = w1
                    if i == carrier_idx:
                        cw = bool(g1_esc) and (not escort_in1) and tl > 65
                        plan['roles'][i] = 'carrier_wait' if cw else 'carrier'
                        if cw:
                            tp = snap_target(mp, prim[1][0] + 7.0 * math.cos(pa),
                                             prim[1][1] + 7.0 * math.sin(pa))
                        else:
                            tp = center_target if go else stage1[k]
                    else:
                        plan['roles'][i] = 'escort'
                        tp = in1[k] if go else stage1[k]
                    plan['targets'][i] = tp
                    plan['posts'][i] = tp
                for k, i in enumerate(g2):
                    plan['roles'][i] = 'escort'
                    plan['watch'][i] = w2
                    tp = in2[k] if go else stage2[k]
                    plan['targets'][i] = tp
                    plan['posts'][i] = tp
                return plan

        # 未下包：携带者不走在最前面。先让 4 名护卫进点/接敌，
        # 携带者在后 7 格等待，避免在单一入口被集火打掉炸弹（上一轮 5 次进攻有 4 次掉包）。
        escorts = [u for u in units if u.get('alive') and u['index'] != carrier_idx]
        escort_in = any(dist(u['x'], u['y'], cx, cy) <= 5.5 for u in escorts)
        tl = float(obs.get('timeLeft', 100) or 100)
        carrier_wait = CARRIER_WAIT and bool(escorts) and (not escort_in) and tl > 65
        wait_pt = None
        if carrier_wait:
            bx0, by0 = cx, cy
            dxs, dys = 27.5 - bx0, 30.5 - by0
            L = math.hypot(dxs, dys) or 1.0
            wait_pt = snap_target(mp, bx0 + dxs / L * CARRIER_GAP, by0 + dys / L * CARRIER_GAP)
        for u in units:
            i = u['index']
            if i == carrier_idx:
                plan['roles'][i] = 'carrier_wait' if carrier_wait else 'carrier'
                tp = wait_pt if carrier_wait else center_target
                plan['targets'][i] = tp
                plan['posts'][i] = tp
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
        return plan_defense_planted(obs, brain, mp, plan, units, sites, fresh)


    A = sites.get('A')
    B = sites.get('B')
    if not A or not B:
        return plan
    acx, acy = site_center(A)
    bcx, bcy = site_center(B)
    stack_choice = defense_stack_site(obs, brain)

    # 每张随机地图只算一次：包点内可用的架枪点、最可能的主入口和侧翼入口。
    ckey = (obs.get('id'), obs.get('seed'))
    cached = brain.map_cache.get(ckey)
    if cached is None:
        info = {'A': defense_post_info(mp, A), 'B': defense_post_info(mp, B)}
        ents = {'A': site_entrances(mp, A), 'B': site_entrances(mp, B)}
        primary = {'A': approach_side(mp, A) or 'E', 'B': approach_side(mp, B) or 'W'}
        secondary = {'A': pick_secondary_side(ents['A'], primary['A']),
                     'B': pick_secondary_side(ents['B'], primary['B'])}
        for name in ('A', 'B'):
            for k, it in enumerate(info[name]):
                ps = primary[name] if k == 0 else secondary[name]
                ss = secondary[name] if k == 0 else primary[name]
                it['watch'] = make_watch(it, ps, ss)
        cached = (info, primary, secondary)
        brain.map_cache[ckey] = cached
    else:
        info, primary, secondary = cached

    units_by_i = {u['index']: u for u in units}

    used = {'A': set(), 'B': set()}

    def pick_post(site_name, side, other):
        lst = info[site_name]
        taken = used[site_name]
        cands = [it for it in lst if it.get('near_side') == side and it['p'] not in taken]
        if not cands:
            cands = [it for it in lst if side in (it.get('vis') or {}) and it['p'] not in taken]
        if not cands:
            cands = [it for it in lst if it['p'] not in taken] or lst
        def sc(it):
            sep = min([dist(it['p'][0], it['p'][1], q[0], q[1]) for q in taken] or [4.0])
            same = 1 if it.get('near_side') == side else 0
            return it['score'] + 2.0 * same + min(sep, 4.0) * 0.4
        return max(cands, key=sc)

    def place(i, site_name, slot, role):
        # slot 0/1 分别守主入口/侧翼入口；2/3 用于回防补位
        if slot == 0:
            side = primary[site_name]; other = secondary[site_name]
        elif slot == 1:
            side = secondary[site_name]; other = primary[site_name]
        else:
            vis_sides = set()
            for it in info[site_name][:2]:
                vis_sides |= set((it.get('vis') or {}).keys())
            side = None
            for sd in ('N', 'S', 'E', 'W'):
                if sd not in vis_sides or any(it.get('near_side') == sd and it['p'] not in used[site_name]
                                              for it in info[site_name]):
                    side = sd
                    break
            side = side or primary[site_name]; other = secondary[site_name]
        it = pick_post(site_name, side, other)
        used[site_name].add(it['p'])
        plan['roles'][i] = role
        plan['targets'][i] = it['p']
        plan['posts'][i] = it['p']
        plan['watch'][i] = make_watch(it, side, other)

    # 威胁计数：靠近某包点的最新敌踪
    threat = {'A': 0, 'B': 0}
    for eid, ex, ey in fresh:
        if dist(ex, ey, acx, acy) < 14.0:
            threat['A'] += 1
        if dist(ex, ey, bcx, bcy) < 14.0:
            threat['B'] += 1

    frame = int(obs.get('frame', 0) or 0)
    commit = None
    c = getattr(brain, 'def_commit', None)
    if c and frame < c[1] and c[0] in ('A', 'B'):
        commit = c[0]
    else:
        brain.def_commit = None
        if threat['A'] >= 2 and threat['A'] > threat['B']:
            commit = 'A'
            brain.def_commit = ('A', frame + 160)
        elif threat['B'] >= 2 and threat['B'] > threat['A']:
            commit = 'B'
            brain.def_commit = ('B', frame + 160)

    if commit and COLLAPSE:
        # 成规模进攻：本点两人守住，中路 + 另一点的一人立刻回防，
        # 形成 4 人交叉火力；另一点留一人看家，避免被假打带走。
        local = (0, 1) if commit == 'A' else (2, 3)
        other = (2, 3) if commit == 'A' else (0, 1)
        for k, i in enumerate(local):
            if units_by_i.get(i, {}).get('alive'):
                place(i, commit, k, 'hold')
        others = [i for i in other if units_by_i.get(i, {}).get('alive')]
        tgt_center = (acx, acy) if commit == 'A' else (bcx, bcy)
        if others:
            rot = min(others, key=lambda i: dist(units_by_i[i]['x'], units_by_i[i]['y'],
                                                 tgt_center[0], tgt_center[1]))
            place(rot, commit, 2, 'rotate')
            for i in others:
                if i != rot:
                    place(i, 'B' if commit == 'A' else 'A', 0, 'hold')
        if units_by_i.get(4, {}).get('alive'):
            place(4, commit, 3, 'rotate')
        return plan

    # 常规部署：可选“重堆一点 + 留 1 人看另一点”。
    # 上一轮 4 个防守回合里对手 3 次打 B，2-2-1 每次都被 5 人快攻逐个击破；
    # 这里改为 4-1（可调）重防 B，另一点留 1 人当哨兵。
    if stack_choice in ('A', 'B') and DEF_SCHEME == 'overwatch':
        # 长枪架点：不站在包点里，而是在包点外围 7~20 格、
        # 对包点内部有视线并有掩体的位置交叉架枪。
        # 射击只看射程/视线/朝向，不看 8 格视野，所以能先手打看不见我们的敌人。
        stack_site = stack_choice
        other_site = 'B' if stack_site == 'A' else 'A'
        n_stack = max(1, min(5, STACK_N))
        alive = [u['index'] for u in units if u.get('alive')]
        scx, scy = site_center(sites[stack_site])
        ox, oy = site_center(sites[other_site])
        alive.sort(key=lambda i: dist(units_by_i[i]['x'], units_by_i[i]['y'], scx, scy))
        stack_ids = alive[:n_stack]
        other_ids = alive[n_stack:]
        ockey = ('ow', ckey, stack_site)
        ow_main = brain.map_cache.get(ockey)
        if ow_main is None:
            ow_main = overwatch_positions(mp, sites[stack_site], 6)
            brain.map_cache[ockey] = ow_main
        ockey2 = ('ow', ckey, other_site)
        ow_other = brain.map_cache.get(ockey2)
        if ow_other is None:
            ow_other = overwatch_positions(mp, sites[other_site], 4)
            brain.map_cache[ockey2] = ow_other

        def assign(ids, posts, center):
            ids = list(ids)
            posts = list(posts)
            for i in ids:
                u = units_by_i[i]
                if not posts:
                    p = (center[0], center[1])
                else:
                    posts.sort(key=lambda q: dist(u['x'], u['y'], q[0], q[1]))
                    p = posts.pop(0)
                plan['roles'][i] = 'hold'
                plan['targets'][i] = p
                plan['posts'][i] = p
                a = angle_of(center[0] - p[0], center[1] - p[1])
                plan['watch'][i] = [quantize_dir(a), quantize_dir(a + 0.55),
                                    quantize_dir(a - 0.55)]

        assign(stack_ids, ow_main, (scx, scy))
        if other_ids:
            assign(other_ids, ow_other, (ox, oy))
        return plan

    if stack_choice in ('A', 'B'):
        stack_site = stack_choice
        other_site = 'B' if stack_site == 'A' else 'A'
        n_stack = max(1, min(5, STACK_N))
        alive = [u['index'] for u in units if u.get('alive')]
        # 让更靠近重防点的单位优先去重防点，保证 4 人都在同一侧
        scx, scy = site_center(sites[stack_site])
        alive.sort(key=lambda i: dist(units_by_i[i]['x'], units_by_i[i]['y'], scx, scy))
        stack_ids = alive[:n_stack]
        other_ids = alive[n_stack:]
        used = {'A': set(), 'B': set()}
        for i in stack_ids:
            it = None
            for cand in info[stack_site]:
                if cand['p'] not in used[stack_site]:
                    it = cand
                    break
            if it is None:
                it = info[stack_site][-1]
            used[stack_site].add(it['p'])
            plan['roles'][i] = 'hold'
            plan['targets'][i] = it['p']
            plan['posts'][i] = it['p']
            # 靠近侧翼入口的点位负责看背面，其余人看正面主入口
            if it.get('near_side') == secondary[stack_site]:
                plan['watch'][i] = make_watch(it, secondary[stack_site], primary[stack_site])
            else:
                plan['watch'][i] = make_watch(it, primary[stack_site], secondary[stack_site])
        for i in other_ids:
            it = None
            for cand in info[other_site]:
                if cand['p'] not in used[other_site]:
                    it = cand
                    break
            if it is None:
                it = info[other_site][-1]
            used[other_site].add(it['p'])
            plan['roles'][i] = 'hold'
            plan['targets'][i] = it['p']
            plan['posts'][i] = it['p']
            plan['watch'][i] = make_watch(it, primary[other_site], secondary[other_site])
        return plan

    # 基线 2-2-1：每个点的两人分别守正面与侧翼入口。
    for i in (0, 1):
        if units_by_i.get(i, {}).get('alive'):
            place(i, 'A', i, 'hold')
    for i in (2, 3):
        if units_by_i.get(i, {}).get('alive'):
            place(i, 'B', i - 2, 'hold')
    mid = units_by_i.get(4)
    if mid and mid.get('alive'):
        mp_pos = snap_target(mp, (mp.w - 1) / 2.0, 7.5)
        plan['roles'][4] = 'hold'
        plan['targets'][4] = mp_pos
        plan['posts'][4] = mp_pos
        plan['watch'][4] = ['D', 'R', 'L']
    return plan


# ---------------------------------------------------------------- live 主逻辑

def weapon_range(obs, wid):
    w = obs.get('weapons', {}).get(wid) or {}
    return float(w.get('range', 18.0))


def threat_angle(brain, x, y, frame, max_age=30, max_d=9.0):
    """由最近的敌方弹道反推射手方向（观察里没有速度，用相邻窗口位移求）。
    返回朝射手方向的弧度，没有则 None。"""
    best = None
    bs = -1e18
    for (a, f, bx, by) in brain.threats:
        age = frame - f
        if age > max_age:
            continue
        d = dist(x, y, bx, by)
        if d > max_d:
            continue
        score = -d - age * 0.05
        if score > bs:
            bs = score
            best = a
    return best


def enemy_near(brain, x, y, frame, radius, max_age=12, mp=None):
    """最近 max_age 帧内被任一队友看到、且离 (x,y) 在 radius 内的敌人。

    mp 不为 None 时还要求从 (x,y) 到该敌人当前位置有视线：躲在墙后的敌人
    不能开枪，也不应阻止我们站定下包/拆包。"""
    for eid, tr in brain.enemies.items():
        if frame - tr['frame'] > max_age:
            continue
        if dist(x, y, tr['x'], tr['y']) > radius:
            continue
        if mp is not None and not mp.los(x, y, tr['x'], tr['y']):
            continue
        return True
    return False


def strafe_step(mp, x, y, base_ang, state, anchor=None, leash=4.5):
    """朝 base_ang 的垂线方向持续侧移；撞墙/超出 leash 时换边。
    返回 (dir, nx, ny, moved)。"""
    sign = state.get('sign', 1)
    for s in (sign, -sign):
        d = quantize_dir(base_ang + s * math.pi / 2.0)
        nx, ny = move_unit(mp, x, y, d)
        moved = abs(nx - x) + abs(ny - y)
        if moved <= 1e-9:
            continue
        if anchor is not None and dist(nx, ny, anchor[0], anchor[1]) > leash:
            continue
        state['sign'] = s
        return d, nx, ny, moved
    # 两条垂线都被墙/边界挡住：先后退（远离威胁），再考虑向前
    for ang in (base_ang + math.pi, base_ang):
        d = quantize_dir(ang)
        nx, ny = move_unit(mp, x, y, d)
        moved = abs(nx - x) + abs(ny - y)
        if moved > 1e-9:
            state['sign'] = -sign
            return d, nx, ny, moved
    state['sign'] = -sign
    return 'N', x, y, 0.0


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
    mid = obs.get('id')
    if brain.match_id != mid:
        brain.match_id = mid
        brain.reset_match()
    rnd = obs.get('round')
    if brain.round != rnd:
        brain.round = rnd
        brain.reset_round(obs)
        brain.chosen_site = None
    brain.update_enemies(obs)
    brain.update_bullets(obs)
    brain.round_sides[int(rnd or 0)] = obs.get('side', 'attack')
    if obs.get('side') == 'attack':
        bcur = obs.get('bomb') or {}
        if bcur.get('state') in ('planted', 'defused', 'exploded') and bcur.get('site') in ('A', 'B'):
            brain.round_plant_site[int(rnd or 0)] = bcur.get('site')
    plan = build_plan(obs, brain, mp)

    units = obs.get('units', [])
    units_by_idx = {u['index']: u for u in units}
    alive = {u['index']: bool(u.get('alive')) for u in units}
    sim = {u['index']: (float(u['x']), float(u['y'])) for u in units}
    paths = {}
    wps_all = plan.get('waypoints') or {}
    for u in units:
        i = u['index']
        tgt = plan['targets'].get(i)
        if alive[i] and tgt is not None:
            wps = wps_all.get(i)
            if wps:
                pts = []
                cur = sim[i]
                for g in wps:
                    seg = astar(mp, cur, g)
                    if seg:
                        pts.extend(seg)
                        cur = g
                # 任一段不可达时不能让整条路线为空（否则单位原地不动）；
                # 退化为直接去目标点，至少不会卡死在出生点/墙边。
                if not pts:
                    pts = astar(mp, sim[i], tgt)
                paths[i] = Path(pts)
            else:
                paths[i] = Path(astar(mp, sim[i], tgt))
        else:
            paths[i] = Path([])

    out = []
    dbg = []
    for f in range(20):
        row = [dict(NEUTRAL) for _ in range(5)]
        frame_now = frame0 + f
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
            tgt = pick_target(brain, obs, mp, i, x, y, f + 1, wr)

            # 默认按路径移动
            dname, nx, ny = follow(mp, x, y, paths[i])
            holding = (paths[i].i >= len(paths[i].pts))

            # ---- 交火态势：看得见的敌人，或被弹道反推出的射手方位 ----
            aim_ang = None
            tdist = None
            if tgt is not None:
                aim_ang = angle_of(tgt[0] - x, tgt[1] - y)
                tdist = tgt[2]
            else:
                aim_ang = threat_angle(brain, x, y, frame_now)
            bomb = obs.get('bomb') or {}
            danger = enemy_near(brain, x, y, frame_now, 13.0)
            danger_plant = (enemy_near(brain, x, y, frame_now, 13.0, mp=mp)
                            if PLANT_LOS else danger)

            # ---- 站定类角色（下包/拆包）：有人贴近时先保命 ----
            must_stand = False
            tl_now = float(obs.get('timeLeft', 100) or 100) - f * DT
            if role == 'carrier' and holding:
                # 时间压力下必须优先下包：时间到 = 进攻方必负，而站定 3 秒
                # 即使被打断/阵亡，也比确定的超时更有胜算（下包后计时重置 40s）。
                must_stand = (not danger_plant) or (PLANT_URGENT > 0 and tl_now <= PLANT_URGENT)
            elif role == 'defuse' and bomb.get('state') == 'planted':
                bd = dist(x, y, float(bomb.get('x', 0) or 0), float(bomb.get('y', 0) or 0))
                if bd <= 1.0:
                    timer = float(bomb.get('timer', 40.0) or 40.0)
                    must_stand = (not danger) or timer <= 8.0

            # 下包紧迫：携带者还没进包点时也停止缠斗，直接沿路径冲包点。
            if (role == 'carrier' and not holding and PLANT_URGENT > 0
                    and tl_now <= PLANT_URGENT):
                engaged = False
            else:
                engaged = (not must_stand) and (aim_ang is not None or danger)

            # ---- 朝向 ----
            if must_stand:
                if aim_ang is not None:
                    aim = quantize_dir(aim_ang)
                else:
                    phase_i = 0 if WATCH_MODE == 'legacy' else i
                    aim = watch[(((frame0 + f) // 50) + phase_i) % len(watch)] if watch else 'D'
            elif aim_ang is not None:
                aim = quantize_dir(aim_ang)
            else:
                obj = plan['targets'].get(i)
                if (not holding) and dname != 'N':
                    aim = dname
                elif (not holding) and obj is not None and dist(x, y, obj[0], obj[1]) < 18.0:
                    aim = quantize_dir(angle_of(obj[0] - x, obj[1] - y))
                else:
                    # 每个单位错开慢扫：按 unit index 错相后总有人看向各入口。
                    phase_i = 0 if WATCH_MODE == 'legacy' else i
                    wd = watch[(((frame0 + f) // 50) + phase_i) % len(watch)] if watch else 'D'
                    aim = wd

            # ---- 移动 ----
            if must_stand:
                dname = 'N'
            elif engaged:
                # 垂直于威胁方向持续侧移：子弹瞄准的是开火瞬间的位置，
                # 连续侧移让弹丸落在身后（本地蒙特卡洛命中率 ~10%，
                # 而朝敌人推进时 ~70%）。
                base = aim_ang if aim_ang is not None else DIR_ANG.get(aim, 0.0)
                anchor = post if (post is not None and holding) else None
                st = brain.strafe.setdefault(i, {'sign': 1})
                dname, nx, ny, moved = strafe_step(mp, x, y, base, st, anchor, 4.5)
            elif holding and role != 'carrier':
                # 无目标驻守：保持横向游走，避免被远程预瞄成静止靶
                base = DIR_ANG.get(aim, 0.0)
                st = brain.strafe.setdefault(i, {'sign': 1})
                sd, sx2, sy2, moved = strafe_step(mp, x, y, base, st, post or (x, y), 3.0)
                if moved > 1e-9:
                    dname, nx, ny = sd, sx2, sy2

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
