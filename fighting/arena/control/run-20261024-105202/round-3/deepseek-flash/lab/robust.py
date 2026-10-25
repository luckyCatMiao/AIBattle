"""健壮性测试：喂各种畸形/边界观察，确保不崩、输出始终合法。"""
import json, os, subprocess, sys
WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = os.environ.get('PY', 'python')
cat = json.load(open(os.path.join(WS, 'example.json'), encoding='utf-8'))['catalog']
BASE = json.load(open(os.path.join(WS, 'example.json'), encoding='utf-8'))

DIRS = {'N', 'F', 'B', 'U', 'D', 'UF', 'UB', 'DF', 'DB'}
BTNS = {'LP', 'HP', 'LK', 'HK', 'G', None}


def check(obs, tag):
    p = subprocess.run([PY, os.path.join(WS, 'agent.py')], input=json.dumps(obs) + "\n",
                       capture_output=True, text=True, cwd=WS, timeout=10)
    if p.returncode != 0:
        print('FAIL(exit) %s: %s' % (tag, p.stderr[-300:]))
        return False
    lines = [l for l in p.stdout.strip().split('\n') if l.strip()]
    if len(lines) != 1:
        print('FAIL(lines=%d) %s' % (len(lines), tag))
        return False
    try:
        o = json.loads(lines[0])
    except Exception as e:
        print('FAIL(json) %s: %r' % (tag, e))
        return False
    ins = o.get('inputs')
    if not isinstance(ins, list) or len(ins) != 15:
        print('FAIL(len) %s: %r' % (tag, ins if not isinstance(ins, list) else len(ins)))
        return False
    for i in ins:
        if not isinstance(i, dict) or i.get('dir') not in DIRS or i.get('btn') not in BTNS:
            print('FAIL(fmt) %s: %r' % (tag, i))
            return False
    return True


def mut(**kw):
    o = json.loads(json.dumps(BASE))
    o.update(kw)
    return o


ok = True
cases = []
cases.append((mut(), 'base'))
cases.append((mut(status='finished', winner=0), 'finished'))
cases.append((mut(status='picking'), 'picking'))
cases.append((mut(fighters=[]), 'no fighters'))
cases.append((mut(fighters=[BASE['fighters'][0]]), 'one fighter'))
o = mut(); o['catalog'] = cat['characters']; cases.append((o, 'catalog=characters'))
o = mut(); del o['catalog']; cases.append((o, 'no catalog'))
o = mut(); o['yourPlayer'] = 1; cases.append((o, 'seat1'))
o = mut(); o['yourPlayer'] = None; cases.append((o, 'yourPlayer None'))
o = mut(); del o['events']; cases.append((o, 'no events'))
o = mut(); o['events'] = [{'id': 5, 'type': 'hit', 'owner': 0, 'frame': 3, 'damage': 10}]; cases.append((o, 'hit event'))
o = mut(); o['frame'] = None; cases.append((o, 'frame None'))
o = mut(); o['projectiles'] = [{'id': 'p1', 'owner': 1, 'x': 500, 'y': 438, 'w': 40, 'h': 32, 'fuse': 0}]
cases.append((o, 'incoming projectile'))
o = mut(); o['fighters'][0]['state'] = 'attack'
o['fighters'][0]['move'] = {'name': '刺拳', 'kind': 'normal', 'frame': 9, 'startup': 3, 'active': 3, 'recovery': 5}
cases.append((o, 'me attacking'))
o = mut(); o['fighters'][0]['state'] = 'blockstun'; o['fighters'][0]['move'] = None
cases.append((o, 'me blockstun'))
o = mut(); o['fighters'][0]['state'] = 'hitstun'; cases.append((o, 'me hitstun'))
o = mut(); o['fighters'][0]['meter'] = 100; o['fighters'][1]['meter'] = 100
cases.append((o, 'both full meter'))
o = mut(); o['fighters'][0]['x'] = 1220; o['fighters'][1]['x'] = 60
cases.append((o, 'reversed sides'))
o = mut(); o['fighters'][1]['state'] = 'air'; o['fighters'][1]['airborne'] = True
cases.append((o, 'op airborne'))
o = mut(); o['fighters'][1]['char'] = 'zzz'
cases.append((o, 'unknown op char'))
o = mut(); o['fighters'][0]['char'] = 'zzz'
cases.append((o, 'unknown my char'))

for obs, tag in cases:
    if not check(obs, tag):
        ok = False
print('ALL OK' if ok else 'SOME FAILED')
