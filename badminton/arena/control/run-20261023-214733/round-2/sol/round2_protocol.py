import json
import subprocess
import time
from pathlib import Path

entry = json.loads(Path('entry.json').read_text(encoding='utf-8'))
sample = json.loads(Path('example.json').read_text(encoding='utf-8'))
child = subprocess.Popen(entry['command'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, encoding='utf-8')
start = time.perf_counter()
for team in (0, 1, 0, 1):
    sample['yourPlayer'] = team
    child.stdin.write(json.dumps(sample) + '\n')
    child.stdin.flush()
    output = json.loads(child.stdout.readline())
    assert len(output['inputs']) == 10
    for frame in output['inputs']:
        assert isinstance(frame, list) and len(frame) == 1
        action = frame[0]
        assert -1 <= action.get('move', 0) <= 1
        assert action.get('swing', 0) in (-1, 0, 1)
        for key in ('jump', 'charge', 'sprint'):
            assert isinstance(action.get(key, False), bool)
child.stdin.close()
child.wait(timeout=5)
assert child.returncode == 0
assert child.stderr.read() == ''
result = {'protocol': 'passed', 'requests': 4, 'seconds': time.perf_counter() - start,
          'command': entry['command']}
Path('round2_protocol_result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
