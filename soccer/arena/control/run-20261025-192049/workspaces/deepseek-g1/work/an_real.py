# -*- coding: utf-8 -*-
"""Analyse a real replay: goals, shots, and the state right before each goal."""
import gzip, json, os, sys, math

FIELDS = ['id', 'team', 'index', 'x', 'y', 'fx', 'fy', 'hasBall', 'keeper',
          'inOwnBox', 'kicks', 'goals', 'touches', 'kickCd', 'controlLock']


def unpack(frame):
    out = dict(frame)
    us = []
    for arr in frame.get('units', []):
        d = dict(zip(FIELDS, arr))
        d['facing'] = {'x': d.pop('fx'), 'y': d.pop('fy')}
        d['hasBall'] = bool(d['hasBall'])
        us.append(d)
    out['units'] = us
    return out


def main():
    P = sys.argv[1]
    games = [int(x) for x in sys.argv[2:]] or list(range(1, 21))
    for g in games:
        p = os.path.join(P, 'r1-g%d.json.gz' % g)
        if not os.path.exists(p):
            continue
        d = json.load(gzip.open(p, 'rt', encoding='utf-8'))
        n = d['teamSize']
        ev = d['final']['events']
        me = 0 if d['seats'][0] == 'deepseek-g1' else 1
        opp = 1 - me
        print('=== g%d n=%d me=%d score=%s' % (g, n, me, d['scores']))
        goals = [e for e in ev if e['type'] == 'goal']
        kicks = [e for e in ev if e['type'] == 'kick']
        for e in goals:
            f = e['frame']
            st = unpack(d['frames'][max(0, min(f - 3, len(d['frames']) - 1))])
            prev = [k for k in kicks if k['frame'] <= f][-2:]
            print(' goal t=%.1f team=%s(%s) own=%s' % (f / 20.0, e['team'],
                  'ME' if e['team'] == me else 'OPP', e.get('ownGoal')))
            for k in prev:
                print('    kick t=%.1f %s from (%.1f,%.1f) ang=%.0f' % (
                    k['frame'] / 20.0, 'ME' if k['team'] == me else 'OPP', k['x'], k['y'],
                    math.degrees(k['angle']) % 360))
            print('    ball(%.1f,%.1f) units: %s' % (st['ball']['x'], st['ball']['y'],
                  ' '.join('%s%d(%.1f,%.1f)' % ('M' if u['team'] == me else 'O', u['index'],
                                                u['x'], u['y']) for u in st['units'])))
        print(' kicks ME %d OPP %d' % (sum(1 for k in kicks if k['team'] == me),
                                       sum(1 for k in kicks if k['team'] == opp)))


if __name__ == '__main__':
    main()
