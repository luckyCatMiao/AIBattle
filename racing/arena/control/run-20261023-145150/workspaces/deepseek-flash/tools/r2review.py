#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Post-race analyzer for saved racing replays (r*-g*.json.gz).

Usage: python -I r2review.py <replay.json.gz> [<replay2.json.gz> ...]
Reads only the replay files given on argv; prints a compact report.
"""
import gzip, json, math, sys

def load(path):
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        return json.load(f)

def unit(v):
    return v

def pct(a, b):
    return 100.0 * a / b if b else 0.0

def analyze(path):
    d = load(path)
    L = d['track']['length']
    print('=' * 78)
    print(f"{d['id']}  seed={d['seed']}  seats={d['seats']}  winner={d['seats'][d['winner']]} ({d['reason']})")
    print(f"track length={L:.3f} halfWidth={d['track']['halfWidth']:.3f} audit={d['track']['audit']}")
    fin = d['final']['cars']
    for i, c in enumerate(fin):
        print(f"  car{i} {d['seats'][i]:14s} finish={c['finishTime']} bestLap={c['bestLap']} "
              f"boosts={c['boosts']} driftTime={c['driftTime']} collisions={c['collisions']} "
              f"laps_done={c['lap']} progress={c['progress']:.2f}")

    ev = d['events']
    for e in ev:
        if e['type'] in ('lap', 'collision', 'finish'):
            extra = ''
            if e['type'] == 'collision':
                extra = f" speed={e.get('speed')}"
            if e['type'] == 'lap':
                extra = f" car={e.get('unit')} lap={e.get('lap')} lapTime={e.get('time')}"
            print(f"  t={e['t']:7.2f} f={e['frame']:4d} {e['type']:9s}{extra}")

    frames = d['frames']
    # frames start at countdown; live from frame 30
    live = [f for f in frames if f['phase'] in ('live', 'finished')]
    n = len(frames)
    # per-car series
    series = [[], []]
    for f in frames:
        for i, c in enumerate(f['cars']):
            series[i].append((f['frame'], f['tick'] * 0.05 if 'tick' in f else f['frame'] * 0.05, c))
    # stats
    print('  -- per-car frame stats (live, after go) --')
    for i in range(2):
        ss = [s for s in series[i] if s[0] >= 30]
        spd = [s[2]['speed'] for s in ss]
        moving = [s for s in ss if s[2]['speed'] > 1]
        print(f"  car{i} {d['seats'][i]:14s} frames={len(ss)} avgV={sum(spd)/len(spd):.2f} "
              f"maxV={max(spd):.2f} drift%={pct(sum(1 for s in moving if s[2]['drifting']), len(moving)):.1f} "
              f"boost%={pct(sum(1 for s in ss if s[2]['boosting']), len(ss)):.1f} "
              f"off%={pct(sum(1 for s in ss if s[2]['offRoad']), len(ss)):.2f} "
              f"v>=22%={pct(sum(1 for s in moving if s[2]['speed'] >= 22), len(moving)):.1f}")

    # progress gap timeline: every 20 frames (1s)
    print('  -- gap timeline (deepseek progress - sol progress; + means deepseek ahead) --')
    idx = {0: 0, 1: 1}
    good = d['seats'][0] == 'deepseek-flash'
    ds, sol = (0, 1) if good else (1, 0)
    print('   t     ds_prog    sol_prog    gap   gap_m   dsV   solV   dsLap solLap')
    prev = None
    for f in frames[::20]:
        if f['frame'] < 30:
            continue
        a, b = f['cars'][ds], f['cars'][sol]
        gap = a['progress'] - b['progress']
        print(f"  {f['frame']*0.05:6.2f} {a['progress']:9.2f} {b['progress']:9.2f} {gap:8.2f} {gap/L:7.2f}L "
              f"{a['speed']:5.1f} {b['speed']:5.1f}   {a['lap']}     {b['lap']}")

    # lead changes on progress
    lead = None
    changes = []
    for f in frames[30:]:
        a, b = f['cars'][ds], f['cars'][sol]
        g = a['progress'] - b['progress']
        l = 1 if g > 0 else (-1 if g < 0 else 0)
        if l != 0 and lead is not None and l != lead:
            changes.append((f['frame'], f['tick'] * 0.05, lead, l, g))
        if l != 0:
            lead = l
    print(f"  lead changes: {len(changes)}")
    for ch in changes[:20]:
        print('   ', ch)

    # windows: per-car input stats
    wins = d['windows']
    print(f"  -- input stats ({len(wins)} windows) --")
    for ci in range(2):
        th = []
        st = []
        dr = 0
        bo = 0
        frames_n = 0
        bo_edges = 0
        prev_b = False
        dr_edges = 0
        prev_d = False
        for w in wins:
            for fr in w['inputs'][ci]:
                fr = fr[0] if isinstance(fr, list) else fr
                th.append(fr.get('throttle', 0))
                st.append(fr.get('steer', 0))
                b = bool(fr.get('boost'))
                dflag = bool(fr.get('drift'))
                bo += b
                dr += dflag
                frames_n += 1
                if b and not prev_b:
                    bo_edges += 1
                if dflag and not prev_d:
                    dr_edges += 1
                prev_b, prev_d = b, dflag
        print(f"  car{ci} {d['seats'][ci]:14s} frames={frames_n} throttle mean={sum(th)/len(th):.3f} "
              f"full%={pct(sum(1 for x in th if x > 0.95), len(th)):.1f} "
              f"brake%={pct(sum(1 for x in th if x < -0.05), len(th)):.1f} "
              f"|steer|mean={sum(abs(x) for x in st)/len(st):.3f} "
              f"drift%={pct(dr, frames_n):.1f} boost%={pct(bo, frames_n):.1f} "
              f"boost_edges={bo_edges} drift_edges={dr_edges}")

    # collision contexts
    print('  -- collision contexts --')
    for e in ev:
        if e['type'] != 'collision':
            continue
        fr = e['frame']
        # nearest frame record
        f = frames[min(fr, len(frames) - 1)]
        a, b = f['cars'][0], f['cars'][1]
        dx, dy = a['x'] - b['x'], a['y'] - b['y']
        print(f"  f={fr} t={e['t']:.2f} speed={e.get('speed')} "
              f"p0(lap{a['lap']},prog{a['progress']:.1f},v{a['speed']:.1f},drift={a['drifting']},boost={a['boosting']},off={a['offRoad']}) "
              f"p1(lap{b['lap']},prog{b['progress']:.1f},v{b['speed']:.1f},drift={b['drifting']},boost={b['boosting']},off={b['offRoad']}) "
              f"dist={math.hypot(dx,dy):.2f}")
        # who was ahead
        print(f"      ahead={d['seats'][0] if a['progress'] > b['progress'] else d['seats'][1]} "
              f"gap={abs(a['progress']-b['progress']):.2f}")

    # biggest per-second gap swings
    print('  -- biggest 1s gap swings --')
    sw = []
    prev = None
    for f in frames[30:]:
        a, b = f['cars'][ds], f['cars'][sol]
        g = a['progress'] - b['progress']
        if prev is not None and f['frame'] % 20 == 0:
            sw.append((g - prev[1], f['frame'], f['tick'] * 0.05, g, prev[1]))
        if f['frame'] % 20 == 0:
            prev = (f['frame'], g)
    for s in sorted(sw, key=lambda x: -abs(x[0]))[:10]:
        print(f"   t={s[2]:6.2f} dgap={s[0]:+7.2f} gap_now={s[3]:+8.2f}")

    # endgame: last 5 seconds
    print('  -- last 5s (every 0.2s) --')
    for f in frames[-100::4]:
        a, b = f['cars'][ds], f['cars'][sol]
        print(f"   t={f['tick']*0.05:6.2f} ds(p{a['lap']},prog{a['progress']:.1f},v{a['speed']:.1f},bE{a['boostEnergy']:.2f},dr{a['drifting']}) "
              f"sol(p{b['lap']},prog{b['progress']:.1f},v{b['speed']:.1f},bE{b['boostEnergy']:.2f},dr{b['drifting']})")

if __name__ == '__main__':
    for p in sys.argv[1:]:
        analyze(p)
