import json
import subprocess
import time

with open('example.json', encoding='utf-8') as f:
    sample = json.load(f)
with open('entry.json', encoding='utf-8') as f:
    entry = json.load(f)
p = subprocess.Popen(entry['command'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.PIPE, text=True, encoding='utf-8')
start = time.perf_counter()
for team in (0, 1, 0, 1):
    sample['yourPlayer'] = team
    p.stdin.write(json.dumps(sample) + '\n')
    p.stdin.flush()
    result = json.loads(p.stdout.readline())
    assert len(result['inputs']) == 10
    for frame in result['inputs']:
        assert isinstance(frame, list) and len(frame) == 1
        a = frame[0]
        assert -1 <= a.get('move', 0) <= 1
        assert a.get('swing', 0) in (-1, 0, 1)
        for key in ('jump', 'charge', 'sprint'):
            assert isinstance(a.get(key, False), bool)
p.stdin.close()
p.wait(timeout=5)
assert p.returncode == 0
assert p.stderr.read() == ''
with open('current_robust_normal.json', encoding='utf-8') as f:
    results = json.load(f)
print(json.dumps({'protocol': 'passed', 'requests': 4,
                  'seconds': time.perf_counter() - start,
                  'match_windows': sum(r['windows'] for r in results),
                  'max_match_wait_ms': max(r['maxMs'] for r in results)}))
