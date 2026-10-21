"""Private contestant mounts; the engine runs the frozen submitted revision."""
import json, os, pathlib, sys
ROOT = pathlib.Path('/mnt/c/Users/Admin/Desktop/AIBattle/rts/arena')
who, mode, *cmd = sys.argv[1:]
if who not in ('sol', 'luna', 'astra', 'opus') or mode not in ('prepare', 'engine'):
    raise SystemExit('invalid contestant/mode')
workspace = ROOT / 'players' / who
selector = ROOT/'control'/'workspace-paths.json'
if mode == 'prepare' and selector.exists():
    workspace = (ROOT / json.loads(selector.read_text())[who]).resolve()
    if not workspace.is_relative_to(ROOT/'control'): raise SystemExit('invalid workspace path')
if mode == 'engine':
    workspace = ROOT / json.loads((ROOT/'control'/'engine-paths.json').read_text())[who]
    workspace = workspace.resolve()
    if not workspace.is_relative_to(ROOT/'control'): raise SystemExit('invalid frozen path')
args = ['bwrap', '--die-with-parent', '--new-session', '--unshare-all']
if mode == 'prepare': args += ['--share-net']
args += ['--cap-drop','ALL','--uid','65534','--gid','65534',
 '--ro-bind','/usr','/usr','--symlink','usr/bin','/bin','--symlink','usr/sbin','/sbin',
 '--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--dir','/etc',
 '--ro-bind','/etc/ssl','/etc/ssl','--ro-bind','/etc/resolv.conf','/etc/resolv.conf',
 '--ro-bind',str(ROOT/'control'/'network-hosts'),'/etc/hosts',
 '--ro-bind','/etc/nsswitch.conf','/etc/nsswitch.conf','--ro-bind','/etc/passwd','/etc/passwd',
 '--ro-bind','/etc/group','/etc/group','--proc','/proc','--dev','/dev','--tmpfs','/tmp',
 '--dir','/home','--dir','/home/player',
 '--ro-bind' if mode=='engine' else '--bind',str(workspace),'/workspace',
 '--clearenv','--setenv','HOME','/home/player','--setenv','PATH','/usr/bin:/bin:/tools/node_modules/.bin',
 '--setenv','LANG','C.UTF-8','--setenv','PYTHONUNBUFFERED','1','--setenv','PYTHONDONTWRITEBYTECODE','1',
 '--setenv','NODE_EXTRA_CA_CERTS','/etc/ssl/certs/ca-certificates.crt','--chdir','/workspace']
if mode=='prepare':
 args += ['--ro-bind','/opt/aibattle-tools/node_modules','/tools/node_modules',
          '--bind','/opt/aibattle-tools/auth/'+who,'/home/player/.claude' if who=='opus' else '/home/player/.codex']
os.execvp('bwrap', args+['--']+cmd)
