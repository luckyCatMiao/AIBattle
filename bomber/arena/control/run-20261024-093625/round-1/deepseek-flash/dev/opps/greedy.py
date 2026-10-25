#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""自测对手「稳健型」：躲火、捡道具、炸墙开路、向对手推进。
刻意用与主 agent 不同的实现（简单 BFS、只看引信<=26 的火力），检验主 agent 鲁棒性。"""
import sys, json, heapq
from collections import deque

W, H = 19, 17
EMPTY, HARD, SOFT = 0, 1, 2
DIRS = [('U', 0, -1), ('D', 0, 1), ('L', -1, 0), ('R', 1, 0)]
DIRDELTA = {'U': (0, -1), 'D': (0, 1), 'L': (-1, 0), 'R': (1, 0), 'N': (0, 0)}


def frames_per_tile(speed):
    m = max(3, 6 - speed)
    p = 1.0 / m
    n = 1
    while p < 1.0:
        p = min(1.0, p + 1.0 / m)
        n += 1
    return n


def frames_until_free(f):
    m = max(3, 6 - f['speed'])
    n = frames_per_tile(f['speed'])
    px, py = f.get('px', f['x']), f.get('py', f['y'])
    dx, dy = f['x'] - px, f['y'] - py
    if abs(dx) < 1e-6 and abs(dy) < 1e-6:
        return 0
    prog = 1.0 - max(abs(dx), abs(dy))
    k = int(round(prog * m))
    k = max(1, min(n, k))
    return n - k


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
        except Exception:
            print(json.dumps({"inputs": [{"dir": "N", "btn": None}] * 20}), flush=True)
            continue
        try:
            res = step(obs)
        except Exception as e:
            sys.stderr.write('greedy err %r\n' % (e,))
            res = {"inputs": [{"dir": "N", "btn": None}] * 20}
        print(json.dumps(res), flush=True)


def step(obs):
    if obs.get('status') != 'playing':
        return neutral()
    my = obs.get('yourPlayer', 0)
    tiles = obs['map']['tiles']
    me = opp = None
    for f in obs['fighters']:
        if f['owner'] == my:
            me = f
        else:
            opp = f
    if me is None or not me['alive']:
        return neutral()
    mx, myy = me['x'], me['y']
    bombs = obs.get('bombs', [])
    blasts = obs.get('blasts', [])
    drops = obs.get('drops', [])
    m = frames_per_tile(me['speed'])
    t0 = frames_until_free(me)
    blast = me['blast']
    bomb_cells = set((b['x'], b['y']) for b in bombs)

    danger = set((c['x'], c['y']) for c in blasts)
    for b in bombs:
        if b['fuse'] <= 34:
            danger.update(blast_cells(tiles, b['x'], b['y'], b['blast']))
    # 也把「对手火力能覆盖的格子」当作危险区（更谨慎的对手）
    if opp and opp['alive']:
        danger.update(blast_cells(tiles, opp['x'], opp['y'], opp['blast'] + 2))

    def ok(x, y):
        return 0 <= x < W and 0 <= y < H and tiles[y * W + x] == EMPTY and (x, y) not in bomb_cells

    def bfs_path(sx, sy, blocked, limit):
        """返回 {(x,y): path}，path 是方向名列表。"""
        res = {(sx, sy): []}
        q = deque([(sx, sy)])
        while q:
            x, y = q.popleft()
            p = res[(x, y)]
            if len(p) >= limit:
                continue
            for name, dx, dy in DIRS:
                nx, ny = x + dx, y + dy
                if (nx, ny) in res or (nx, ny) in blocked or not ok(nx, ny):
                    continue
                res[(nx, ny)] = p + [name]
                q.append((nx, ny))
        return res

    # 1) 躲火
    reach = bfs_path(mx, myy, set(), 6)
    if (mx, myy) in danger:
        best = None
        for cell, p in reach.items():
            if not p or cell in danger:
                continue
            if best is None or len(p) < best[0]:
                best = (len(p), p)
        if best:
            return emit(best[1], None, m, t0)

    # 2) 捡道具（路径避开已知火线）
    reach = bfs_path(mx, myy, danger, 6)
    best = None
    for d in drops:
        c = (d['x'], d['y'])
        if c in reach and c not in danger and reach[c]:
            if best is None or len(reach[c]) < best[0]:
                best = (len(reach[c]), reach[c])
    if best and best[0] <= 5:
        return emit(best[1], None, m, t0)

    # 3) 炸墙 / 打人
    opp_cell = (opp['x'], opp['y']) if opp else None
    cand = []
    for cell, p in reach.items():
        cells = blast_cells(tiles, cell[0], cell[1], blast)
        hit_opp = opp_cell is not None and opp_cell in cells
        walls = 0
        for name, dx, dy in DIRS:
            ln = blast_line(tiles, cell[0], cell[1], dx, dy, blast)
            if ln and ln[0] == SOFT:
                walls += 1
        if walls == 0 and not hit_opp:
            continue
        cand.append((walls * 2.0 + (8.0 if hit_opp else 0) - len(p) * 0.5, cell, p, hit_opp))
    if cand and me['activeBombs'] < me['bombs']:
        cand.sort(key=lambda z: -z[0])
        for (sc, cell, p, hit_opp) in cand[:5]:
            esc = escape_after(tiles, bomb_cells, cell, blast, danger, 5)
            if esc is None:
                continue
            return emit(p, cell, m, t0, esc)

    # 4) 靠近对手
    if opp_cell:
        reach2 = bfs_path(mx, myy, danger, 30)
        if opp_cell in reach2 and reach2[opp_cell]:
            return emit(reach2[opp_cell][:3], None, m, t0)
        best = None
        for cell, p in reach2.items():
            if not p:
                continue
            dd = abs(cell[0] - opp_cell[0]) + abs(cell[1] - opp_cell[1])
            if best is None or dd < best[0]:
                best = (dd, p)
        if best:
            return emit(best[1][:3], None, m, t0)
    return neutral()


def neutral():
    return {"inputs": [{"dir": "N", "btn": None}] * 20}


def blast_cells(tiles, cx, cy, blast):
    out = [(cx, cy)]
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        for s in range(1, blast + 1):
            x, y = cx + dx * s, cy + dy * s
            if not (0 <= x < W and 0 <= y < H):
                break
            t = tiles[y * W + x]
            if t == HARD:
                break
            out.append((x, y))
            if t == SOFT:
                break
    return out


def blast_line(tiles, cx, cy, dx, dy, blast):
    for s in range(1, blast + 1):
        x, y = cx + dx * s, cy + dy * s
        if not (0 <= x < W and 0 <= y < H):
            return None
        t = tiles[y * W + x]
        if t == EMPTY:
            continue
        return (t, (x, y))
    return None


def escape_after(tiles, bomb_cells, cell, blast, danger, limit):
    cset = set(blast_cells(tiles, cell[0], cell[1], blast))
    blocked = set(bomb_cells)
    blocked.add(cell)
    q = deque([(cell[0], cell[1], 0, [])])
    seen = {(cell[0], cell[1])}
    while q:
        x, y, d, p = q.popleft()
        if d > limit:
            continue
        if d > 0 and (x, y) not in cset and (x, y) not in danger:
            return p
        for name, dx, dy in DIRS:
            nx, ny = x + dx, y + dy
            if not (0 <= nx < W and 0 <= ny < H) or (nx, ny) in seen:
                continue
            if tiles[ny * W + nx] != EMPTY or (nx, ny) in blocked:
                continue
            seen.add((nx, ny))
            q.append((nx, ny, d + 1, p + [name]))
    return None


def emit(path, bomb_cell, m, t0, escape=None):
    """path: 方向名列表（走到 bomb_cell）；bomb_cell 非空则走到后放弹；escape 是放弹后的退路。"""
    frames = []
    for _ in range(t0):
        frames.append({"dir": "N", "btn": None})
    for i, mv in enumerate(path):
        for j in range(m):
            frames.append({"dir": mv, "btn": None})
    if bomb_cell is not None:
        if frames and frames[-1]["btn"] is None:
            frames.append({"dir": "N", "btn": "BOMB"})
        else:
            frames.append({"dir": "N", "btn": None})
            frames.append({"dir": "N", "btn": "BOMB"})
        if escape:
            for mv in escape:
                for j in range(m):
                    frames.append({"dir": mv, "btn": None})
    while len(frames) < 20:
        frames.append({"dir": "N", "btn": None})
    return {"inputs": frames[:20]}


if __name__ == '__main__':
    main()
