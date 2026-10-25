import json
import sys
import math
sys.path.insert(0, '/workspace')
import soccer

trace = json.load(open(sys.argv[1]))
init = trace['initial']

# Build a World matching the JS state exactly (full precision floats)
rules = json.load(open('/workspace/rules_dump.json')) if False else None
# We need rules/map: reconstruct from catalog by running node? Use constants here.
from soccer_meta import get_meta
meta = get_meta()
rules = meta['rules']
w = soccer.World(meta['W'], meta['H'], meta['tiles'], rules, meta['penaltyBoxes'], meta['goals'], trace['n'])
w.spawns = meta['spawns_by_n'][str(trace['n'])]
w.frame = init['frame']
w.half = init['half']
w.score = list(init['score'])
w.freeze = init['freeze']
w.status = init['status']
w.kickoffTeam = init['kickoffTeam']
w.golden = init['golden']
w.goldenEnd = init['goldenEnd']
w.ball = {k: init['ball'][k] for k in ('x', 'y', 'vx', 'vy', 'owner', 'lastTouch', 'lastTeam')}
for u in init['units']:
    uu = {'id': u['id'], 'team': u['team'], 'index': u['index'], 'x': u['x'], 'y': u['y'],
          'fx': u['fx'], 'fy': u['fy'], 'held': dict(u['held']),
          'kickCd': u['kickCd'], 'controlLock': u['controlLock'], 'stealLock': u['stealLock'],
          'foulLock': u['foulLock']}
    w.units.append(uu)

def cmp(a, b, path, tol=1e-9, errs=None):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in a:
            if k not in b:
                errs.append(f'{path}.{k} missing'); continue
            cmp(a[k], b[k], f'{path}.{k}', tol, errs)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            errs.append(f'{path} len {len(a)}!={len(b)}'); return
        for i, (x, y) in enumerate(zip(a, b)):
            cmp(x, y, f'{path}[{i}]', tol, errs)
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        if abs(a - b) > tol:
            errs.append(f'{path}: {a} != {b} (d={a-b})')
    else:
        if a != b:
            errs.append(f'{path}: {a!r} != {b!r}')

nerr = 0
for fr in trace['frames']:
    inputs = {}
    for team in (0, 1):
        for idx, inp in enumerate(fr['inputs'][str(team)]):
            uid = f't{team}u{idx}'
            inputs[uid] = {'dir': inp['dir'], 'aim': inp['aim'], 'kick': bool(inp['kick'])}
    w.step(inputs)
    # build comparable state
    mine = {
        'frame': w.frame, 'half': w.half, 'score': list(w.score), 'freeze': w.freeze,
        'status': w.status,
        'ball': {k: w.ball[k] for k in ('x', 'y', 'vx', 'vy', 'owner', 'lastTouch', 'lastTeam')},
        'units': [{'id': u['id'], 'team': u['team'], 'index': u['index'], 'x': u['x'], 'y': u['y'],
                   'fx': u['fx'], 'fy': u['fy'], 'kickCd': u['kickCd'], 'controlLock': u['controlLock'],
                   'stealLock': u['stealLock'], 'foulLock': u['foulLock'], 'held': u['held']} for u in w.units],
        'kickoffTeam': w.kickoffTeam, 'golden': w.golden, 'goldenEnd': w.goldenEnd,
    }
    errs = []
    cmp(fr['state'], mine, 'state', 1e-9, errs)
    if errs:
        nerr += len(errs)
        print(f"frame w{fr['w']} i{fr['i']} MISMATCH ({len(errs)}):")
        for e in errs[:8]:
            print('   ', e)
        if nerr > 40:
            break
print('total mismatches:', nerr)
