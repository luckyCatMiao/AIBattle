#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Exact Python replay of simulation.js for recorded harness dumps.

The harness dump stores, for every decision window, the snapshot *before* the
window is applied plus both seats' raw inputs.  Replaying those inputs with the
same physics reproduces the match frame by frame; this gives us the exact
per-frame bullet field, which is independent of any player's movement and can
therefore be used to score alternative movement/aim policies offline.
"""
import json
import math

W, H = 40, 30
SQ = math.sqrt(0.5)

PILLARS = (
    (8, 6, 4, 2), (28, 22, 4, 2),
    (8, 22, 4, 2), (28, 6, 4, 2),
    (19, 4, 2, 3), (19, 23, 2, 3),
    (19, 13, 2, 4),
)

DIRV = {
    'N': (0.0, 0.0),
    'U': (0.0, -1.0), 'D': (0.0, 1.0),
    'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-SQ, -SQ), 'UR': (SQ, -SQ),
    'DL': (-SQ, SQ), 'DR': (SQ, SQ),
}

DT = 1.0 / 20.0
SUB = 3
PLAYER_STEP = 13.0 * DT
BULLET_STEP = 8.5 * DT
HIT_R = 0.45 + 0.22
SPAWN_OFF = 0.45 + 0.22 + 0.12
COOLDOWN = 24


def build_field():
    f = [0] * (W * H)
    for y in range(H):
        for x in range(W):
            if x == 0 or y == 0 or x == W - 1 or y == H - 1:
                f[y * W + x] = 1
    for (px, py, pw, ph) in PILLARS:
        for y in range(py, py + ph):
            for x in range(px, px + pw):
                if 0 < x < W - 1 and 0 < y < H - 1:
                    f[y * W + x] = 1
    return f


FIELD = build_field()
_UNIT8 = tuple((math.cos(i * math.pi / 4.0), math.sin(i * math.pi / 4.0)) for i in range(8))


def tile_at(x, y):
    if x < 0 or y < 0 or x >= W or y >= H:
        return 1
    return FIELD[int(math.floor(y)) * W + int(math.floor(x))]


def circle_hits_wall(x, y, r=0.45):
    if tile_at(x, y):
        return True
    for ux, uy in _UNIT8:
        if tile_at(x + ux * r, y + uy * r):
            return True
    return False


def move_player(x, y, dx, dy):
    if dx:
        nx = x + dx * PLAYER_STEP
        if not circle_hits_wall(nx, y):
            x = nx
    if dy:
        ny = y + dy * PLAYER_STEP
        if not circle_hits_wall(x, ny):
            y = ny
    return x, y


def advance_bullet(x, y, vx, vy, steps=1):
    for _ in range(steps):
        for _s in range(SUB):
            nx = x + vx * DT / SUB
            ny = y + vy * DT / SUB
            if tile_at(nx, y):
                vx = -vx
            else:
                x = nx
            if tile_at(x, ny):
                vy = -vy
            else:
                y = ny
    return x, y, vx, vy


def norm_input(raw):
    d = raw or {}
    dk = str(d.get('dir') or 'N').upper()
    if dk not in DIRV:
        dk = 'N'
    aim = d.get('aim')
    aim = None if aim is None else str(aim).upper()
    if aim is not None and aim not in DIRV:
        aim = None
    return dk, aim, bool(d.get('fire'))


class Match(object):
    """Replays one game from a dump's window records."""

    def __init__(self, seed, windows):
        # windows: list of (frame, raw0, raw1); frame == 3*window index
        self.seed = seed
        self.windows = windows
        self.px = [5.0, W - 6.0]
        self.py = [(H - 1) / 2.0, (H - 1) / 2.0]
        self.facing = [(1.0, 0.0), (-1.0, 0.0)]
        self.cd = [0, 0]
        self.alive = [True, True]
        self.bullets = []          # [x, y, vx, vy, owner]
        self.next_id = 1
        self.frames = []           # per-frame record
        self.fires = []            # (frame, owner, x, y, dir)
        self.bullet_paths = {}     # bullet id -> list of (x, y) per frame alive
        self.status = 'playing'
        self.winner = None
        self.death_frame = None
        self.death_victim = None
        self.death_owner = None

    def snapshot_frame(self):
        return {
            'px': list(self.px), 'py': list(self.py),
            'bullets': [(b[0], b[1], b[2], b[3], b[4], b[5]) for b in self.bullets],
            'cd': list(self.cd), 'alive': list(self.alive),
        }

    def step(self, inputs):
        if self.status != 'playing':
            return
        self.frame = getattr(self, 'frame', 0) + 1
        for i in (0, 1):
            if not self.alive[i]:
                continue
            dk, aim, fire = inputs[i]
            dx, dy = DIRV[dk]
            if dx or dy:
                self.facing[i] = (dx, dy)
                self.px[i], self.py[i] = move_player(self.px[i], self.py[i], dx, dy)
            if self.cd[i] > 0:
                self.cd[i] -= 1
                continue
            if aim:
                self.facing[i] = DIRV[aim]
            if not fire:
                continue
            fx, fy = self.facing[i]
            ln = math.hypot(fx, fy) or 1.0
            ux, uy = fx / ln, fy / ln
            bx = self.px[i] + ux * SPAWN_OFF
            by = self.py[i] + uy * SPAWN_OFF
            if tile_at(bx, by):
                continue
            bid = self.next_id
            self.next_id += 1
            self.bullets.append([bx, by, ux * 8.5, uy * 8.5, i, bid])
            self.bullet_paths[bid] = [(bx, by)]
            self.cd[i] = COOLDOWN
            self.fires.append((self.frame, i, self.px[i], self.py[i], ux, uy, bid))
        for b in self.bullets:
            x, y, vx, vy = advance_bullet(b[0], b[1], b[2], b[3], 1)
            b[0], b[1], b[2], b[3] = x, y, vx, vy
            self.bullet_paths[b[5]].append((x, y))
        # hit check
        for b in self.bullets:
            for i in (0, 1):
                if not self.alive[i] or b[4] == i:
                    continue
                if math.hypot(self.px[i] - b[0], self.py[i] - b[1]) <= HIT_R:
                    self.alive[i] = False
                    self.status = 'finished'
                    self.winner = 1 - i
                    self.death_frame = self.frame
                    self.death_victim = i
                    self.death_owner = b[4]
                    return
        self.frames.append(self.snapshot_frame())

    def run(self):
        self.frame = 0
        self.frames.append(self.snapshot_frame())
        for (frame, raw0, raw1) in self.windows:
            ins = [norm_input(raw0), norm_input(raw1)]
            for k in range(3):
                if self.status != 'playing':
                    break
                # both seats submit per-frame inputs: raw is {"inputs":[f,f,f]}
                a0 = (raw0 or {}).get('inputs') or []
                a1 = (raw1 or {}).get('inputs') or []
                per = [norm_input(a0[k] if k < len(a0) else None),
                       norm_input(a1[k] if k < len(a1) else None)]
                self.step(per)
                if self.status != 'playing':
                    break
        return self


