# -*- coding: utf-8 -*-
"""Embed policy.py into agent.py as a base64 blob and switch main() to it."""
import base64, re, sys, os

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AG = os.path.join(WS, 'agent.py')
POL = os.path.join(WS, 'policy.py')

src = open(POL, encoding='utf-8').read()
b64 = base64.b64encode(src.encode('utf-8')).decode('ascii')

agent = open(AG, encoding='utf-8').read()

# drop any previously embedded block
agent = re.sub(r"\n# ===== BEGIN EMBEDDED POLICY =====.*?# ===== END EMBEDDED POLICY =====\n",
               "\n", agent, flags=re.S)

block = '''
# ===== BEGIN EMBEDDED POLICY =====
import base64 as _b64
import types as _types
_POLICY_B64 = %r
_POL = _types.ModuleType('policy')
exec(compile(_b64.b64decode(_POLICY_B64).decode('utf-8'), 'policy_embedded.py', 'exec'),
     _POL.__dict__)
# ===== END EMBEDDED POLICY =====
''' % b64

marker = "def main():"
idx = agent.index(marker)
agent = agent[:idx] + block + "\n\n" + agent[idx:]

# main(): use _POL instead of importing policy
old = '''            try:
                import policy as _POL
                fr = _POL.decide(st, me, n, sys.modules[__name__])
            except Exception:'''
new = '''            try:
                fr = _POL.decide(st, me, n, sys.modules[__name__])
            except Exception:'''
if old in agent:
    agent = agent.replace(old, new)
elif "_POL.decide(st, me, n, sys.modules[__name__])" not in agent:
    raise SystemExit('cannot patch main()')

open(AG, 'w', encoding='utf-8').write(agent)
print('embedded %d bytes of policy into agent.py (%d bytes total)' % (len(src), len(agent)))
