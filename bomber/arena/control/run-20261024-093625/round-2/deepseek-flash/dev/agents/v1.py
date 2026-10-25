#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""泡泡堂 / BLAST BUDDIES 1v1 agent — deepseek-v4.1-flash.

设计要点
--------
1. 所有炸弹的引信都是公开的（observation.bombs[].fuse），而一个决策窗口只有 20 帧，
   任何新放下的炸弹引信是 40 帧 —— 所以「未来 20 帧内会出现的火焰」完全可以从
   当前观察精确推算。安全因此是可以精确保证的，而不是靠猜。
2. 时间扩展图上的最短路（Dijkstra）用来做两件事：
   a. 我自己走到目标格、并且躲开火焰；
   b. 判断对手在我放弹之后「是否还有活路」——没有活路才是真正的必杀。
3. 软墙掉落是纯位置函数（引擎用 seed/round/x/y 播种 LCG），可以离线精确预测，
   于是只炸「会掉火力/速度」的墙，farm 效率远高于乱炸。
4. 永远不做没有退路的放弹；永远不站进已知火线。
"""

import sys
import json
import heapq

W, H = 19, 17
EMPTY, HARD, SOFT = 0, 1, 2
DIRS4 = ((0, -1), (0, 1), (-1, 0), (1, 0))
NAME2DELTA = {'U': (0, -1), 'D': (0, 1), 'L': (-1, 0), 'R': (1, 0), 'N': (0, 0)}
DELTA2NAME = {(0, -1): 'U', (0, 1): 'D', (-1, 0): 'L', (1, 0): 'R'}
FUSE = 40
BLAST_FRAMES = 12
BOMBS_MAX, BLAST_MAX, SPEED_MAX = 6, 6, 3
POWERUP_CHANCE = 0.55
WEIGHTS = (('bomb', 0.40), ('blast', 0.35), ('speed', 0.25))
DROP_VALUE = {'bomb': 1.6, 'blast': 3.0, 'speed': 2.6}
DEBUG = False
import os as _os
W_BASE = float(_os.environ.get('AG_BASE', '1.5'))    # 炸墙的基础价值（开图本身）
W_ESC = float(_os.environ.get('AG_ESC', '0.35'))     # 放弹后逃生耗时的惩罚系数
W_MOB = float(_os.environ.get('AG_MOB', '0.15'))     # 终点格机动性奖励
W_STAY = float(_os.environ.get('AG_STAY', '-1.0'))   # 原地不动的基础分
W_THREAT = float(_os.environ.get('AG_THREAT', '5.0'))
W_HIT = float(_os.environ.get('AG_HIT', '6.0'))
DANGER_EXTRA = int(_os.environ.get('AG_DANGER', '4'))
ESC_FREE = float(_os.environ.get('AG_ESCFREE', '0'))
HUNT1_T = float(_os.environ.get('AG_H1T', '60'))
HUNT1 = float(_os.environ.get('AG_H1', '3.0'))
HUNT2_T = float(_os.environ.get('AG_H2T', '35'))
HUNT2 = float(_os.environ.get('AG_H2', '4.0'))
# 出生角是一个「5 格口袋」（两侧硬墙 + 一圈软墙），不炸墙永远出不去。
# 被困时必须让「炸开一条路」压过「原地不动」，否则会站着看对手把装备刷满。
TRAP_CELLS = int(_os.environ.get('AG_TRAPN', '12'))    # 可达格数 <= 此值 → 视为被困
REACH_T = int(_os.environ.get('AG_REACHT', '24'))      # 统计「可达」的时间上限（帧）
W_TRAPB = float(_os.environ.get('AG_TRAPB', '4.0'))    # 被困时放弹的基础加分
W_TRAPO = float(_os.environ.get('AG_TRAPO', '0.8'))    # 被困时每炸开新空间的加分系数
EXIT_PEN = float(_os.environ.get('AG_EXITP', '1.5'))   # 终点只有 1 个出口时的惩罚
SAFE_H = int(_os.environ.get('AG_SAFEH', '45'))        # 放弹后逃生终点需要保持安全的帧数
# （实测 24 比 45 更差：退得不够远会在下一个窗口里来回折返，炸弹放得多但道具收得少）


def move_inc(speed):
    return max(3, 6 - speed)


def move_frames(speed):
    """引擎里一格的推进增量是 1/max(3,6-speed)，但浮点累加会让速度 0 实际用 7 帧
    （1/6 累加 6 次 = 0.9999999999999999 < 1，要多走一帧才到 1）。
    这里返回「从开始移动到重新自由」的真实帧数，必须与引擎逐帧一致。"""
    return _progress_steps(speed)


def progress_after(k, speed):
    """复刻引擎的浮点累加：从刚起步（progress = 1/m）开始累加 k 次。"""
    m = move_inc(speed)
    p = 1.0 / m
    for _ in range(k - 1):
        p = min(1.0, p + 1.0 / m)
    return p


def _progress_steps(speed):
    """从刚起步到 progress >= 1 需要累加几次。"""
    m = move_inc(speed)
    p = 1.0 / m
    n = 1
    while p < 1.0:
        p = min(1.0, p + 1.0 / m)
        n += 1
    return n


# ---------------------------------------------------------------- 掉落预测
def _lcg_pair(seed):
    s = (seed & 0xFFFFFFFF) or 1
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
    a = s / 4294967296.0
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
    b = s / 4294967296.0
    return a, b


def predict_drop(seed, rnd, x, y):
    """完全复刻引擎 rollDrop(): 位置 -> 掉落类型（None 表示不掉）。"""
    roll, pick = _lcg_pair(seed * 31 + rnd * 977 + x * 131 + y * 17)
    if roll >= POWERUP_CHANCE:
        return None
    acc = 0.0
    for name, wgt in WEIGHTS:
        acc += wgt
        if pick <= acc:
            return name
    return WEIGHTS[-1][0]


# ---------------------------------------------------------------- 世界状态
class Fighter(object):
    __slots__ = ('owner', 'x', 'y', 'from_x', 'from_y', 'move_progress', 'facing',
                 'bombs', 'blast', 'speed', 'active_bombs', 'alive', 'invuln_until',
                 'held', 'input_history')

    def clone(self):
        f = Fighter()
        for k in self.__slots__:
            setattr(f, k, getattr(self, k))
        f.held = dict(self.held)
        f.input_history = [dict(h) for h in self.input_history]
        return f


class World(object):
    __slots__ = ('tiles', 'bombs', 'blasts', 'drops', 'fighters', 'round_frames',
                 'status', 'seed', 'round', 'next_id', 'time_left')

    @staticmethod
    def from_obs(obs):
        w = World()
        w.tiles = bytearray(obs['map']['tiles'])
        w.seed = int(obs.get('seed', 1))
        w.round = int(obs.get('round', 1))
        w.round_frames = int(obs.get('frame', 0))
        w.status = obs.get('status', 'playing')
        w.time_left = float(obs.get('timeLeft', 150.0))
        w.next_id = 1000
        w.bombs = []
        for b in obs.get('bombs', []):
            w.bombs.append({'id': b['id'], 'owner': b['owner'], 'x': b['x'], 'y': b['y'],
                            'fuse': b['fuse'], 'blast': b['blast'], 'exploded': False})
        w.blasts = []
        for c in obs.get('blasts', []):
            w.blasts.append([c['x'], c['y'], c['frames'], c['owner']])
        w.drops = []
        for d in obs.get('drops', []):
            w.drops.append({'id': d['id'], 'x': d['x'], 'y': d['y'], 'type': d['type']})
        w.fighters = []
        for fo in obs.get('fighters', []):
            f = Fighter()
            f.owner = fo['owner']
            f.x = fo['x']
            f.y = fo['y']
            f.from_x = fo['x']
            f.from_y = fo['y']
            f.move_progress = 1.0
            px, py = fo.get('px', fo['x']), fo.get('py', fo['y'])
            dx, dy = fo['x'] - px, fo['y'] - py
            if abs(dx) > 1e-6 or abs(dy) > 1e-6:
                n = _progress_steps(fo['speed'])
                m = move_inc(fo['speed'])
                k = int(round((1.0 - max(abs(dx), abs(dy))) * m))
                k = max(1, min(n - 1, k))
                if abs(dx) >= abs(dy):
                    f.from_x = fo['x'] - (1 if dx > 0 else -1)
                    f.from_y = fo['y']
                else:
                    f.from_y = fo['y'] - (1 if dy > 0 else -1)
                    f.from_x = fo['x']
                f.move_progress = progress_after(k, fo['speed'])
            f.facing = fo.get('facing', 1)
            f.bombs = fo['bombs']
            f.blast = fo['blast']
            f.speed = fo['speed']
            f.active_bombs = fo.get('activeBombs', 0)
            f.alive = fo.get('alive', True)
            f.invuln_until = 0
            f.held = {'dir': 'N', 'btn': None}
            f.input_history = []
            w.fighters.append(f)
        return w

    def clone(self):
        n = World()
        n.tiles = bytearray(self.tiles)
        n.bombs = [dict(b) for b in self.bombs]
        n.blasts = [list(c) for c in self.blasts]
        n.drops = [dict(d) for d in self.drops]
        n.fighters = [f.clone() for f in self.fighters]
        n.round_frames = self.round_frames
        n.time_left = self.time_left
        n.status = self.status
        n.seed = self.seed
        n.round = self.round
        n.next_id = self.next_id
        return n


def frames_until_free(f):
    """我「可以再次下指令移动」还要等几帧（严格复刻引擎的浮点比较）。"""
    if f.move_progress >= 1.0:
        return 0
    m = move_inc(f.speed)
    p = f.move_progress
    k = 0
    while p < 1.0 and k < 20:
        p = min(1.0, p + 1.0 / m)
        k += 1
    return k


# ---------------------------------------------------------------- 引擎复刻
def _bomb_at(w, x, y):
    for b in w.bombs:
        if b['x'] == x and b['y'] == y:
            return b
    return None


def _walkable(w, x, y, ignore_id):
    if not (0 <= x < W and 0 <= y < H):
        return False
    if w.tiles[y * W + x] != EMPTY:
        return False
    b = _bomb_at(w, x, y)
    if b is not None and b['id'] != ignore_id:
        return False
    return True


def _pressed_edge(f, btn):
    h = f.input_history
    if not h or h[-1]['btn'] != btn:
        return False
    return len(h) < 2 or h[-2]['btn'] != btn


def _push_input(f, inp):
    f.input_history.append(inp)
    if len(f.input_history) > 8:
        f.input_history.pop(0)
    f.held = inp


def _explode(w, bomb, track_drops=True):
    if bomb['exploded']:
        return
    bomb['exploded'] = True
    cells = [(bomb['x'], bomb['y'])]
    broken = []
    for dx, dy in DIRS4:
        for s in range(1, bomb['blast'] + 1):
            x = bomb['x'] + dx * s
            y = bomb['y'] + dy * s
            if not (0 <= x < W and 0 <= y < H):
                break
            t = w.tiles[y * W + x]
            if t == HARD:
                break
            cells.append((x, y))
            if t == SOFT:
                w.tiles[y * W + x] = EMPTY
                broken.append((x, y))
                break
            for ob in w.bombs:
                if not ob['exploded'] and ob['x'] == x and ob['y'] == y:
                    _explode(w, ob, track_drops)
                    break
    for (x, y) in cells:
        w.blasts.append([x, y, BLAST_FRAMES, bomb['owner']])
    cset = set(cells)
    if w.drops:
        w.drops = [d for d in w.drops if (d['x'], d['y']) not in cset]
    if track_drops:
        for (x, y) in broken:
            tp = predict_drop(w.seed, w.round, x, y)
            if tp:
                w.drops.append({'id': 'x', 'x': x, 'y': y, 'type': tp})


def _step_fighter(w, f):
    if not f.alive:
        return
    inp = f.held
    if not f.input_history:
        return
    m = move_inc(f.speed)
    if f.move_progress < 1.0:
        f.move_progress = min(1.0, f.move_progress + 1.0 / m)
        if f.move_progress >= 1.0:
            f.from_x = f.x
            f.from_y = f.y
        return
    # 拾取
    if w.drops:
        for d in w.drops:
            if d['x'] == f.x and d['y'] == f.y:
                w.drops.remove(d)
                if d['type'] == 'bomb':
                    f.bombs = min(BOMBS_MAX, f.bombs + 1)
                elif d['type'] == 'blast':
                    f.blast = min(BLAST_MAX, f.blast + 1)
                else:
                    f.speed = min(SPEED_MAX, f.speed + 1)
                break
    # 放弹（上升沿）
    if inp['btn'] == 'BOMB' and _pressed_edge(f, 'BOMB'):
        if f.active_bombs < f.bombs and _bomb_at(w, f.x, f.y) is None:
            w.bombs.append({'id': 'b%d' % w.next_id, 'owner': f.owner, 'x': f.x, 'y': f.y,
                            'fuse': FUSE, 'blast': f.blast, 'exploded': False})
            w.next_id += 1
            f.active_bombs += 1
    delta = NAME2DELTA.get(inp['dir'], (0, 0))
    if delta[0] == 0 and delta[1] == 0:
        return
    dx, dy = delta
    if dx != 0:
        f.facing = dx
    nx, ny = f.x + dx, f.y + dy
    own = None
    for b in w.bombs:
        if b['owner'] == f.owner and b['x'] == f.x and b['y'] == f.y:
            own = b
            break
    if _walkable(w, nx, ny, own['id'] if own else None):
        f.from_x = f.x
        f.from_y = f.y
        f.move_progress = 1.0 / m
        f.x = nx
        f.y = ny


def step(w, inputs):
    """inputs: list of (dir,btn) 对应 w.fighters 顺序。"""
    for f, (d, b) in zip(w.fighters, inputs):
        if f.alive:
            _push_input(f, {'dir': d, 'btn': b})
    w.round_frames += 1
    for b in w.bombs:
        if b['exploded']:
            continue
        b['fuse'] -= 1
        if b['fuse'] <= 0:
            _explode(w, b)
            ow = w.fighters[b['owner']] if b['owner'] < len(w.fighters) else None
            if ow:
                ow.active_bombs = max(0, ow.active_bombs - 1)
    w.bombs = [b for b in w.bombs if not b['exploded']]
    for c in w.blasts:
        c[2] -= 1
    w.blasts = [c for c in w.blasts if c[2] > 0]
    for f in w.fighters:
        _step_fighter(w, f)
    for f in w.fighters:
        if not f.alive:
            continue
        if w.round_frames <= f.invuln_until:
            continue
        for c in w.blasts:
            if c[0] == f.x and c[1] == f.y:
                f.alive = False
                break
    if w.status == 'playing':
        alive = [f for f in w.fighters if f.alive]
        if len(alive) <= 1:
            w.status = 'ended'


# ---------------------------------------------------------------- 火焰时间线
def fire_timeline(w, horizon, extra=None):
    """返回 fire[t] = 第 t 帧（相对现在）处于火焰中的格子集合。
    extra = (cell, place_frame, blast, owner) 表示「我打算在 place_frame 放的炸弹」。"""
    tiles = bytearray(w.tiles)
    bombs = [{'x': b['x'], 'y': b['y'], 'fuse': b['fuse'], 'blast': b['blast'],
              'exploded': False, 'owner': b['owner']} for b in w.bombs]
    blasts = [[c[0], c[1], c[2], c[3]] for c in w.blasts]
    fire = [set() for _ in range(horizon + 2)]

    def explode_tl(b):
        if b['exploded']:
            return
        b['exploded'] = True
        cells = [(b['x'], b['y'])]
        for dx, dy in DIRS4:
            for s in range(1, b['blast'] + 1):
                x = b['x'] + dx * s
                y = b['y'] + dy * s
                if not (0 <= x < W and 0 <= y < H):
                    break
                t = tiles[y * W + x]
                if t == HARD:
                    break
                cells.append((x, y))
                if t == SOFT:
                    tiles[y * W + x] = EMPTY
                    break
                for ob in bombs:
                    if not ob['exploded'] and ob['x'] == x and ob['y'] == y:
                        explode_tl(ob)
                        break
        for (x, y) in cells:
            blasts.append([x, y, BLAST_FRAMES, b['owner']])

    # extra 炸弹在第 extra[1] 帧的「角色阶段」放下，也就是该帧引信阶段之后。
    # extra[1] == 0 表示这一帧就放，循环从 1 开始，所以要单独处理。
    if extra is not None and extra[1] <= 0:
        bombs.append({'x': extra[0][0], 'y': extra[0][1], 'fuse': FUSE,
                      'blast': extra[2], 'exploded': False, 'owner': extra[3]})

    for t in range(1, horizon + 1):
        for b in bombs:
            if b['exploded']:
                continue
            b['fuse'] -= 1
            if b['fuse'] <= 0:
                explode_tl(b)
        bombs = [b for b in bombs if not b['exploded']]
        for c in blasts:
            c[2] -= 1
        blasts = [c for c in blasts if c[2] > 0]
        fire[t] = set((c[0], c[1]) for c in blasts)
        if extra is not None and t == extra[1]:
            cell, _, blast, owner = extra
            bombs.append({'x': cell[0], 'y': cell[1], 'fuse': FUSE, 'blast': blast,
                          'exploded': False, 'owner': owner})
    return fire


def safe_at(fire, cell, t):
    if t <= 0:
        return True
    if t >= len(fire):
        return True
    return cell not in fire[t]


def safe_range(fire, cell, t0, t1):
    for t in range(t0, t1 + 1):
        if not safe_at(fire, cell, t):
            return False
    return True


# ---------------------------------------------------------------- 搜索
def dijkstra(fire, tiles, bomb_cells, start, t0, speed, max_t, goal_fn=None,
             safe_goal_until=None):
    """时间扩展图上的最短路。
    状态 (cell, t)：t 表示「我在 cell 上、可以再次移动的那一帧」。
    移动一格耗 m 帧，期间位置已经是目标格，所以目标格必须在 [t, t+m-1] 安全。
    返回 (arrive, prev)；若给了 goal_fn 且找到目标，提前返回。"""
    m = move_frames(speed)
    start = (start[0], start[1])
    if goal_fn is not None and goal_fn(start, t0):
        return {start: t0}, {}, (t0, [start])
    best = {(start, t0): t0}
    prev = {}
    arrive = {}
    pq = [(t0, start)]
    found = None
    while pq:
        t, cell = heapq.heappop(pq)
        if best.get((cell, t)) != t:
            continue
        if cell not in arrive or t < arrive[cell]:
            arrive[cell] = t
        # 原地等待
        nt = t + 1
        if nt <= max_t and safe_at(fire, cell, nt):
            key = (cell, nt)
            if key not in best:
                best[key] = nt
                prev[key] = (cell, t)
                heapq.heappush(pq, (nt, cell))
        for dx, dy in DIRS4:
            nb = (cell[0] + dx, cell[1] + dy)
            if not (0 <= nb[0] < W and 0 <= nb[1] < H):
                continue
            if tiles[nb[1] * W + nb[0]] != EMPTY:
                continue
            if nb in bomb_cells:
                continue
            ok = True
            for tt in range(t, t + m):
                if not safe_at(fire, nb, tt):
                    ok = False
                    break
            if not ok:
                continue
            nt2 = t + m
            if nt2 > max_t:
                continue
            key = (nb, nt2)
            if key in best:
                continue
            best[key] = nt2
            prev[key] = (cell, t)
            heapq.heappush(pq, (nt2, nb))
            if goal_fn is not None and goal_fn(nb, nt2):
                found = (nt2, nb)
                break
        if found is not None:
            break
    if found is not None:
        path = _reconstruct(prev, found, start, t0)
        return arrive, prev, (found[0], path)
    return arrive, prev, None


def _reconstruct(prev, node, start, t0):
    """node = (time, cell)；prev 的键与值都是 (cell, time) 形式的 key。"""
    path = [node[1]]
    cur = (node[1], node[0])
    guard = 0
    while cur in prev and guard < 400:
        cur = prev[cur]
        path.append(cur[0])
        guard += 1
    path.reverse()
    if path[0] != start:
        path.insert(0, start)
    return path


# ---------------------------------------------------------------- 战术辅助
def blast_cells(tiles, cx, cy, blast):
    cells = [(cx, cy)]
    broken = []
    for dx, dy in DIRS4:
        for s in range(1, blast + 1):
            x = cx + dx * s
            y = cy + dy * s
            if not (0 <= x < W and 0 <= y < H):
                break
            t = tiles[y * W + x]
            if t == HARD:
                break
            cells.append((x, y))
            if t == SOFT:
                broken.append((x, y))
                break
    return cells, broken


def manhattan(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def _log1p(v):
    import math
    return math.log1p(max(0.0, v))


def line_hits(tiles, a, b, blast):
    """从 a 放弹（火力 blast）能否烧到 b 所在格。"""
    if a == b:
        return True
    if a[0] == b[0]:
        d = abs(a[1] - b[1])
        if d > blast:
            return False
        step = 1 if b[1] > a[1] else -1
        for k in range(1, d):
            if tiles[(a[1] + step * k) * W + a[0]] != EMPTY:
                return False
        return True
    if a[1] == b[1]:
        d = abs(a[0] - b[0])
        if d > blast:
            return False
        step = 1 if b[0] > a[0] else -1
        for k in range(1, d):
            if tiles[a[1] * W + (a[0] + step * k)] != EMPTY:
                return False
        return True
    return False


# ---------------------------------------------------------------- 输入组装
def run_script(w, my, cells, bomb_idx, prev_btn=None, max_frames=240):
    """在克隆世界里「真的跑一遍」这条计划：逐帧用转向控制器驱动自己，
    返回 (inputs, alive, sim)。因为是真的在引擎语义下推进，速度变化、
    浮点帧数、连锁引爆全都会被如实反映 —— 这既是执行器也是安全校验器。"""
    sim = w.clone()
    mi = 0
    for i, f in enumerate(sim.fighters):
        if f.owner == my:
            mi = i
    me = sim.fighters[mi]
    n_other = len(sim.fighters)
    inputs = []
    idx = 0
    last_btn = prev_btn
    alive = True
    while len(inputs) < max_frames:
        if sim.status != 'playing' or not me.alive:
            alive = me.alive
            break
        d, btn = 'N', None
        if me.move_progress >= 1.0:
            cur = (me.x, me.y)
            while idx < len(cells) - 1 and cells[idx] != cur:
                idx += 1
            if idx < len(cells) and cells[idx] == cur:
                if idx in bomb_idx and last_btn != 'BOMB':
                    btn = 'BOMB'
                if idx + 1 < len(cells):
                    nxt = cells[idx + 1]
                    dd = DELTA2NAME.get((nxt[0] - cur[0], nxt[1] - cur[1]))
                    if dd:
                        d = dd
                        idx += 1
        inputs.append((d, btn))
        last_btn = btn
        row = []
        for i in range(n_other):
            row.append((d, btn) if i == mi else ('N', None))
        step(sim, row)
    alive = me.alive and sim.status == 'playing' or (me.alive and sim.status != 'playing')
    return inputs, me.alive, sim


def neutral():
    return {"inputs": [{"dir": "N", "btn": None} for _ in range(20)]}


def round_may_end(w, horizon=20):
    """本决策窗口（20 帧）内是否可能有人被炸死 / 时间到。

    引擎的窗口是 20 帧，但一局可能在第 20 帧之前就结束；剩下的帧会带着「上一局地图的
    计划」直接执行到新一局的全新地图上（引擎 endRound() 里立刻 startRound()，位置重置
    回到出生点、炸弹清空、地图重建）。这时计划里的放弹会变成在自己的出生点埋一颗雷，
    而计划里的逃生路线在新地图上多半不存在 —— 实测 seed 6004 R3 就是这样
    2 秒被自己的炸弹炸死。所以只要本窗口内可能局末，就把整条计划降级成
    「不放弹 + 尾部原地不动」。

    已知不足：这里只检查「谁现在站在火里」，对手**自己走进**火里结束一局的情况抓不到
    （seed 6001 R2 就是这样漏掉的）。试过把判定放宽成「对手离未来火焰格 <= 2 格」，
    能多拦住这种情形，但会大量误伤放弹：同样 15 个种子下打满 6/6/3 的局数从 12/47
    掉到 6/48，净亏。所以保留这条紧的判定，把漏网情形记在 review.md 的已知问题里。
    """
    try:
        if w.time_left <= 1.2:
            return True
        fire = fire_timeline(w, horizon + 2)
        for t in range(1, horizon + 1):
            s = fire[t] if t < len(fire) else set()
            if not s:
                continue
            for f in w.fighters:
                if f.alive and (f.x, f.y) in s:
                    return True
    except Exception:
        return False
    return False


def opp_threat(tiles, oppcell, oppblast, extra=2):
    s = set()
    r = oppblast + extra
    for dx, dy in DIRS4:
        for k in range(0, r + 1):
            x = oppcell[0] + dx * k
            y = oppcell[1] + dy * k
            if not (0 <= x < W and 0 <= y < H):
                break
            t = tiles[y * W + x]
            if t == HARD:
                break
            s.add((x, y))
            if t == SOFT:
                break
    return s


# ---------------------------------------------------------------- 主决策
def empty_components(tiles):
    """返回 (comp_id_of_cell, comp_size_of_id)：只沿 EMPTY 连通。"""
    comp = [-1] * (W * H)
    sizes = []
    for i in range(W * H):
        if tiles[i] != EMPTY or comp[i] >= 0:
            continue
        cid = len(sizes)
        stack = [i]
        comp[i] = cid
        n = 0
        while stack:
            j = stack.pop()
            n += 1
            x, y = j % W, j // W
            for dx, dy in DIRS4:
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H:
                    k = ny * W + nx
                    if tiles[k] == EMPTY and comp[k] < 0:
                        comp[k] = cid
                        stack.append(k)
        sizes.append(n)
    return comp, sizes


def choose_action(w, my):
    me = None
    opp = None
    for f in w.fighters:
        if f.owner == my:
            me = f
        else:
            opp = f
    if me is None or opp is None or not me.alive:
        return None
    tiles = w.tiles
    comp, csize = empty_components(tiles)

    def open_gain(cell):
        roots = set()
        for dx, dy in DIRS4:
            nx, ny = cell[0] + dx, cell[1] + dy
            if 0 <= nx < W and 0 <= ny < H:
                k = ny * W + nx
                if tiles[k] == EMPTY and comp[k] >= 0:
                    roots.add(comp[k])
        return sum(csize[r] for r in roots)

    maxfuse = 0
    for b in w.bombs:
        if b['fuse'] > maxfuse:
            maxfuse = b['fuse']
    horizon = max(70, maxfuse + 25)
    fire = fire_timeline(w, horizon)
    bomb_cells = set((b['x'], b['y']) for b in w.bombs)
    mycell = (me.x, me.y)
    oppcell = (opp.x, opp.y)
    t0 = frames_until_free(me)
    dist_to_opp = manhattan(mycell, oppcell)

    arrive, prev, _ = dijkstra(fire, tiles, bomb_cells, mycell, t0, me.speed, 30)

    def exits_count(cell):
        n = 0
        for dx, dy in DIRS4:
            nx, ny = cell[0] + dx, cell[1] + dy
            if 0 <= nx < W and 0 <= ny < H and tiles[ny * W + nx] == EMPTY \
                    and (nx, ny) not in bomb_cells:
                n += 1
        return n

    # ---- 0) 判断自己是不是被困在一个封闭口袋里
    # 四个出生角都是「5 格口袋」：两侧硬墙 + 一圈软墙，不炸墙永远出不去。
    # 被困时「原地不动」不是保守而是慢性死亡——对手会从容把装备刷满再回来收掉你，
    # 所以这种情况下必须让「炸开一条路」的候选压过「原地不动」。
    reach = [c for c, t in arrive.items() if t <= REACH_T]
    max_exits = max([exits_count(c) for c in reach] or [0])
    trapped = (len(reach) <= TRAP_CELLS) or (max_exits <= 1)

    def path_to(cell):
        t = arrive[cell]
        cur = (cell, t)
        path = [cell]
        guard = 0
        while cur in prev and guard < 400:
            cur = prev[cur]
            path.append(cur[0])
            guard += 1
        path.reverse()
        if path[0] != mycell:
            path.insert(0, mycell)
        return path

    def term_ok(cell, t):
        return safe_range(fire, cell, t, min(horizon, t + 26))

    cands = []

    # ---- 1) 捡道具
    # 注意：道具被后续爆炸烧掉是不可逆的损失，所以「能捡就捡」要放宽到 40 帧
    # （速度 0 时一格要 7 帧，26 帧只够走 3 格，会让眼前刚炸出来的道具捡不到）。
    # 落脚安全只要求 18 帧，整条计划是否安全由 run_script 用引擎语义再验一遍。
    for d in w.drops:
        dc = (d['x'], d['y'])
        if dc not in arrive:
            continue
        t = arrive[dc]
        if t > 40 or not safe_range(fire, dc, t, min(horizon, t + 18)):
            continue
        sc = DROP_VALUE.get(d['type'], 1.0) * 3.0 / (1.0 + 0.14 * t)
        cands.append((sc, path_to(dc), set(), 'drop:' + d['type']))

    # ---- 2) 放弹（farm / 开图 / 压制 / 击杀）
    if me.active_bombs < me.bombs:
        pre = []
        for C, t in arrive.items():
            if t > 12:
                continue
            if C in bomb_cells:
                continue
            cells, broken = blast_cells(tiles, C[0], C[1], me.blast)
            bv = 0.0
            opened = 0.0
            for (bx, by) in broken:
                tp = predict_drop(w.seed, w.round, bx, by)
                dv = DROP_VALUE[tp] if tp else 0.15
                og = open_gain((bx, by))
                # 1.5 是「开图本身就有价值」的底分：不炸墙就只能原地发呆
                toward = max(0.0, dist_to_opp - manhattan((bx, by), oppcell))
                bv += dv + 0.55 * _log1p(og) + W_BASE + 0.30 * toward
                opened += og
            hit = oppcell in cells
            opens = bool(broken)
            if trapped and opens:
                # 被困在口袋里：开图的价值远高于平时，且必须压过「原地不动」。
                # 只有真的炸掉软墙才算「开路」，炸空地不享受这个加分。
                bv += W_TRAPB + W_TRAPO * _log1p(opened)
            pre.append((bv + (W_HIT if hit else 0.0) - 0.03 * t, C, t, hit, opens))
        pre.sort(key=lambda z: -z[0])
        for (psc, C, t, hit, opens) in pre[:6]:
            h2 = max(horizon, t + FUSE + 16)
            fire2 = fire_timeline(w, h2, extra=(C, t, me.blast, my))
            bc2 = set(bomb_cells)
            bc2.add(C)
            _, _, res = dijkstra(fire2, tiles, bc2, C, t, me.speed, min(h2, t + 52),
                                 goal_fn=lambda c, tt, f2=fire2, hh=h2: safe_range(f2, c, tt, min(hh, tt + SAFE_H)))
            if res is None:
                continue  # 没有退路 —— 绝对不放
            et = res[0]
            kill = False
            if hit:
                _, _, ores = dijkstra(fire2, tiles, bc2, oppcell, 20, opp.speed, min(h2, 20 + 52),
                                      goal_fn=lambda c, tt, f2=fire2, hh=h2: safe_range(f2, c, tt, min(hh, tt + SAFE_H)))
                kill = (ores is None)
            sc = psc
            if kill:
                sc += 80.0
            elif hit:
                sc += W_HIT
            sc -= W_ESC * max(0.0, et - ESC_FREE)
            # 地板：只要「有退路」就永远比原地发呆强 —— 不炸墙就永远开不了图
            if sc < W_STAY - 0.1:
                sc = W_STAY - 0.1
            pth = path_to(C)
            esc = res[1]
            if len(esc) > 1:
                cells_script = pth + esc[1:]
            else:
                cells_script = pth
            cands.append((sc, cells_script, {len(pth) - 1},
                          'bomb@%d,%d%s%s' % (C[0], C[1], ' KILL' if kill else '',
                                              ' OPEN' if opens else '')))

    # ---- 3) 压制走位
    best = None
    for C, t in arrive.items():
        if t > 22 or not term_ok(C, t):
            continue
        d = manhattan(C, oppcell)
        if d < 2:
            d += 6  # 贴脸有风险
        if best is None or d < best[0]:
            best = (d, C, t)
    if best is not None:
        pth = path_to(best[1])
        sc = 0.30 + max(0.0, (6 - best[0]) * 0.10)
        if best[0] <= 3:
            sc += 0.25
        if len(pth) <= 1:
            sc = 0.02  # 原地不动没有任何价值，只在实在没得选时才用
        # 时间不多就必须主动找对手：平局不计分，拖满 150 秒等于白打
        if w.time_left < HUNT1_T:
            sc *= HUNT1
        if w.time_left < HUNT2_T:
            sc *= HUNT2
        cands.append((sc, pth, set(), 'approach'))

    # ---- 4) 原地（只作为最后的兜底）
    if term_ok(mycell, t0):
        cands.append((W_STAY, [mycell], set(), 'stay'))

    # ---- 5) 躲火（当前格即将起火则强制优先）
    # 注意：t0 可能为 0（这一帧就能动），此时仍必须检查「我脚下这格会不会很快起火」，
    # 否则会站着不动被自己的炸弹炸死。
    threat_soon = False
    for t in range(1, min(t0 + DANGER_EXTRA, horizon) + 1):
        if not safe_at(fire, mycell, t):
            threat_soon = True
            break
    if threat_soon:
        _, _, res = dijkstra(fire, tiles, bomb_cells, mycell, t0, me.speed, horizon,
                             goal_fn=lambda c, tt: safe_range(fire, c, tt, horizon))
        if res is not None:
            cands.append((200.0, res[1], set(), 'escape'))

    # ---- 6) 终点格评估：机动性 + 对手威胁
    oth = opp_threat(tiles, oppcell, opp.blast, 3)

    opp_near = manhattan(mycell, oppcell) <= opp.blast + 6
    tl = w.time_left
    urg = 1.0 if tl > 60.0 else (0.5 if tl > 30.0 else 0.15)
    scored = []
    stay_sc = None
    for (sc, cells, bidx, note) in cands:
        endc = cells[-1] if cells else mycell
        e = exits_count(endc)
        sc += W_MOB * min(e, 3)         # 出口越多越不容易被堵死（只做微调）
        if e <= 1:
            sc -= EXIT_PEN
        danger = endc in oth
        if danger:
            # 站进对手火力覆盖圈很危险；除非这一手本身就是攻击
            sc -= (1.5 if (bidx and note.startswith('bomb')) else W_THREAT) * urg
        if opp_near and e <= 2 and not note.startswith('bomb'):
            sc -= 1.0 * urg
        if note == 'stay':
            stay_sc = sc
        scored.append((sc, cells, bidx, note, endc, danger))
    # 「原地不动」必须是真正的最后手段：只要存在一条【通过了硬安全校验（一定有退路）】
    # 且终点不在对手火力覆盖圈里的建设性计划（炸墙开图 / 击杀 / 捡道具），
    # 就不允许它输给「站着不动」。注意必须在上面所有扣分之后做，
    # 否则出口数惩罚会把放弹重新压到原地不动以下 —— 这正是第 1 轮我站着不动 50 秒的原因。
    if stay_sc is not None:
        out = []
        for (sc, cells, bidx, note, endc, danger) in scored:
            productive = ((note.startswith('bomb') and (' OPEN' in note or ' KILL' in note))
                          or note.startswith('drop:'))
            if productive and not danger:
                sc = max(sc, stay_sc + 0.3)
            out.append((sc, cells, bidx, note))
        scored = out
    else:
        scored = [(sc, cells, bidx, note) for (sc, cells, bidx, note, _e, _d) in scored]
    scored.sort(key=lambda z: -z[0])
    return scored


def emergency(w, my, prev_btn):
    """所有计划都过不了安全校验时的保底：先试「跑到安全格」，再退化为固定方向。"""
    me = None
    for f in w.fighters:
        if f.owner == my:
            me = f
    if me is not None:
        try:
            maxfuse = 0
            for b in w.bombs:
                if b['fuse'] > maxfuse:
                    maxfuse = b['fuse']
            horizon = max(70, maxfuse + 25)
            fire = fire_timeline(w, horizon)
            bomb_cells = set((b['x'], b['y']) for b in w.bombs)
            _, _, res = dijkstra(fire, w.tiles, bomb_cells, (me.x, me.y),
                                 frames_until_free(me), me.speed, horizon,
                                 goal_fn=lambda c, tt, f2=fire, hh=horizon: safe_range(f2, c, tt, hh))
            if res is not None:
                inp, alive, sim = run_script(w, my, res[1], set(), prev_btn, 20)
                if alive:
                    return inp[:20] + [('N', None)] * max(0, 20 - len(inp[:20]))
        except Exception:
            pass
    best = None
    best_t = -1
    for d in ('N', 'U', 'D', 'L', 'R'):
        sim = w.clone()
        mi = 0
        for i, f in enumerate(sim.fighters):
            if f.owner == my:
                mi = i
        me = sim.fighters[mi]
        t = 0
        for k in range(80):
            if not me.alive or sim.status != 'playing':
                break
            row = []
            for i in range(len(sim.fighters)):
                row.append((d, None) if i == mi else ('N', None))
            step(sim, row)
            t += 1
        if me.alive and sim.status == 'playing':
            return [(d, None)] * 20
        if t > best_t:
            best_t = t
            best = [(d, None)] * 20
    return best or [('N', None)] * 20


PREV_BTN = None
# 观察里的 px/py 保留两位小数，无法区分「正好走完」和「还差最后一帧」——
# 速度 0 时 1/6 累加 6 次 = 0.9999999999999999 < 1，引擎还要再走一帧。
# 于是用「自己模拟自己」的方式跨窗口精确跟踪自己的 moveProgress。
TRACK = {'key': None, 'x': None, 'y': None, 'prog': 1.0, 'alive': True}


def track_sync(w, my):
    me = None
    for f in w.fighters:
        if f.owner == my:
            me = f
    if me is None:
        return None
    key = (w.seed, w.round)
    if TRACK['key'] != key:
        TRACK['key'] = key
        TRACK['x'] = None
    if (TRACK['x'] == me.x and TRACK['y'] == me.y
            and TRACK['alive'] == me.alive):
        me.move_progress = TRACK['prog']
    return me


def track_advance(w, my, frames):
    sim = w.clone()
    mi = None
    for i, f in enumerate(sim.fighters):
        if f.owner == my:
            mi = i
    if mi is None:
        return
    for (d, b) in frames:
        if sim.status != 'playing':
            break
        row = []
        for i in range(len(sim.fighters)):
            row.append((d, b) if i == mi else ('N', None))
        step(sim, row)
    me = sim.fighters[mi]
    TRACK['x'] = me.x
    TRACK['y'] = me.y
    TRACK['prog'] = me.move_progress
    TRACK['alive'] = me.alive
    TRACK['key'] = (w.seed, w.round)


def decide(obs):
    global PREV_BTN
    if obs.get('status') != 'playing':
        PREV_BTN = None
        return neutral()
    my = int(obs.get('yourPlayer', 0))
    try:
        w = World.from_obs(obs)
    except Exception:
        return neutral()
    if len(w.fighters) < 2:
        return neutral()
    try:
        track_sync(w, my)
    except Exception:
        pass
    cands = []
    try:
        cands = choose_action(w, my)
    except Exception as e:
        if DEBUG:
            sys.stderr.write('choose err %r\n' % (e,))
    note = ''
    frames = None
    if DEBUG:
        me0 = [f for f in w.fighters if f.owner == my][0]
        sys.stderr.write('cell=(%d,%d) t0=%d spd=%d bomb=%d/%d nBombs=%d cands=%s\n' % (
            me0.x, me0.y, frames_until_free(me0), me0.speed, me0.active_bombs, me0.bombs,
            len(w.bombs), ' | '.join('%s:%.1f' % (c[3], c[0]) for c in cands[:6])))
        sys.stderr.write('   bombs=%s blasts=%s t0pos=(%s,%s) p=(%s,%s) mp=%.3f tiles=%s\n' % (
            [(b['x'], b['y'], b['fuse']) for b in w.bombs],
            [(c[0], c[1]) for c in w.blasts],
            me0.x, me0.y, me0.x - me0.from_x, me0.y - me0.from_y, me0.move_progress,
            [w.tiles[me0.y * W + me0.x + dx] for dx in (-1, 0, 1)]))
    for (sc, cells, bidx, nte) in cands:
        try:
            inputs, alive, sim = run_script(w, my, cells, bidx, PREV_BTN, 220)
        except Exception:
            continue
        if not alive:
            continue
        if len(inputs) < 20:
            inputs = inputs + [('N', None)] * (20 - len(inputs))
        frames = inputs[:20]
        note = '%s %.1f' % (nte, sc)
        if DEBUG:
            sys.stderr.write('   pick %s alive=%s path=%s\n' % (nte, alive, cells[:8]))
        break
    if frames is None:
        frames = emergency(w, my, PREV_BTN)
        note = 'emergency'
    # 保证窗口最后一帧不是 BOMB，让下一窗口的上升沿保持新鲜
    if frames and frames[-1][1] == 'BOMB':
        frames = frames[:-1] + [('N', None)]
    # 本窗口内可能局末：新一局会把地图和位置全部重置，旧计划里的放弹＝在出生点埋雷
    try:
        if frames is not None and round_may_end(w):
            frames = [(d, None) for (d, b) in frames]
            frames = frames[:-8] + [('N', None)] * 8
            note = (note + ' |noroundend').strip()
    except Exception:
        pass
    PREV_BTN = frames[-1][1] if frames else None
    try:
        track_advance(w, my, frames)
    except Exception:
        TRACK['x'] = None
    return {"inputs": [{"dir": d, "btn": b} for (d, b) in frames], "note": note}


def main():
    global DEBUG
    if '--debug' in sys.argv:
        DEBUG = True
    out = sys.stdout
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
        except Exception:
            out.write(json.dumps(neutral()) + '\n')
            out.flush()
            continue
        try:
            res = decide(obs)
        except Exception as e:
            if DEBUG:
                sys.stderr.write('decide err %r\n' % (e,))
            res = neutral()
        if DEBUG:
            sys.stderr.write('-> %s\n' % res.get('note', ''))
            sys.stderr.flush()
        try:
            out.write(json.dumps(res) + '\n')
            out.flush()
        except Exception:
            pass


if __name__ == '__main__':
    main()
