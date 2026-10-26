#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打印进球前后若干帧的球/门将/球员位置，帮助理解丢球机制。"""
import gzip
import json
import math
import sys


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


def events(d):
    src = d.get('events') or (d.get('final') or {}).get('events') or []
    ev = {}
    for e in src:
        ev[e['id']] = e
    return [ev[k] for k in sorted(ev)]


def main(path, pre=25, post=4):
    d = load(path)
    fr = d['frames']
    evs = events(d)
    seats = d['seats']
    print('file', path, 'seats', seats, 'score', d.get('scores'), 'n', d.get('teamSize'))
    for e in evs:
        if e['type'] != 'goal':
            continue
        f0 = e['frame']
        print('\n=== goal frame', f0, 'team', e['team'], seats[e['team']], 'score', e.get('score'))
        for f in range(max(0, f0 - pre), min(len(fr), f0 + post)):
            s = fr[f]
            b = s['ball']
            line = 'f%-5d ball(%5.2f,%5.2f v%5.2f,%5.2f own=%s) ' % (
                f, b['x'], b['y'], b['vx'], b['vy'], b['owner'])
            parts = []
            for u in s['units']:
                tag = 'K' if u['index'] == 0 else str(u['index'])
                parts.append('%s%s(%.1f,%.1f)' % ('M' if seats[u['team']] == 'deepseek-g1' else 'S', tag, u['x'], u['y']))
            print(line + ' '.join(parts))


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 25,
         int(sys.argv[3]) if len(sys.argv) > 3 else 4)
