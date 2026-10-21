#!/usr/bin/env python3
"""泡泡堂 1v1 程序：帧精确引擎移植 + 窗口内候选计划枚举 + 时间感知逃生检查。"""
import sys, json, time, copy
from collections import deque

W, H = 19, 17
EMPTY, HARD, SOFT = 0, 1, 2
FUSE, BLASTF = 40, 12
DIRS = {'U': (0, -1), 'D': (0, 1), 'L': (-1, 0), 'R': (1, 0)}


def mf(speed):
    return max(3, 6 - speed)


def move_len(speed):
    # 引擎用浮点累加 1/k，实际耗帧数可能比 k 多 1
    k = mf(speed)
    p, n = 1 / k, 1
    while p < 1:
        p = min(1, p + 1 / k)
        n += 1
    return n + 0


def ring_at_frame(fr):
    el = fr / 20.0 - 40
    return 0 if el <= 0 else min(10, 1 + int(el // 2.5))


def flood_d(x, y):
    return min(x, y, W - 1 - x, H - 1 - y)


def flood_frame(x, y):
    # 第一个使该格被淹的回合帧
    d = flood_d(x, y)
    return int((40 + 2.5 * d) * 20) + 1


def drop_roll(seed, rnd, x, y):
    s = (seed * 31 + rnd * 977 + x * 131 + y * 17) & 0xFFFFFFFF or 1
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
    if s / 4294967296 >= 0.38:
        return None
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
    p = s / 4294967296
    acc = 0
    for t, w in (('bomb', .40), ('blast', .35), ('speed', .25)):
        acc += w
        if p <= acc:
            return t
    return 'bomb'


class G:
    pass


def from_obs(o):
    g = G()
    g.seed, g.round = o['seed'], o['round']
    g.tiles = list(o['map']['tiles'])
    g.fr = o['frame']
    g.bombs = [dict(b, ex=False) for b in o['bombs']]
    g.blasts = [dict(c) for c in o['blasts']]
    g.drops = [dict(d) for d in o['drops']]
    g.f = []
    for f in o['fighters']:
        d = dict(owner=f['owner'], alive=f['alive'], x=f['x'], y=f['y'], speed=f['speed'],
                 blast=f['blast'], bombs=f['bombs'], act=f['activeBombs'], lastbtn=None)
        rem = abs(f['x'] - f['px']) + abs(f['y'] - f['py'])
        if rem > 1e-6:
            dx = 0 if f['px'] == f['x'] else (1 if f['x'] > f['px'] else -1)
            dy = 0 if f['py'] == f['y'] else (1 if f['y'] > f['py'] else -1)
            d['fx'], d['fy'] = f['x'] - dx, f['y'] - dy
            k = mf(f['speed'])
            n = max(1, int(round((1 - rem) * k)))
            mp = 1 / k
            for _ in range(n - 1):
                mp = min(1, mp + 1 / k)
            if mp >= 1:  # 浮点尾差：已累加满 k 次但仍 <1 的情况
                mp = 1 - 1e-12
            d['mp'] = mp
        else:
            d['fx'], d['fy'], d['mp'] = f['x'], f['y'], 1.0
        g.f.append(d)
    g.flood = ring_at_frame(g.fr)
    return g


def clone(g):
    n = G()
    n.seed, n.round, n.fr, n.flood = g.seed, g.round, g.fr, g.flood
    n.tiles = g.tiles[:]
    n.bombs = [dict(b) for b in g.bombs]
    n.blasts = [dict(c) for c in g.blasts]
    n.drops = [dict(d) for d in g.drops]
    n.f = [dict(f) for f in g.f]
    return n


def tile(g, x, y):
    if x < 0 or y < 0 or x >= W or y >= H:
        return HARD
    return g.tiles[y * W + x]


def bomb_at(g, x, y):
    for b in g.bombs:
        if b['x'] == x and b['y'] == y:
            return b
    return None


def walkable(g, x, y, ign=None):
    if x < 0 or y < 0 or x >= W or y >= H:
        return False
    if g.tiles[y * W + x] != EMPTY or flood_d(x, y) < g.flood:
        return False
    b = bomb_at(g, x, y)
    return not (b and b['id'] != ign)


def explode(g, b, stats):
    if b.get('ex'):
        return
    b['ex'] = True
    cells = [(b['x'], b['y'])]
    for dx, dy in DIRS.values():
        for s in range(1, b['blast'] + 1):
            x, y = b['x'] + dx * s, b['y'] + dy * s
            if x < 0 or y < 0 or x >= W or y >= H:
                break
            t = g.tiles[y * W + x]
            if t == HARD:
                break
            cells.append((x, y))
            if t == SOFT:
                g.tiles[y * W + x] = EMPTY
                if stats is not None and b['owner'] == stats['me']:
                    stats['soft'] += 1
                dt = drop_roll(g.seed, g.round, x, y)
                if dt:
                    g.drops.append({'id': 'n', 'x': x, 'y': y, 'type': dt})
                break
            o = bomb_at(g, x, y)
            if o and not o.get('ex'):
                explode(g, o, stats)
    for c in cells:
        g.blasts.append({'x': c[0], 'y': c[1], 'frames': BLASTF, 'owner': b['owner']})
    cs = set(cells)
    g.drops = [d for d in g.drops if (d['x'], d['y']) not in cs]


def step(g, inputs, stats=None):
    """inputs: list per owner of (dir, btn). 返回 False 表示对局结束。"""
    g.fr += 1
    g.flood = ring_at_frame(g.fr)
    for b in g.bombs:
        if b.get('ex'):
            continue
        b['fuse'] -= 1
        if b['fuse'] <= 0:
            explode(g, b, stats)
            ow = g.f[b['owner']]
            ow['act'] = max(0, ow['act'] - 1)
    g.bombs = [b for b in g.bombs if not b.get('ex')]
    for c in g.blasts:
        c['frames'] -= 1
    g.blasts = [c for c in g.blasts if c['frames'] > 0]
    for i, f in enumerate(g.f):
        if not f['alive']:
            continue
        d, btn = inputs[i]
        edge = btn == 'BOMB' and f['lastbtn'] != 'BOMB'
        f['lastbtn'] = btn
        if f['mp'] < 1:
            f['mp'] = min(1, f['mp'] + 1 / mf(f['speed']))
            if f['mp'] >= 1:
                f['fx'], f['fy'] = f['x'], f['y']
            continue
        for dr in g.drops:
            if dr['x'] == f['x'] and dr['y'] == f['y']:
                g.drops.remove(dr)
                t = dr['type']
                if t == 'bomb':
                    f['bombs'] = min(6, f['bombs'] + 1)
                elif t == 'blast':
                    f['blast'] = min(6, f['blast'] + 1)
                else:
                    f['speed'] = min(3, f['speed'] + 1)
                if stats is not None and i == stats['me']:
                    stats['pick'] += 1
                break
        if edge and f['act'] < f['bombs'] and not bomb_at(g, f['x'], f['y']):
            g.bombs.append({'id': 'm%d_%d' % (i, g.fr), 'owner': i, 'x': f['x'], 'y': f['y'],
                            'fuse': FUSE, 'blast': f['blast'], 'ex': False})
            f['act'] += 1
        if d == 'N':
            continue
        dx, dy = DIRS[d]
        nx, ny = f['x'] + dx, f['y'] + dy
        own = None
        for b in g.bombs:
            if b['owner'] == i and b['x'] == f['x'] and b['y'] == f['y']:
                own = b['id']
        if walkable(g, nx, ny, own):
            f['fx'], f['fy'] = f['x'], f['y']
            f['mp'] = 1 / mf(f['speed'])
            f['x'], f['y'] = nx, ny
    blast_cells = {(c['x'], c['y']) for c in g.blasts}
    for f in g.f:
        if f['alive'] and ((f['x'], f['y']) in blast_cells or flood_d(f['x'], f['y']) < g.flood):
            f['alive'] = False
    return all(f['alive'] for f in g.f)


# ---------------- 危险时间线与逃生检查 ----------------

def danger_timeline(g, extra=()):
    """返回 {cell: [(start,end),...]}（相对帧，1 起），以及炸弹爆炸时刻。考虑连锁。"""
    bombs = [dict(b) for b in g.bombs] + [dict(b) for b in extra]
    n = len(bombs)
    cells = []
    for b in bombs:
        cs = [(b['x'], b['y'])]
        for dx, dy in DIRS.values():
            for s in range(1, b['blast'] + 1):
                x, y = b['x'] + dx * s, b['y'] + dy * s
                t = tile(g, x, y)
                if t == HARD:
                    break
                cs.append((x, y))
                if t == SOFT:
                    break
        cells.append(cs)
    T = [b['fuse'] for b in bombs]
    changed = True
    while changed:
        changed = False
        for i in range(n):
            for j in range(n):
                if i != j and T[i] < T[j] and (bombs[j]['x'], bombs[j]['y']) in cells[i]:
                    T[j] = T[i]
                    changed = True
    dz = {}
    for i in range(n):
        for c in cells[i]:
            dz.setdefault(c, []).append((T[i], T[i] + BLASTF - 1))
    for c in g.blasts:
        if c['frames'] > 1:
            dz.setdefault((c['x'], c['y']), []).append((1, c['frames'] - 1))
    bpos = {(bombs[i]['x'], bombs[i]['y']): T[i] for i in range(n)}
    return dz, bpos


def bad(dz, c, a, b, fr0):
    # 区间 [a,b] 相对帧内是否危险
    for s, e in dz.get(c, ()):
        if s <= b and a <= e:
            return True
    if fr0 + b >= flood_frame(*c) - 2:
        return True
    return False


def can_escape(g, who, extra=(), horizon=70):
    f = g.f[who]
    if not f['alive']:
        return False
    dz, bpos = danger_timeline(g, extra)
    k = move_len(f['speed'])
    fr0 = g.fr
    t0 = 0
    if f['mp'] < 1:
        t0 = int(round((1 - f['mp']) * k))
        if bad(dz, (f['x'], f['y']), 1, max(1, t0), fr0):
            return False
    start = (f['x'], f['y'])
    ownb = start if start in bpos else None
    seen = set()
    q = deque([(start, t0)])
    while q:
        c, t = q.popleft()
        if (c, t) in seen:
            continue
        seen.add((c, t))
        # 安全终点：此后再无危险
        last = max([e for s, e in dz.get(c, ())] + [0])
        if last < t + 1 and fr0 + t + 40 < flood_frame(*c):
            return True
        if t >= horizon:
            continue
        # 等待一帧
        if not bad(dz, c, t + 1, t + 1, fr0):
            q.append((c, t + 1))
        for dx, dy in DIRS.values():
            n = (c[0] + dx, c[1] + dy)
            if n[0] < 0 or n[1] < 0 or n[0] >= W or n[1] >= H:
                continue
            if tile(g, *n) != EMPTY:
                continue
            if n in bpos and bpos[n] > t:
                continue
            if c in bpos and bpos[c] > t and c != ownb:
                pass
            if bad(dz, n, t + 1, t + k, fr0):
                continue
            q.append((n, t + k))
    return False


# ---------------- 计划生成 ----------------

def bfs(g, start, ign=None):
    dist = {start: 0}
    par = {start: None}
    q = deque([start])
    while q:
        c = q.popleft()
        for d, (dx, dy) in DIRS.items():
            n = (c[0] + dx, c[1] + dy)
            if n in dist:
                continue
            if not walkable(g, n[0], n[1], ign if c == start else None):
                continue
            dist[n] = dist[c] + 1
            par[n] = (c, d)
            q.append(n)
    return dist, par


def path_dirs(par, t):
    out = []
    while par[t] is not None:
        c, d = par[t]
        out.append(d)
        t = c
    return out[::-1]


def plan_frames(g, me, moves1, bomb, moves2, wait_first=0):
    """把格级计划转为帧输入：每段移动按住方向直至到达。"""
    f = g.f[me]
    k = move_len(f['speed'])
    fr = []
    pre = 0
    if f['mp'] < 1:
        mp = f['mp']
        while mp < 1:
            mp = min(1, mp + 1 / mf(f['speed']))
            pre += 1
    for _ in range(pre):
        fr.append(('N', None))
    for _ in range(wait_first):
        fr.append(('N', None))
    for d in moves1:
        fr += [(d, None)] * k
    if bomb:
        if moves2:
            fr.append((moves2[0], 'BOMB'))
            fr += [(moves2[0], None)] * (k - 1)
            for d in moves2[1:]:
                fr += [(d, None)] * k
        else:
            fr.append(('N', 'BOMB'))
    while len(fr) < 20:
        fr.append(('N', None))
    return fr


def simulate(g, me, frames, n=20):
    s = clone(g)
    stats = {'me': me, 'soft': 0, 'pick': 0}
    opp = 1 - me
    stats['trap'] = False
    nb = len([b for b in s.bombs if b['owner'] == me])
    for i in range(n):
        inp = [None, None]
        inp[me] = frames[i]
        inp[opp] = ('N', None)
        step(s, inp, stats)
        if not s.f[me]['alive']:
            break
        if len([b for b in s.bombs if b['owner'] == me]) > nb:
            nb += 1
            if s.f[opp]['alive'] and not can_escape(s, opp):
                stats['trap'] = True
    return s, stats


def pending_value(s, me):
    """我方未爆炸弹将摧毁的软墙价值。"""
    v = 0
    seen = set()
    for b in s.bombs:
        if b['owner'] != me:
            continue
        for dx, dy in DIRS.values():
            for st in range(1, b['blast'] + 1):
                x, y = b['x'] + dx * st, b['y'] + dy * st
                t = tile(s, x, y)
                if t == HARD:
                    break
                if t == SOFT:
                    if (x, y) not in seen:
                        seen.add((x, y))
                        v += 10 + (25 if drop_roll(s.seed, s.round, x, y) else 0)
                    break
    return v


def potential(g, me):
    """全图势场：每个可达格的吸引力。"""
    f = g.f[me]
    o = g.f[1 - me]
    dist, _ = bfs(g, (f['x'], f['y']))
    secs = g.fr / 20.0
    goals = []
    for d in g.drops:
        goals.append(((d['x'], d['y']), 60))
    softs_left = 0
    for c in dist:
        v = 0
        for dx, dy in DIRS.values():
            for st in range(1, f['blast'] + 1):
                x, y = c[0] + dx * st, c[1] + dy * st
                t = tile(g, x, y)
                if t == HARD:
                    break
                if t == SOFT:
                    v += 1 + (2 if drop_roll(g.seed, g.round, x, y) else 0)
                    break
        if v:
            softs_left += 1
            goals.append((c, 8 * v))
    # 中后期：靠近中心与对手（软墙代价 4 的最短路，促使炸穿通往中心的墙）
    import heapq
    cd = {}
    pq = [(0, (x, y)) for y in range(H) for x in range(W) if flood_d(x, y) >= 7 and tile(g, x, y) != HARD]
    heapq.heapify(pq)
    while pq:
        dd, c = heapq.heappop(pq)
        if c in cd:
            continue
        cd[c] = dd
        for dx, dy in DIRS.values():
            n = (c[0] + dx, c[1] + dy)
            t = tile(g, *n)
            if t == HARD or n in cd:
                continue
            heapq.heappush(pq, (dd + (4 if t == SOFT else 1), n))
    late = secs > 22 or softs_left == 0
    lw = min(6, max(1, (secs - 18) / 3))
    pot = {}
    for c, dd in dist.items():
        best = 0
        for gc, gv in goals:
            dg = abs(gc[0] - c[0]) + abs(gc[1] - c[1])
            best = max(best, gv - 4 * dg)
        p = best
        if late:
            p -= lw * cd.get(c, 40)
            if o['alive']:
                p -= 2 * abs(abs(c[0] - o['x']) + abs(c[1] - o['y']) - 2)
        # 远离即将被淹的格
        ff = flood_frame(*c)
        if ff - g.fr < 200:
            p -= (200 - (ff - g.fr)) * 2
        pot[c] = p
    return pot, dist


def choose(o):
    t0 = time.time()
    me = o['yourPlayer']
    g = from_obs(o)
    f = g.f[me]
    opp = 1 - me
    if not f['alive']:
        return [('N', None)] * 20, 'dead'
    pot, _ = potential(g, me)
    start = (f['x'], f['y'])
    dist, par = bfs(g, start)
    cands = []
    near = [c for c in dist if dist[c] <= 5]
    far = sorted((c for c in dist if dist[c] > 5), key=lambda c: -pot.get(c, -1e9))[:6]
    for T in far:
        cands.append((path_dirs(par, T), False, [], 0))
    for T in near:
        m1 = path_dirs(par, T)
        for wf in (0, 8) if T == start else (0,):
            cands.append((m1, False, [], wf))
        if f['act'] < f['bombs'] and not bomb_at(g, *T) and dist[T] <= 3:
            gb = clone(g)
            gb.bombs.append({'id': 'tmp', 'owner': me, 'x': T[0], 'y': T[1], 'fuse': 40, 'blast': f['blast']})
            d2, p2 = bfs(gb, T, 'tmp')
            for E in d2:
                if E != T and d2[E] <= 4:
                    cands.append((m1, True, path_dirs(p2, E), 0))
    best = None
    ob = g.f[opp]
    for (m1, bomb, m2, wf) in cands:
        if time.time() - t0 > 3.2:
            break
        frames = plan_frames(g, me, m1, bomb, m2, wf)
        s, st = simulate(g, me, frames)
        if not s.f[me]['alive']:
            continue
        sc = 0.0
        if not can_escape(s, me):
            sc -= 1e6
        if st['trap']:
            sc += 2e4
        if not s.f[opp]['alive']:
            sc += 50
        # 对手现在放弹的威胁
        so = s.f[opp]
        if so['alive'] and so['act'] < so['bombs'] and not bomb_at(s, so['x'], so['y']):
            hyp = [{'id': 'h', 'owner': opp, 'x': so['x'], 'y': so['y'], 'fuse': 40, 'blast': so['blast']}]
            if not can_escape(s, me, hyp):
                sc -= 400
        sc += st['soft'] * 10 + st['pick'] * 60
        sc += pending_value(s, me)
        fe = s.f[me]
        # 终点势能：按剩余路程折算到计划终点格，避免远目标因窗口截断被低估
        end = (fe['x'], fe['y'])
        if not bomb and m1:
            tgt = (start[0], start[1])
            for d in m1:
                tgt = (tgt[0] + DIRS[d][0], tgt[1] + DIRS[d][1])
            if tgt != end:
                rem = abs(tgt[0] - end[0]) + abs(tgt[1] - end[1])
                sc += max(pot.get(end, -50), pot.get(tgt, -50) - 4 * rem)
            else:
                sc += pot.get(end, -50)
        else:
            sc += pot.get(end, -50)
        if bomb:
            # 炸弹能否威胁对手
            if so['alive']:
                bx, by = None, None
                for b in s.bombs:
                    if b['owner'] == me:
                        bx, by = b['x'], b['y']
                if bx is not None and (bx == so['x'] or by == so['y']) and abs(bx - so['x']) + abs(by - so['y']) <= fe['blast']:
                    sc += 30
            sc -= 3
        sc -= 0.1 * (len(m1) + len(m2))
        if best is None or sc > best[0]:
            best = (sc, frames, bomb)
    if best is None:
        return [('N', None)] * 20, 'no plan'
    return best[1][:20], 'score %.0f%s' % (best[0], ' bomb' if best[2] else '')


def main():
    lastbtn = None
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
            frames, note = choose(o)
        except Exception as e:
            print('err %r' % e, file=sys.stderr)
            frames, note = [('N', None)] * 20, 'err'
        out = [{'dir': d, 'btn': b} for d, b in frames[:20]]
        sys.stdout.write(json.dumps({'inputs': out, 'note': note}) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
