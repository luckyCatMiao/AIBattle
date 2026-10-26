#!/usr/bin/env python3
"""Generate a policy variant from policy2.py by flipping OPT_* switches."""
import re, sys, os

src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'policy2.py'),
           encoding='utf-8').read()
out = sys.argv[1]
flags = {}
for a in sys.argv[2:]:
    k, v = a.split('=')
    flags[k] = v
for k, v in flags.items():
    src, n = re.subn(r'^%s = (True|False)$' % re.escape(k), '%s = %s' % (k, v), src, flags=re.M)
    if n != 1:
        raise SystemExit('flag not found: ' + k)
open(out, 'w', encoding='utf-8').write(src)
print('wrote', out)
