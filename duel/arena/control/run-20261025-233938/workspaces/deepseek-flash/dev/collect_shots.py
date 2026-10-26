#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Collect per-shot records (with opponent velocity) for offline aim analysis."""
import json, math, os, sys
_DEV = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_DEV)); sys.path.insert(0, _DEV)
import replay
from replay import DIRV, advance_bullet, tile_at, SPAWN_OFF
from bench_rank import bullet_dists, AIM_KEYS

def collect(path, max_games):
    shots = []
    for seed, wins, snaps in replay.load_dump(path, max_games):
        m = replay.Match(seed, wins).run()
        for (frame, owner, sx, sy, ux, uy, bid) in m.fires:
            if len(m.frames) - frame < 400:
                continue
            opp = 1 - owner
            f0 = frame
            ox, oy = m.frames[f0]['px'][opp], m.frames[f0]['py'][opp]
            f_prev = max(0, f0 - 3)
            vx = (ox - m.frames[f_prev]['px'][opp]) / (0.05 * (f0 - f_prev))
            vy = (oy - m.frames[f_prev]['py'][opp]) / (0.05 * (f0 - f_prev))
            opp_pos = [(m.frames[f]['px'][opp], m.frames[f]['py'][opp]) for f in range(f0, f0 + 400)]
            vals = {dk: bullet_dists(sx, sy, DIRV[dk][0], DIRV[dk][1], opp_pos) for dk in AIM_KEYS}
            adir = None
            for dk in AIM_KEYS:
                dx, dy = DIRV[dk]
                if abs(dx - ux) < 1e-6 and abs(dy - uy) < 1e-6:
                    adir = dk
            if adir is None:
                continue
            shots.append({'seed': seed, 'frame': frame, 'owner': owner,
                          'sx': sx, 'sy': sy, 'ox': ox, 'oy': oy,
                          'ovx': vx, 'ovy': vy, 'vals': vals, 'chosen': adir})
    return shots

if __name__ == '__main__':
    shots = collect(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 2)
    out = os.path.join(os.path.dirname(sys.argv[1]), 'shots2.json')
    json.dump(shots, open(out, 'w'))
    print('shots', len(shots), '->', out)
