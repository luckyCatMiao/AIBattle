#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bomb-defusal 5v5 agent (program mode).

stdin: one JSON observation per line.  stdout: one JSON action line.

Design notes
------------
* Firing is automatic and only checks weapon range, line of sight and the
  +/-50 deg facing cone -- NOT the 8-tile vision range.  So long sight lines
  (this map has 20+ tile straight lanes) are the dominant tactical feature and
  facing is independent of movement.  Every unit therefore aims at the threat
  bearing while moving in any direction.
* Waypoints are tile centres so the replicating physics never stalls.
"""
import sys
import os
import json
import math
import heapq

SQ = 0.7071067811865476
DIR_VEC = {
    'N': (0.0, 0.0), 'U': (0.0, -1.0), 'D': (0.0, 1.0),
    'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-SQ, -SQ), 'UR': (SQ, -SQ), 'DL': (-SQ, SQ), 'DR': (SQ, SQ),
}
CARD = ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR']
CARD_ANG = [math.atan2(DIR_VEC[k][1], DIR_VEC[k][0]) for k in CARD]
FRAME_STEP = 3.0 / 20.0
RADIUS = 0.30


def dir_to(dx, dy):
    if abs(dx) < 1e-9 and abs(dy) < 1e-9:
        return 'N'
    a = math.atan2(dy, dx)
    best, bd = 'N', 9.0
    for k, ka in zip(CARD, CARD_ANG):
        d = abs(((a - ka + math.pi * 3) % (math.pi * 2)) - math.pi)
        if d < bd:
            bd, best = d, k
    return best


class Grid:
    def __init__(self, tiles, w, h):
        self.t = tiles
        self.w = w
        self.h = h

    def wall(self, tx, ty):
        if tx < 0 or ty < 0 or tx >= self.w or ty >= self.h:
            return True
        return self.t[ty * self.w + tx] == 1

    def hits(self, x, y, r=RADIUS):
        minx, maxx = math.floor(x - r), math.floor(x + r)
        miny, maxy = math.floor(y - r), math.floor(y + r)
        for ty in range(miny, maxy + 1):
            for tx in range(minx, maxx + 1):
                if not self.wall(tx, ty):
                    continue
                cx = min(max(x, tx), tx + 1.0)
                cy = min(max(y, ty), ty + 1.0)
                if (x - cx) ** 2 + (y - cy) ** 2 < r * r:
                    return True
        return False

    def los(self, x1, y1, x2, y2):
        dx, dy = x2 - x1, y2 - y1
        dist = math.hypot(dx, dy)
        if dist < 1e-6:
            return True
        steps = max(1, int(math.ceil(dist / 0.1)))
        for i in range(1, steps):
            t = i / steps
            if self.wall(math.floor(x1 + dx * t), math.floor(y1 + dy * t)):
                return False
        return True

    def clear(self, x1, y1, x2, y2, r=0.33):
        dx, dy = x2 - x1, y2 - y1
        dist = math.hypot(dx, dy)
        steps = max(1, int(math.ceil(dist / 0.12)))
        for i in range(steps + 1):
            t = i / steps
            if self.hits(x1 + dx * t, y1 + dy * t, r):
                return False
        return True

    def step(self, x, y, d):
        vx, vy = DIR_VEC[d]
        if vx == 0.0 and vy == 0.0:
            return x, y
        l = math.hypot(vx, vy)
        mx, my = vx / l * FRAME_STEP, vy / l * FRAME_STEP
        nx = x + mx
        if not self.hits(nx, y):
            x = nx
        ny = y + my
        if not self.hits(x, ny):
            y = ny
        return x, y

    def astar(self, sx, sy, gx, gy):
        w, h = self.w, self.h
        s = (int(math.floor(sx)), int(math.floor(sy)))
        t = (int(math.floor(gx)), int(math.floor(gy)))
        if self.wall(t[0], t[1]):
            return None
        N = w * h
        gs = [float('inf')] * N
        fr = [-1] * N
        closed = bytearray(N)
        k0 = s[1] * w + s[0]
        gs[k0] = 0.0
        hf = lambda x, y: math.hypot(x - t[0], y - t[1])
        openh = [(hf(s[0], s[1]), 0.0, s[0], s[1])]
        nbrs = ((1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0),
                (1, 1, 1.41421356), (1, -1, 1.41421356), (-1, 1, 1.41421356), (-1, -1, 1.41421356))
        while openh:
            _, gcur, x, y = heapq.heappop(openh)
            k = y * w + x
            if closed[k]:
                continue
            closed[k] = 1
            if x == t[0] and y == t[1]:
                path = []
                cur = k
                while cur != -1:
                    path.append((cur % w + 0.5, cur // w + 0.5))
                    cur = fr[cur]
                path.reverse()
                return path[1:]
            for dx, dy, c in nbrs:
                nx, ny = x + dx, y + dy
                if self.wall(nx, ny):
                    continue
                if dx and dy and (self.wall(x + dx, y) or self.wall(x, y + dy)):
                    continue
                nk = ny * w + nx
                if closed[nk]:
                    continue
                ng = gcur + c
                if ng < gs[nk]:
                    gs[nk] = ng
                    fr[nk] = k
                    heapq.heappush(openh, (ng + hf(nx, ny), ng, nx, ny))
        return None


def ctr(p):
    """snap a point to a tile centre"""
    return (math.floor(p[0]) + 0.5, math.floor(p[1]) + 0.5)


# ---------------------------------------------------------------- tactics
PLANT = {'A': ctr((9, 6)), 'B': ctr((30, 6))}

# approach: the site's own choke lane, hugging the tile centres
LANE = {
    'A': [ctr((9, 21)), ctr((9, 15)), ctr((9, 12)), ctr((9, 9)), ctr((9, 6))],
    'B': [ctr((30, 21)), ctr((30, 15)), ctr((30, 12)), ctr((30, 9)), ctr((30, 6))],
}
# mid flank: through the centre choke then west/east into the site corridor
FLANK = {
    'A': [ctr((19, 13)), ctr((18, 10)), ctr((12, 9)), ctr((12, 6)), ctr((10, 6))],
    'B': [ctr((19, 13)), ctr((21, 10)), ctr((27, 9)), ctr((27, 6)), ctr((29, 6))],
}
# wide rush: all five use the chosen site's own choke, spread over four columns
# inside the 4-tile gap (left gap x8-11, right gap x28-31).  Round 1 showed the
# two mid flankers die at 0.8-1.3 s to the central pre-aim lane without ever
# firing, so they no longer take the centre gap.
WIDE_LANE = {
    'A': [
        [ctr((9, 21)), ctr((9, 16)), ctr((9, 12)), ctr((9, 9)), ctr((9, 6))],
        [ctr((8, 21)), ctr((8, 16)), ctr((8, 12)), ctr((8, 9)), ctr((8, 7))],
        [ctr((10, 21)), ctr((10, 16)), ctr((10, 12)), ctr((10, 9)), ctr((10, 6))],
        [ctr((11, 21)), ctr((11, 16)), ctr((11, 12)), ctr((11, 9)), ctr((11, 7))],
        [ctr((7, 21)), ctr((7, 16)), ctr((8, 12)), ctr((8, 9)), ctr((6, 7))],
    ],
    'B': [
        [ctr((30, 21)), ctr((30, 16)), ctr((30, 12)), ctr((30, 9)), ctr((30, 6))],
        [ctr((31, 21)), ctr((31, 16)), ctr((31, 12)), ctr((31, 9)), ctr((31, 7))],
        [ctr((29, 21)), ctr((29, 16)), ctr((29, 12)), ctr((29, 9)), ctr((29, 6))],
        [ctr((28, 21)), ctr((28, 16)), ctr((28, 12)), ctr((28, 9)), ctr((28, 7))],
        [ctr((32, 21)), ctr((32, 16)), ctr((31, 12)), ctr((31, 9)), ctr((33, 7))],
    ],
}
# look direction used once a wide-rush unit has reached the site: watch the
# southern retake lanes (the defenders hold mid, i.e. south of the bomb),
# instead of staring north with the bomb behind the squad.
WIDE_HOLD_LOOK = {
    'A': [ctr((9, 12)), ctr((9, 12)), ctr((10, 12)), ctr((12, 12)), ctr((8, 12))],
    'B': [ctr((30, 12)), ctr((30, 12)), ctr((29, 12)), ctr((27, 12)), ctr((31, 12))],
}

# wide2: cross the exposed bottom band only as far as the safe west edge
# (x<=13 is shadowed by the x13 wall and the site cover), then go north in the
# safe corridor x9-12 before entering the choke.  The old wide lanes sent the
# easternmost unit all the way to x7 at the bottom, i.e. 5-6 extra tiles of
# exposure through the defenders' long lane.
WIDE2_LANE = {
    'A': [
        [ctr((13, 21)), ctr((12, 19)), ctr((12, 17)), ctr((10, 16)), ctr((10, 12)), ctr((9, 9)), ctr((9, 6))],
        [ctr((12, 21)), ctr((12, 19)), ctr((11, 17)), ctr((10, 15)), ctr((10, 11)), ctr((9, 9)), ctr((8, 7))],
        [ctr((13, 22)), ctr((12, 19)), ctr((12, 17)), ctr((10, 16)), ctr((10, 12)), ctr((10, 9)), ctr((10, 6))],
        [ctr((14, 21)), ctr((13, 19)), ctr((12, 17)), ctr((10, 16)), ctr((10, 12)), ctr((11, 9)), ctr((11, 7))],
        [ctr((14, 22)), ctr((13, 19)), ctr((12, 17)), ctr((9, 16)), ctr((9, 12)), ctr((9, 9)), ctr((7, 7))],
    ],
    'B': [
        [ctr((26, 21)), ctr((27, 19)), ctr((27, 17)), ctr((29, 16)), ctr((29, 12)), ctr((30, 9)), ctr((30, 6))],
        [ctr((27, 21)), ctr((27, 19)), ctr((28, 17)), ctr((29, 15)), ctr((29, 11)), ctr((30, 9)), ctr((31, 7))],
        [ctr((26, 22)), ctr((27, 19)), ctr((27, 17)), ctr((29, 16)), ctr((29, 12)), ctr((29, 9)), ctr((29, 6))],
        [ctr((25, 21)), ctr((26, 19)), ctr((27, 17)), ctr((29, 16)), ctr((29, 12)), ctr((28, 9)), ctr((28, 7))],
        [ctr((25, 22)), ctr((26, 19)), ctr((27, 17)), ctr((30, 16)), ctr((30, 12)), ctr((30, 9)), ctr((32, 7))],
    ],
}

# post-plant holds around the bomb (position, look-at)
POST = {
    'A': [(ctr((9, 10)), ctr((9, 6))), (ctr((12, 10)), ctr((9, 8))),
          (ctr((6, 10)), ctr((9, 8))), (ctr((12, 8)), ctr((9, 7))),
          (ctr((7, 9)), ctr((9, 6)))],
    'B': [(ctr((30, 10)), ctr((30, 6))), (ctr((27, 10)), ctr((30, 8))),
          (ctr((33, 10)), ctr((30, 8))), (ctr((27, 8)), ctr((30, 7))),
          (ctr((32, 9)), ctr((30, 6)))],
}

# defence: cover the two site chokes and the middle choke
DEF_SPLIT = [
    (ctr((9, 8)), ctr((9, 16))),
    (ctr((9, 5)), ctr((9, 16))),
    (ctr((30, 8)), ctr((30, 16))),
    (ctr((30, 5)), ctr((30, 16))),
    (ctr((19, 9)), ctr((19, 17))),
]
DEF_STACK_A = [
    (ctr((9, 8)), ctr((9, 16))),
    (ctr((9, 5)), ctr((9, 16))),
    (ctr((12, 9)), ctr((12, 15))),
    (ctr((19, 9)), ctr((19, 17))),
    (ctr((11, 6)), ctr((10, 14))),
]
DEF_STACK_B = [
    (ctr((30, 8)), ctr((30, 16))),
    (ctr((30, 5)), ctr((30, 16))),
    (ctr((27, 9)), ctr((27, 15))),
    (ctr((19, 9)), ctr((19, 17))),
    (ctr((28, 6)), ctr((29, 14))),
]
RETAKE = POST

# Post-plant hold for the ATTACKING squad.  This is deliberately different from
# RETAKE above, which is used by the DEFENDING squad (and has been working).
# In round 1 the attackers planted in every attack round of r1-g1 yet scored
# 0 kills in three rounds: the old POST put all five south of the bomb looking
# NORTH, i.e. with their backs to the mid lane the defenders retake from.  The
# new layout is a crossfire on the site: south/east watchers on the retake
# lanes, one bomb guard, one north watcher.
ATK_POST = {
    'A': [(ctr((9, 7)), ctr((9, 12))),
          (ctr((5, 7)), ctr((9, 11))),
          (ctr((11, 7)), ctr((13, 10))),
          (ctr((9, 4)), ctr((9, 1))),
          (ctr((10, 6)), ctr((9, 6)))],
    'B': [(ctr((30, 7)), ctr((30, 12))),
          (ctr((34, 7)), ctr((30, 11))),
          (ctr((28, 7)), ctr((26, 10))),
          (ctr((30, 4)), ctr((30, 1))),
          (ctr((29, 6)), ctr((30, 6)))],
}

# --- alternative defence layouts (position, look-at), tested offline ---
def _L(cells):
    # defenders hold and look SOUTH, down the lanes the attackers come up
    return [(ctr((x, y)), ctr((x, y + 8))) for (x, y) in cells]

DEF_LAYOUTS = {
    '0': _L([(9, 8), (9, 5), (30, 8), (30, 5), (19, 9)]),
    '1': [(ctr((9, 9)), ctr((9, 17))), (ctr((12, 6)), ctr((12, 13))),
          (ctr((30, 9)), ctr((30, 17))), (ctr((27, 6)), ctr((27, 13))),
          (ctr((19, 9)), ctr((19, 17)))],
    '2': _L([(9, 5), (30, 5), (19, 9), (17, 9), (21, 9)]),
    '3': _L([(9, 9), (9, 5), (30, 9), (30, 5), (19, 13)]),
    '4': [(ctr((9, 6)), ctr((9, 15))), (ctr((12, 9)), ctr((11, 15))),
          (ctr((30, 6)), ctr((30, 15))), (ctr((27, 9)), ctr((28, 15))),
          (ctr((19, 10)), ctr((19, 17)))],
    '5': _L([(9, 5), (30, 5), (19, 9), (12, 6), (27, 6)]),
    '6': _L([(9, 6), (30, 6), (14, 9), (19, 9), (24, 9)]),
    '7': _L([(9, 6), (9, 8), (30, 6), (30, 8), (19, 9)]),
    '8': _L([(9, 6), (30, 6), (12, 9), (27, 9), (19, 9)]),
    '9': _L([(9, 6), (30, 6), (9, 9), (30, 9), (19, 9)]),
    'SA': _L([(9, 6), (9, 8), (12, 9), (6, 4), (10, 7)]),
    'SB': _L([(30, 6), (30, 8), (27, 9), (33, 4), (29, 7)]),
    'S2': _L([(9, 6), (9, 8), (12, 9), (10, 4), (6, 7)]),
    'C': _L([(17, 9), (19, 9), (21, 9), (18, 8), (20, 8)]),
    'C2': _L([(16, 10), (19, 10), (22, 10), (17, 9), (21, 9)]),
    'C3': _L([(12, 9), (16, 9), (19, 9), (23, 9), (27, 9)]),
    'C4': _L([(11, 9), (14, 9), (19, 9), (25, 9), (28, 9)]),
    'C5': _L([(13, 9), (17, 9), (21, 9), (24, 9), (27, 9)]),
    # test-only: full stack on one site (simulates an opponent that anticipates us)
    'TA': _L([(9, 8), (9, 6), (12, 9), (6, 5), (10, 5)]),
    'TB': _L([(30, 8), (30, 6), (27, 9), (33, 5), (29, 5)]),
    'T3A': _L([(9, 8), (9, 6), (12, 9), (17, 9), (19, 9)]),
    'T3B': _L([(30, 8), (30, 6), (27, 9), (21, 9), (19, 9)]),
}
VARIANT = os.environ.get('AGENT_VARIANT', 'C')
ATK_STYLE = os.environ.get('AGENT_ATK', 'wide')
ATK_POST_STYLE = os.environ.get('AGENT_POST', 'new')   # 'old' keeps the R1 layout
ECO = os.environ.get('AGENT_ECO', '1') != '0'
# Round 2 had 0 plants in 6 attack rounds, and the trace showed the carrier
# being the first unit into the defenders' long pre-aim lane.  Keep the carrier
# on the slower, shadowed corridor while the other four take the fast wide
# lane; the carrier's job is to survive and plant, not to win the first duel.
CARRIER_SAFE = os.environ.get('AGENT_CARRIER_SAFE', '1') != '0'
# Site selection: 'rand' = seed-derived per round, 'A'/'B' = always, 'alt' = alternate per round.
SITE_MODE = os.environ.get('AGENT_SITE', 'alt')
# Attack shape: 'stack' = all five hit one site; 'feint2'/'feint1' = send 2/1
# decoys at the other site to pull the defence's rotation, main body takes the
# bomb site (carrier always stays with the main body).
ATK_MODE = os.environ.get('AGENT_MODE', 'stack')
# Defence rotation after a contact: '1' (default) rotates the squad to the
# threatened site, '0' keeps the starting layout for the whole round.
DEF_ROTATE = os.environ.get('AGENT_NOROTATE', '0') != '1'

# positions used when the whole squad rotates onto the threatened site
DEF_HOLD = {
    'A': [(ctr((9, 5)), ctr((9, 16))), (ctr((9, 8)), ctr((9, 16))),
          (ctr((6, 4)), ctr((7, 14))), (ctr((10, 7)), ctr((10, 16))),
          (ctr((12, 6)), ctr((11, 14)))],
    'B': [(ctr((30, 5)), ctr((30, 16))), (ctr((30, 8)), ctr((30, 16))),
          (ctr((33, 4)), ctr((32, 14))), (ctr((29, 7)), ctr((29, 16))),
          (ctr((27, 6)), ctr((28, 14)))],
}
DEF_ANCHOR = {
    'split': [(ctr((9, 5)), ctr((9, 15))), (ctr((6, 4)), ctr((7, 14))),
              (ctr((30, 5)), ctr((30, 15))), (ctr((33, 4)), ctr((32, 14))),
              (ctr((19, 9)), ctr((19, 17)))],
}



class Agent:
    def __init__(self):
        self.grid = None
        self.round = -1
        self.side = None
        self.site = 'A'
        self.plan = {}
        self.last_state = None
        self.contacts = []
        self.seen_event_id = 0
        self.last_pos = {}
        self.stuck = {}
        self.def_style = 'split'
        self.atk_style = 'stack'
        self.round_first_live = True
        self.threat = None

    # ---------------- buying ----------------
    def buy(self, obs):
        out = []
        side = obs.get('side', 'attack')
        for u in obs.get('units', []):
            money = u.get('money', 0)
            cur = u.get('weapon', 'pistol')
            armor = u.get('armor', 0)
            p = {'unit': u['index']}
            spent = 0
            AR, RIF, SMG = 650, 2700, 1250
            # Attack economy: the middle round of an attack half (2 or 5) is
            # the only chance to save for a real rifle round on the last
            # attack round.  A 2050-dollar "force" buys smg+armor and then
            # dies to rifles at long range (round 1: 0 kills in both smg
            # rounds), while full-saving reaches ~3950 and affords
            # rifle+armor on round 3/6.
            if ECO and side == 'attack' and obs.get('round') in (2, 5):
                has_gun = cur in ('rifle', 'sniper', 'lmg')
                need = (0 if has_gun else RIF) + (0 if armor >= 100 else AR)
                if money < need:
                    continue
            if cur in ('pistol', 'pdw', 'shotgun'):
                if money >= RIF:
                    p['weapon'] = 'rifle'; spent = RIF
                elif money >= SMG:
                    p['weapon'] = 'smg'; spent = SMG
            elif cur in ('smg', 'sniper', 'lmg'):
                if cur == 'smg' and money >= RIF + AR:
                    p['weapon'] = 'rifle'; spent = RIF
            left = money - spent
            if armor < 100 and left >= AR:
                p['armor'] = True; left -= AR
            if side == 'defend' and left >= 400 and u['index'] in (0, 1) and not u.get('kit'):
                p['kit'] = True
            if 'weapon' in p or p.get('armor') or p.get('kit'):
                out.append(p)
        return {'buys': out}

    # ---------------- planning ----------------
    def new_round(self, obs):
        self.grid = Grid(obs['map']['tiles'], obs['map'].get('width', 40), obs['map'].get('height', 24))
        self.round = obs['round']
        self.side = obs['side']
        self.contacts = []
        self.last_state = None
        self.plan = {}
        self.last_pos = {}
        self.stuck = {}
        self.round_first_live = True
        self.threat = None
        r = obs['round']
        # pseudo-random but reproducible site choice from the server seed
        sd = int(obs.get('seed', 1) or 1)
        if SITE_MODE == 'A':
            self.site = 'A'
        elif SITE_MODE == 'B':
            self.site = 'B'
        elif SITE_MODE == 'alt':
            self.site = 'A' if r % 2 == 1 else 'B'
        else:
            self.site = 'A' if ((sd * 1103515245 + r * 12345) >> 8) % 2 == 0 else 'B'
        if os.environ.get('AGENT_DEBUG'):
            sys.stderr.write('round %s side %s site %s mode %s\n' % (r, self.side, self.site, SITE_MODE))
        if self.side == 'defend':
            self.def_style = 'split'
            self.atk_style = 'stack'
        else:
            self.atk_style = ATK_STYLE

    def build_plan(self, obs):
        side = obs['side']
        bomb = obs.get('bomb') or {}
        state = bomb.get('state')
        units = {u['index']: u for u in obs['units']}
        alive = [i for i in sorted(units) if units[i].get('alive')]

        self.plan = {}
        if side == 'attack':
            if state == 'planted':
                site = bomb.get('site') or self.site
                src = ATK_POST if ATK_POST_STYLE == 'new' else POST
                arr = src.get(site, src['A'])
                # With fewer than five survivors, keep the two positions that
                # matter most in a retake: the bomb guard (index 4) and the
                # north watcher (index 3).  Plain index order dropped both
                # when only three attackers survived, leaving the bomb
                # uncovered on the side the defenders can flank from.
                order = list(range(len(arr)))
                if ATK_POST_STYLE == 'new' and len(alive) < len(arr):
                    order = [k for k in (4, 3, 0, 2, 1) if k < len(arr)]
                for slot, i in enumerate(alive):
                    pos, look = arr[order[slot % len(order)]]
                    self.plan[i] = {'q': [pos], 'look': look, 'mode': 'hold'}
            elif state == 'dropped':
                bx, by = bomb.get('x'), bomb.get('y')
                if bx is None:
                    bx, by = PLANT[self.site]
                best, bd = None, 1e9
                for i in alive:
                    u = units[i]
                    d = math.hypot(u['x'] - bx, u['y'] - by)
                    if d < bd:
                        bd, best = d, i
                for i in alive:
                    if i == best:
                        self.plan[i] = {'q': [ctr((bx, by)), PLANT[self.site]],
                                        'look': None, 'look_dir': 'U', 'mode': 'plant'}
                    else:
                        self._push_plan(i, units)
            else:
                carrier = 0
                cid = bomb.get('carrier')
                if cid:
                    try:
                        carrier = int(str(cid)[-1])
                    except Exception:
                        carrier = 0
                if carrier not in alive:
                    carrier = alive[0] if alive else 0
                if self.atk_style in ('wide', 'wide2', 'wide3', 'wide4'):
                    routes = (WIDE2_LANE if self.atk_style == 'wide2' else WIDE_LANE)[self.site]
                    looks = WIDE_HOLD_LOOK[self.site]
                    main_units, decoy_units = self._split_attack(alive, carrier)
                    trail = set(self._trail_units(alive, carrier))
                    lane_order = None
                    if self.atk_style in ('wide3', 'wide4'):
                        lane_order = sorted(range(len(routes)), key=lambda k: routes[k][0][0])
                        if self.site == 'B':
                            lane_order.reverse()
                    others = [k for k in sorted(main_units) if k != carrier]
                    for pos_i, i in enumerate(sorted(main_units)):
                        if self.atk_style == 'wide4':
                            if i == carrier:
                                j = lane_order[-1]
                            else:
                                j = lane_order[others.index(i) % (len(lane_order) - 1)]
                        elif lane_order is not None:
                            j = lane_order[pos_i % len(lane_order)]
                        else:
                            j = 0 if i == carrier else i % len(routes)
                        route = routes[j]
                        hold = looks[j]
                        if i == carrier and CARRIER_SAFE and self.atk_style == 'wide':
                            # WIDE2_LANE[site][0] is the shadowed corridor: it
                            # crosses only ~4 tiles of the exposed bottom band
                            # before turning north, instead of the 8-15 tiles
                            # the fast wide lanes spend in the long sight line.
                            route = WIDE2_LANE[self.site][0]
                            hold = looks[0]
                        p = {'q': self._route(i, units, route),
                             'look': None, 'look_dir': 'U',
                             'hold_look': hold,
                             'mode': 'plant' if i == carrier else 'push'}
                        if i in trail:
                            # Stage in the shadow of the centre cover block and
                            # follow ~1.6 s later, after the defence is engaged.
                            u = units.get(i) or {}
                            px, py = u.get('x', 20.5), u.get('y', 21.5)
                            pocket = (20.5 if px > 19.5 else 19.5, 21.5)
                            p['q'] = [pocket] + p['q']
                            p['wait_until'] = 32
                            p['wait_at'] = pocket
                        self.plan[i] = p
                    if decoy_units:
                        osite = 'B' if self.site == 'A' else 'A'
                        oroutes = WIDE_LANE[osite]
                        olooks = WIDE_HOLD_LOOK[osite]
                        for i in decoy_units:
                            j = i % len(oroutes)
                            self.plan[i] = {'q': self._route(i, units, oroutes[j]),
                                            'look': None, 'look_dir': 'U',
                                            'hold_look': olooks[j],
                                            'mode': 'push'}
                else:
                    for i in alive:
                        if i == carrier:
                            self.plan[i] = {'q': self._route(i, units, LANE[self.site]),
                                            'look': None, 'look_dir': 'U', 'mode': 'plant'}
                        else:
                            self._push_plan(i, units)
        else:
            if state == 'planted':
                bx, by = bomb.get('x'), bomb.get('y')
                if bx is None:
                    bx, by = PLANT[self.site]
                near, nd = None, 1e9
                for i in alive:
                    u = units[i]
                    d = math.hypot(u['x'] - bx, u['y'] - by)
                    if d < nd:
                        nd, near = d, i
                covers = RETAKE[self.site]
                ci = 0
                for i in alive:
                    if i == near:
                        self.plan[i] = {'q': [ctr((bx, by))], 'look': None, 'mode': 'defuse'}
                    else:
                        pos, look = covers[ci % len(covers)]
                        ci += 1
                        self.plan[i] = {'q': [pos], 'look': look, 'mode': 'hold'}
            else:
                if self.def_style == 'A':
                    arr = DEF_STACK_A
                elif self.def_style == 'B':
                    arr = DEF_STACK_B
                elif self.threat and DEF_ROTATE:
                    arr = DEF_HOLD[self.threat]
                else:
                    arr = DEF_LAYOUTS.get(VARIANT, DEF_SPLIT)
                # greedy nearest-position assignment so units do not cross over
                free = list(arr)
                order = []
                for i in alive:
                    u = units[i]
                    order.append((min(math.hypot(u['x'] - p[0], u['y'] - p[1]) for p, _ in free), i))
                order.sort()
                used = set()
                for _, i in order:
                    u = units[i]
                    bi, bd = None, 1e9
                    for k, (pos, look) in enumerate(arr):
                        if k in used:
                            continue
                        d = math.hypot(u['x'] - pos[0], u['y'] - pos[1])
                        if d < bd:
                            bd, bi = d, k
                    if bi is None:
                        continue
                    used.add(bi)
                    pos, look = arr[bi]
                    self.plan[i] = {'q': [pos], 'look': look, 'mode': 'hold'}
                if os.environ.get('AGENT_DEBUG'):
                    sys.stderr.write('plan r%s threat=%s: %s\n' % (
                        self.round, self.threat,
                        ' '.join('u%d->(%.0f,%.0f)' % (i, self.plan[i]['q'][0][0], self.plan[i]['q'][0][1])
                                 for i in sorted(self.plan))))

    def _route(self, i, units, route):
        """Drop waypoints the unit has already passed, so a mid-route replan
        never sends it back to the start of the lane.

        The old implementation picked the globally nearest waypoint.  When a
        unit sits between two waypoints but slightly closer to the one behind
        it, a death-triggered replan sent it backwards (up to ~2 tiles, ~0.7 s)
        before it resumed.  Project onto the route segments instead: the unit
        follows the polyline, so the next waypoint is the end of the segment it
        is currently on."""
        u = units.get(i) or {}
        x, y = u.get('x', 0.0), u.get('y', 0.0)
        if len(route) <= 1:
            return list(route)
        best_j, best_d = 0, float('inf')
        for j in range(len(route) - 1):
            ax, ay = route[j]
            bx, by = route[j + 1]
            vx, vy = bx - ax, by - ay
            L2 = vx * vx + vy * vy
            if L2 <= 1e-12:
                t = 0.0
            else:
                t = ((x - ax) * vx + (y - ay) * vy) / L2
                t = max(0.0, min(1.0, t))
            px, py = ax + vx * t, ay + vy * t
            d = math.hypot(x - px, y - py)
            if d < best_d:
                best_j, best_d = j, d
        nxt = list(route[best_j + 1:])
        return nxt if nxt else [route[-1]]

    def _split_attack(self, alive, carrier):
        """Return (main_units, decoy_units).

        Decoys are the easternmost survivors other than the carrier: they are
        closest to a mirrored B site, and keeping the carrier in the main body
        is essential because a dead carrier drops the bomb in the open.
        """
        n_dec = 0
        if ATK_MODE.startswith('feint'):
            try:
                n_dec = int(ATK_MODE[len('feint'):] or '2')
            except ValueError:
                n_dec = 2
        if n_dec <= 0:
            return list(alive), []
        others = [i for i in alive if i != carrier]
        decoys = others[-n_dec:] if n_dec <= len(others) else list(others)
        main = [i for i in alive if i not in decoys]
        return main, decoys

    def _trail_units(self, alive, carrier):
        """Units that stage in the centre shadow and follow late ('trailN')."""
        if not ATK_MODE.startswith('trail'):
            return []
        try:
            n = int(ATK_MODE[len('trail'):] or '2')
        except ValueError:
            n = 2
        others = [i for i in alive if i != carrier]
        return others[-n:] if n <= len(others) else list(others)

    def _push_plan(self, i, units):
        if self.atk_style in ('wide', 'wide2', 'wide3'):
            lanes = WIDE2_LANE if self.atk_style == 'wide2' else WIDE_LANE
            j = i % len(lanes[self.site])
            self.plan[i] = {'q': self._route(i, units, lanes[self.site][j]),
                            'look': None, 'look_dir': 'U',
                            'hold_look': WIDE_HOLD_LOOK[self.site][j],
                            'mode': 'push'}
            return
        route = (FLANK if (self.atk_style != 'stack' and i in (3, 4)) else LANE)[self.site]
        self.plan[i] = {'q': self._route(i, units, route), 'look': None,
                        'look_dir': 'U', 'mode': 'push'}

    # ---------------- main control ----------------
    def window(self, obs):
        if obs.get('phase') != 'live':
            return self.neutral_window()
        if self.round != obs.get('round') or self.side != obs.get('side'):
            self.new_round(obs)
        side = obs['side']
        bomb = obs.get('bomb') or {}
        state = bomb.get('state')
        if side == 'defend':
            self._update_threat(obs)
        # rebuild whenever the situation *or* the surviving squad changes:
        # roles (bomb carrier, defuser, who goes for a dropped bomb) depend on
        # who is alive, so a death must re-assign them.
        alive_key = tuple(sorted(u['index'] for u in obs.get('units', []) if u.get('alive')))
        bkey = (state, round(bomb.get('x') or -1, 1), round(bomb.get('y') or -1, 1),
                str(bomb.get('carrier')))
        key = (self.round, side, state, self.site, self.threat, alive_key, bkey)
        if self.last_state != key:
            self.build_plan(obs)
            self.last_state = key

        # ---- contact book from events (own shot impacts / deaths) ----
        self._absorb_events(obs)
        # ---- contact book from pooled vision ----
        vis = obs.get('visibleEnemies') or {}
        pooled = []
        for u in obs['units']:
            if not u.get('alive'):
                continue
            for e in vis.get(u['id'], []) or []:
                pooled.append((e['x'], e['y'], 0))
        if pooled:
            self.contacts = pooled
        else:
            self.contacts = [(x, y, t + 1) for (x, y, t) in self.contacts if t + 1 <= 3]

        grid = self.grid
        units = obs['units']
        pos = {u['index']: [u['x'], u['y']] for u in units}

        # stuck detection (based on real observation, once per window)
        for u in units:
            i = u['index']
            lp = self.last_pos.get(i)
            if lp is not None and u.get('alive'):
                if math.hypot(u['x'] - lp[0], u['y'] - lp[1]) < 0.25:
                    self.stuck[i] = self.stuck.get(i, 0) + 1
                else:
                    self.stuck[i] = 0
            self.last_pos[i] = (u['x'], u['y'])
        for i, n in self.stuck.items():
            p = self.plan.get(i)
            if n >= 2 and p and p['q'] and len(p['q']) > 1:
                p['q'].pop(0)
                self.stuck[i] = 0

        frames = []
        by_idx = {u['index']: u for u in units}
        for f in range(20):
            frame = []
            for idx in range(5):
                u = by_idx.get(idx)
                if u is None or not u.get('alive'):
                    frame.append({'dir': 'N', 'aim': 'N'})
                    continue
                x, y = pos[idx]
                p = self.plan.get(idx)
                seen = vis.get(u['id'], []) or []
                aimv = None
                if seen:
                    n, nd = None, 1e9
                    for e in seen:
                        d = math.hypot(e['x'] - x, e['y'] - y)
                        if d < nd:
                            nd, n = d, (e['x'], e['y'])
                    aimv = (n[0] - x, n[1] - y)
                elif self.contacts:
                    n, nd = None, 1e9
                    for (cx, cy, age) in self.contacts:
                        d = math.hypot(cx - x, cy - y)
                        if d < nd:
                            nd, n = d, (cx, cy)
                    if nd <= 14:
                        aimv = (n[0] - x, n[1] - y)

                d = 'N'
                holding = False
                nxt = None
                waiting = False
                if p and p.get('wait_until', -1) > (obs.get('frame') or 0) and p.get('wait_at'):
                    wat = p['wait_at']
                    if math.hypot(x - wat[0], y - wat[1]) < 0.8:
                        waiting = True
                if p and not waiting:
                    q = p['q']
                    rfin = 0.30 if (p['mode'] in ('plant', 'defuse') and len(q) == 1) else 0.55
                    while q and math.hypot(q[0][0] - x, q[0][1] - y) < rfin:
                        q.pop(0)
                    if q:
                        nxt = self._next_point(x, y, q)
                        if nxt:
                            d = dir_to(nxt[0] - x, nxt[1] - y)
                            if aimv is None and p.get('look'):
                                aimv = (p['look'][0] - x, p['look'][1] - y)
                            if aimv is None and p.get('look_dir'):
                                aimv = DIR_VEC[p['look_dir']]
                            if aimv is None:
                                aimv = (nxt[0] - x, nxt[1] - y)
                    else:
                        holding = True
                if holding or not p:
                    if aimv is None and p and p.get('look'):
                        aimv = (p['look'][0] - x, p['look'][1] - y)
                    if aimv is None and p and p.get('hold_look'):
                        aimv = (p['hold_look'][0] - x, p['hold_look'][1] - y)
                    if aimv is None and p and p.get('look_dir'):
                        aimv = DIR_VEC[p['look_dir']]
                if waiting:
                    nxt = None
                    d = 'N'
                    if aimv is None and p.get('hold_look'):
                        aimv = (p['hold_look'][0] - x, p['hold_look'][1] - y)
                    if aimv is None and p.get('look_dir'):
                        aimv = DIR_VEC[p['look_dir']]
                aim = dir_to(aimv[0], aimv[1]) if aimv else 'N'
                if os.environ.get('AGENT_DEBUG') and f == 0 and u.get('alive'):
                    sys.stderr.write('  %s r%s u%d pos=(%.2f,%.2f) q=%s nxt=%s d=%s aim=%s\n' % (
                        side[0], self.round, idx, x, y,
                        ['(%.1f,%.1f)' % t for t in (p['q'] if p else [])],
                        '(%.1f,%.1f)' % nxt if nxt else None, d, aim))
                if nxt:
                    d, nx, ny = self._move(x, y, d, nxt[0], nxt[1])
                else:
                    d, nx, ny = d, x, y
                pos[idx] = [nx, ny]
                frame.append({'dir': d, 'aim': aim})
            frames.append(frame)
        return {'inputs': frames}

    def _better_look(self, p, x, y, aimv):
        """when holding, prefer the role look direction if nothing is close"""
        return True

    def _move(self, x, y, d, tx, ty):
        """One frame of movement towards (tx,ty).  Returns (dir, x, y).

        If the dominant axis is blocked by a wall corner, slide along it:
        pick the alternative direction with a positive dot product that gets
        closest to the waypoint.  Sending the corrected dir (not just using it
        for the local prediction) is what actually unsticks a cornered unit."""
        nx, ny = self.grid.step(x, y, d)
        if math.hypot(nx - x, ny - y) >= FRAME_STEP * 0.5:
            return d, nx, ny
        vx, vy = DIR_VEC[d]
        best, bd = (d, nx, ny), math.hypot(tx - nx, ty - ny)
        for alt in CARD:
            ax, ay = DIR_VEC[alt]
            if ax * vx + ay * vy <= 1e-9:
                continue
            px, py = self.grid.step(x, y, alt)
            if math.hypot(px - x, py - y) < 1e-6:
                continue
            dd = math.hypot(tx - px, ty - py)
            if dd < bd - 1e-6:
                best, bd = (alt, px, py), dd
        return best

    def _next_point(self, x, y, q):
        grid = self.grid
        tgt = q[0]
        if grid.wall(int(math.floor(tgt[0])), int(math.floor(tgt[1]))):
            q.pop(0)
            return self._next_point(x, y, q) if q else None
        path = grid.astar(x, y, tgt[0], tgt[1])
        if not path:
            q.pop(0)
            return self._next_point(x, y, q) if q else None
        k = 0
        for j in range(len(path) - 1, -1, -1):
            if grid.clear(x, y, path[j][0], path[j][1]):
                k = j
                break
        return path[k]

    def _update_threat(self, obs):
        if self.threat:
            return
        cand = [c for c in self.contacts if c[2] <= 2]
        if not cand:
            return
        best, bd = None, 1e9
        for (x, y, age) in cand:
            d = math.hypot(x - 19.5, y - 15.0)
            if d < bd:
                bd, best = d, (x, y)
        if best is None:
            return
        da = math.hypot(best[0] - 7.5, best[1] - 5.5)
        db = math.hypot(best[0] - 32.5, best[1] - 5.5)
        if min(da, db) <= 22:
            self.threat = 'A' if da <= db else 'B'
            if os.environ.get('AGENT_DEBUG'):
                sys.stderr.write('threat=%s contact=(%.1f,%.1f) round=%s\n' % (self.threat, best[0], best[1], self.round))

    def _absorb_events(self, obs):
        evs = obs.get('events') or []
        side = obs['side']
        for e in evs:
            eid = e.get('id', 0)
            if eid <= self.seen_event_id:
                continue
            self.seen_event_id = eid
            if e.get('type') == 'shot' and e.get('owner') == obs.get('yourTeam'):
                to = e.get('to')
                if to:
                    self.contacts.append((to['x'], to['y'], 0))

    def neutral_window(self):
        fr = [{'dir': 'N', 'aim': 'N'} for _ in range(5)]
        return {'inputs': [list(fr) for _ in range(20)]}


# ----------------------------------------------------------- wire protocol
# The published protocol (RULES.md/GAME.md) is a bare JSON observation in and a
# bare JSON action out.  Round 1 of this competition died with "Invalid response
# envelope" on BOTH seats before a single decision window, which strongly hints
# that the real judge frames messages in an envelope and validates the reply
# shape.  The exact schema is not public, so this adapter is deliberately
# generous:
#   * a bare observation is answered with a flat action that ALSO carries the
#     action under every common envelope key and a type marker;
#   * an enveloped observation is located by a generic tree search (any depth,
#     any key name), answered, and the reply mirrors the envelope while also
#     carrying the action under all common alias keys.
# Extra keys are ignored by the documented server-side parsers (they read
# resp["buys"] / resp["inputs"]), so this is safe for the bare protocol too.
_ENV_OBS_KEYS = ('observation', 'obs', 'view', 'state', 'data', 'payload',
                 'request', 'query', 'message', 'body', 'content', 'info',
                 'game', 'snapshot', 'frame', 'input', 'step', 'params')
_RESP_KEY = {
    'observation': 'action', 'obs': 'action', 'view': 'action',
    'state': 'action', 'request': 'response', 'query': 'response',
    'input': 'action', 'params': 'action',
}
_TYPE_MAP = {
    'observation': 'action', 'observe': 'action', 'obs': 'action',
    'view': 'action', 'state': 'action', 'input': 'action', 'step': 'action',
    'request': 'response', 'query': 'response',
}
# Keys under which a judge might look for our action.  We put the same object
# in all of them; a lenient reader picks whichever it wants.
_ALIAS_KEYS = ('action', 'response', 'result', 'data', 'payload', 'output',
               'answer', 'reply', 'body', 'content', 'act')


def _looks_like_obs(o):
    if not isinstance(o, dict):
        return False
    if 'phase' in o:
        return True
    # judges that omit phase on the buy frame still send units + map/buy info
    return (isinstance(o.get('units'), list)
            and ('visibleEnemies' in o or 'map' in o or 'side' in o))


def _find_obs(obj, depth=0):
    """Return (observation, key_path).  key_path == [] means bare observation.

    Generic tree search: first the well-known envelope key names (so a nested
    {"payload":{"observation":...}} is preferred over an unrelated subtree),
    then any other key, then list elements.  Depth-limited to stay cheap.
    """
    if depth > 6:
        return None, None
    if _looks_like_obs(obj):
        return obj, []
    if isinstance(obj, dict):
        for k in _ENV_OBS_KEYS:
            v = obj.get(k)
            if isinstance(v, (dict, list)):
                obs, sub = _find_obs(v, depth + 1)
                if obs is not None:
                    return obs, [k] + sub
        for k, v in obj.items():
            if k in _ENV_OBS_KEYS:
                continue
            if isinstance(v, (dict, list)):
                obs, sub = _find_obs(v, depth + 1)
                if obs is not None:
                    return obs, [k] + sub
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            if _looks_like_obs(v):
                return v, [i]
            if isinstance(v, (dict, list)):
                obs, sub = _find_obs(v, depth + 1)
                if obs is not None:
                    return obs, [i] + sub
    return None, None


def _flip_marker(out):
    for mk in ('type', 'kind', 'event', 'msgType', 'msg_type', 'op'):
        v = out.get(mk)
        if not isinstance(v, str):
            continue
        lv = v.lower()
        for a, b in _TYPE_MAP.items():
            if lv == a or lv.endswith('.' + a) or lv.endswith('/' + a):
                out[mk] = v[:len(v) - len(a)] + b
                break
            if lv == a + 's' or lv.endswith('.' + a + 's') or lv.endswith('/' + a + 's'):
                out[mk] = v[:len(v) - len(a) - 1] + b
                break


def _add_aliases(d, action):
    for k in _ALIAS_KEYS:
        if k not in d:
            d[k] = action


def _wrap_action(template, path, action):
    """Put `action` back into an envelope shaped like `template`."""
    try:
        out = json.loads(json.dumps(template))
        cur = out
        for k in path[:-1]:
            cur = cur[k]
        old_key = path[-1]
        if isinstance(cur, dict):
            new_key = _RESP_KEY.get(old_key, old_key)
            cur[new_key] = action
            if new_key != old_key:
                cur.pop(old_key, None)
            _add_aliases(cur, action)
        elif isinstance(cur, list):
            cur[old_key] = action
        _flip_marker(out)
        _add_aliases(out, action)
        if out.get('type') is None:
            out['type'] = 'action'
        if out.get('kind') is None:
            out['kind'] = 'action'
        return out
    except Exception:
        # never let envelope rebuilding cost the turn
        return action


def _bare_reply(action):
    """Flat action plus alias/type markers (documented parsers read the flat
    fields and ignore the rest)."""
    out = {}
    out.update(action)
    out['type'] = 'action'
    out['kind'] = 'action'
    _add_aliases(out, action)
    return out


def _ack_reply(msg, neutral):
    """Reply to a message we cannot identify as an observation.

    Covers the (unlikely but fatal) case of a startup/ready handshake: an
    acknowledgement is included together with a neutral action, so either
    reading of the message is satisfied.
    """
    try:
        if isinstance(msg, dict):
            out = json.loads(json.dumps(msg))
            out['ok'] = True
            out['status'] = 'ok'
            out['ready'] = True
            out['type'] = 'action'
            out['kind'] = 'action'
            _add_aliases(out, neutral)
            out.update(neutral)
            return out
    except Exception:
        pass
    return _bare_reply(neutral)


def main():
    ag = Agent()
    out = sys.stdout
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            # never desync the request/response stream: one line in, one out
            out.write(json.dumps(_bare_reply(ag.neutral_window()),
                                 separators=(',', ':')) + '\n')
            out.flush()
            continue
        resp = None
        obs, path = None, None
        try:
            obs, path = _find_obs(msg)
            if obs is None:
                resp = _ack_reply(msg, ag.neutral_window())
            else:
                phase = obs.get('phase')
                if phase is None and isinstance(obs.get('units'), list) and (
                        'buy' in obs or 'buyable' in obs):
                    phase = 'buy'  # judge omits phase on the buy frame
                if phase is None and 'visibleEnemies' in obs:
                    phase = 'live'
                if phase == 'buy':
                    action = ag.buy(obs)
                elif phase == 'live':
                    action = ag.window(obs)
                else:
                    action = ag.neutral_window()
                resp = _wrap_action(msg, path, action) if path else _bare_reply(action)
        except Exception as e:
            try:
                sys.stderr.write('ERR %r\n' % (e,))
                sys.stderr.flush()
            except Exception:
                pass
            try:
                phase = obs.get('phase') if isinstance(obs, dict) else None
            except Exception:
                phase = None
            fallback = ag.neutral_window() if phase == 'live' else {'buys': []}
            try:
                resp = _wrap_action(msg, path, fallback) if path else _bare_reply(fallback)
            except Exception:
                resp = fallback
        out.write(json.dumps(resp, separators=(',', ':')) + '\n')
        out.flush()


if __name__ == '__main__':
    main()
