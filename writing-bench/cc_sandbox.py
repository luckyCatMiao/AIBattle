"""Linux entry point: only this contestant's project and home are mounted."""
import os
import json
from pathlib import Path
import re
import sys
import time

run, entry, *command = sys.argv[1:]
if not re.fullmatch(r'combat-\d{8}-\d{6}-[a-f0-9]{6}', run) or not re.fullmatch(r'作品-\d{2}', entry):
    raise SystemExit('Invalid workspace')
root = Path('/mnt/c/Users/Admin/Desktop/AIBattle/writing-bench/combat-runs') / run
# Controllers from an earlier version may retry an interrupted child. Park only
# this stopped entry before launching Claude; other contestants keep running.
terminal = root / 'terminal-results.json'
while terminal.exists():
    try:
        excluded = json.loads(terminal.read_text(encoding='utf-8')).get('entries', {})
    except (OSError, ValueError):
        time.sleep(1)
        continue
    if entry not in excluded:
        break
    time.sleep(30)
project = root / 'entries' / entry / 'project'
home = Path('/opt/aibattle-cc') / run / entry / 'home'
args = ['bwrap', '--die-with-parent', '--new-session', '--unshare-all', '--share-net',
        '--cap-drop', 'ALL', '--uid', '65534', '--gid', '65534',
        '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin',
        '--symlink', 'usr/sbin', '/sbin', '--symlink', 'usr/lib', '/lib',
        '--symlink', 'usr/lib64', '/lib64', '--dir', '/etc']
for name in ('ssl', 'resolv.conf', 'hosts', 'nsswitch.conf', 'passwd', 'group'):
    args += ['--ro-bind', '/etc/' + name, '/etc/' + name]
args += ['--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
         '--dir', '/home', '--bind', str(home), '/home/player',
         '--bind', str(project), '/workspace',
         '--ro-bind', '/opt/aibattle-tools/node_modules', '/tools/node_modules',
         '--clearenv', '--setenv', 'HOME', '/home/player',
         '--setenv', 'PATH', '/usr/bin:/bin:/tools/node_modules/.bin',
         '--setenv', 'LANG', 'C.UTF-8', '--setenv', 'TERM', 'dumb',
         '--setenv', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '1',
         '--setenv', 'DISABLE_AUTOUPDATER', '1', '--chdir', '/workspace']
if '--model' in command and command[command.index('--model') + 1] in ('gpt-5.6-sol', 'gpt-6-astra', 'gpt-6-luna'):
    args += ['--setenv', 'DEBUG', '1']
os.execvp('bwrap', args + ['--'] + command)
