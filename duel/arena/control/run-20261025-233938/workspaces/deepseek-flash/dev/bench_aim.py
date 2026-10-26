#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Offline aim benchmark on recorded games.

For every shot actually fired in a recorded match we know the opponent's real
future trajectory (from the exact replay).  The bullet field does not depend on
the players, so for *any* candidate aim direction we can compute exactly how
close that bullet would have come to the opponent's real path.  This gives a
low-variance measure of aim quality against a strong, evasive opponent without
running a whole match per candidate.

Caveat: the recorded opponent was dodging the *original* bullets, not the
counterfactual one, so this is a proxy, not a closed-loop result.
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

import agent as agentmod

AIM_KEYS = ('U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR')


def bullet_min_dist(px, py, ux, uy, opp_pos, max_frames=400):
    """min distance from a bullet fired at (px,py) along (ux,uy) to the
    opponent's real path (opp_pos[f] = (x,y) at fire_frame + f)."""
    bx = px + ux * SPAWN_OFF
    by = py + uy * SPAWN_OFF
    if tile_at(bx, by):
        return None
    vx = ux * 8.5
    vy = uy * 8.5
    best = 1e9
    n = min(max_frames, len(opp_pos))
    for f in range(n):
        bx, by, vx, vy = advance_bullet(bx, by, vx, vy, 1)
        ox, oy = opp_pos[f]
        if f + 1 < n:
            nx, ny = opp_pos[f + 1]
        else:
            nx, ny = ox, oy
        for s in (0.0, 0.5, 1.0):
            d = math.hypot(ox + (nx - ox) * s - bx, oy + (ny - oy) * s - by)
            if d < best:
                best = d
                if best < 0.05:
                    return best
    return best


def main():
    path = sys.argv[1]
    max_games = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    agg = {k: [] for k in AIM_KEYS}
    chosen = []
    oracle = []
    chosen_dir = []
    rows = []
    for seed, wins, snaps in replay.load_dump(path, max_games):
        m = replay.Match(seed, wins).run()
        print('game seed=%s frames=%s winner=%s death=%s' %
              (seed, m.frame, m.winner, m.death_frame), file=sys.stderr)
        # per-owner fire events with the shooter's position
        for (frame, owner, sx, sy, ux, uy, bid) in m.fires:
            f0 = frame  # bullet path starts at frame index frame (bullet at index frame+1)
            remain = len(m.frames) - f0
            if remain < 30:
                continue
            opp = 1 - owner
            opp_pos = [(m.frames[f]['px'][opp], m.frames[f]['py'][opp])
                       for f in range(f0, min(len(m.frames), f0 + 400))]
            if not opp_pos:
                continue
            vals = {}
            for dk in AIM_KEYS:
                dx, dy = DIRV[dk]
                r = bullet_min_dist(sx, sy, dx, dy, opp_pos)
                vals[dk] = r if r is not None else 99.0
                agg[dk].append(vals[dk])
            # the direction that was actually fired
            adir = None
            for dk in AIM_KEYS:
                dx, dy = DIRV[dk]
                if abs(dx - ux) < 1e-6 and abs(dy - uy) < 1e-6:
                    adir = dk
            if adir is None:
                continue
            chosen.append(vals[adir])
            oracle.append(min(vals.values()))
            chosen_dir.append(adir)
            rows.append({'seed': seed, 'frame': frame, 'owner': owner,
                         'sx': sx, 'sy': sy, 'vals': vals, 'chosen': adir})
    n = len(chosen)
    if not n:
        print('no shots')
        return
    def pct(a, t):
        return 100.0 * sum(1 for v in a if v < t) / len(a)
    print('shots=%d' % n)
    print('chosen: mean=%.3f median=%.3f  <1.5=%.1f%% <1.0=%.1f%% hit=%.1f%%' % (
        sum(chosen) / n, sorted(chosen)[n // 2], pct(chosen, 1.5), pct(chosen, 1.0), pct(chosen, HIT_R)))
    print('oracle: mean=%.3f median=%.3f  <1.5=%.1f%% <1.0=%.1f%% hit=%.1f%%' % (
        sum(oracle) / n, sorted(oracle)[n // 2], pct(oracle, 1.5), pct(oracle, 1.0), pct(oracle, HIT_R)))
    for dk in AIM_KEYS:
        a = agg[dk]
        print('  dir %-2s: mean=%.3f median=%.3f <1.5=%.1f%% <1.0=%.1f%%' % (
            dk, sum(a) / len(a), sorted(a)[len(a) // 2], pct(a, 1.5), pct(a, 1.0)))
    print('chosen dir histogram:', {k: chosen_dir.count(k) for k in AIM_KEYS})
    with open(os.path.join(os.path.dirname(path), 'aim_events.json'), 'w') as fh:
        json.dump(rows, fh)


if __name__ == '__main__':
    main()
