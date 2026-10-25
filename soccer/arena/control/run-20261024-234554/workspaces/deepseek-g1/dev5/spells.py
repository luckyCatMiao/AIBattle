import gzip, json, glob, sys
D = sys.argv[1]
fn = sys.argv[2]
d = json.load(gzip.open(D + '/' + fn, 'rt', encoding='utf-8'))
me = d['seats'].index('deepseek-g1')
fr = d['frames']
spells = []
cur = None
for f in fr:
    b = f['ball']; o = b.get('owner')
    team = None
    if o:
        u = next((u for u in f['units'] if u['id'] == o), None)
        team = None if u is None else u['team']
    key = (team, (u['index'] if (o and u is not None) else None))
    if cur is None or cur[0] != key:
        if cur: spells.append(cur)
        cur = [key, f['frame'], f['frame'], b['x'], b['x']]
    else:
        cur[2] = f['frame']; cur[4] = b['x']
if cur: spells.append(cur)
print(f"{fn} n={d['teamSize']} seat={me} score={d['scores']} frames={len(fr)}")
print('spells (owner, start, end, x0, x1) with len>=20:')
for key, a, b2, x0, x1 in spells:
    if b2 - a >= 20:
        tag = 'ME ' if key[0] == me else ('OPP' if key[0] is not None else '---')
        print(f'  {tag} idx={key[1]} f{a:5d}-{b2:5d} ({a/20:6.1f}-{b2/20:6.1f}s) x {x0:5.1f}->{x1:5.1f}')
ev = d['final'].get('events') or []
print('tackles:', sum(1 for e in ev if e['type'] == 'tackle'))
print('kick times:', [(e['frame'], e['team'], round(e['x'],1), round(e['y'],1)) for e in ev if e['type']=='kick'][:60])
