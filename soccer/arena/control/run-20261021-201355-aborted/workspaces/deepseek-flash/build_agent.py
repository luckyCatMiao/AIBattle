"""Assemble a single self-contained agent.py from physics.py + policy.py."""
import re

phys = open('/workspace/physics.py').read()
phys = phys.split("if __name__ == '__main__':")[0].rstrip()

pol = open('/workspace/policy.py').read()
pol = pol.split("if __name__ == '__main__':")[0].rstrip()
# drop module imports; the inlined physics names come first
pol = pol.replace('import math\nimport physics\n', '')
pol = re.sub(r'from physics import \([^)]*\)\n', '', pol)
pol = pol.replace('physics.World()', 'World()')

header = '''#!/usr/bin/env python3
"""3v3 soccer controller -- single-file submission.

Reads one observation JSON per line on stdin, writes exactly one 20-frame
window JSON per line on stdout, flushing immediately.  Debug output, if any,
goes to stderr.

The file is self-contained: it includes a faithful port of the match physics
(used only as an internal forward model) and the tactical controller.
"""
import sys
import json
import math
'''

main = '''

# ====================================================================== #
# stdin / stdout driver
# ====================================================================== #
VALID_DIRS = set(DIRS.keys())


def _clean_input(inp, fallback_aim):
    if not isinstance(inp, dict):
        return {'dir': 'N', 'aim': fallback_aim, 'kick': False}
    d = inp.get('dir')
    if d not in VALID_DIRS:
        d = 'N'
    a = inp.get('aim')
    if not (isinstance(a, (int, float)) and not isinstance(a, bool)
            and math.isfinite(a)):
        if isinstance(a, str) and a in VALID_DIRS and a != 'N':
            pass
        else:
            a = fallback_aim
    return {'dir': d, 'aim': a, 'kick': bool(inp.get('kick'))}


def _neutral_window(team=0):
    aim = 0 if team == 0 else 180
    return {'inputs': [[{'dir': 'N', 'aim': aim, 'kick': False}
                        for _ in range(3)] for _ in range(20)]}


def _window_to_json(win, team):
    frames = win.get('inputs') if isinstance(win, dict) else None
    if not isinstance(frames, list) or len(frames) != 20:
        return json.dumps(_neutral_window(team), separators=(',', ':'))
    aim = 0 if team == 0 else 180
    out = []
    for frame in frames:
        if not isinstance(frame, list):
            frame = []
        row = [_clean_input(frame[i] if i < len(frame) else None, aim)
               for i in range(3)]
        out.append(row)
    return json.dumps({'inputs': out}, separators=(',', ':'))


def main():
    agent = Agent()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        team = 0
        try:
            obs = json.loads(line)
            team = int(obs.get('yourTeam', 0))
            win = agent.plan_window(obs)
            text = _window_to_json(win, team)
        except Exception as exc:  # never let a bad state kill the process
            print('agent error: %r' % (exc,), file=sys.stderr)
            text = json.dumps(_neutral_window(team), separators=(',', ':'))
        sys.stdout.write(text + '\\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
'''

body = header + '\n\n# ====================================================================== #\n# physics forward model\n# ====================================================================== #\n' + phys + \
       '\n\n# ====================================================================== #\n# tactical controller\n# ====================================================================== #\n' + pol + main
open('/workspace/agent.py', 'w').write(body)
print('wrote agent.py, %d bytes' % len(body))
