# -*- coding: utf-8 -*-
"""本地测试用：catalog.buildMaze 与 simulation 的 Python 复刻 + 对局跑分。

只用于自测，不参与提交（agent.py 不依赖本文件）。
"""
import math
import os
import sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)
if WS not in sys.path:
    sys.path.insert(0, WS)

import agent as A  # noqa: E402

W, H = 40, 30
CELL = 4
GRID_W, GRID_H = 9, 7
ORIGIN_X, ORIGIN_Y = 2, 1
SPAWNS = [(5.0, (H - 1) / 2.0, 'R'), (float(W - 6), (H - 1) / 2.0, 'L')]

HZ = 20
DT = 1.0 / HZ
FRAMES_PER_DECISION = 3
PRAD = 0.45
BRAD = 0.22
PSPEED = 13.0
BSPEED = 8.5
CD = 0.8
CD_LATE = 0.4
LATE_AT = 60.0
MATCH_SECONDS = 120.0


def _imul32(a, b):
    return ((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF)) & 0xFFFFFFFF


def mulberry32(seed):
    a = [(int(seed) & 0xFFFFFFFF) or 1]

    def rnd():
        a[0] = (a[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = _imul32(a[0] ^ (a[0] >> 15), 1 | a[0])
        t = ((t + _imul32(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF) ^ t
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return rnd


class Lcg(object):
    def __init__(self, seed):
        self.s = (int(seed) & 0xFFFFFFFF) or 1

    def next(self):
        self.s = (_imul32(self.s, 1664525) + 1013904223) & 0xFFFFFFFF
        return self.s / 4294967296.0

    def range(self, a, b):
        return a + (b - a) * self.next()


def carve_cell(tiles, cx, cy):
    x0 = ORIGIN_X + cx * CELL
    y0 = ORIGIN_Y + cy * CELL
    for y in range(y0, y0 + CELL - 1):
        for x in range(x0, x0 + CELL - 1):
            if x > 0 and y > 0 and x < W - 1 and y < H - 1:
                tiles[y * W + x] = 0


def carve_passage(tiles, cx, cy, d):
    x0 = ORIGIN_X + cx * CELL
    y0 = ORIGIN_Y + cy * CELL
    if d == 'R':
        wx = x0 + CELL - 1
        for y in range(y0, y0 + CELL - 1):
            tiles[y * W + wx] = 0
    else:
        wy = y0 + CELL - 1
        for x in range(x0, x0 + CELL - 1):
            tiles[wy * W + x] = 0


def build_maze(seed):
    rnd = mulberry32(seed)
    tiles = [1] * (W * H)
    for cy in range(GRID_H):
        for cx in range(GRID_W):
            carve_cell(tiles, cx, cy)

    seen = [0] * (GRID_W * GRID_H)
    stack = [(int(rnd() * GRID_W), int(rnd() * GRID_H))]
    seen[stack[0][1] * GRID_W + stack[0][0]] = 1
    DIRS4 = [('R', 1, 0), ('L', -1, 0), ('D', 0, 1), ('U', 0, -1)]
    while stack:
        cx, cy = stack[-1]
        options = []
        for (d, dx, dy) in DIRS4:
            nx, ny = cx + dx, cy + dy
            if nx < 0 or ny < 0 or nx >= GRID_W or ny >= GRID_H:
                continue
            if seen[ny * GRID_W + nx]:
                continue
            options.append((d, nx, ny))
        if not options:
            stack.pop()
            continue
        d, nx, ny = options[int(rnd() * len(options))]
        carve_dir = 'R' if (d == 'R' or d == 'L') else 'D'
        carve_passage(tiles, min(cx, nx), min(cy, ny), carve_dir)
        seen[ny * GRID_W + nx] = 1
        stack.append((nx, ny))

    extra = int(GRID_W * GRID_H * 1.5)
    for _ in range(extra):
        if rnd() < 0.5:
            carve_passage(tiles, int(rnd() * (GRID_W - 1)), int(rnd() * GRID_H), 'R')
        else:
            carve_passage(tiles, int(rnd() * GRID_W), int(rnd() * (GRID_H - 1)), 'D')

    for y in range(0, (H - 1) // 2 + 1):
        for x in range(W):
            mx = W - 1 - x
            my = H - 1 - y
            if my * W + mx == y * W + x:
                continue
            tiles[my * W + mx] = tiles[y * W + x]

    for _round in range(30):
        reach = [0] * (W * H)
        q = deque()
        for (sx, sy, _d) in SPAWNS:
            ix, iy = int(math.floor(sx + 0.5)), int(math.floor(sy + 0.5))
            if tiles[iy * W + ix] == 1:
                tiles[iy * W + ix] = 0
            if not reach[iy * W + ix]:
                reach[iy * W + ix] = 1
                q.append((ix, iy))
        while q:
            x, y = q.popleft()
            for (dx, dy) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if nx <= 0 or ny <= 0 or nx >= W - 1 or ny >= H - 1:
                    continue
                if reach[ny * W + nx] or tiles[ny * W + nx] == 1:
                    continue
                reach[ny * W + nx] = 1
                q.append((nx, ny))
        target = None
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                if tiles[y * W + x] == 0 and not reach[y * W + x]:
                    target = (x, y)
                    break
            if target:
                break
        if not target:
            break
        prev = [-1] * (W * H)
        seen2 = [0] * (W * H)
        bfs = deque()
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                if reach[y * W + x]:
                    seen2[y * W + x] = 1
                    bfs.append((x, y))
        found = -1
        head = 0
        blist = list(bfs)
        while head < len(blist) and found < 0:
            x, y = blist[head]
            head += 1
            for (dx, dy) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if nx <= 0 or ny <= 0 or nx >= W - 1 or ny >= H - 1:
                    continue
                i = ny * W + nx
                if seen2[i]:
                    continue
                seen2[i] = 1
                prev[i] = y * W + x
                if nx == target[0] and ny == target[1]:
                    found = i
                    break
                blist.append((nx, ny))
        if found < 0:
            break
        i = found
        while i >= 0:
            if tiles[i] == 1:
                tiles[i] = 0
                x = i % W
                y = (i - x) // W
                tiles[(H - 1 - y) * W + (W - 1 - x)] = 0
            i = prev[i]

    sx, sy, _d = SPAWNS[0]
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            x = int(math.floor(sx + 0.5)) + dx
            y = int(math.floor(sy + 0.5)) + dy
            if x > 0 and y > 0 and x < W - 1 and y < H - 1:
                tiles[y * W + x] = 0
                mx = W - 1 - x
                my = H - 1 - y
                if mx > 0 and my > 0 and mx < W - 1 and my < H - 1:
                    tiles[my * W + mx] = 0
    return tiles


# ---------------------------------------------------------------- 对局

class Match(object):

    def __init__(self, seed, names=('A', 'B')):
        self.seed = seed
        self.tiles = build_maze(seed)
        self.field = A.Field(self.tiles, W, H, PSPEED * DT, PRAD)
        rng = Lcg((int(seed) & 0xFFFFFFFF) ^ 0x9e3779b9)
        self.p = []
        for i in range(2):
            jx = rng.range(-1.1, 1.1)
            jy = rng.range(-1.1, 1.1)
            self.p.append({
                'x': SPAWNS[i][0] + jx, 'y': SPAWNS[i][1] + jy,
                'fx': 1.0 if i == 0 else -1.0, 'fy': 0.0,
                'alive': True, 'cooldown': 0, 'shots': 0, 'hits': 0,
                'held': {'dir': 'N', 'aim': None, 'fire': False},
                'name': names[i],
            })
        self.bullets = []
        self.next_bullet = 1
        self.frame = 0
        self.now = 0.0
        self.status = 'playing'
        self.winner = None
        self.reason = ''
        self.events = []
        self.event_id = 0

    def emit(self, typ, **kw):
        self.event_id += 1
        e = {'id': self.event_id, 't': round(self.now, 3), 'frame': self.frame, 'type': typ}
        e.update(kw)
        self.events.append(e)
        if len(self.events) > 400:
            self.events.pop(0)

    def step(self):
        if self.status != 'playing':
            return
        self.frame += 1
        self.now += DT
        f = self.field
        for i, p in enumerate(self.p):
            if not p['alive']:
                continue
            held = p['held']
            mx, my = A.DIRV[held['dir']]
            if mx or my:
                p['fx'], p['fy'] = mx, my
            nx = p['x'] + mx * PSPEED * DT
            ny = p['y'] + my * PSPEED * DT
            if not f.circle_hits(nx, p['y'], PRAD):
                p['x'] = nx
            if not f.circle_hits(p['x'], ny, PRAD):
                p['y'] = ny

        for p in self.p:
            if not p['alive']:
                continue
            if p['cooldown'] > 0:
                p['cooldown'] -= 1
                continue
            held = p['held']
            if held['aim']:
                dx, dy = A.DIRV[held['aim']]
                p['fx'], p['fy'] = dx, dy
            if not held['fire']:
                continue
            ln = math.hypot(p['fx'], p['fy']) or 1.0
            ux, uy = p['fx'] / ln, p['fy'] / ln
            bx = p['x'] + ux * (PRAD + BRAD + 0.12)
            by = p['y'] + uy * (PRAD + BRAD + 0.12)
            if f.wall(bx, by):
                continue
            self.bullets.append({'id': 'b%d' % self.next_bullet, 'owner': self.p.index(p),
                                 'x': bx, 'y': by, 'vx': ux * BSPEED, 'vy': uy * BSPEED,
                                 'bounces': 0})
            self.next_bullet += 1
            p['shots'] += 1
            cd = CD_LATE if self.now >= LATE_AT else CD
            p['cooldown'] = int(round(cd * HZ))
            self.emit('fire', owner=self.p.index(p), x=round(bx, 3), y=round(by, 3))

        for b in self.bullets:
            b['x'], b['y'], b['vx'], b['vy'] = A.advance_bullet(
                b['x'], b['y'], b['vx'], b['vy'], DT / A.SUB, f)

        for b in self.bullets:
            for i, p in enumerate(self.p):
                if not p['alive'] or i == b['owner']:
                    continue
                if math.hypot(p['x'] - b['x'], p['y'] - b['y']) <= PRAD + BRAD:
                    p['alive'] = False
                    self.p[b['owner']]['hits'] += 1
                    self.emit('hit', owner=b['owner'], victim=i,
                              text='%s 命中 %s' % (self.p[b['owner']]['name'], p['name']))
                    self.status = 'finished'
                    self.winner = 1 - i
                    self.reason = '%s 被击中' % p['name']
                    return

        if self.now >= MATCH_SECONDS:
            self.status = 'finished'
            self.winner = None
            self.reason = '时间到，双方都还活着'

    def snapshot(self, owner):
        return {
            'id': 'test', 'seed': self.seed, 'frame': self.frame,
            'now': round(self.now, 3), 'status': self.status,
            'winner': self.winner, 'reason': self.reason, 'yourPlayer': owner,
            'timeLeft': max(0.0, round((MATCH_SECONDS - self.now) * 10) / 10),
            'map': {'width': W, 'height': H, 'tiles': list(self.tiles)},
            'players': [{
                'id': 'p%d' % i, 'index': i, 'name': p['name'], 'alive': p['alive'],
                'x': round(p['x'], 3), 'y': round(p['y'], 3),
                'fx': round(p['fx'], 3), 'fy': round(p['fy'], 3),
                'cooldown': p['cooldown'], 'shots': p['shots'], 'hits': p['hits'],
            } for i, p in enumerate(self.p)],
            'bullets': [{
                'id': b['id'], 'owner': b['owner'], 'x': round(b['x'], 3), 'y': round(b['y'], 3),
                'vx': round(b['vx'], 3), 'vy': round(b['vy'], 3),
                'speed': round(math.hypot(b['vx'], b['vy']), 2), 'bounces': b['bounces'],
            } for b in self.bullets],
            'events': self.events[-120:],
            'rules': {'hz': HZ, 'decisionFrames': 3, 'playerRadius': PRAD,
                      'playerSpeed': PSPEED, 'bulletRadius': BRAD, 'bulletSpeed': BSPEED,
                      'fireCooldown': CD, 'fireCooldownLate': CD_LATE, 'lateAt': LATE_AT,
                      'matchSeconds': MATCH_SECONDS},
        }


def norm_inputs(raw):
    if not isinstance(raw, dict):
        return None
    ins = raw.get('inputs')
    if isinstance(ins, dict):
        ins = [ins]
    if not isinstance(ins, list) or len(ins) > 3:
        return None
    out = []
    for i in range(3):
        if i >= len(ins):
            out.append({'dir': 'N', 'aim': None, 'fire': False})
            continue
        fr = ins[i]
        if not isinstance(fr, dict):
            return None
        d = fr.get('dir', 'N')
        d = 'N' if d is None else str(d).upper()
        if d not in A.DIRV:
            return None
        a = fr.get('aim', None)
        a = None if a is None else str(a).upper()
        if a is not None and a not in A.DIRV:
            return None
        fi = fr.get('fire', False)
        if fi is None:
            fi = False
        if not isinstance(fi, bool):
            return None
        out.append({'dir': d, 'aim': a, 'fire': fi})
    return out


def run_match(seed, ctrl0, ctrl1, max_windows=2000, verbose=False):
    m = Match(seed, names=('A', 'B'))
    ctrls = [ctrl0, ctrl1]
    w = 0
    while m.status == 'playing' and w < max_windows:
        w += 1
        wins = [None, None]
        for i in range(2):
            if not m.p[i]['alive']:
                wins[i] = [{'dir': 'N', 'aim': None, 'fire': False}] * 3
                continue
            obs = m.snapshot(i)
            raw = ctrls[i].act(obs)
            wins[i] = norm_inputs(raw)
            if wins[i] is None:
                return {'winner': 1 - i, 'reason': 'P%d 非法输出' % i, 'frames': m.frame,
                        'shots': [p['shots'] for p in m.p], 'bullets': len(m.bullets)}
        for k in range(FRAMES_PER_DECISION):
            if m.status != 'playing':
                break
            for i in range(2):
                m.p[i]['held'] = wins[i][k]
            m.step()
    if verbose:
        print('  end: winner=%s reason=%s frames=%d shots=%s bullets=%d' % (
            m.winner, m.reason, m.frame, [p['shots'] for p in m.p], len(m.bullets)))
    return {'winner': m.winner, 'reason': m.reason, 'frames': m.frame,
            'shots': [p['shots'] for p in m.p], 'hits': [p['hits'] for p in m.p],
            'bullets': len(m.bullets)}
