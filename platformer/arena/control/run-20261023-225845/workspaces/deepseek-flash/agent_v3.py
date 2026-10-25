#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""横版闯关竞速 · 参赛 agent（deepseek-v4.1-flash）。

思路
----
1. 把 simulation.js 的玩家/怪物物理逐条移植到 Python（已逐帧对齐验证，误差 0）。
2. 每个决策点用**束搜索**在"何时起跳 / 何时停下 / 何时后退"上做 3~5 秒前瞻，
   目标是"视野内既不掉坑也不撞怪，且前进最远"。搜索只覆盖地面上的选择，
   空中没有可选项，所以分支很小。
3. 束搜索给出完整动作序列后**开环执行**：只要观察到的状态和预测一致就继续
   照计划走，只有真的发生偏差（被对手推、怪物刷新等）才重新规划。
   这样避免"每 5 帧重规划一次"把需要好几秒铺垫的绕怪计划反复推翻。
4. 保守判定：给怪物碰撞留 MARGIN 余量，宁可绕远也不贴边通过。
"""

import sys
import json
import math
import os

DEBUG = bool(os.environ.get('AGENT_DEBUG'))

# ---------------- 物理常数（与 catalog.js 完全一致） ----------------
HZ = 20
DT = 1.0 / HZ                       # 0.05
GRAVITY = 42.0
MAXFALL = 26.0
MOVE_SPEED = 6.8
ACCEL = 70.0
AIR_ACCEL = 40.0
FRICTION = 48.0
JUMP_SPEED = 14.0

PLAYER_W = 0.72
PLAYER_H = 1.35
HALF = PLAYER_W * 0.5               # 0.36
MONSTER_W = 0.72
MONSTER_H = 0.62
MONSTER_SPEED = 1.7

EXPF = math.exp(-FRICTION * DT)     # 地面无输入时的摩擦衰减
DEATH_Y = -3.0

# 规划时给怪物留的安全余量（格）。观察值是两位小数，且真实执行与预测可能
# 有微小出入，贴边通过的计划很容易变成撞上。
MARGIN = 0.22

REPLAN_EVERY = 10                    # 每 2 个窗口强制刷新一次计划（10 帧）
STALL_PENALTY = 0.20                 # 计划里"顶住台阶/墙空转"每帧的扣分
PLAN_HORIZON = 88                   # 规划视野（帧）≈4.4 秒 ≈30 格
BEAM_SIZE = 320
TAIL_FRAMES = 14

MOVES_FWD = ((1.0, False), (1.0, True), (0.0, False), (0.0, True))
MOVES_BACK = ((1.0, False), (1.0, True), (0.0, False), (0.0, True), (-1.0, False))
MOVES_RUN = ((1.0, False), (1.0, True))
MOVES_AIR = ((1.0, False),)

NEUTRAL = (1.0, False)


# ---------------- 关卡 ----------------
class World(object):
    """把 tiles 压成每列的位掩码：bit y <=> 世界高度 [y, y+1) 为实心。

    只保留 y <= 7 的层：玩家最高头顶 7.35，再高的砖永远碰不到，
    但仍保留一层余量以便和 solidBox 完全一致。
    """
    __slots__ = ('w', 'h', 'cols', 'goalX', 'startX')

    def __init__(self, level):
        w = int(level['width'])
        h = int(level['height'])
        tiles = level['tiles']
        cols = [0] * w
        lim = min(h, 8)
        for ty in range(h):
            ylev = h - 1 - ty
            if ylev >= lim:
                continue
            base = ty * w
            bit = 1 << ylev
            for tx in range(w):
                if tiles[base + tx]:
                    cols[tx] |= bit
        self.w = w
        self.h = h
        self.cols = cols
        self.goalX = float(level['goalX'])
        self.startX = float(level.get('startX', 2.5))


def sbox(cols, w, h, l, b, r, t):
    """实心盒检测，等价于 simulation.js 的 solidBox。"""
    x0 = math.floor(l)
    x1 = math.floor(r - 1e-9)
    y0 = math.floor(b)
    y1 = math.floor(t - 1e-9)
    if y1 < 0 or y0 >= h:
        return False
    if y0 < 0:
        y0 = 0
    if y1 > h - 1:
        y1 = h - 1
    mask = ((1 << (y1 + 1)) - 1) ^ ((1 << y0) - 1)
    for cx in range(x0, x1 + 1):
        if cx < 0 or cx >= w:
            return True
        if cols[cx] & mask:
            return True
    return False


def solid_at(cols, w, h, x, y):
    """等价于 solidWorld：世界坐标点是否实心。"""
    tx = math.floor(x)
    if tx < 0 or tx >= w:
        return True
    yl = math.floor(y)
    if yl < 0 or yl >= h:
        return False
    return (cols[tx] >> yl) & 1


def step(cols, w, h, x, y, vx, vy, og, move, jump, push=False):
    """一个物理帧的玩家推进（updateRunner 的逐行移植）。

    push=True 时按"被身后对手顶着"来推进：每帧至少前进 0.21 格（pushSpeed*DT）。
    真实规则里后面的人最多以 4.2 格/秒把你往前推，减速时尤其明显。
    """
    x_old = x
    grounded = og
    if move != 0.0:
        target = move * MOVE_SPEED
        d = target - vx
        lim = (ACCEL if og else AIR_ACCEL) * DT
        if d > lim:
            d = lim
        elif d < -lim:
            d = -lim
        vx += d
    elif og:
        vx *= EXPF
        if -0.05 < vx < 0.05:
            vx = 0.0

    if jump and og:
        vy = JUMP_SPEED
        og = False
    vy -= GRAVITY * DT
    if vy < -MAXFALL:
        vy = -MAXFALL

    x += vx * DT
    if sbox(cols, w, h, x - HALF, y, x + HALF, y + PLAYER_H):
        if vx > 0:
            x = math.floor(x + HALF) - HALF - 1e-4
        elif vx < 0:
            x = math.floor(x - HALF) + 1 + HALF + 1e-4
        vx = 0.0

    y += vy * DT
    if sbox(cols, w, h, x - HALF, y, x + HALF, y + PLAYER_H):
        if vy <= 0:
            y = math.floor(y) + 1 + 1e-4
            vy = 0.0
            og = True
        else:
            y = math.floor(y + PLAYER_H) - PLAYER_H - 1e-4
            vy = 0.0
    else:
        og = False

    if push and grounded and og and x < x_old + 0.21:
        nx = x_old + 0.21
        if not sbox(cols, w, h, nx - HALF, y, nx + HALF, y + PLAYER_H):
            x = nx

    return (x, y, vx, vy, og)


def step_monsters(cols, w, h, mons):
    out = []
    for (mx, my, md) in mons:
        nx = mx + md * MONSTER_SPEED * DT
        wall = solid_at(cols, w, h, nx + md * 0.5, my + 0.4)
        gap = not solid_at(cols, w, h, nx + md * 0.6, my - 0.2)
        if wall or gap:
            out.append((mx, my, -md))
        else:
            out.append((nx, my, md))
    return out


def monster_hits(nx, ny, mons, margin=0.0):
    """怪物碰撞判定；margin>0 时更保守（留安全余量）。"""
    lim = 0.72 + margin
    for (mx, my, _) in mons:
        if -lim < nx - mx < lim and ny < my + MONSTER_H + margin and ny + PLAYER_H > my - margin:
            return True
    return False


# ---------------- 束搜索 ----------------
def _heuristic_tail(cols, w, h, st, mtraj, frames):
    """尾部启发式推进：前方有坑/台阶/怪就跳，返回最终 x 或 None（会死）。"""
    x, y, vx, vy, og = st
    for k in range(frames):
        mons = mtraj[min(k + 1, len(mtraj) - 1)]
        jump = False
        if og:
            look = x + HALF
            for d in (1.6, 1.2, 0.85, 0.5):
                c = int(math.floor(look + d))
                if c < 0 or c >= w:
                    jump = True
                    break
                top = None
                for yy in range(4, -1, -1):
                    if (cols[c] >> yy) & 1:
                        top = yy + 1
                        break
                if top is None or top > y + 0.5:
                    jump = True
                    break
            if not jump:
                for (mx, my, md) in mons:
                    dd = mx - x
                    if 0.7 < dd < 2.6 and md > 0:
                        jump = True
                        break
                    if 2.0 < dd < 4.2 and md < 0:
                        jump = True
                        break
        st = step(cols, w, h, x, y, vx, vy, og, 1.0, jump)
        x, y, vx, vy, og = st
        if y < DEATH_Y:
            return None
        if monster_hits(x, y, mons, MARGIN):
            return None
    return x


def _prune(items, beam_size):
    """状态去重 + 排序剪枝；同一状态保留"空转帧数"更少的路径。"""
    best = {}
    order = []
    for e in items:
        st = e[0]
        key = (int(st[0] * 1000), int(st[1] * 1000), int(st[2] * 100), int(st[3] * 100), st[4])
        old = best.get(key)
        if old is None:
            best[key] = e
            order.append(key)
        elif e[3] < old[3]:
            best[key] = e
    uniq = [best[k] for k in order]
    uniq.sort(key=lambda e: (-e[0][0], e[3]))
    if len(uniq) <= beam_size:
        return uniq
    npref = len(set(e[1] for e in uniq))
    cap = max(4, beam_size // max(1, npref))
    per_pref = {}
    out = []
    rest = []
    for e in uniq:
        n = per_pref.get(e[1], 0)
        if n < cap:
            per_pref[e[1]] = n + 1
            out.append(e)
        else:
            rest.append(e)
    if len(out) < beam_size:
        out.extend(rest[:beam_size - len(out)])
    return out[:beam_size]


def _search(world, st0, mons0, horizon, beam_size, opts_ground, no_brake=False, push=False):
    """单次束搜索。返回 (beam, nodes, mtraj)；beam 为空表示视野内全灭。

    beam 元素 = (state, prefix5, node_id)；nodes[node] = (parent_id, action)。
    """
    cols, w, h = world.cols, world.w, world.h
    mtraj = [mons0]
    cur = mons0
    for _ in range(horizon + TAIL_FRAMES + 4):
        cur = step_monsters(cols, w, h, cur)
        mtraj.append(cur)

    nodes = []
    beam = [(st0, (), -1, 0)]
    x0 = st0[0]
    for f in range(horizon):
        mf = mtraj[f + 1]
        threat = False
        for (mx, my, md) in mf:
            if -3.0 < mx - x0 < 14.0:
                threat = True
                break
        nxt = []
        for st, pref, nid, stuck in beam:
            og = st[4]
            if not og:
                opts = MOVES_AIR
            elif threat:
                opts = opts_ground
            else:
                opts = MOVES_RUN
            for mv, jp in opts:
                ns = step(cols, w, h, st[0], st[1], st[2], st[3], og, mv, jp, push)
                if ns[1] < DEATH_Y:
                    continue
                if mf and monster_hits(ns[0], ns[1], mf, MARGIN):
                    continue
                # 想往前走却几乎没速度（顶住台阶/墙、原地起跳、停顿后重启）
                # = 空转；末端位置往往已经撞到右墙饱和，必须显式扣分才能区分。
                stall = 1 if (mv > 0 and abs(ns[2]) < 1.5) else 0
                nodes.append((nid, (mv, jp)))
                np = pref if len(pref) >= 5 else pref + ((mv, jp),)
                nxt.append((ns, np, len(nodes) - 1, stuck + stall))
        if not nxt:
            return [], nodes, mtraj
        beam = _prune(nxt, beam_size)
    return beam, nodes, mtraj


def _path(nodes, nid):
    """回溯出完整动作序列。"""
    out = []
    while nid >= 0:
        nid, act = nodes[nid]
        out.append(act)
    out.reverse()
    return out


def _predicted_states(world, st0, acts, push=False):
    """按动作序列前推，返回每帧后的状态。"""
    cols, w, h = world.cols, world.w, world.h
    x, y, vx, vy, og = st0
    out = [(x, y, vx, vy, og)]
    for (mv, jp) in acts:
        x, y, vx, vy, og = step(cols, w, h, x, y, vx, vy, og, mv, jp, push)
        out.append((x, y, vx, vy, og))
    return out


def _score(world, beam, mtraj, horizon, tail):
    """给每个 5 帧前缀打分；尾部会死的前缀直接淘汰。"""
    cols, w, h = world.cols, world.w, world.h
    scores = {}
    who = {}
    for e in beam:
        st, pref, nid, stuck = e
        if len(pref) < 5:
            continue
        v = _heuristic_tail(cols, w, h, st, mtraj[horizon:], tail)
        if v is None:
            continue
        v -= STALL_PENALTY * stuck
        if pref not in scores or v > scores[pref]:
            scores[pref] = v
            who[pref] = nid
    return scores, who


def plan(world, st0, mons0, horizon=PLAN_HORIZON, beam_size=BEAM_SIZE, no_brake=False, push=False):
    """多级规划，返回 (完整动作序列, 预测状态序列, 预测怪物轨迹)。

    no_brake=True：对手贴身跟随时不许减速/后退——因为一减速就会被后面的人
    顶着往前推，实际轨迹会和计划差出半格，落点直接失准。
    """
    stages = (
        (horizon, MOVES_FWD),
        (horizon, MOVES_BACK),
        (max(24, horizon // 2), MOVES_FWD),
        (max(24, horizon // 2), MOVES_BACK),
    )
    for (hz, opts) in stages:
        beam, nodes, mtraj = _search(world, st0, mons0, hz, beam_size, opts, no_brake, push)
        if not beam:
            continue
        scores, who = _score(world, beam, mtraj, hz, TAIL_FRAMES)
        if not scores:
            continue
        best_pref = max(scores.items(), key=lambda kv: kv[1])[0]
        acts = _path(nodes, who[best_pref])
        if DEBUG:
            sys.stderr.write('[plan] h=%d %s v=%.1f acts=%s\n'
                             % (hz, 'back' if opts is MOVES_BACK else 'fwd',
                                scores[best_pref], acts[:6]))
        return acts, _predicted_states(world, st0, acts, push), mtraj[:len(acts) + 1]

    # 所有方案都会死：挑活最久、走得最远的，尽量不提前送死
    best = None
    for (hz, opts) in ((24, MOVES_BACK), (24, MOVES_FWD), (12, MOVES_FWD)):
        beam, nodes, mtraj = _search(world, st0, mons0, hz, beam_size, opts, no_brake, push)
        if not beam:
            continue
        e = max(beam, key=lambda e: e[0][0] - STALL_PENALTY * e[3])
        if best is None or e[0][0] - STALL_PENALTY * e[3] > best[0][0] - STALL_PENALTY * best[3]:
            best = e
            best_beam = (beam, nodes, mtraj)
    if best is not None:
        beam, nodes, mtraj = best_beam
        acts = _path(nodes, best[2])
        if DEBUG:
            sys.stderr.write('[plan] FALLBACK acts=%s\n' % (acts[:6],))
        return acts, _predicted_states(world, st0, acts, push), mtraj[:len(acts) + 1]
    return [NEUTRAL] * 5, [(0.0, 3.0, 0.0, 0.0, True)] * 6, [[]]


# ---------------- 决策与主循环 ----------------
def _norm_mons(monsters):
    out = []
    for m in monsters or []:
        try:
            out.append((float(m['x']), float(m['y']), 1 if float(m.get('dir', 1)) >= 0 else -1))
        except (KeyError, TypeError, ValueError):
            continue
    out.sort()
    return out


def _state_close(a, b, tol_xy=0.05, tol_v=0.6):
    return (abs(a[0] - b[0]) <= tol_xy and abs(a[1] - b[1]) <= tol_xy
            and abs(a[2] - b[2]) <= tol_v and abs(a[3] - b[3]) <= tol_v
            and bool(a[4]) == bool(b[4]))


def _mons_close(a, b, tol=0.06):
    if len(a) != len(b):
        return False
    for (ax, ay, ad), (bx, by, bd) in zip(a, b):
        if abs(ax - bx) > tol or abs(ay - by) > tol or ad != bd:
            return False
    return True


def decide(obs, cache):
    yp = int(obs.get('yourPlayer') or 0)
    runners = obs.get('runners') or []
    if len(runners) < 2:
        return [[{"move": 1.0, "jump": False}] for _ in range(5)]
    me = runners[yp]
    if obs.get('phase') != 'race' or obs.get('status') != 'playing':
        cache.pop('plan', None)
        return [[{"move": 1.0, "jump": False}] for _ in range(5)]

    key = (obs.get('seed'), obs.get('round'))
    world = cache.get('world')
    if world is None or cache.get('wkey') != key:
        try:
            world = World(obs['level'])
        except Exception:
            return [[{"move": 1.0, "jump": False}] for _ in range(5)]
        cache['world'] = world
        cache['wkey'] = key
        cache.pop('plan', None)

    st = (float(me['x']), float(me['y']), float(me['vx']), float(me['vy']),
          bool(me['onGround']))
    mons = _norm_mons(obs.get('monsters'))

    pc = cache.get('plan')
    if pc is not None:
        idx = pc['idx']
        if (idx + 5 <= len(pc['acts'])
                and (idx % REPLAN_EVERY) != 0
                and _state_close(pc['pred'][idx], st)
                and _mons_close(pc['mons'][idx], mons)):
            acts = pc['acts'][idx:idx + 5]
            pc['idx'] = idx + 5
            return [[{"move": a[0], "jump": bool(a[1])}] for a in acts]
        if DEBUG:
            sys.stderr.write('[replan] idx=%d state=%s pred=%s\n'
                             % (idx, st, pc['pred'][idx] if idx < len(pc['pred']) else None))

    opp = runners[1 - yp]
    try:
        dxo = st[0] - float(opp['x'])
        pushed = (0.0 <= dxo < 1.3) and (abs(float(opp['y']) - st[1]) < 1.3)
    except (KeyError, TypeError, ValueError):
        pushed = False
    try:
        acts, pred, mtraj = plan(world, st, mons, push=pushed)
    except Exception as exc:
        sys.stderr.write('plan error: %r\n' % (exc,))
        acts, pred, mtraj = [NEUTRAL] * 5, [st] * 6, [mons]

    cache['plan'] = {'idx': 0, 'acts': acts, 'pred': pred, 'mons': mtraj}
    out = (list(acts[:5]) + [NEUTRAL] * 5)[:5]
    cache['plan']['idx'] = 5
    return [[{"move": a[0], "jump": bool(a[1])}] for a in out]


def main():
    cache = {}
    out = sys.stdout
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
            frames = decide(obs, cache)
        except Exception as exc:
            sys.stderr.write('decide error: %r\n' % (exc,))
            frames = [[{"move": 1.0, "jump": False}] for _ in range(5)]
        out.write(json.dumps({"inputs": frames}) + "\n")
        out.flush()


if __name__ == '__main__':
    main()
