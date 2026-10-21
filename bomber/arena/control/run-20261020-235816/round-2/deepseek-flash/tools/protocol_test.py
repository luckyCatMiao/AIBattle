"""End-to-end protocol test: drive the real `python3 -I agent.py` subprocess.

Usage:
  python3 tools/protocol_test.py game <seed> <opponent_path> [start]
  python3 tools/protocol_test.py fuzz [n]
  python3 tools/protocol_test.py readonly <dir>
"""
import sys, os, json, subprocess, time, random, statistics, shutil, stat
sys.path.insert(0, '/workspace')
import engine
from tools.bench import make_obs, load_agent

W, H = 19, 17
VALID_DIRS = {'N', 'U', 'D', 'L', 'R'}
VALID_BTNS = {None, 'BOMB'}

def validate(line):
    w = json.loads(line)
    ins = w.get('inputs')
    assert isinstance(ins, list) and len(ins) == 20, 'window length %r' % (len(ins) if isinstance(ins, list) else ins)
    for u in ins:
        assert isinstance(u, dict), 'input not dict'
        assert u.get('dir') in VALID_DIRS, 'bad dir %r' % u.get('dir')
        assert u.get('btn') in VALID_BTNS, 'bad btn %r' % u.get('btn')
    return w

def game(seed, opponent_path, start=1):
    Opp = load_agent(opponent_path)
    g = engine.Game(['agent', 'opp'], seed=seed)
    proc = subprocess.Popen([sys.executable, '-I', '/workspace/agent.py'],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, cwd='/workspace', text=True, bufsize=1)
    opp = Opp()
    times, bad = [], 0
    try:
        while g.status == 'playing':
            obs = make_obs(g, 0)
            t0 = time.perf_counter()
            proc.stdin.write(json.dumps(obs) + '\n'); proc.stdin.flush()
            line = proc.stdout.readline()
            dt = time.perf_counter() - t0
            if not line:
                print('EOF from agent at frame', g.roundFrames, 'stderr:', proc.stderr.read()[:400]); break
            try:
                w = validate(line)
                ins = w['inputs']
            except Exception as e:
                bad += 1; print('BAD WINDOW', repr(e), line[:200]); ins = [{'dir':'N','btn':None}]*20
            times.append(dt)
            o = opp.decide(make_obs(g, 1)).get('inputs') or []
            onorm = [{'dir': (x or {}).get('dir','N'), 'btn': (x or {}).get('btn')} for x in (o[:20] + [{'dir':'N','btn':None}]*(20-len(o)))]
            g.advance_window([ins, onorm])
    finally:
        try:
            proc.stdin.close()
        except Exception:
            pass
        try:
            rest = proc.stdout.read()
        except Exception:
            rest = ''
        err = proc.stderr.read()
        proc.wait(timeout=5)
    times.sort()
    print(json.dumps({'seed': seed, 'opponent': opponent_path, 'windows': len(times),
                      'bad': bad, 'wins': [p['wins'] for p in g.players],
                      'rounds': [(r['round'], r['frames'], r['winner']) for r in g.roundLog],
                      'mean_ms': round(1000*statistics.mean(times), 3) if times else None,
                      'p99_ms': round(1000*times[int(len(times)*0.99)], 3) if times else None,
                      'max_ms': round(1000*max(times), 3) if times else None,
                      'extra_output_bytes': len(rest), 'stderr_bytes': len(err)}))
    if err:
        print('STDERR:', err[:800])

def fuzz(n=400):
    r = random.Random(1234)
    good = json.load(open('/workspace/example.json'))
    cases = []
    for i in range(n):
        o = json.loads(json.dumps(good))
        k = i % 14
        if k == 0: o.pop('map', None)
        elif k == 1: o['map'] = {'width': 19, 'height': 17, 'tiles': [0]*10}
        elif k == 2: o['map'] = {'width': 19, 'height': 17, 'tiles': 'x'*323}
        elif k == 3: o['fighters'] = []
        elif k == 4: o['fighters'] = [{'owner': 0, 'x': 99, 'y': -5, 'alive': True, 'speed': 'fast', 'blast': None, 'bombs': -1, 'activeBombs': 0}]
        elif k == 5: o['fighters'] = [{'owner': 0, 'alive': True}]
        elif k == 6: o['bombs'] = 'nope'
        elif k == 7: o['blasts'] = [{'x': 1}, None, 3]
        elif k == 8: o['drops'] = [{'x': 1, 'y': 1}, {'type': 'bomb'}]
        elif k == 9: o['status'] = 'finished'
        elif k == 10: o['round'] = 'x'; o['seed'] = None; o['frame'] = 'y'; o['timeLeft'] = None
        elif k == 11: o['yourPlayer'] = 7
        elif k == 12: o = {'status': 'playing'}
        else: o['players'] = [{'id': 0}, None, {'id': 1, 'wins': 'x'}]
        cases.append(o)
    p = subprocess.Popen([sys.executable, '-I', '/workspace/agent.py'], stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd='/workspace', text=True, bufsize=1)
    bad = 0; outs = 0; tmax = 0.0
    for o in cases:
        t0 = time.perf_counter()
        p.stdin.write(json.dumps(o) + '\n'); p.stdin.flush()
        line = p.stdout.readline()
        tmax = max(tmax, time.perf_counter() - t0)
        try:
            validate(line)
            outs += 1
        except Exception as e:
            bad += 1
            print('FUZZ BAD', repr(e), line[:160])
    # invalid JSON lines must still produce exactly one legal line each
    for s in ['not json', '{', '[]', 'null', '123']:
        p.stdin.write(s + '\n'); p.stdin.flush()
        line = p.stdout.readline()
        try:
            validate(line); outs += 1
        except Exception as e:
            bad += 1; print('FUZZ BAD JSON', repr(e), line[:160])
    p.stdin.close(); rest = p.stdout.read(); err = p.stderr.read(); p.wait(timeout=5)
    print(json.dumps({'cases': len(cases) + 5, 'valid_outputs': outs, 'bad': bad,
                      'max_ms': round(1000*tmax, 3), 'extra_output_bytes': len(rest),
                      'stderr_bytes': len(err)}))
    if err: print('STDERR:', err[:800])

def readonly(d):
    os.makedirs(d, exist_ok=True)
    shutil.copy('/workspace/agent.py', os.path.join(d, 'agent.py'))
    os.chmod(os.path.join(d, 'agent.py'), 0o555)
    os.chmod(d, 0o555)
    obs = json.load(open('/workspace/example.json'))
    p = subprocess.run([sys.executable, '-I', 'agent.py'], input=json.dumps(obs) + '\n',
                       capture_output=True, text=True, timeout=10, cwd=d)
    ok = False
    try:
        validate(p.stdout.splitlines()[0]); ok = True
    except Exception as e:
        print('bad', repr(e))
    print(json.dumps({'rc': p.returncode, 'valid': ok, 'stderr_bytes': len(p.stderr), 'out_lines': len(p.stdout.splitlines())}))
    os.chmod(d, 0o755); os.chmod(os.path.join(d, 'agent.py'), 0o755)

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'game':
        game(int(sys.argv[2]), sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 1)
    elif cmd == 'fuzz':
        fuzz(int(sys.argv[2]) if len(sys.argv) > 2 else 400)
    elif cmd == 'readonly':
        readonly(sys.argv[2])
