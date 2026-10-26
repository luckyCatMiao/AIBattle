# -*- coding: utf-8 -*-
"""Verify our Python engine port against recorded practice replays.

Usage: python -I work/fid2.py <practice-dir> [max_games]
"""
import gzip, json, os, math, sys

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, WS)
import agent  # noqa: E402

DIRV = {'N': (0, 0), 'U': (0, -1), 'D': (0, 1), 'L': (-1, 0), 'R': (1, 0),
        'UL': (-0.7071067811865476, -0.7071067811865476),
        'UR': (0.7071067811865476, -0.7071067811865476),
        'DL': (-0.7071067811865476, 0.7071067811865476),
        'DR': (0.7071067811865476, 0.7071067811865476)}


FIELDS = ['id', 'team', 'index', 'x', 'y', 'fx', 'fy', 'hasBall', 'keeper',
          'inOwnBox', 'kicks', 'goals', 'touches', 'kickCd', 'controlLock']


def unpack(frame):
    """compact_frame -> full observation dict."""
    out = dict(frame)
    us = []
    for arr in frame.get('units', []):
        d = dict(zip(FIELDS, arr))
        d['facing'] = {'x': d.pop('fx'), 'y': d.pop('fy')}
        d['hasBall'] = bool(d['hasBall'])
        d['keeper'] = bool(d['keeper'])
        d['inOwnBox'] = bool(d['inOwnBox'])
        us.append(d)
    out['units'] = us
    return out


def main():
    P = sys.argv[1]
    maxg = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    mism = tot = 0
    worst = 0.0
    for g in range(1, maxg + 1):
        p = os.path.join(P, 'r1-g%d.json.gz' % g)
        if not os.path.exists(p):
            continue
        d = json.load(gzip.open(p, 'rt', encoding='utf-8'))
        fr = d['frames']
        ev = d['final']['events']
        bad = {e['frame'] for e in ev if e['type'] in ('goal', 'foul', 'card', 'kickoff', 'half', 'tackle', 'save')}
        gmis = 0
        for w in d['windows']:
            f0 = w['frame'] - 20
            if f0 < 0:
                continue
            if any(f0 < bf <= w['frame'] + 1 for bf in bad):
                continue
            obs = unpack(fr[f0])
            st = agent.state_from_obs(obs)
            for k in range(20):
                inp = []
                for u in st.units:
                    row = w['inputs'][u.team][k][u.index]
                    aim = row.get('aim')
                    av = None
                    if aim is not None:
                        a = math.radians(aim)
                        av = (math.cos(a), math.sin(a))
                    inp.append((row['dir'], av, bool(row['kick'])))
                agent.step(st, inp, st.kickoffTeam)
                if st.status != 'playing':
                    break
                st2 = unpack(fr[f0 + k + 1])
                maxd = 0.0
                for u in st.units:
                    q = None
                    for u2 in st2['units']:
                        if u2['team'] == u.team and u2['index'] == u.index:
                            q = u2
                            break
                    if q is None:
                        maxd = 99
                        break
                    maxd = max(maxd, math.hypot(u.x - q['x'], u.y - q['y']))
                bd = math.hypot(st.bx - st2['ball']['x'], st.by - st2['ball']['y'])
                tot += 1
                worst = max(worst, maxd, bd)
                if maxd > 0.02 or bd > 0.03:
                    mism += 1
                    gmis += 1
        print('game %d: mismatching frames %d  score %s n=%d' % (g, gmis, d['scores'], d['teamSize']))
    print('total frames %d mismatches %d (%.4f%%) worst %.4f' %
          (tot, mism, 100.0 * mism / max(1, tot), worst))


if __name__ == '__main__':
    main()
