"""Exercise the actual entry command using compact UTF-8 observation lines."""
import json
import subprocess
import time
from pathlib import Path

entry = json.loads(Path('entry.json').read_text())
example = json.loads(Path('example.json').read_text(encoding='utf-8'))
# Generate genuine observations locally without touching any protected source.
source = "const s=require('./simulation');const g=s.createMatch({seed:9137,players:[{name:'测试',kind:'api'},{name:'基线',kind:'api'}]});console.log(JSON.stringify(s.view(g,0)));for(let i=0;i<25;i++)s.step(g);console.log(JSON.stringify(s.view(g,0)));"
raw = subprocess.check_output(['node', '-e', source]).decode('utf-8').splitlines()
child = subprocess.Popen(entry['command'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
results = []
for line in raw + raw[1:]:
    started = time.perf_counter()
    child.stdin.write((line + '\n').encode('utf-8'))
    child.stdin.flush()
    response = json.loads(child.stdout.readline())
    elapsed = time.perf_counter() - started
    frames = response['inputs']
    assert len(frames) == 5
    for frame in frames:
        assert len(frame) == 1
        assert -1 <= frame[0]['move'] <= 1
        assert isinstance(frame[0]['jump'], bool)
    assert elapsed < 5
    results.append({'seconds': elapsed, 'response': response})
child.stdin.close()
child.wait(timeout=5)
errors = child.stderr.read().decode('utf-8')
assert child.returncode == 0 and not errors, errors
Path('round2_protocol.json').write_text(json.dumps({'command': entry['command'], 'results': results}, indent=2), encoding='utf-8')
print(json.dumps({'passed': len(results), 'maxSeconds': max(x['seconds'] for x in results)}))
