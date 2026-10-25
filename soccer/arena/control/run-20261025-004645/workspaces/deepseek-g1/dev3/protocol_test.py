# -*- coding: utf-8 -*-
"""协议健壮性检查：模拟各种观察（不同人数/座位/冻结/金球/终场），
校验 agent.py 每行都返回合法窗口，且单次响应远低于 5 秒。"""
import json, subprocess, sys, time, os, copy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PY = os.environ.get('PYEXE', sys.executable)
DIRS = {'N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR'}

base = json.load(open(os.path.join(ROOT, 'example.json'), encoding='utf-8'))
keep = ('id', 'seed', 'tick', 'frame', 'status', 'phase', 'winner', 'reason', 'yourTeam',
        'players', 'score', 'half', 'teamSize', 'timeLeft', 'golden', 'goldenLeft',
        'freeze', 'stats', 'units', 'ball', 'map', 'rules', 'events')


def mk_obs(n, me, **kw):
    """用 example 的场地数据合成一个 n 人局观察。"""
    obs = {k: copy.deepcopy(base[k]) for k in keep if k in base}
    obs['teamSize'] = n
    obs['yourTeam'] = me
    obs['units'] = []
    spawn_y = {1: [13], 2: [9, 17], 3: [7, 13, 19], 4: [6, 10, 16, 20],
               5: [5, 9, 13, 17, 21], 6: [3, 7, 11, 15, 19, 23]}[n]
    for team in (0, 1):
        for i in range(n):
            x = 11.5 if team == 0 else 32.5
            obs['units'].append({
                'id': 't%du%d' % (team, i), 'team': team, 'index': i,
                'name': '%d #%d' % (team, i + 1), 'x': x, 'y': spawn_y[i] + 0.5,
                'facing': {'x': 1 if team == 0 else -1, 'y': 0},
                'hasBall': False, 'keeper': i == 0, 'inOwnBox': False,
                'kickCd': 0, 'controlLock': 0, 'goals': 0, 'kicks': 0, 'touches': 0,
            })
    obs['ball'] = {'x': 22, 'y': 13, 'vx': 0, 'vy': 0, 'owner': None,
                   'lastTouch': None, 'lastTeam': None}
    obs.update(kw)
    return obs


def validate(line, n):
    d = json.loads(line)
    assert isinstance(d, dict) and 'inputs' in d, 'missing inputs'
    fr = d['inputs']
    assert isinstance(fr, list) and len(fr) == 20, 'frames=%d' % len(fr)
    for f in fr:
        assert isinstance(f, list) and len(f) == n, 'frame len %d != %d' % (len(f), n)
        for u in f:
            assert set(u.keys()) >= {'dir', 'aim', 'kick'}, 'keys %s' % u.keys()
            assert u['dir'] in DIRS, 'bad dir %r' % u['dir']
            a = u['aim']
            assert a is None or isinstance(a, str) or isinstance(a, (int, float)), 'bad aim %r' % a
            if isinstance(a, str):
                assert a in DIRS, 'bad aim str %r' % a
            if isinstance(a, (int, float)):
                assert 0 <= float(a) < 360 or -360 < float(a) < 360, 'aim range %r' % a
            assert isinstance(u['kick'], bool), 'kick not bool'
    return True


cases = []
for n in range(1, 7):
    for me in (0, 1):
        cases.append(('plain n=%d me=%d' % (n, me), mk_obs(n, me)))
        cases.append(('freeze n=%d me=%d' % (n, me), mk_obs(n, me, freeze=0.6)))
        cases.append(('golden n=%d me=%d' % (n, me), mk_obs(n, me, golden=True, goldenLeft=12.5,
                                                          timeLeft=12.5, score=[1, 1])))
        lead = mk_obs(n, me, score=[1, 0] if me == 0 else [0, 1], timeLeft=30.0, half=2)
        lead['units'][me * n + (1 if n > 1 else 0)]['hasBall'] = True
        lead['ball'] = {'x': 18.0, 'y': 13.0, 'vx': 0, 'vy': 0,
                        'owner': 't%du%d' % (me, 1 if n > 1 else 0), 'lastTouch': None, 'lastTeam': me}
        cases.append(('leading n=%d me=%d' % (n, me), lead))

p = subprocess.Popen([PY, os.path.join(ROOT, 'agent.py')], cwd=ROOT,
                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                     text=True, bufsize=1)
worst = 0.0
worst_name = ''
fail = 0
for name, obs in cases:
    t0 = time.time()
    p.stdin.write(json.dumps(obs) + '\n')
    p.stdin.flush()
    line = p.stdout.readline()
    dt = time.time() - t0
    if dt > worst:
        worst, worst_name = dt, name
    try:
        validate(line, obs['teamSize'])
    except Exception as e:
        fail += 1
        print('FAIL %-22s %s' % (name, e))
p.stdin.close()
err = p.stderr.read()
p.wait(timeout=10)
print('cases=%d  fail=%d  worst=%.2fs (%s)' % (len(cases), fail, worst, worst_name))
if err.strip():
    print('stderr:', err[:800])
sys.exit(1 if fail else 0)
