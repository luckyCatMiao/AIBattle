import json
import pathlib
import subprocess
import sys
import time

root = pathlib.Path(__file__).resolve().parent
observation = json.loads((root / 'example.json').read_text(encoding='utf-8'))
process = subprocess.Popen([sys.executable, str(root / 'agent.py')], cwd=root,
                           stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, text=True, bufsize=1)
times = []
for i in range(6):
    start = time.perf_counter()
    process.stdin.write(json.dumps(observation) + '\n')
    process.stdin.flush()
    line = process.stdout.readline()
    assert line, process.stderr.read()
    result = json.loads(line)
    assert len(result['inputs']) == 20
    for frame in result['inputs']:
        assert len(frame) == observation['teamSize']
        for action in frame:
            assert action['dir'] in ['N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR']
            assert isinstance(action['kick'], bool)
            assert isinstance(action['aim'], (int, float)) and 0 <= action['aim'] < 360
    times.append(time.perf_counter() - start)
process.stdin.close()
process.wait(timeout=10)
errors = process.stderr.read()
assert process.returncode == 0, (process.returncode, errors)
assert not errors, errors
print(json.dumps({'responses': len(times), 'teamSize': observation['teamSize'],
                  'seconds': times, 'exitCode': process.returncode, 'stderr': errors}))
