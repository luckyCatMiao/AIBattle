#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Offline aim benchmark on recorded games (see bench_aim.py docstring).

Reports, per shot, how the *actually chosen* direction ranks among the 8 legal
directions by true closest approach to the opponent's recorded trajectory, at
several horizons (0.75 s / 1.5 s / 3 s / 20 s).  Rank is the fair comparison:
absolute distances are dominated by how close the two players happened to be.
"""
import json
import math
import os
import sys

_DEV = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_DEV))
sys.path.insert(0, _DEV)
import replay
from replay import DIRV, advance_bullet, tile_at, SPAWN_OFF, HIT_R

AIM_KEYS = ('U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR')
HORIZONS = (15, 30, 60, 400)


def bullet_dists(px, py, ux, uy, opp_pos):
    """min distance to the opponent's real path within each horizon."""
    bx = px + ux * SPAWN_OFF
    by = py + uy * SPAWN_OFF
    out = {}
    if tile_at(bx, by):
        return {h: 99.0 for h in HORIZONS}
    vx = ux * 8.5
    vy = uy * 8.5
    best = 1e9
    n = min(max(HORIZONS), len(opp_pos))
    for f in range(n):
        bx, by, vx, vy = advance_bullet(bx, by, vx, vy, 1)
        ox, oy = opp_pos[f]
        if f + 1 < len(opp_pos):
            nx, ny = opp_pos[f + 1]
        else:
            nx, ny = ox, oy
        for s in (0.0, 0.5, 1.0):
            d = math.hypot(ox + (nx - ox) * s - bx, oy + (ny - oy) * s - by)
            if d < best:
                best = d
        for h in HORIZONS:
            if f + 1 == h:
                out[h] = best
    for h in HORIZONS:
        out.setdefault(h, best)
    return out


def collect(path, max_games):
    shots = []
    for seed, wins, snaps in replay.load_dump(path, max_games):
        m = replay.Match(seed, wins).run()
        print('game seed=%s frames=%s winner=%s death=%s' %
              (seed, m.frame, m.winner, m.death_frame), file=sys.stderr)
        for (frame, owner, sx, sy, ux, uy, bid) in m.fires:
            if len(m.frames) - frame < 35:
                continue
            opp = 1 - owner
            opp_pos = [(m.frames[f]['px'][opp], m.frames[f]['py'][opp])
                       for f in range(frame, min(len(m.frames), frame + 400))]
            vals = {}
            for dk in AIM_KEYS:
                dx, dy = DIRV[dk]
                vals[dk] = bullet_dists(sx, sy, dx, dy, opp_pos)
            adir = None
            for dk in AIM_KEYS:
                dx, dy = DIRV[dk]
                if abs(dx - ux) < 1e-6 and abs(dy - uy) < 1e-6:
                    adir = dk
            if adir is None:
                continue
            shots.append({'seed': seed, 'frame': frame, 'owner': owner,
                          'sx': sx, 'sy': sy, 'ox': opp_pos[0][0], 'oy': opp_pos[0][1],
                          'vals': vals, 'chosen': adir})
    return shots


def summarize(shots, tag=''):
    n = len(shots)
    if not n:
        print('no shots')
        return
    print('=== %s shots=%d' % (tag, n))
    for h in HORIZONS:
        ranks = []
        chosen_v = []
        best_v = []
        rel = []
        for s in shots:
            a = {k: s['vals'][k][h] for k in AIM_KEYS}
            order = sorted(a, key=lambda k: a[k])
            ranks.append(order.index(s['chosen']) + 1)
            chosen_v.append(a[s['chosen']])
            best_v.append(a[order[0]])
            rel.append(a[s['chosen']] - sum(a.values()) / 8.0)
        ranks.sort()
        cr = {1: 0, 2: 0}
        for r in ranks:
            if r <= 2:
                cr[r] += 1
        print(' h=%3d frames: chosen rank mean=%.2f median=%d top1=%.1f%% top2=%.1f%% | '
              'chosen=%.2f best=%.2f mean(8)=%.2f delta=%+.2f' % (
                  h, sum(ranks) / n, ranks[n // 2], 100.0 * cr[1] / n,
                  100.0 * (cr[1] + cr[2]) / n,
                  sum(chosen_v) / n, sum(best_v) / n,
                  sum(chosen_v) / n - sum(rel) / n, sum(rel) / n))


if __name__ == '__main__':
    path = sys.argv[1]
    max_games = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    shots = collect(path, max_games)
    summarize(shots, os.path.basename(path))
    out = os.path.join(os.path.dirname(path), 'aim_shots.json')
    with open(out, 'w') as fh:
        json.dump(shots, fh)
    print('wrote', out)
