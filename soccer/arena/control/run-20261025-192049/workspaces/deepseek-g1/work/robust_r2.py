#!/usr/bin/env python3
"""Feed round-2 recorded frames to agent.py and validate every reply."""
import gzip, json, glob, subprocess, sys, time, os

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pat = sys.argv[1] if len(sys.argv) > 1 else os.path.join(WS, 'matches', 'r2-g*.json.gz')
step = int(sys.argv[2]) if len(sys.argv) > 2 else 37
obs_list = []
for p in sorted(glob.glob(pat), key=lambda x: int(x.split('-g')[-1].split('.')[0])):
    with gzip.open(p, 'rt', encoding='utf-8') as f:
        d = json.load(f)
    me = d['seats'].index('deepseek-g1')
    f = d['unitsFormat']
    n = d['teamSize']
    for fr in d['frames'][::step]:
        if fr['status'] != 'playing':
            continue
        units = []
        for arr in fr['units']:
            u = dict(zip(f, arr))
            units.append({'id': u['id'], 'team': u['team'], 'index': u['index'],
                          'x': u['x'], 'y': u['y'], 'facing': {'x': u['fx'], 'y': u['fy']},
                          'hasBall': bool(u['hasBall']), 'keeper': bool(u['keeper']),
                          'inOwnBox': bool(u['inOwnBox']), 'kickCd': u['kickCd'],
                          'controlLock': u['controlLock'], 'goals': u['goals'],
                          'kicks': u['kicks'], 'touches': u['touches']})
        obs = {'id': d['id'], 'seed': d['seed'], 'frame': fr['frame'], 'status': 'playing',
               'yourTeam': me, 'score': fr['score'], 'half': fr['half'],
               'timeLeft': fr.get('timeLeft', 60), 'golden': bool(fr.get('golden')),
               'teamSize': n, 'units': units, 'ball': fr['ball'],
               'freeze': fr.get('freeze', 0),
               'map': {'width': 44, 'height': 26, 'tiles': [], 'goals': {},
                       'spawns': [[], []], 'penaltyBoxes': {}},
               'rules': {'teamSize': 6}, 'events': [],
               'stats': [{'kicks': 0, 'possession': 0, 'fouls': 0},
                         {'kicks': 0, 'possession': 0, 'fouls': 0}]}
        obs_list.append(obs)
print('observations', len(obs_list), 'sizes', sorted(set(o['teamSize'] for o in obs_list)))
inp = '\n'.join(json.dumps(o) for o in obs_list) + '\n'
t0 = time.time()
r = subprocess.run([sys.executable, '-I', 'agent.py'], input=inp, text=True,
                   capture_output=True, cwd=WS, timeout=300)
dt = time.time() - t0
print('exit', r.returncode, 'wall %.1fs' % dt, 'per-call %.4fs' % (dt / len(obs_list)))
print('stderr', r.stderr[:500])
lines = [l for l in r.stdout.strip().split('\n') if l.strip()]
print('replies', len(lines))
bad = 0
for i, line in enumerate(lines):
    try:
        o = json.loads(line)
        frames = o['inputs']
        n = obs_list[i]['teamSize']
        assert len(frames) == 20
        for row in frames:
            assert len(row) == n
            for c in row:
                assert c['dir'] in ('N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR')
                assert c['aim'] is None or (isinstance(c['aim'], (int, float)) and 0 <= c['aim'] < 360)
                assert isinstance(c['kick'], bool)
    except Exception as e:
        bad += 1
        if bad <= 3:
            print('BAD', i, e)
print('invalid replies', bad)
