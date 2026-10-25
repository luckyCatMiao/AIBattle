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
import time

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
import os as _os2
DROP_VALUE = {'bomb': float(_os2.environ.get('AG_VBOMB', '1.6')),
              'blast': float(_os2.environ.get('AG_VBLAST', '3.0')),
              'speed': float(_os2.environ.get('AG_VSPEED', '2.6'))}
DEBUG = False
import os as _os
W_BASE = float(_os.environ.get('AG_BASE', '1.5'))    # 炸墙的基础价值（开图本身）
W_TOWARD = float(_os.environ.get('AG_TOWARD', '0.30'))  # 炸墙「朝对手推进」的权重
W_OPEN = float(_os.environ.get('AG_OPENW', '0.55'))     # 开图增益（log1p 新空间）的权重
# 放弹目标的最大「走过去」帧数。旧值 12 在速度 0（7 帧/格）时只覆盖不到 2 格，
# 于是 agent 只能在脚边炸墙：明明 4 格外就有一面会掉火力的墙，它也走不过去。
TOP_N = int(_os.environ.get('AG_TOPN', '6'))           # 放弹候选里真正做安全校验的个数
TRAVEL_T = int(_os.environ.get('AG_TRAVEL', '30'))
ARRIVE_T = int(_os.environ.get('AG_ARRIVE', '50'))      # dijkstra 的搜索上限（帧）
W_TRAV = float(_os.environ.get('AG_TRAV', '0.0'))      # 每帧赶路成本
W_NEED = int(_os.environ.get('AG_NEED', '1'))           # 1=装备满了就不再为该项掉落加分
W_ESC = float(_os.environ.get('AG_ESC', '0.35'))     # 放弹后逃生耗时的惩罚系数
W_MOB = float(_os.environ.get('AG_MOB', '0.15'))     # 终点格机动性奖励
W_STAY = float(_os.environ.get('AG_STAY', '-1.0'))   # 原地不动的基础分
W_THREAT = float(_os.environ.get('AG_THREAT', '5.0'))
W_HIT = float(_os.environ.get('AG_HIT', '6.0'))
DANGER_EXTRA = int(_os.environ.get('AG_DANGER', '4'))
ESC_FREE = float(_os.environ.get('AG_ESCFREE', '0'))
HUNT1_T = float(_os.environ.get('AG_H1T', '200'))
HUNT1 = float(_os.environ.get('AG_H1', '3.0'))
HUNT2_T = float(_os.environ.get('AG_H2T', '200'))
HUNT2 = float(_os.environ.get('AG_H2', '10.0'))
HUNT_ADD1 = float(_os.environ.get('AG_H1A', '2'))      # 追击时给 approach 的加法奖励
# 装备领先时不要无脑贴脸：自测里出现过「6/6/3 追 2/3/1 追进角落被反杀」的局。
LEAD_CAREFUL = float(_os.environ.get('AG_LEAD', '1.0'))
BEHIND_AGGR = float(_os.environ.get('AG_BEHIND', '0.5'))
BEHIND_T = float(_os.environ.get('AG_BEHINDT', '3'))
HUNT_ADD2 = float(_os.environ.get('AG_H2A', '0'))
# 出生角是一个「5 格口袋」（两侧硬墙 + 一圈软墙），不炸墙永远出不去。
# 被困时必须让「炸开一条路」压过「原地不动」，否则会站着看对手把装备刷满。
TRAP_CELLS = int(_os.environ.get('AG_TRAPN', '12'))    # 可达格数 <= 此值 → 视为被困
REACH_T = int(_os.environ.get('AG_REACHT', '24'))      # 统计「可达」的时间上限（帧）
W_TRAPB = float(_os.environ.get('AG_TRAPB', '4.0'))    # 被困时放弹的基础加分
W_TRAPO = float(_os.environ.get('AG_TRAPO', '0.8'))    # 被困时每炸开新空间的加分系数
EXIT_PEN = float(_os.environ.get('AG_EXITP', '1.5'))   # 终点只有 1 个出口时的惩罚
SAFE_H = int(_os.environ.get('AG_SAFEH', '45'))        # 放弹后逃生终点需要保持安全的帧数
# 判定「对手跑不掉」时给他的安全窗口。用 45 太苛刻：只要躲过这一轮火就够，
# 要求 45 帧全程安全会把「其实能躲开」的情形误判成必杀，于是白白送弹 + 送位置。
OSAFE_H = int(_os.environ.get('AG_OSAFEH', '45'))
KILL_SC = float(_os.environ.get('AG_KILL', '300'))
HIT_SC = float(_os.environ.get('AG_HITSC', '-2'))     # 必杀候选的分数（远高于一切 farm 计划）
W_DEAD = float(_os.environ.get('AG_DEAD', '60.0'))     # 终点落在「对手一颗弹就能收掉」的死胡同时的惩罚
# 引擎在「连锁引爆」时不会给被连锁的炸弹扣 activeBombs（只有自己引信烧完时才扣）。
# 于是一颗炸弹如果被别的炸弹的火焰提前引爆，它的 owner 就永久损失 1 点放弹容量，
# 本局剩余时间里 activeBombs 只增不减，几次之后就会被锁死（自测里 258 个快照有 21 个
# 处于 active==max 且场上无弹的状态）。所以除了必杀，不要把炸弹放进任何现有炸弹的
# 爆炸十字里。
W_CHAIN = float(_os.environ.get('AG_CHAIN', '12.0'))
# 1 = 严格避免连锁（默认，提交用）；0 = 允许连锁（只用于构造「会泄漏容量的
# 强对手」做对照实验，模拟 Sol 那种每局泄漏 5 点放弹容量的行为）。
NOLEAK = int(_os.environ.get('AG_NOLEAK', '3'))
# 贴身放弹（和对手同格/相邻格）等于和对手对赌同一帧的先后手：对手下一帧就能在
# 我唯一的退路上补一颗弹。除非这一手是必杀，否则重罚（自测里多个失局就是
# 「我在走廊里贴着对手放弹，他反手封住另一头」）。
W_BLUNT = float(_os.environ.get('AG_BLUNT', '20.0'))
# 逃生路径贴着对手走：他可以把那条路也炸掉。
W_PATH = float(_os.environ.get('AG_PATH', '10.0'))
# 放弹目标必须在「本窗口的 20 帧内」真正走到并放下炸弹。旧版允许到达时间 30，
# 结果计划里的炸弹落在第 20 帧之后，窗口内一颗弹都没放；下一窗口重新评分又
# 选了另一个远目标 —— 实测两个 agent 会在两个目标之间来回走 120 秒，一颗弹都不放。
# 到达时间 t 就是放弹那一帧的输入下标（0-based），所以要 <= 18（末帧还会被
# 「最后一帧不放弹」的保护改掉）。
BOMB_T = int(_os.environ.get('AG_BOMBT', '18'))
# kill_threat 现在是「对手一颗弹 + 堵住唯一出口」的严格判据，命中就说明停在那里
# 下一窗口极可能被收掉。60 分远大于一切 farm/走位收益，等价于禁止。
# 放完炸弹之后的落脚点如果是「只有一条轴」的走廊格，对手只要在我的退路上再补一颗弹，
# 我就会像夹心一样被夹死（自测里的自炸绝大多数是这个形状）。
# W_CORR = 这种「单轴落脚点 + 对手在附近」的惩罚。
# 贴脸 + 走廊 = 最典型的死法：对手贴着我放一颗弹，我在 1 宽走廊里没有垂直退路。
# 统计上 34/40 次致命炸弹是贴身放置的，所以「没有两条轴的出口时不要贴脸」。
W_ADJ = float(_os.environ.get('AG_ADJ', '10.0'))
ADJ_R = float(_os.environ.get('AG_ADJR', '2'))
W_CORR = float(_os.environ.get('AG_CORR', '0.0'))
CORR_R = float(_os.environ.get('AG_CORRR', '10'))
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
def fire_timeline(w, horizon, extra=None, want_tiles=False, extra_info=None):
    """返回 fire[t] = 第 t 帧（相对现在）处于火焰中的格子集合。
    extra = (cell, place_frame, blast, owner) 表示「我打算在 place_frame 放的炸弹」。
    extra_info（list）会被追加一个元素：extra 炸弹实际在第几帧被引爆
    （None 表示在时间线内没爆）。若它早于 place_frame+FUSE，说明会被别人连锁，
    放弹容量会永久 -1（引擎 bug）。"""
    tiles = bytearray(w.tiles)
    bombs = [{'x': b['x'], 'y': b['y'], 'fuse': b['fuse'], 'blast': b['blast'],
              'exploded': False, 'owner': b['owner']} for b in w.bombs]
    blasts = [[c[0], c[1], c[2], c[3]] for c in w.blasts]
    fire = [set() for _ in range(horizon + 2)]
    extra_bomb = None
    extra_explode = None

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
        extra_bomb = {'x': extra[0][0], 'y': extra[0][1], 'fuse': FUSE,
                      'blast': extra[2], 'exploded': False, 'owner': extra[3]}
        bombs.append(extra_bomb)

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
            extra_bomb = {'x': cell[0], 'y': cell[1], 'fuse': FUSE, 'blast': blast,
                          'exploded': False, 'owner': owner}
            bombs.append(extra_bomb)
        if extra_bomb is not None and extra_bomb['exploded'] and extra_explode is None:
            extra_explode = t
    if extra_info is not None:
        extra_info.append(extra_explode)
    if want_tiles:
        return fire, tiles
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
                if goal_fn is not None and goal_fn(cell, nt):
                    found = (nt, cell)
                    break
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
    浮点帧数、连锁引爆全都会被如实反映 —— 这既是执行器也是安全校验器。

    两个第 2 轮暴露的 bug 在这里修掉：
    A) 连续重复路径格（dijkstra 的等待）以前会让 idx 卡住、输出 20×N。
       现在「下一格 == 当前格」表示显式等待 1 帧：输出 N 并前进一格。
    B) 以前 sim.status != 'playing'（模拟对手被自己的炸弹炸死）就提前退出，
       漏掉我方后续的死亡。现在把克隆世界里的对手设为永久无敌，
       只在我方死亡或跑满计划时结束，安全校验不再被对手的模拟死亡干扰。
    """
    sim = w.clone()
    mi = 0
    for i, f in enumerate(sim.fighters):
        if f.owner == my:
            mi = i
    # 对手在验证器里永不死亡：我们只关心自己的计划是否安全。
    for i, f in enumerate(sim.fighters):
        if i != mi:
            f.invuln_until = 10 ** 9
    me = sim.fighters[mi]
    n_other = len(sim.fighters)
    inputs = []
    idx = 0
    last_btn = prev_btn
    pos20 = None
    while len(inputs) < max_frames:
        if not me.alive:
            break
        d, btn = 'N', None
        if me.move_progress >= 1.0:
            cur = (me.x, me.y)
            # 计划执行漂移时向前对齐（正常情况下 cells[idx] 就是 cur）。
            while idx < len(cells) and cells[idx] != cur:
                idx += 1
            if idx < len(cells) and cells[idx] == cur:
                if idx in bomb_idx and last_btn != 'BOMB':
                    btn = 'BOMB'
                if idx + 1 < len(cells):
                    nxt = cells[idx + 1]
                    if nxt == cur:
                        # 显式等待一帧（旧版在这里卡死）
                        idx += 1
                    else:
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
        if len(inputs) == 20:
            # 窗口边界上的真实落点：下一窗口从这里重新决策，所以这里才是
            # 必须「对手一颗弹收不掉」的位置。只检查计划终点是不够的。
            pos20 = (me.x, me.y)
            my_bombs20 = set((b['x'], b['y']) for b in sim.bombs if b['owner'] == my)
    if pos20 is None:
        pos20 = (me.x, me.y)
        my_bombs20 = set((b['x'], b['y']) for b in sim.bombs if b['owner'] == my)
    return inputs, me.alive, sim, pos20, my_bombs20


def neutral():
    return {"inputs": [{"dir": "N", "btn": None} for _ in range(20)]}


# 单次响应硬上限 5 秒。比赛机（WSL）可能比本机慢数倍，所以留足余量：
# 超过这个时间就放弃剩余候选、走便宜的 emergency，绝不冒险超时。
_DEADLINE = [None]


def _past_deadline():
    d = _DEADLINE[0]
    return d is not None and time.perf_counter() > d


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


# ---------------------------------------------------------------- 对手炸弹威胁
# 自测发现：我方 40 次死亡里 36 次在「致命炸弹放下的那一刻」就站在 ≤1 个出口的格子上，
# 34 次是被贴身放置的炸弹炸死的。也就是说杀我的不是对枪，而是「站在死胡同里被贴脸埋雷」。
# 炸弹引信 40 帧、决策窗口 20 帧，所以只要我站的位置有一条垂直于火线的退路，单颗炸弹
# 就杀不掉我。下面两个函数把这条判据做成可计算的：
#   同一行上的敌方炸弹 → 我需要一个上/下出口才能躲开；
#   同一列上的敌方炸弹 → 我需要一个左/右出口才能躲开。
def _cell_open(tiles, bomb_cells, x, y):
    if not (0 <= x < W and 0 <= y < H):
        return False
    return tiles[y * W + x] == EMPTY and (x, y) not in bomb_cells


def axis_exits(tiles, bomb_cells, cell):
    """返回 (是否有左右出口, 是否有上下出口)。"""
    return (_cell_open(tiles, bomb_cells, cell[0] - 1, cell[1])
            or _cell_open(tiles, bomb_cells, cell[0] + 1, cell[1]),
            _cell_open(tiles, bomb_cells, cell[0], cell[1] - 1)
            or _cell_open(tiles, bomb_cells, cell[0], cell[1] + 1))


def opp_reach_set(w, opp, tiles, bomb_cells, depth):
    """对手在大约 2 秒内能走到（并因此能从那里放弹）的格子集合。"""
    start = (opp.x, opp.y)
    seen = {start: 0}
    frontier = [start]
    for d in range(depth):
        nxt = []
        for (x, y) in frontier:
            for dx, dy in DIRS4:
                nx, ny = x + dx, y + dy
                if (nx, ny) in seen:
                    continue
                if not _cell_open(tiles, bomb_cells, nx, ny):
                    continue
                seen[(nx, ny)] = d + 1
                nxt.append((nx, ny))
        frontier = nxt
        if not frontier:
            break
    return set(seen)


def _clear_row(tiles, x0, x1, y):
    lo, hi = (x0, x1) if x0 < x1 else (x1, x0)
    for x in range(lo + 1, hi):
        if tiles[y * W + x] != EMPTY:
            return False
    return True


def _clear_col(tiles, y0, y1, x):
    lo, hi = (y0, y1) if y0 < y1 else (y1, y0)
    for y in range(lo + 1, hi):
        if tiles[y * W + x] != EMPTY:
            return False
    return True


def bomb_cross(tiles, C, blast):
    return set(blast_cells(tiles, C[0], C[1], blast)[0])


def can_escape_bomb(tiles, bomb_cells, E, cross, speed, budget=36):
    """E 在这颗炸弹爆炸前（40 帧引信，留 4 帧余量）能不能走到十字火焰之外。
    这是「死胡同」判据的正确版本：站在走廊里只要跑得出去就没事，
    真正致命的是四面被墙/炸弹围死、或者唯一的出口还在火线上。"""
    if E not in cross:
        return True
    inc = move_inc(speed)
    best = {E: 0}
    pq = [(0, E)]
    while pq:
        t, cell = heapq.heappop(pq)
        if best.get(cell, 10 ** 9) != t:
            continue
        if cell != E and cell not in cross:
            return True
        nt = t + inc
        if nt > budget:
            continue
        for dx, dy in DIRS4:
            nb = (cell[0] + dx, cell[1] + dy)
            if not _cell_open(tiles, bomb_cells, nb[0], nb[1]):
                continue
            if best.get(nb, 10 ** 9) <= nt:
                continue
            best[nb] = nt
            heapq.heappush(pq, (nt, nb))
    return False


def kill_threat(tiles, bomb_cells, E, reach, blast, speed, bombs_left, max_try=6):
    """对手一颗炸弹能不能收掉站在 E 的我。返回 (是否有威胁, 威胁来自哪颗)。
    只考虑对手 2 秒内能走到、且与 E 同行/同列、直线可见、距离 <= blast 的放弹点。"""
    if bombs_left <= 0 or not reach:
        return False, None
    cand = []
    for C in reach:
        if C in bomb_cells:
            continue
        if C == E:
            continue
        if C[1] == E[1] and abs(C[0] - E[0]) <= blast and _clear_row(tiles, C[0], E[0], E[1]):
            cand.append((abs(C[0] - E[0]), C))
        elif C[0] == E[0] and abs(C[1] - E[1]) <= blast and _clear_col(tiles, C[1], E[1], E[0]):
            cand.append((abs(C[1] - E[1]), C))
    if not cand:
        return False, None
    cand.sort()
    for (_, C) in cand[:max_try]:
        cross = bomb_cross(tiles, C, blast)
        if E not in cross:
            continue
        # 关键修复：对手的威胁炸弹本身会把 C 变成实体障碍。
        # 旧版只用当前 bomb_cells，于是「唯一出口就在 C 上」的死胡同被误判成可逃
        # （第 2 轮多次死在 1 宽口袋的顶端）。这里必须把 C 也堵上。
        blocked = set(bomb_cells)
        blocked.add(C)
        if not can_escape_bomb(tiles, blocked, E, cross, speed):
            return True, C
    return False, None


# ---------------------------------------------------------------- 必杀判定
# 旧版必杀判据有两个方向相反的偏差：
#   1) 让对手「先站 20 帧」再开始跑，低估了逃生；
#   2) 又要求落脚后 45 帧全程安全，高估了逃生难度。
# 正确判据只有一句：对手从「现在」开始全速移动，能不能活到所有火焰结束。
# 能活 → 不是必杀；不能活 → 才是真正的必杀。
def opp_survives(fire, tiles_use, bomb_cells, start, speed, horizon):
    """对手从 now 起立刻移动，能否活过整条火焰时间线。

    优化：只要到达某个「此后不会再起火」的格子，就能一直等到火焰结束。
    预先算 last_fire[cell]（该格最后一次起火的帧），目标就是 tt > last_fire[cell]，
    O(1) 判定。旧版要求真的跑到 horizon 帧，几乎每次都要把整张时间扩展图展开。"""
    last = {}
    lf = -1
    hi = min(horizon, len(fire) - 1)
    for t in range(1, hi + 1):
        s = fire[t]
        if s:
            lf = t
            for c in s:
                last[c] = t
    if lf < 0:
        return True     # 时间线里根本没有火

    def goal(c, tt):
        return tt > last.get(c, -1)

    _, _, res = dijkstra(fire, tiles_use, bomb_cells, start, 0, speed, lf + 1,
                         goal_fn=goal)
    return res is not None


# ---------------------------------------------------------------- 威胁上下文
# 「对手一颗弹能不能收掉这一格」是整个防守的核心判据。choose_action 里要
# 对很多候选落脚点反复问同一个问题，decide 里还要检查窗口末尾的实际落点，
# 所以做成模块级、带缓存的上下文。
def make_threat_ctx(w, my):
    me = None
    opp = None
    for f in w.fighters:
        if f.owner == my:
            me = f
        else:
            opp = f
    if me is None or opp is None:
        return None
    tiles = w.tiles
    bomb_cells = set((b['x'], b['y']) for b in w.bombs)
    # 13 格（速度 3 的 40 帧）太远，kill_threat 会退化成 O(150×BFS)。
    # 10 格已经覆盖了实战里所有真实威胁，同时把每个窗口的判定成本压下来。
    depth = min(10, 40 // max(3, 6 - opp.speed) + 1)
    try:
        reach = opp_reach_set(w, opp, tiles, bomb_cells, depth)
    except Exception:
        reach = set()
    return {'tiles': tiles, 'bomb_cells': bomb_cells, 'reach': reach,
            'blast': opp.blast, 'speed': me.speed,
            'left': opp.bombs - opp.active_bombs, 'cache': {}}


def ctx_danger(ctx, cell, extra_blocked=None):
    if ctx is None:
        return False
    key = cell if not extra_blocked else (cell, frozenset(extra_blocked))
    v = ctx['cache'].get(key)
    if v is None:
        try:
            bc = ctx['bomb_cells']
            if extra_blocked:
                bc = set(bc) | set(extra_blocked)
            v = kill_threat(ctx['tiles'], bc, cell, ctx['reach'],
                            ctx['blast'], ctx['speed'], ctx['left'])[0]
        except Exception:
            v = False
        ctx['cache'][key] = v
    return v


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


def choose_action(w, my, allow_bomb=True, aggr=1.0):
    me = None
    opp = None
    for f in w.fighters:
        if f.owner == my:
            me = f
        else:
            opp = f
    if me is None or opp is None or not me.alive:
        return None
    # 已经泄漏掉的放弹容量 = activeBombs - 场上属于自己的炸弹数。
    # 引擎在连锁引爆时不扣 activeBombs，所以这个差值就是本局永久损失的容量。
    _my_onfield = sum(1 for b in w.bombs if b['owner'] == my)
    _leak_now = max(0, me.active_bombs - _my_onfield)
    # NOLEAK: 1=总是避免连锁；2=只做排序惩罚；0=完全不避；
    #         3=混合（泄漏 >=2 点后开始避免，之前允许用连锁换节奏）。
    _avoid_chain = (NOLEAK == 1) or (NOLEAK == 3 and _leak_now >= 2)
    # 贴身放弹的风险取决于对手还能不能还手：对手被锁死（没有可放的弹）时贴脸是
    # 收人头的正解；装备大幅领先/被逼到必须进攻时也放宽。
    _opp_left = opp.bombs - opp.active_bombs
    _eqadv = (me.bombs + me.blast + me.speed) - (opp.bombs + opp.blast + opp.speed)
    _blunt_scale = 0.0 if _opp_left <= 0 else (0.35 if _eqadv >= 5 else 1.0)
    if aggr > 1.0:
        _blunt_scale *= 0.6
    # 对手被锁死（已泄漏到 active==bombs 且场上没有他的炸弹）：他完全不能放弹，
    # 这是收人头的窗口，应该主动压上去。Sol 每局泄漏约 5 点容量，这种窗口很多。
    _enemy_onfield = sum(1 for b in w.bombs if b['owner'] != my)
    _opp_locked = (_opp_left <= 0 and _enemy_onfield == 0)
    if _opp_locked:
        aggr *= 1.8
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

    arrive, prev, _ = dijkstra(fire, tiles, bomb_cells, mycell, t0, me.speed, ARRIVE_T)

    # ---- 对手威胁：尽早算一次，供所有放弹/走位计划的「落脚点」筛选使用。
    oth = opp_threat(tiles, oppcell, opp.blast, 3)
    opp_bombs_left = opp.bombs - opp.active_bombs
    try:
        _reach_depth = min(10, 40 // max(3, 6 - opp.speed) + 1)
        opp_reach = opp_reach_set(w, opp, tiles, bomb_cells, _reach_depth)
    except Exception:
        opp_reach = set()
    _danger_cache = {}

    def is_dangerous(cell):
        """站在 cell 上，对手下一颗炸弹能不能收掉我（含「唯一出口被堵」）。
        这是第 2 轮 4 次死亡里 3 次直接命中的形状：站在 1 宽口袋顶端。"""
        v = _danger_cache.get(cell)
        if v is None:
            try:
                v = kill_threat(tiles, bomb_cells, cell, opp_reach, opp.blast,
                                me.speed, opp_bombs_left)[0]
            except Exception:
                v = False
            _danger_cache[cell] = v
        return v
    def plan_escape(fire2, tiles_use, bc2, start, t_start, hmax):
        """放弹后的退路：在爆炸前能到达、之后 SAFE_H 帧安全、且不是
        「对手一颗弹收掉」的格子。优先近、远离对手、出口多。

        旧版用「最早到达的安全格」当目标，结果经常沿着走廊朝对手方向退
        （第 2 轮 g2 第 1 局就是这样把自己的退路交给对手封死的）。"""
        # 必须在爆炸前（place+FUSE 帧）离开十字，晚于这个时间到达的格子没有意义。
        max_t = min(hmax, t_start + FUSE - 2)
        if _past_deadline():
            return None
        arrive2, prev2, _ = dijkstra(fire2, tiles_use, bc2, start, t_start, me.speed, max_t)

        def ok(c, t):
            return safe_range(fire2, c, t, min(hmax, t + SAFE_H)) and not is_dangerous(c)

        best = None
        for c, t in arrive2.items():
            if c == start or not ok(c, t):
                continue
            e = exits_count(c)
            sc = -t - 0.6 * max(0, 6 - manhattan(c, oppcell)) + 0.3 * min(e, 3)
            if best is None or sc > best[0]:
                best = (sc, c, t)
        if best is not None:
            return (best[2], _reconstruct(prev2, (best[2], best[1]), start, t_start))
        if _past_deadline():
            return None
        # 没有「又好又安全」的格：退而求其次，只要求安全，取最早的一个。
        fallback = None
        for c, t in arrive2.items():
            if c == start:
                continue
            if safe_range(fire2, c, t, min(hmax, t + SAFE_H)):
                if fallback is None or t < fallback[1]:
                    fallback = (c, t)
        if fallback is not None:
            c, t = fallback
            return (t, _reconstruct(prev2, (t, c), start, t_start))
        return None


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
        # 旧版只要求 26 帧安全：自己的炸弹还有 30 帧才爆时它会「安全」地站进火线，
        # 下一个窗口预警只剩 4 帧，来不及跑（第 2 轮 g2 第 2 局）。改成 SAFE_H。
        return safe_range(fire, cell, t, min(horizon, t + SAFE_H))

    cands = []

    # ---- 1) 捡道具
    # 注意：道具被后续爆炸烧掉是不可逆的损失，所以「能捡就捡」要放宽到 40 帧
    # （速度 0 时一格要 7 帧，26 帧只够走 3 格，会让眼前刚炸出来的道具捡不到）。
    # 落脚安全只要求 18 帧，整条计划是否安全由 run_script 用引擎语义再验一遍。
    # 已经满级的装备再捡纯属浪费窗口（第 2 轮 g1 W497 在 6/6/3 时还去捡 blast）。
    def _need_drop(tp):
        if not W_NEED:
            return True
        if tp == 'bomb':
            return me.bombs < BOMBS_MAX
        if tp == 'blast':
            return me.blast < BLAST_MAX
        if tp == 'speed':
            return me.speed < SPEED_MAX
        return True

    for d in w.drops:
        dc = (d['x'], d['y'])
        if dc not in arrive:
            continue
        t = arrive[dc]
        if t > 40 or not safe_range(fire, dc, t, min(horizon, t + 18)):
            continue
        if not _need_drop(d['type']):
            continue
        sc = DROP_VALUE.get(d['type'], 1.0) * 3.0 / (1.0 + 0.14 * t)
        cands.append((sc, path_to(dc), set(), 'drop:' + d['type']))

    # ---- 1.5) 必杀 / 压制：把所有「能覆盖对手」的可达格单独枚举一遍。
    if not allow_bomb:
        me_bombs_allowed = False
    else:
        me_bombs_allowed = True
    # 现有炸弹的爆炸十字并集。新弹只要落在这里面，就会被某颗更老的炸弹提前连锁：
    # 引擎在连锁引爆时不给被连锁的炸弹扣 activeBombs，于是放弹容量永久 -1。
    # 这条规则是整局最关键的资源：Sol 每局要泄漏约 5 点，只剩 1–2 颗并发；
    # 我们能保住 6 点，就等于多出一整套多弹协同能力。所以除了「这一手直接必杀」，
    # 一律禁止把炸弹放进现有爆炸十字。
    existing_blast = set()
    for b in w.bombs:
        existing_blast |= set(blast_cells(tiles, b['x'], b['y'], b['blast'])[0])
    # 旧版只对按 farm 价值排前 6 的格子做击杀判定，真正的杀招常常排不进去 ——
    # 而 1v1 里能杀死对手的机会本来就稀少，漏掉一次就少一次。
    if me_bombs_allowed and me.active_bombs < me.bombs and opp.alive:
        hit_cells = set(blast_cells(tiles, oppcell[0], oppcell[1], me.blast)[0])
        hit_cells.discard(oppcell)
        tried = []
        for C in hit_cells:
            if C in bomb_cells:
                continue
            t = arrive.get(C)
            if t is None or t > min(TRAVEL_T, BOMB_T):
                continue
            tried.append((t, C))
        tried.sort()
        for (t, C) in tried[:7]:
            if _past_deadline():
                break
            h2 = max(horizon, t + FUSE + 20)
            info = []
            fire2, tiles2 = fire_timeline(w, h2, extra=(C, t, me.blast, my), want_tiles=True,
                                          extra_info=info)
            bc2 = set(bomb_cells)
            bc2.add(C)
            res = plan_escape(fire2, tiles, bc2, C, t, h2)
            if res is None:
                continue  # 自己都跑不掉，不考虑
            kill = not opp_survives(fire2, tiles2, bc2, oppcell, opp.speed, h2)
            chained = bool(info and info[0] is not None and info[0] < t + FUSE)
            if _avoid_chain and chained and not kill:
                continue  # 连锁会永久吃掉一点放弹容量；只有必杀值得
            pth = path_to(C)
            esc = res[1]
            blunt = 0.0
            if not kill:
                if manhattan(C, oppcell) <= 1:
                    blunt += W_BLUNT * _blunt_scale
                if any(manhattan(pp, oppcell) <= 1 for pp in esc[1:]):
                    blunt += W_PATH * _blunt_scale
            cells_script = pth + esc[1:] if len(esc) > 1 else pth
            hsc = HIT_SC if aggr <= 1.2 else HIT_SC * 0.3   # 落后时更愿意压制
            if _opp_locked:
                hsc = max(hsc, 2.0)   # 对手不能还手，压制本身就是收益
            sc = (KILL_SC if kill else hsc) - W_ESC * max(0.0, res[0] - ESC_FREE) - 0.05 * t - blunt
            cands.append((sc, cells_script, {len(pth) - 1},
                          (('KILL@%d,%d') if kill else ('hit@%d,%d')) % (C[0], C[1])))

    # ---- 2) 放弹（farm / 开图 / 压制 / 击杀）
    if me_bombs_allowed and me.active_bombs < me.bombs:
        pre = []
        for C, t in arrive.items():
            if t > min(TRAVEL_T, BOMB_T):
                continue
            if C in bomb_cells:
                continue
            cells, broken = blast_cells(tiles, C[0], C[1], me.blast)
            bv = 0.0
            opened = 0.0
            for (bx, by) in broken:
                tp = predict_drop(w.seed, w.round, bx, by)
                dv = DROP_VALUE[tp] if tp else 0.15
                if W_NEED and tp:
                    # 已经满了的装备再刷就是纯浪费：把该掉落的价值清零
                    if tp == 'bomb' and me.bombs >= BOMBS_MAX:
                        dv = 0.0
                    elif tp == 'blast' and me.blast >= BLAST_MAX:
                        dv = 0.0
                    elif tp == 'speed' and me.speed >= SPEED_MAX:
                        dv = 0.0
                og = open_gain((bx, by))
                # 1.5 是「开图本身就有价值」的底分：不炸墙就只能原地发呆
                toward = max(0.0, dist_to_opp - manhattan((bx, by), oppcell))
                bv += dv + W_OPEN * _log1p(og) + W_BASE + W_TOWARD * toward
                opened += og
            hit = oppcell in cells
            opens = bool(broken)
            if trapped and opens:
                # 被困在口袋里：开图的价值远高于平时，且必须压过「原地不动」。
                # 只有真的炸掉软墙才算「开路」，炸空地不享受这个加分。
                bv += W_TRAPB + W_TRAPO * _log1p(opened)
            if NOLEAK >= 1 and C in existing_blast:
                # 只是排序时的近似惩罚；真正是否被连锁由 fire_timeline 精确判定。
                bv -= W_CHAIN
            pre.append((bv + (W_HIT if hit else 0.0) - W_TRAV * t, C, t, hit, opens))
        pre.sort(key=lambda z: -z[0])
        for (psc, C, t, hit, opens) in pre[:TOP_N]:
            if _past_deadline():
                break
            h2 = max(horizon, t + FUSE + 16)
            info = []
            fire2, tiles2 = fire_timeline(w, h2, extra=(C, t, me.blast, my), want_tiles=True,
                                          extra_info=info)
            bc2 = set(bomb_cells)
            bc2.add(C)
            res = plan_escape(fire2, tiles, bc2, C, t, h2)
            if res is None:
                continue  # 没有退路 —— 绝对不放
            et = res[0]
            kill = False
            if hit:
                kill = not opp_survives(fire2, tiles2, bc2, oppcell, opp.speed, h2)
            chained = bool(info and info[0] is not None and info[0] < t + FUSE)
            if _avoid_chain and chained and not kill:
                continue  # 连锁会永久吃掉一点放弹容量；只有必杀值得
            blunt = 0.0
            if not kill:
                if manhattan(C, oppcell) <= 1:
                    blunt += W_BLUNT * _blunt_scale
                escp = res[1]
                if any(manhattan(pp, oppcell) <= 1 for pp in escp[1:]):
                    blunt += W_PATH * _blunt_scale
            sc = psc - blunt
            if kill:
                sc += 80.0
            elif hit:
                sc += W_HIT
            sc -= W_ESC * max(0.0, et - ESC_FREE)
            pth = path_to(C)
            esc = res[1]
            # 落脚点是「单轴走廊格」且对手就在附近 → 他只要在我退路上补一颗弹，
            # 我就会像夹心一样被夹死（自测里绝大多数自炸就是这个形状）。
            if W_CORR > 0 and len(esc) > 1:
                eend = esc[-1]
                exh, exv = axis_exits(tiles, bc2, eend)
                if not (exh and exv) and manhattan(eend, oppcell) <= CORR_R + opp.blast:
                    sc -= W_CORR
            # 地板：只要「有退路」就永远比原地发呆强 —— 不炸墙就永远开不了图
            if sc < W_STAY - 0.1:
                sc = W_STAY - 0.1
            if len(esc) > 1:
                cells_script = pth + esc[1:]
            else:
                cells_script = pth
            cands.append((sc, cells_script, {len(pth) - 1},
                          'bomb@%d,%d%s%s' % (C[0], C[1], ' KILL' if kill else '',
                                              ' OPEN' if opens else '')))

    # ---- 3) 压制走位
    # 不能把「离对手最近」当成唯一目标：最近的那格常常是 1 宽死胡同。
    # 终点必须同时满足火线安全与「对手一颗弹收不掉」。
    best = None
    for C, t in arrive.items():
        if t > 22 or not term_ok(C, t):
            continue
        if is_dangerous(C):
            continue
        d = manhattan(C, oppcell)
        if d < 2:
            d += 6  # 贴脸有风险
        if HUNT_STATE.get('cell') == C:
            d -= HUNT_HYST          # 追同一个目标时给一点粘性，避免两格之间来回横跳
        if best is None or d < best[0]:
            best = (d, C, t)
    if best is not None:
        HUNT_STATE['cell'] = best[1]
        pth = path_to(best[1])
        sc = 0.30 + max(0.0, (6 - best[0]) * 0.10)
        if best[0] <= 3:
            sc += 0.25
        if len(pth) <= 1:
            sc = 0.02  # 原地不动没有任何价值，只在实在没得选时才用
        # 时间不多就必须主动找对手：平局不计分，拖满 150 秒等于白打
        eqd = (me.bombs + me.blast + me.speed) - (opp.bombs + opp.blast + opp.speed)
        hmul = LEAD_CAREFUL if eqd >= 3 else (BEHIND_AGGR if eqd <= -BEHIND_T else 1.0)
        if w.time_left < HUNT1_T:
            sc = sc * HUNT1 + HUNT_ADD1 * hmul
        if w.time_left < HUNT2_T:
            sc = sc * HUNT2 + HUNT_ADD2 * hmul
        # 比分感知：领先时少贴脸（平局也保住领先），落后/决胜局必须主动。
        sc *= aggr
        cands.append((sc, pth, set(), 'approach'))

    # ---- 3.5) 主动逃离「一颗弹死」的格子
    # 第 2 轮多次死亡：人已经站在 1 宽死胡同里，对手下一手封住唯一出口。
    # 只要脚下这格是 danger，就必须先离开，即使眼下没有火。
    if is_dangerous(mycell):
        flee_target = None
        for C, t in arrive.items():
            if t <= 0 or t > 46:
                continue
            if C == mycell:
                continue
            if not safe_range(fire, C, t, min(horizon, t + SAFE_H)):
                continue
            if is_dangerous(C):
                continue
            if flee_target is None or t < flee_target[0]:
                flee_target = (t, C)
        if flee_target is not None:
            cands.append((180.0, path_to(flee_target[1]), set(), 'flee'))

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
    opp_near = manhattan(mycell, oppcell) <= opp.blast + 6
    tl = w.time_left
    urg = 1.0 if tl > 60.0 else (0.5 if tl > 30.0 else 0.15)
    scored = []
    stay_sc = None
    passive_sc = None      # 「原地」与「纯走位」里较高的那个：干活计划必须压过它
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
        if W_ADJ > 0 and manhattan(endc, oppcell) <= ADJ_R:
            exh, exv = axis_exits(tiles, bomb_cells, endc)
            if not (exh and exv):
                sc -= W_ADJ
        # 「死胡同」判据：对手能在我这条行/列上放弹、而我在引信烧完前跑不出十字火焰
        # → 这一格他一颗炸弹就能收掉我，不管这一手多能干活都不许停在这里。
        try:
            th = is_dangerous(endc)
            if th:
                sc -= W_DEAD
                danger = True
        except Exception:
            pass
        if note == 'stay':
            stay_sc = sc
        if note in ('stay', 'approach'):
            passive_sc = sc if passive_sc is None else max(passive_sc, sc)
        scored.append((sc, cells, bidx, note, endc, danger))
    # 「原地不动」必须是真正的最后手段：只要存在一条【通过了硬安全校验（一定有退路）】
    # 且终点不在对手火力覆盖圈里的建设性计划（炸墙开图 / 击杀 / 捡道具），
    # 就不允许它输给「站着不动」。注意必须在上面所有扣分之后做，
    # 否则出口数惩罚会把放弹重新压到原地不动以下 —— 这正是第 1 轮我站着不动 50 秒的原因。
    if passive_sc is not None:
        out = []
        for (sc, cells, bidx, note, endc, danger) in scored:
            productive = ((note.startswith('bomb') and (' OPEN' in note or ' KILL' in note))
                          or note.startswith('drop:'))
            if productive and not danger:
                sc = max(sc, passive_sc + 0.3)
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
                inp, alive, sim, _p20, _b20 = run_script(w, my, res[1], set(), prev_btn, 20)
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
        for i, f in enumerate(sim.fighters):
            if i != mi:
                f.invuln_until = 10 ** 9
        me = sim.fighters[mi]
        t = 0
        for k in range(80):
            if not me.alive:
                break
            row = []
            for i in range(len(sim.fighters)):
                row.append((d, None) if i == mi else ('N', None))
            step(sim, row)
            t += 1
        if me.alive:
            return [(d, None)] * 20
        if t > best_t:
            best_t = t
            best = [(d, None)] * 20
    return best or [('N', None)] * 20


HUNT_STATE = {'cell': None}
HUNT_HYST = float(_os.environ.get('AG_HYST', '0.0'))
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
    _DEADLINE[0] = time.perf_counter() + 2.8
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
    near_end = False
    try:
        near_end = round_may_end(w)
    except Exception:
        near_end = False
    cands = []
    # 比分感知：五局三胜、平局不计分。领先时「平局」也保住领先，落后/决胜局必须主动。
    aggr = 1.0
    try:
        pw = {}
        for i, p in enumerate(obs.get('players') or []):
            pw[int(p.get('id', i))] = int(p.get('wins', 0))
        mw = pw.get(my, 0)
        ow = max([v for k, v in pw.items() if k != my] or [0])
        lead = mw - ow
        # 只有在「落后 / 时间不多且不领先 / 决胜局打平」时加码进攻；
        # 领先时不主动降低进攻（v8 的 0.35 版本会把可赢的局拖成平局）。
        if lead < 0:
            aggr = 1.25
        if w.time_left < 40 and lead <= 0:
            aggr = max(aggr, 1.5)
        if int(obs.get('round', 1)) >= 5 and lead == 0:
            aggr = max(aggr, 1.7)   # 决胜局平局＝输掉整场
    except Exception:
        aggr = 1.0
    try:
        cands = choose_action(w, my, allow_bomb=not near_end, aggr=aggr)
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
    # 窗口边界上的落点必须不是「对手一颗弹就能收掉」的死胡同：
    # 一个计划可能跨多个窗口，decide 只执行前 20 帧，所以真正要检查的是
    # 第 20 帧时我站在哪，而不是计划最终逃到哪（第 2 轮 g2 第 3 局就是这样死的）。
    tctx = None
    try:
        tctx = make_threat_ctx(w, my)
    except Exception:
        tctx = None
    fallback = None
    for (sc, cells, bidx, nte) in cands:
        if _past_deadline() and fallback is not None:
            break
        try:
            inputs, alive, sim, pos20, my_bombs20 = run_script(w, my, cells, bidx, PREV_BTN, 80)
        except Exception:
            continue
        if not alive:
            continue
        if len(inputs) < 20:
            inputs = inputs + [('N', None)] * (20 - len(inputs))
        cand_frames = inputs[:20]
        d20 = False
        try:
            d20 = ctx_danger(tctx, pos20, my_bombs20) if pos20 is not None else False
        except Exception:
            d20 = False
        if fallback is None:
            fallback = (cand_frames, '%s %.1f' % (nte, sc), pos20)
        if d20:
            continue  # 先记下，继续找更安全的；实在没有才用它
        frames = cand_frames
        note = '%s %.1f' % (nte, sc)
        if DEBUG:
            sys.stderr.write('   pick %s alive=%s pos20=%s path=%s\n' % (nte, alive, pos20, cells[:8]))
        break
    if frames is None and fallback is not None:
        frames, note, _p = fallback
        note = 'fallback ' + note
    if frames is None:
        frames = emergency(w, my, PREV_BTN)
        note = 'emergency'
    # 保证窗口最后一帧不是 BOMB，让下一窗口的上升沿保持新鲜
    if frames and frames[-1][1] == 'BOMB':
        frames = frames[:-1] + [('N', None)]
    # 本窗口内可能局末：新一局会把地图和位置全部重置，计划里的放弹＝在出生点埋雷。
    # 旧版是「把炸弹按钮抹掉 + 最后 8 帧改成原地」，但那样会跳过 run_script 的安全校验，
    # 实测 6 次自炸里有 4 次就是被这一步坑死的（走位被截断，人停在自家炸弹的十字里）。
    # 现在改成：整条计划在「本窗口禁止放弹」的前提下重新生成并重新校验，走位保持原样。
    # 走位在新一局里最多是撞墙（引擎忽略），不会致死。
    if near_end:
        note = (note + ' |noend').strip()
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
            # 空行也回一个合法窗口：绝不让裁判等不到输出。
            out.write(json.dumps(neutral()) + '\n')
            out.flush()
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
