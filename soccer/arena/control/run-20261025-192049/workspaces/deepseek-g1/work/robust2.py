# -*- coding: utf-8 -*-
"""Robustness: feed real recorded observations to the submitted agent.

Usage: python -I work/robust2.py <practice-or-match-dir> [max_frames]
"""
import gzip, json, os, subprocess, sys, time

FIELDS = ['id', 'team', 'index', 'x', 'y', 'fx', 'fy', 'hasBall', 'keeper',
          'inOwnBox', 'kicks', 'goals', 'touches', 'kickCd', 'controlLock']


def unpack(frame):
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
    maxf = int(sys.argv[2]) if len(sys.argv) > 2 else 40
    ws = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    obs_list = []
    for g in range(1, 21):
        p = os.path.join(P, 'r1-g%d.json.gz' % g)
        if not os.path.exists(p):
            continue
        d = json.load(gzip.open(p, 'rt', encoding='utf-8'))
        me = 0 if d['seats'][0] == 'deepseek-g1' else 1
        for i in range(0, len(d['frames']) - 1, 20):
            o = unpack(d['frames'][i])
            o['yourTeam'] = me
            o['status'] = 'playing'
            o['phase'] = 'live'
            o.pop('map', None)
            o.pop('rules', None)
            o['teamSize'] = d['teamSize']
            o['timeLeft'] = max(0.0, 120.0 - i / 20.0)
            o['golden'] = False
            o['freeze'] = o.get('freeze', 0)
            obs_list.append(o)
            if len(obs_list) >= maxf:
                break
        if len(obs_list) >= maxf:
            break
    lines = '\n'.join(json.dumps(o) for o in obs_list) + '\n'
    t0 = time.time()
    r = subprocess.run([sys.executable, '-I', os.path.join(ws, 'agent.py')],
                       input=lines, capture_output=True, text=True, encoding='utf-8', cwd=ws)
    dt = time.time() - t0
    out = [l for l in r.stdout.strip().split('\n') if l.strip()]
    print('rc=%s obs=%d replies=%d total=%.2fs avg=%.3fs' % (
        r.returncode, len(obs_list), len(out), dt, dt / max(1, len(obs_list))))
    if r.stderr.strip():
        print('stderr (first 500):', r.stderr[:500])
    bad = 0
    for i, l in enumerate(out):
        try:
            d = json.loads(l)
            fr = d['inputs']
            n = obs_list[i]['teamSize']
            assert len(fr) == 20, 'frames %d' % len(fr)
            for row in fr:
                assert len(row) == n, 'units %d != %d' % (len(row), n)
                for c in row:
                    assert c['dir'] in ('N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR')
                    assert c['aim'] is None or (isinstance(c['aim'], (int, float)) and 0 <= c['aim'] < 360)
                    assert isinstance(c['kick'], bool)
        except Exception as e:
            bad += 1
            if bad < 3:
                print('BAD reply %d: %s' % (i, e))
    print('invalid replies:', bad)


if __name__ == '__main__':
    main()
