import io
p = 'agent.py'
s = io.open(p, encoding='utf-8').read()
old = """    scored = []
    stay_sc = None
    for (sc, cells, bidx, note) in cands:"""
new = """    scored = []
    stay_sc = None
    passive_sc = None      # 「原地」与「纯走位」里较高的那个：干活计划必须压过它
    for (sc, cells, bidx, note) in cands:"""
assert old in s
s = s.replace(old, new)
old = """        if note == 'stay':
            stay_sc = sc
        scored.append((sc, cells, bidx, note, endc, danger))"""
new = """        if note == 'stay':
            stay_sc = sc
        if note in ('stay', 'approach'):
            passive_sc = sc if passive_sc is None else max(passive_sc, sc)
        scored.append((sc, cells, bidx, note, endc, danger))"""
assert old in s
s = s.replace(old, new)
old = """    if stay_sc is not None:
        out = []
        for (sc, cells, bidx, note, endc, danger) in scored:
            productive = ((note.startswith('bomb') and (' OPEN' in note or ' KILL' in note))
                          or note.startswith('drop:'))
            if productive and not danger:
                sc = max(sc, stay_sc + 0.3)
            out.append((sc, cells, bidx, note))
        scored = out"""
new = """    if passive_sc is not None:
        out = []
        for (sc, cells, bidx, note, endc, danger) in scored:
            productive = ((note.startswith('bomb') and (' OPEN' in note or ' KILL' in note))
                          or note.startswith('drop:'))
            if productive and not danger:
                sc = max(sc, passive_sc + 0.3)
            out.append((sc, cells, bidx, note))
        scored = out"""
assert old in s
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(s)
print('patched')
