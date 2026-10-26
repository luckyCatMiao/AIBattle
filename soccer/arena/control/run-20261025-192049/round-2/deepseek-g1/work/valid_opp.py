# -*- coding: utf-8 -*-
"""Validate the opponent policy port against recorded replays.

Predicts the opponent's frame-0 action of each decision window from the true
observed state (frame 0 is model-free: every candidate plan starts from the
true state), and compares with the recorded input.
"""
import gzip, json, os, sys

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(WS, 'work'))
import oppport as O  # noqa: E402

FIELDS = ['id', 'team', 'index', 'x', 'y', 'fx', 'fy', 'hasBall', 'keeper',
          'inOwnBox', 'kicks', 'goals', 'touches', 'kickCd', 'controlLock']


def unpack(frame):
    out = dict(frame)
    us = []
    for arr in frame.get('units', []):
        d = dict(zip(FIELDS, arr))
        d['facing'] = {'x': d.pop('fx'), 'y': d.pop('fy')}
        us.append(d)
    out['units'] = us
    return out


def main():
    dirs = sys.argv[1:]
    tot = dir_m = kick_m = aim_m = 0
    per_team = [0, 0]
    for P in dirs:
        for g in range(1, 21):
            p = os.path.join(P, 'r1-g%d.json.gz' % g)
            if not os.path.exists(p):
                continue
            d = json.load(gzip.open(p, 'rt', encoding='utf-8'))
            fr = d['frames']
            me = 0 if d['seats'][0] == 'deepseek-g1' else 1
            opp = 1 - me
            gm = gt = 0
            for w in d['windows']:
                f0 = w['frame'] - 20
                if f0 < 0 or f0 >= len(fr):
                    continue
                st = unpack(fr[f0])
                if any(u['team'] == opp for u in st['units']) is False:
                    continue
                # freeze / kickoff frames are not policy-driven
                if st.get('freeze', 0):
                    continue
                acts = O.policy({'units': st['units'], 'ball': st['ball'],
                                 'teamSize': d['teamSize']}, opp, 'main')
                actual = w['inputs'][opp][0]
                for i, a in enumerate(acts):
                    act = actual[i] if i < len(actual) else None
                    if act is None:
                        continue
                    tot += 1
                    gt += 1
                    okd = (a['dir'] == act['dir'])
                    okk = (bool(a['kick']) == bool(act.get('kick')))
                    aa = act.get('aim')
                    oka = aa is not None and abs(((a['aim'] - aa + 180) % 360) - 180) < 0.6
                    if not okd:
                        dir_m += 1
                    if not okk:
                        kick_m += 1
                    if not oka:
                        aim_m += 1
                    if not (okd and okk):
                        gm += 1
            if gt:
                print('g%d n=%d: units-frame0 mismatch %d/%d' % (g, d['teamSize'], gm, gt))
    print('TOTAL %d: dir mismatch %.2f%%  kick %.2f%%  aim %.2f%%' % (
        tot, 100.0 * dir_m / max(1, tot), 100.0 * kick_m / max(1, tot),
        100.0 * aim_m / max(1, tot)))


if __name__ == '__main__':
    main()
