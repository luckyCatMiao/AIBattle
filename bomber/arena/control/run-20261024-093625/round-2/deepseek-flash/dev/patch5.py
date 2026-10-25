import io
p = 'agent.py'
s = io.open(p, encoding='utf-8').read()
old = "DROP_VALUE = {'bomb': 1.6, 'blast': 3.0, 'speed': 2.6}"
new = ("import os as _os2\n"
       "DROP_VALUE = {'bomb': float(_os2.environ.get('AG_VBOMB', '1.6')),\n"
       "              'blast': float(_os2.environ.get('AG_VBLAST', '3.0')),\n"
       "              'speed': float(_os2.environ.get('AG_VSPEED', '2.6'))}")
assert old in s
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(s)
print('patched')
