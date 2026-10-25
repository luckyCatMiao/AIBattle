import json, subprocess, sys, time
obs = json.load(open(sys.argv[1]))
agent = sys.argv[2]
line = json.dumps(obs, separators=(',', ':')) + '\n'
t0 = time.time()
p = subprocess.run([sys.executable, agent], input=line, text=True,
                   capture_output=True, timeout=10)
dt = time.time() - t0
out = json.loads(p.stdout.strip())
win = out['inputs']
n = obs['teamSize']
dirs = {'N','U','D','L','R','UL','UR','DL','DR'}
ok = len(win) == 20 and all(len(fr) == n for fr in win)
bad = []
for fr in win:
    for inp in fr:
        if inp.get('dir') not in dirs: bad.append(('dir', inp))
        a = inp.get('aim')
        if a is not None and not (isinstance(a,(int,float)) and 0 <= a <= 360): bad.append(('aim', inp))
        if not isinstance(inp.get('kick'), bool): bad.append(('kick', inp))
print(f'agent={agent} frames={len(win)} n={n} shape_ok={ok} bad={len(bad)} wall={dt*1000:.1f}ms stderr={len(p.stderr)}')
if bad[:3]: print(bad[:3])
