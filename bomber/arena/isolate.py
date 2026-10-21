"""Private contestant mounts; the engine runs the frozen submitted revision."""
import json, os, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent
who, mode, *cmd = sys.argv[1:]
if not who or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in who) or mode not in ('prepare', 'engine'):
    raise SystemExit('invalid contestant/mode')
workspace = ROOT / 'players' / who
selector = ROOT / 'control' / 'workspace-paths.json'
if mode == 'prepare' and selector.exists():
    workspace = (ROOT / json.loads(selector.read_text(encoding='utf-8'))[who]).resolve()
    if not workspace.is_relative_to(ROOT / 'control'):
        raise SystemExit('invalid workspace path')
if mode == 'engine':
    workspace = ROOT / json.loads((ROOT / 'control' / 'engine-paths.json').read_text(encoding='utf-8'))[who]
    workspace = workspace.resolve()
    if not workspace.is_relative_to(ROOT / 'control'):
        raise SystemExit('invalid frozen path')
args = ['bwrap', '--die-with-parent', '--new-session', '--unshare-all']
# 只有准备阶段联网（模型客户端要连自己的端点）；比赛执行阶段完全断网。
if mode == 'prepare':
    args += ['--share-net']
args += ['--cap-drop', 'ALL', '--uid', '65534', '--gid', '65534',
         '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin', '--symlink', 'usr/sbin', '/sbin',
         '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64', '--dir', '/etc',
         '--ro-bind', '/etc/ssl', '/etc/ssl', '--ro-bind', '/etc/resolv.conf', '/etc/resolv.conf',
         '--ro-bind', str(ROOT / 'control' / 'network-hosts'), '/etc/hosts',
         '--ro-bind', '/etc/nsswitch.conf', '/etc/nsswitch.conf', '--ro-bind', '/etc/passwd', '/etc/passwd',
         '--ro-bind', '/etc/group', '/etc/group', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
         '--dir', '/home', '--dir', '/home/player',
         '--ro-bind' if mode == 'engine' else '--bind', str(workspace), '/workspace',
         '--clearenv', '--setenv', 'HOME', '/home/player',
         '--setenv', 'PATH', '/usr/bin:/bin:/tools/node_modules/.bin',
         '--setenv', 'LANG', 'C.UTF-8', '--setenv', 'PYTHONUNBUFFERED', '1',
         '--setenv', 'PYTHONDONTWRITEBYTECODE', '1',
         '--setenv', 'NODE_EXTRA_CA_CERTS', '/etc/ssl/certs/ca-certificates.crt',
         '--chdir', '/workspace']
if mode == 'prepare':
    # 每个选手一个私有 home；clients.json 决定挂 .claude 还是 .codex。
    clients = json.loads((ROOT / 'control' / 'clients.json').read_text(encoding='utf-8'))
    home = pathlib.Path(json.loads((ROOT / 'control' / 'home-paths.json').read_text(encoding='utf-8'))[who])
    if not home.is_relative_to('/opt/aibattle-tools/auth'):
        raise SystemExit('invalid home path')
    args += ['--ro-bind', '/opt/aibattle-tools/node_modules', '/tools/node_modules',
             '--bind', str(home / ('.claude' if clients.get(who) == 'claude' else '.codex')),
             '/home/player/.claude' if clients.get(who) == 'claude' else '/home/player/.codex']
os.execvp('bwrap', args + ['--'] + cmd)
