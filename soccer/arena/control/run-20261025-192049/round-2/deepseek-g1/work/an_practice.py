# -*- coding: utf-8 -*-
"""Analyze practice replays: keeper positioning, defensive line, goals."""
import gzip, json, os, sys

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


def load(path):
    d = json.load(gzip.open(path, 'rt', encoding='utf-8'))
    return d


def main():
    P = sys.argv[1]
    games = range(1, 21)
    for g in games:
        p = os.path.join(P, 'r1-g%d.json.gz' % g)
        if not os.path.exists(p):
            continue
        d = load(p)
        n = d['teamSize']
        # our team id in each frame: from 'yourTeam'? replay has seats; frame has yourTeam?
        fr = d['frames']
        ev = d['final']['events']
        # find goals
        goals = [e for e in ev if e['type'] == 'goal']
        kicks = [e for e in ev if e['type'] == 'kick']
        print('=== game %d n=%d score=%s seats=%s' % (g, n, d['scores'], d['seats']))
        for e in goals:
            # last kick before goal by same-ish time
            prevk = [k for k in kicks if k['frame'] <= e['frame']][-3:]
            print('  goal f%d t%.2f team=%s scorer=%s own=%s  kicks:' % (
                e['frame'], e['frame'] / 20.0, e['team'], e.get('scorer'), e.get('ownGoal')))
            for k in prevk:
                print('     kick f%d t=%.2f team=%s unit=%s from (%.2f,%.2f) ang=%.1f' % (
                    k['frame'], k['frame'] / 20.0, k['team'], k['unit'], k['x'], k['y'], k['angle']))
        # keeper stats: opponent keeper is index 0 of the other team
        # Our team id = 0 if seats[0]=='deepseek-g1' else 1
        me = 0 if d['seats'][0] == 'deepseek-g1' else 1
        opp = 1 - me
        ky = []
        kx = []
        opp_field_x = []
        for f in fr:
            f = unpack(f)
            for u in f['units']:
                if u['team'] == opp and u['index'] == 0:
                    ky.append(u['y'])
                    kx.append(44 - u['x'] if opp == 1 else u['x'])  # distance from own goal line
                elif u['team'] == opp:
                    opp_field_x.append(44 - u['x'] if opp == 1 else u['x'])
        if ky:
            ky_s = sorted(ky)
            def pct(a, q):
                return a[min(len(a) - 1, int(q * len(a)))]
            print('  opp keeper: x_from_goal mean %.2f [p5 %.2f p95 %.2f]; y mean %.2f p5 %.2f p50 %.2f p95 %.2f; y<10.5 %.1f%% y>15.5 %.1f%%' % (
                sum(kx) / len(kx), pct(sorted(kx), .05), pct(sorted(kx), .95),
                sum(ky) / len(ky), pct(ky_s, .05), pct(ky_s, .5), pct(ky_s, .95),
                100.0 * sum(1 for v in ky if v < 10.5) / len(ky),
                100.0 * sum(1 for v in ky if v > 15.5) / len(ky)))
            ox = sorted(opp_field_x)
            print('  opp field: x_from_goal p5 %.2f p50 %.2f p95 %.2f  (min %0.1f)' % (
                pct(ox, .05), pct(ox, .5), pct(ox, .95), ox[0]))


if __name__ == '__main__':
    main()
