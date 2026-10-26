#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""逐脚分析回放：踢球 -> 结果（进球/扑救/被封/队友接到/其他）。

只读回放，不接触对手代码。用法：
  python -I work/r2prep/analyze_shots.py matches/r2-g1.json.gz ...
  python -I work/r2prep/analyze_shots.py --dir matches --out work/r2prep/shots.json
"""
import gzip
import json
import math
import os
import sys

W, H = 44.0, 26.0
MOUTH_LO, MOUTH_HI = 10.5, 15.5
CR = 0.82


def load(path):
    with gzip.open(path, 'rt', encoding='utf-8') as fh:
        d = json.load(fh)
    fmt = d.get('unitsFormat')
    if fmt:
        for fr in d['frames']:
            us = fr.get('units') or []
            if us and isinstance(us[0], list):
                fr['units'] = [dict(zip(fmt, row)) for row in us]
    return d


def collect_events(frames, dump):
    src = dump.get('events') or (dump.get('final') or {}).get('events') or []
    ev = {}
    for e in src:
        ev[e['id']] = e
    for fr in frames:
        for e in fr.get('events') or []:
            ev[e['id']] = e
    return [ev[k] for k in sorted(ev)]


def unit_at(fr, uid):
    for u in fr.get('units') or []:
        if u['id'] == uid:
            return u
    return None


def keeper_of(fr, team):
    for u in fr.get('units') or []:
        if u['team'] == team and u['index'] == 0:
            return u
    return None


def analyze(path):
    d = load(path)
    frames = d['frames']
    evs = collect_events(frames, d)
    seats = d.get('seats') or ['team0', 'team1']
    n = d.get('teamSize')
    rec = {'file': os.path.basename(path), 'seed': d.get('seed'), 'teamSize': n,
           'seats': seats, 'scores': d.get('scores'), 'winner': d.get('winner'),
           'kicks': [], 'goals': [], 'saves': []}

    # 索引事件
    ev_by_frame = {}
    for e in evs:
        ev_by_frame.setdefault(e['frame'], []).append(e)

    for e in evs:
        if e['type'] == 'goal':
            t = e.get('team')
            gk = None
            # 找最近一次同队 kick（<=40 帧内）
            prev = [x for x in evs if x['type'] == 'kick' and x['frame'] <= e['frame']
                    and x['frame'] >= e['frame'] - 60 and x.get('team') == t]
            prev.sort(key=lambda x: x['frame'])
            k = prev[-1] if prev else None
            dist = None
            flight = None
            keep = None
            keep_d = None
            tgt_y = None
            if k is not None:
                flight = (e['frame'] - k['frame']) / 20.0
                f0 = frames[k['frame']]
                kp = keeper_of(f0, 1 - t)
                if kp is not None:
                    keep = (kp['x'], kp['y'])
                    # 射线
                    a = k.get('angle')
                    ux, uy = math.cos(a), math.sin(a)
                    gx = 1.0 if t == 1 else W - 1.0
                    tt = (gx - k['x']) / ux if abs(ux) > 1e-9 else 0
                    tgt_y = k['y'] + uy * tt
                    # 门将到射线的垂距
                    dx, dy = kp['x'] - k['x'], kp['y'] - k['y']
                    keep_d = abs(dx * uy - dy * ux)
                ghx = 1.0 if t == 1 else W - 1.0
                dist = math.hypot(ghx - k['x'], 13.0 - k['y'])
            rec['goals'].append({'frame': e['frame'], 'team': t, 'scorer': e.get('scorer'),
                                 'kick_frame': k['frame'] if k else None,
                                 'kx': k['x'] if k else None, 'ky': k['y'] if k else None,
                                 'angle': k.get('angle') if k else None,
                                 'dist': dist, 'flight': flight, 'keep': keep,
                                 'keep_perp': keep_d, 'tgt_y': tgt_y,
                                 'own': e.get('ownGoal')})

    # 每脚踢球轨迹
    kick_by_frame = {}
    for e in evs:
        if e['type'] == 'kick':
            kick_by_frame.setdefault(e['frame'], []).append(e)
    goal_frames = set(e['frame'] for e in evs if e['type'] == 'goal')
    save_by_frame = {}
    for e in evs:
        if e['type'] == 'save':
            save_by_frame.setdefault(e['frame'], []).append(e)

    for e in evs:
        if e['type'] != 'kick':
            continue
        t = e['team']
        f0 = e['frame']
        if f0 + 1 >= len(frames):
            continue
        b0 = frames[f0]['ball']
        # 直接从球的位置和速度模拟自由飞行（回放同样给出 vx,vy）
        x, y = b0['x'], b0['y']
        vx, vy = b0['vx'], b0['vy']
        out = {'frame': f0, 'team': t, 'unit': e.get('unit'),
               'x': e['x'], 'y': e['y'], 'angle': e.get('angle'),
               'dist': math.hypot((1.0 if t == 1 else W - 1.0) - e['x'], 13.0 - e['y'])}
        kp = keeper_of(frames[f0], 1 - t)
        if kp is not None:
            a = e.get('angle') or 0.0
            ux, uy = math.cos(a), math.sin(a)
            dx, dy = kp['x'] - e['x'], kp['y'] - e['y']
            out['keep'] = (kp['x'], kp['y'])
            out['keep_perp'] = abs(dx * uy - dy * ux)
            out['keep_d'] = math.hypot(dx, dy)
            gx = 1.0 if t == 1 else W - 1.0
            tt = (gx - e['x']) / ux if abs(ux) > 1e-9 else 0.0
            out['tgt_y'] = e['y'] + uy * tt
            out['on_target'] = MOUTH_LO - 0.3 <= out['tgt_y'] <= MOUTH_HI + 0.3
        # 飞行：最多 120 帧，或直到 owner 非空 / 进球 / 又一次踢球
        min_kd = 9e9
        min_dd = 9e9
        res = 'open'
        end_frame = f0
        for k in range(f0 + 1, min(f0 + 121, len(frames))):
            fr = frames[k]
            b = fr['ball']
            if b.get('owner'):
                res = 'captured'
                end_frame = k
                break
            if k in goal_frames:
                res = 'goal'
                end_frame = k
                break
            if k in kick_by_frame:
                res = 'rekick'
                end_frame = k
                break
            kp2 = keeper_of(fr, 1 - t)
            if kp2 is not None:
                d = math.hypot(kp2['x'] - b['x'], kp2['y'] - b['y'])
                if d < min_kd:
                    min_kd = d
            # 到球门线
            if b['x'] <= 1.01 or b['x'] >= W - 1.01:
                if MOUTH_LO <= b['y'] <= MOUTH_HI:
                    res = 'goalmouth'
                else:
                    res = 'wall'
                end_frame = k
                break
            if abs(b['vx']) < 0.02 and abs(b['vy']) < 0.02:
                res = 'stopped'
                end_frame = k
                break
        out['result'] = res
        out['end_frame'] = end_frame
        out['min_keep_d'] = min_kd if min_kd < 9e8 else None
        # 最终球的位置
        be = frames[min(end_frame, len(frames) - 1)]['ball']
        out['end_ball'] = (be['x'], be['y'])
        out['own'] = (t == 0 and be['x'] <= 1.0) or (t == 1 and be['x'] >= W - 1.0)
        rec['kicks'].append(out)

    for e in evs:
        if e['type'] == 'save':
            rec['saves'].append({'frame': e['frame'], 'team': e.get('team'), 'unit': e.get('unit')})
    return rec


def summarize(recs):
    print('%-26s %5s %4s %-16s %-5s %s' % ('file', 'size', 'seat', 'score(me:op)', 'res', 'goals me/op'))
    tot = {}
    for r in recs:
        seats = r['seats']
        mi = seats.index('deepseek-g1') if 'deepseek-g1' in seats else -1
        sc = r['scores'] or {}
        me, op = sc.get('deepseek-g1'), sc.get('sol')
        w = r.get('winner')
        res = 'D' if w is None else ('W' if w == mi else 'L')
        print('%-26s %5d %4d %-16s %-5s %s' % (r['file'], r['teamSize'], mi,
                                               '%s:%s' % (me, op), res,
                                               '%d/%d' % (sum(1 for g in r['goals'] if g['team'] == (mi)),
                                                          sum(1 for g in r['goals'] if g['team'] == (1 - mi)))))
        key = r['teamSize']
        a = tot.setdefault(key, [0, 0, 0])
        a[0] += 1
        a[1] += 1 if res == 'W' else 0
        a[2] += 1 if res == 'L' else 0
    print('\nby size:')
    for k in sorted(tot):
        a = tot[k]
        print('  n=%d games=%d W=%d L=%d' % (k, a[0], a[1], a[2]))


if __name__ == '__main__':
    args = sys.argv[1:]
    out = None
    files = []
    i = 0
    while i < len(args):
        if args[i] == '--dir':
            i += 1
            files += [os.path.join(args[i], f) for f in sorted(os.listdir(args[i])) if f.endswith('.json.gz')]
        elif args[i] == '--out':
            i += 1
            out = args[i]
        else:
            files.append(args[i])
        i += 1
    recs = [analyze(p) for p in files]
    summarize(recs)
    if out:
        with open(out, 'w', encoding='utf-8') as fh:
            json.dump(recs, fh)
        print('wrote', out)