def load_dump(path, max_games=None):
    """-> [(seed, windows, snapshots_by_window)] with one entry per game."""
    games = {}
    order = []
    with open(path, 'r', encoding='utf-8') as fh:
        for line in fh:
            d = json.loads(line)
            seed = d['seed']
            if seed not in games:
                games[seed] = {'w': {}, 'snap': {}}
                order.append(seed)
            fr = d['frame']
            g = games[seed]
            if fr not in g['w']:
                g['w'][fr] = [None, None]
            g['w'][fr][d['owner']] = d['raw']
            if d['owner'] == 0:
                g['snap'][fr] = d['snap']
    out = []
    for seed in order[:max_games]:
        g = games[seed]
        frames = sorted(g['w'])
        wins = [(fr, g['w'][fr][0], g['w'][fr][1]) for fr in frames]
        out.append((seed, wins, g['snap']))
    return out


if __name__ == '__main__':
    import sys
    path = sys.argv[1]
    for seed, wins, snaps in load_dump(path, 1):
        m = Match(seed, wins).run()
        # verify against recorded snapshots at every window boundary
        bad = 0
        worst = 0.0
        for fr, sn in snaps.items():
            if fr >= len(m.frames):
                continue
            st = m.frames[fr]
            for i in (0, 1):
                if sn['players'][i]['alive'] != st['alive'][i]:
                    bad += 1
                worst = max(worst, abs(sn['players'][i]['x'] - st['px'][i]),
                            abs(sn['players'][i]['y'] - st['py'][i]))
            if len(sn['bullets']) != len(st['bullets']):
                bad += 1
        print('seed', seed, 'frames', m.frame, 'winner', m.winner,
              'death_frame', m.death_frame, 'mismatch', bad, 'worst_pos', round(worst, 6))
