#!/usr/bin/env python3
"""Feed example.json to agent.py and validate the buy / live replies."""
import json
import subprocess
import sys
import time

EX = '/workspace/example.json'
ALLOWED = {'N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR'}

p = subprocess.Popen([sys.executable, '-I', '/workspace/agent.py'],
                     stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.PIPE, text=True, bufsize=1)

def ask(obs):
    t0 = time.time()
    p.stdin.write(json.dumps(obs) + '\n')
    p.stdin.flush()
    line = p.stdout.readline()
    dt = time.time() - t0
    if not line:
        raise SystemExit('no output; stderr=%s' % p.stderr.read())
    if line.count('\n') > 1:
        raise SystemExit('more than one line: %r' % line)
    return json.loads(line), dt

buy_obs = json.load(open(EX))
buy_obs['phase'] = 'buy'
r, dt = ask(buy_obs)
buys = r.get('buys')
assert isinstance(buys, list) and len(buys) <= 5, r
for b in buys:
    assert isinstance(b.get('unit'), int) and 0 <= b['unit'] <= 4, b
print('BUY ok: %s  %.1f ms' % (json.dumps(buys), dt * 1000))

live_obs = json.load(open(EX))
live_obs['phase'] = 'live'
r, dt = ask(live_obs)
assert 'inputs' in r, r.keys()
inp = r['inputs']
assert isinstance(inp, list) and len(inp) == 20, len(inp)
for fi, frame in enumerate(inp):
    assert isinstance(frame, list) and len(frame) == 5, (fi, len(frame))
    for ui, cmd in enumerate(frame):
        assert set(cmd) == {'dir', 'aim'}, (fi, ui, cmd)
        assert cmd['dir'] in ALLOWED, (fi, ui, cmd)
        assert cmd['aim'] in ALLOWED, (fi, ui, cmd)
print('LIVE ok: 20x5, all dir/aim legal, %.1f ms' % (dt * 1000))

# The advertised example window must also be legal under the same rules.
ex = json.load(open(EX)).get('exampleWindow') or []
assert len(ex) == 20
for frame in ex:
    for cmd in frame:
        assert cmd['dir'] in ALLOWED and cmd['aim'] in ALLOWED, cmd
print('exampleWindow legal: 20x5')

# Robustness: garbage / empty line / missing fields must not kill the process.
# An empty line is deliberately skipped (no reply), so it is written separately.
for bad in ['{}', 'not json', '{"phase":"buy"}', '{"phase":"live"}']:
    p.stdin.write(bad + '\n')
    p.stdin.flush()
    line = p.stdout.readline()
    assert line.strip(), 'no reply for %r' % bad
    json.loads(line)
p.stdin.write('\n')
p.stdin.flush()
p.stdin.write('{"phase":"buy"}\n')
p.stdin.flush()
assert json.loads(p.stdout.readline()).get('buys') is not None
print('ROBUST ok: garbage/missing-field inputs replied; empty line skipped, stream still alive')

p.stdin.close()
p.kill()
err = p.stderr.read()
if err.strip():
    print('stderr: %s' % err[:500])
print('SMOKE PASS')
