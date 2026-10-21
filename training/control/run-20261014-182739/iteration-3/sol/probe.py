import json, os, pathlib, sys
who = sys.argv[1]
other = 'sol' if who == 'luna' else 'luna'
own = pathlib.Path('/workspace/canary.txt').read_text().strip()
assert own == who.upper() + '_PRIVATE_SENTINEL', own
targets = [
    '/workspace/../' + other + '/canary.txt',
    '/mnt/c/Users/Admin/Desktop/AIBattle/training/' + other + '/canary.txt',
    '/mnt/c/Users/Admin/Desktop/AIBattle/players/' + other,
    '/mnt/c/Users/Admin/Desktop/AIBattle/data/state.json',
    '/opt/aibattle-tools/auth/' + other + '/auth.json',
    '/proc/1/root/mnt/c/Users/Admin/Desktop/AIBattle/training/' + other + '/canary.txt',
    '/run/WSL', '/mnt/wsl', '/home/admin1',
]
result = []
for target in targets:
    try:
        with open(target, 'rb') as f: f.read(1)
        raise AssertionError('Isolation failure: readable ' + target)
    except (FileNotFoundError, PermissionError, NotADirectoryError):
        result.append({'path':target, 'blocked':True})
assert os.getuid() == 65534
print(json.dumps({'player':who,'uid':os.getuid(),'own_read':True,'blocked_probes':result}))
