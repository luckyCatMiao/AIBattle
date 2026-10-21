import json, os, pathlib, sys
who = sys.argv[1]
own = pathlib.Path('/workspace/canary.txt').read_text().strip()
assert own == who.upper() + '_PRIVATE_SENTINEL', own
targets = [
    '/mnt/c/Users/Admin/Desktop/AIBattle/data/state.json',
    '/run/WSL', '/mnt/wsl', '/home/admin1',
]
for other in ('luna','sol','astra'):
    if other!=who:
        targets += ['/workspace/../'+other+'/canary.txt',
                    '/mnt/c/Users/Admin/Desktop/AIBattle/training/'+other+'/canary.txt',
                    '/mnt/c/Users/Admin/Desktop/AIBattle/players/'+other,
                    '/opt/aibattle-tools/auth/'+other+'/auth.json',
                    '/proc/1/root/mnt/c/Users/Admin/Desktop/AIBattle/training/'+other+'/canary.txt']
result = []
for target in targets:
    try:
        with open(target, 'rb') as f: f.read(1)
        raise AssertionError('Isolation failure: readable ' + target)
    except (FileNotFoundError, PermissionError, NotADirectoryError):
        result.append({'path':target, 'blocked':True})
assert os.getuid() == 65534
print(json.dumps({'player':who,'uid':os.getuid(),'own_read':True,'blocked_probes':result}))
