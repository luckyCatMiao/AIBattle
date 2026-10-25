#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Detailed post-race report for saved racing replays.

Usage: python -I r2detail.py <replay.json.gz> [...]
Everything is derived from the replay alone (frames/windows/events/track).
"""
import gzip, json, math, sys

LAP_CP = 16

def load(path):
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        return json.load(f)

def pct(a, b):
    return 100.0 * a / b if b else 0.0

def unwrap_progress(cars, n):
    """Return per-car monotone progress using wrap/lap-glitch correction."""
    out = [[None] * n, [None] * n]
    for ci in range(2):
        P = None
        last = None
        for k in range(n):
            pr = cars[k][ci]['progress']
            if P is None:
                P = pr
            else:
                d = pr - last
                if d > 200:      # one-frame lap-increment glitch
                    d -= 463.837      # approximate; refined by caller? use track len
                elif d < -200:   # start-line reset from lap-0 progress
                    d += 463.837
                P += d
            out[ci][k] = P
            last = pr
    return out

def unwrap_progress2(cars, n, L):
    out = [[None] * n, [None] * n]
    for ci in range(2):
        P = None
        last = None
        for k in range(n):
            pr = cars[k][ci]['progress']
            if P is None:
                P = pr
            else:
                d = pr - last
                if d > L * 0.5:
                    d -= L
                elif d < -L * 0.5:
                    d += L
                P += d
            out[ci][k] = P
            last = pr
    return out

def main(path):
    d = load(path)
    L = d['track']['length']
    cars = [f['cars'] for f in d['frames']]
    n = len(cars)
    t = [k * 0.05 for k in range(n)]
    ds, sol = (0, 1) if d['seats'][0] == 'deepseek-flash' else (1, 0)
    print('=' * 86)
    print(f"{d['id']} seed={d['seed']} seats={d['seats']} winner={d['seats'][d['winner']]}")
    print(f"track: length={L:.3f} halfWidth={d['track']['halfWidth']:.3f} "
          f"roadTiles={d['track']['audit']['roadTiles']} attempt={d['track']['audit']['attempt']} "
          f"valid={d['track']['audit']['valid']} minSelfDist={d['track']['audit']['minSelfDistance']:.2f}")
    fc = d['final']['cars']
    for ci in range(2):
        c = fc[ci]
        print(f"  {d['seats'][ci]:14s} finish={c['finishTime']} bestLap={c['bestLap']} "
              f"boosts={c['boosts']} driftTime={c['driftTime']} collisions={c['collisions']} "
              f"laps={c['lap']} prog={c['progress']:.2f}")

    P = unwrap_progress2(cars, n, L)
    live = [k for k in range(n) if d['frames'][k]['phase'] in ('live', 'finished') and k >= 30]
    # per car stats
    print('  --- running stats (from GO) ---')
    for ci in range(2):
        ks = live
        moving = [k for k in ks if cars[k][ci]['speed'] > 1]
        spd = [cars[k][ci]['speed'] for k in ks]
        off = sum(1 for k in ks if cars[k][ci]['offRoad'])
        drift = sum(1 for k in moving if cars[k][ci]['drifting'])
        boost = sum(1 for k in ks if cars[k][ci]['boosting'])
        hi = sum(1 for k in moving if cars[k][ci]['speed'] >= 22)
        print(f"  {d['seats'][ci]:14s} avgV={sum(spd)/len(spd):5.2f} maxV={max(spd):5.2f} "
              f"drift%={pct(drift,len(moving)):5.1f} boost%={pct(boost,len(ks)):5.1f} "
              f"off%={pct(off,len(ks)):5.2f} v>=22%={pct(hi,len(moving)):5.1f}")

    # per-lap counters from cumulative car state
    print('  --- per-lap (car-level counters) ---')
    for ci in range(2):
        last_lap = 0
        prev_b = cars[30][ci]['boosts']
        prev_d = cars[30][ci]['driftTime']
        lap_start = 30
        for k in range(30, n):
            lap = cars[k][ci]['lap']
            if lap != last_lap:
                # lap crossing frame
                print(f"  {d['seats'][ci]:14s} lap{lap} @ {t[k]:6.2f}s  "
                      f"boosts+={cars[k][ci]['boosts']-prev_b} drift+={cars[k][ci]['driftTime']-prev_d:.2f}s "
                      f"(frame {k})")
                prev_b = cars[k][ci]['boosts']
                prev_d = cars[k][ci]['driftTime']
                last_lap = lap

    # checkpoint sector times via nextCp transitions
    print('  --- sector times per lap (checkpoint-to-checkpoint) ---')
    # passes[ci][(raceLap, cpIndex)] = t.  cp 0 is the start/finish line.
    # While racing, car.lap = completed laps.  cp1..15 passed during car.lap L-1
    # belong to race lap L; cp0 passed when lap increments to L ends race lap L.
    passes = [dict(), dict()]
    for ci in range(2):
        prev_cp = cars[30][ci]['nextCp']
        for k in range(30, n):
            c = cars[k][ci]
            if c['nextCp'] != prev_cp:
                passed = (c['nextCp'] - 1) % LAP_CP
                if passed == 0:
                    race_lap = c['lap']          # lap just completed
                else:
                    race_lap = c['lap'] + 1
                passes[ci][(race_lap, passed)] = t[k]
                prev_cp = c['nextCp']
    print('   lap  sec    ds_time   sol_time   delta(ds-sol)')
    lap_sum_ds = 0.0
    lap_sum_sol = 0.0
    for lap in (1, 2, 3):
        sd = ss = 0.0
        missing = False
        for j in range(1, LAP_CP + 1):
            if j == 1:
                if lap == 1:
                    t0d = t0s = 1.5
                else:
                    t0d = passes[0].get((lap - 1, 0))
                    t0s = passes[1].get((lap - 1, 0))
            else:
                t0d = passes[0].get((lap, j - 1))
                t0s = passes[1].get((lap, j - 1))
            t1d = passes[0].get((lap, j % LAP_CP))
            t1s = passes[1].get((lap, j % LAP_CP))
            if None in (t0d, t0s, t1d, t1s):
                missing = True
                continue
            dd, dsd = t1d - t0d, t1s - t0s
            sd += dd; ss += dsd
            print(f"   {lap}   cp{j:2d}   {dd:8.2f}  {dsd:8.2f}   {dd-dsd:+7.2f}")
        print(f"   {lap}   SUM     {sd:8.2f}  {ss:8.2f}   {sd-ss:+7.2f}" + ("  (missing sectors)" if missing else ""))

    # gap timeline using unwrapped progress, 0.5s resolution
    print('  --- gap timeline (+ = deepseek ahead), every 0.5s ---')
    ref = None
    for k in range(60, n, 10):
        if ref is None:
            ref = 0
        gap = P[ds][k] - P[sol][k]
        if k % 100 == 60:
            print(f"   t={t[k]:6.2f}  gap={gap:+8.2f}u  dsLap={cars[k][ds]['lap']} solLap={cars[k][sol]['lap']} "
                  f"dsV={cars[k][ds]['speed']:5.1f} solV={cars[k][sol]['speed']:5.1f}")
    # biggest gain/loss windows (1s)
    print('  --- biggest 1s net gain (deepseek - sol), 20-frame windows ---')
    gains = []
    for k in range(60, n - 20, 20):
        g0 = P[ds][k] - P[sol][k]
        g1 = P[ds][k + 20] - P[sol][k + 20]
        gains.append((g1 - g0, k))
    for g, k in sorted(gains, key=lambda x: -abs(x[0]))[:8]:
        print(f"   t={t[k]:6.2f}->{t[k+20]:6.2f}  net={g:+7.2f}u  gap_after={P[ds][k+20]-P[sol][k+20]:+8.2f}u")

    # collision contexts +/-0.5s
    print('  --- collisions ---')
    for e in d['events']:
        if e['type'] != 'collision':
            continue
        fr = e['frame']
        print(f"   f={fr} t={e['t']:.2f} listed_speed={e.get('speed')}")
        for k in range(max(30, fr - 10), min(n, fr + 11), 2):
            a, b = cars[k][ds], cars[k][sol]
            gap = a['progress'] - b['progress']
            dist = math.hypot(a['x'] - b['x'], a['y'] - b['y'])
            da = math.degrees(math.atan2(math.sin(a['angle'] - b['angle']), math.cos(a['angle'] - b['angle'])))
            print(f"     f={k:4d} t={t[k]:6.2f} ds(v{a['speed']:5.1f},dr{int(a['drifting'])},bo{int(a['boosting'])},"
                  f"off{int(a['offRoad'])},p{a['progress']:7.1f}) sol(v{b['speed']:5.1f},dr{int(b['drifting'])},"
                  f"bo{int(b['boosting'])},off{int(b['offRoad'])},p{b['progress']:7.1f}) dist={dist:4.2f} dang={da:+6.1f}")

if __name__ == '__main__':
    for p in sys.argv[1:]:
        main(p)
