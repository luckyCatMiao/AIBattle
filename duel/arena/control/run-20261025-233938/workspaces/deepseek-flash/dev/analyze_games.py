#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Exact per-frame analysis of recorded duel games (r1/r2/r3).

Usage: python -I dev/analyze_games.py <game.json.gz> [...]
"""
import gzip
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from replay import Match, HIT_R, W, H

DT = 0.05


def load(path):
    with gzip.open(path, 'rt', encoding='utf-8') as fh:
        return json.load(fh)


def pct(vals, p):
    if not vals:
        return 0.0
    s = sorted(vals)
    k = min(len(s) - 1, max(0, int(round((p / 100.0) * (len(s) - 1)))))
    return s[k]


def analyze(path):
    d = load(path)
    seats = d['seats']
    our = seats.index('deepseek-flash')
    opp = 1 - our
    wins = [(w['frame'], {'inputs': w['inputs'][0]}, {'inputs': w['inputs'][1]})
            for w in d['windows']]
    m = Match(d['seed'], wins).run()
    last = d['frames'][-1]['frame']
    F = m.frames[:last + 1]
    n = len(F)

    # verify
    worst = 0.0
    bad = 0
    for sn in d['frames']:
        fr = sn['frame']
        if fr >= n:
            continue
        st = F[fr]
        for i in (0, 1):
            worst = max(worst, abs(sn['players'][i]['x'] - st['px'][i]),
                        abs(sn['players'][i]['y'] - st['py'][i]))
            if sn['players'][i]['alive'] != st['alive'][i]:
                bad += 1
        if len(sn['bullets']) != len(st['bullets']):
            bad += 1

    # ---- shots
    fires = m.fires
    per_owner = {0: [], 1: []}
    for (fr, own, x, y, ux, uy, bid) in fires:
        per_owner[own].append((fr, bid, x, y, ux, uy))

    # interval stats
    def gaps(own):
        fs = [f[0] for f in per_owner[own]]
        return [b - a for a, b in zip(fs, fs[1:])]

    # ---- shot quality: distance from each bullet to the *other* player
    # build bullet id -> (owner, path)
    bpath = {}
    for fr, st in enumerate(F):
        for b in st['bullets']:
            bpath.setdefault(b[5], []).append((fr, b[0], b[1], b[4]))
    # need per-frame player pos
    pos = [(st['px'][0], st['py'][0], st['px'][1], st['py'][1]) for st in F]

    def shot_quality(own, horizon):
        vals = []
        for (fr, bid, x, y, ux, uy) in per_owner[own]:
            target = 1 - own
            best = 1e9
            for (f2, bx, by, bo) in bpath.get(bid, []):
                if f2 < fr or f2 > fr + horizon:
                    continue
                px, py = pos[f2][2 * target], pos[f2][2 * target + 1]
                best = min(best, math.hypot(bx - px, by - py))
            vals.append(best)
        return vals

    # ---- clearance per player per frame
    clear = [[], []]
    eps = {0: [], 1: []}
    minc = [1e9, 1e9]
    argminc = [None, None]
    under = {0: {1.0: 0, 1.5: 0, 2.0: 0, 3.0: 0}, 1: {1.0: 0, 1.5: 0, 2.0: 0, 3.0: 0}}
    for fr, st in enumerate(F):
        for i in (0, 1):
            px, py = st['px'][i], st['py'][i]
            best = 1e9
            bb = None
            for b in st['bullets']:
                if b[4] == i:
                    continue
                dd = math.hypot(px - b[0], py - b[1])
                if dd < best:
                    best, bb = dd, b
            if bb is None:
                continue
            c = best - HIT_R
            clear[i].append((c, fr, bb[4], bb[0], bb[1], bb[5]))
            if c < minc[i]:
                minc[i], argminc[i] = c, (fr, best, bb[4], bb[0], bb[1], bb[5])
            for t in under[i]:
                if best <= t:
                    under[i][t] += 1
    for i in (0, 1):
        for c, fr, own, bx, by, bid in clear[i]:
            if c < 1.0:
                if eps[i] and fr - eps[i][-1][1] <= 3:
                    eps[i][-1][1] = fr
                    eps[i][-1][2] = min(eps[i][-1][2], c)
                else:
                    eps[i].append([fr, fr, c])

    # ---- separation / wall
    sep = []
    wall = [[], []]
    for fr, st in enumerate(F):
        sep.append(math.hypot(st['px'][0] - st['px'][1], st['py'][0] - st['py'][1]))
        for i in (0, 1):
            x, y = st['px'][i], st['py'][i]
            wall[i].append(min(x, y, W - 1 - x, H - 1 - y))

    # frames separation < 1.46 with opponent cooldown <=6 (exact frames)
    close_ready = {0: 0, 1: 0}
    close_ready_frames = []
    for fr, st in enumerate(F):
        s = sep[fr]
        if s < 1.46:
            for i in (0, 1):
                # opponent's cooldown as seen by i
                ocd = st['cd'][1 - i]
                if ocd <= 6:
                    close_ready[i] += 1
            close_ready_frames.append((fr, round(s, 3)))

    # closest separation
    minsep = min(sep)
    minsep_fr = sep.index(minsep)

    # latency (train.py reports per-seat decision seconds)
    lat = [[], []]
    for w in d['windows']:
        for i in (0, 1):
            try:
                lat[i].append(float(w['seconds'][i]))
            except Exception:
                pass

    # safety metrics: consecutive exposure
    def episode_table(e):
        return [(a, b, round(c, 2)) for a, b, c in e]

    out = []
    A = out.append
    A('=== %s seed=%s seats=%s our=P%d' % (d['id'], d['seed'], seats, our))
    A('physics_frames=%d (0..%d) sim_seconds=%.2f windows=%d snapshots=%d'
      % (n - 1, n - 1, (n - 1) * DT, len(d['windows']), len(d['frames'])))
    A('verify worst_pos=%.6f mismatches=%d' % (worst, bad))
    A('result winner=%r reason=%r' % (d.get('winner'), d.get('reason')))
    A('shots our=%d opp=%d total=%d' % (len(per_owner[our]), len(per_owner[opp]), len(fires)))
    for i in (0, 1):
        g = gaps(i)
        fr0 = per_owner[i][0][0] if per_owner[i] else None
        A('  P%d %s first_fire_frame=%s gaps min/med/max=%d/%d/%d'
          % (i, 'OUR' if i == our else 'OPP', fr0, min(g), sorted(g)[len(g)//2], max(g)))
    for i in (0, 1):
        who = 'OUR' if i == our else 'OPP'
        ls = lat[i]
        A('  %s latency n=%d mean=%.1fms p95=%.1fms max=%.1fms'
          % (who, len(ls), 1000 * sum(ls) / len(ls), 1000 * pct(ls, 95), 1000 * max(ls)))
    for i in (0, 1):
        who = 'OUR' if i == our else 'OPP'
        A('[%s] min_clearance=%.4f frame=%d t=%.2fs bullet=%s owner=%d at (%.2f,%.2f)'
          % (who, minc[i], argminc[i][0], argminc[i][0] * DT, argminc[i][5],
             argminc[i][2], argminc[i][3], argminc[i][4]))
        A('[%s] frames any enemy bullet <=1.0/1.5/2.0/3.0: %d/%d/%d/%d (%.1f%%/%0.1f%%/%0.1f%%/%0.1f%%)'
          % (who, under[i][1.0], under[i][1.5], under[i][2.0], under[i][3.0],
             100 * under[i][1.0] / n, 100 * under[i][1.5] / n,
             100 * under[i][2.0] / n, 100 * under[i][3.0] / n))
        A('[%s] episodes clearance<1.0 count=%d frames=%d total=%s'
          % (who, len(eps[i]), sum(b - a + 1 for a, b, _ in eps[i]), episode_table(eps[i])))
        ws = wall[i]
        A('[%s] wall hug frac<2.2=%.3f frac<1.5=%.3f min=%.2f'
          % (who, sum(1 for v in ws if v < 2.2) / n,
             sum(1 for v in ws if v < 1.5) / n, min(ws)))
    A('separation min=%.2f at frame %d t=%.2fs; median=%.2f; frames<1.46=%d; '
      'frames<1.46 & opp_cd<=6: our=%d opp=%d %s'
      % (minsep, minsep_fr, minsep_fr * DT, sorted(sep)[len(sep)//2],
         sum(1 for v in sep if v < 1.46), close_ready[our], close_ready[opp],
         close_ready_frames[:20]))
    for i in (0, 1):
        who = 'OUR' if i == our else 'OPP'
        for hz, name in ((15, '0.75s'), (30, '1.5s'), (60, '3s'), (10 ** 9, 'life')):
            v = shot_quality(i, hz)
            A('[%s] shot min-dist %s: n=%d median=%.2f p10=%.2f min=%.2f <1.5=%d <1.0=%d'
              % (who, name, len(v), sorted(v)[len(v)//2], pct(v, 10), min(v),
                 sum(1 for x in v if x < 1.5), sum(1 for x in v if x < 1.0)))
    # nearest call details, frames around
    A('closest 3 calls for OUR and OPP (clearance, frame, t, bullet, owner):')
    for i in (0, 1):
        who = 'OUR' if i == our else 'OPP'
        best = sorted(clear[i])[:3]
        for c, fr, own, bx, by, bid in best:
            A('  %s clear=%.3f frame=%d t=%.2fs bullet=%s owner=P%d'
              % (who, c, fr, fr * DT, bid, own))
    return '\n'.join(out)


if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(analyze(p))
        print()
