#!/usr/bin/env python3
import json
import pathlib
import subprocess
import time
import copy

root = pathlib.Path(__file__).resolve().parent
example = json.loads((root / 'example.json').read_text())
example.pop('exampleWindow', None)
observations = []
for team in (0, 1):
    for frame in (0, 1200, 2400, 2600):
        for owner in (None, 't0u0', 't0u1', 't1u1'):
            obs = copy.deepcopy(example)
            obs.update(yourTeam=team, frame=frame, golden=frame >= 2400)
            obs['ball']['owner'] = owner
            if owner:
                unit = next(u for u in obs['units'] if u['id'] == owner)
                obs['ball'].update(x=unit['x'] + unit['facing']['x']*.62, y=unit['y'])
            observations.append(obs)
proc = subprocess.Popen(['python3', str(root / 'agent.py')], stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=root)
timings = []
for obs in observations:
    start = time.perf_counter()
    proc.stdin.write(json.dumps(obs) + '\n')
    proc.stdin.flush()
    out = json.loads(proc.stdout.readline())
    timings.append(time.perf_counter() - start)
    assert len(out['inputs']) == 20
    for frame in out['inputs']:
        assert len(frame) == 3
        for unit in frame:
            assert unit['dir'] in ('N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR')
            assert isinstance(unit['aim'], (int, float)) and 0 <= unit['aim'] < 360
            assert isinstance(unit['kick'], bool)
proc.stdin.close()
proc.wait(timeout=5)
errors = proc.stderr.read()
assert proc.returncode == 0 and not errors, errors
print(json.dumps({'observations': len(observations), 'valid': True,
                  'max_response_ms_including_startup': max(timings)*1000,
                  'mean_response_ms': sum(timings)/len(timings)*1000}))
