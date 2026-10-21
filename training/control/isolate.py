"""Run one contestant inside a private Linux mount/PID namespace (WSL).

The opponent, Windows drives, referee files, and parent /proc are not mounted.
Only a contestant's own workspace is writable. No Windows interop sockets.
"""
import os
import pathlib
import sys

ROOT = pathlib.Path('/mnt/c/Users/Admin/Desktop/AIBattle/training')
name, mode, *command = sys.argv[1:]
if name not in ('luna', 'sol', 'astra') or mode not in ('prepare', 'engine', 'probe'):
    raise SystemExit('invalid contestant/mode')
workspace = ROOT / name
args = ['bwrap', '--die-with-parent', '--new-session', '--unshare-all']
if mode == 'prepare':
    args += ['--share-net']  # Codex service only needed during authoring.
args += ['--cap-drop', 'ALL', '--uid', '65534', '--gid', '65534',
         '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin',
         '--symlink', 'usr/sbin', '/sbin', '--symlink', 'usr/lib', '/lib',
         '--symlink', 'usr/lib64', '/lib64', '--dir', '/etc',
         '--ro-bind', '/etc/ssl', '/etc/ssl',
         '--ro-bind', '/etc/resolv.conf', '/etc/resolv.conf',
         '--ro-bind', str(ROOT / 'control' / 'network-hosts'), '/etc/hosts',
         '--ro-bind', '/etc/nsswitch.conf', '/etc/nsswitch.conf',
         '--ro-bind', '/etc/passwd', '/etc/passwd',
         '--ro-bind', '/etc/group', '/etc/group',
         '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
         '--dir', '/home', '--dir', '/home/player',
         '--ro-bind' if mode == 'engine' else '--bind', str(workspace), '/workspace',
         '--clearenv', '--setenv', 'HOME', '/home/player',
         '--setenv', 'PATH', '/usr/bin:/bin:/tools/node_modules/.bin',
         '--setenv', 'LANG', 'C.UTF-8', '--setenv', 'PYTHONUNBUFFERED', '1',
         '--setenv', 'PYTHONDONTWRITEBYTECODE', '1',
         '--setenv', 'NODE_EXTRA_CA_CERTS', '/etc/ssl/certs/ca-certificates.crt',
         '--chdir', '/workspace']
if mode == 'prepare':
    args += ['--ro-bind', '/opt/aibattle-tools/node_modules', '/tools/node_modules',
             '--bind', '/opt/aibattle-tools/auth/' + name, '/home/player/.codex']
os.execvp('bwrap', args + ['--'] + command)
