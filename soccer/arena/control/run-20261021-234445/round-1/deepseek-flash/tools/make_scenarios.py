import json, os, subprocess, sys

OUT = '/workspace/tools/scen'
os.makedirs(OUT, exist_ok=True)

def unit(team, index, x, y, fx=1.0, fy=0.0, **kw):
    d = {'team': team, 'index': index, 'x': x, 'y': y, 'fx': fx, 'fy': fy}
    d.update(kw)
    return d

def frame_inputs(n, actions):
    """actions: dict (team,index)->input ; fill rest neutral"""
    fr = {0: [], 1: []}
    for t in (0, 1):
        for i in range(n):
            fr[t].append(actions.get((t, i), {'dir': 'N', 'aim': None, 'kick': False}))
    return fr

def scenario(name, n, units, ball, frames, **kw):
    sc = {'teamSize': n, 'seed': 1, 'units': units, 'ball': ball, 'frames': frames}
    sc.update(kw)
    with open(f'{OUT}/{name}.json', 'w') as f:
        json.dump(sc, f)
    return name

names = []
N = 3
# 1) walk into opponent penalty box -> foul
units = [unit(0, 0, 11.5, 13.5), unit(0, 1, 32.0, 13.0), unit(0, 2, 11.5, 19.5),
         unit(1, 0, 42.0, 13.0), unit(1, 1, 32.5, 9.5), unit(1, 2, 32.5, 19.5)]
frames = [frame_inputs(N, {(0, 1): {'dir': 'R', 'aim': 0, 'kick': False}}) for _ in range(20)]
names.append(scenario('foul_enter', N, units, {'x': 20, 'y': 13}, frames))

# 2) shot at empty goal (keeper far outside box)
units = [unit(0, 0, 11.5, 13.5), unit(0, 1, 30.0, 13.0, 1.0, 0.0), unit(0, 2, 11.5, 19.5),
         unit(1, 0, 40.0, 22.5), unit(1, 1, 32.5, 3.5), unit(1, 2, 32.5, 19.5)]
frames = [frame_inputs(N, {(0, 1): {'dir': 'N', 'aim': 0, 'kick': i == 0}}) for i in range(40)]
names.append(scenario('goal_center', N, units, {'x': 30.62, 'y': 13.0, 'owner': 't0u1', 'lastTouch': 't0u1', 'lastTeam': 0}, frames))

# 3) shot into keeper (should be saved)
units = [unit(0, 0, 11.5, 13.5), unit(0, 1, 30.0, 13.0, 1.0, 0.0), unit(0, 2, 11.5, 19.5),
         unit(1, 0, 41.0, 13.0), unit(1, 1, 32.5, 3.5), unit(1, 2, 32.5, 19.5)]
frames = [frame_inputs(N, {(0, 1): {'dir': 'N', 'aim': 0, 'kick': i == 0}}) for i in range(40)]
names.append(scenario('shot_saved', N, units, {'x': 30.62, 'y': 13.0, 'owner': 't0u1', 'lastTouch': 't0u1', 'lastTeam': 0}, frames))

# 4) corner shot from a wing position (x>34, y<6 legal)
units = [unit(0, 0, 11.5, 13.5), unit(0, 1, 38.0, 4.5, 0.6, 0.8), unit(0, 2, 11.5, 19.5),
         unit(1, 0, 41.5, 12.0), unit(1, 1, 32.5, 3.5), unit(1, 2, 32.5, 19.5)]
import math
ang = math.degrees(math.atan2(15.2 - 4.5, 43.0 - 38.0))
frames = [frame_inputs(N, {(0, 1): {'dir': 'N', 'aim': round(ang, 3), 'kick': i == 0}}) for i in range(40)]
names.append(scenario('wing_shot', N, units, {'x': 38.0 + 0.6*0.62, 'y': 4.5 + 0.8*0.62, 'owner': 't0u1', 'lastTouch': 't0u1', 'lastTeam': 0}, frames))

# 5) wall bounce: shoot up-left at the top wall
units = [unit(0, 0, 11.5, 13.5), unit(0, 1, 20.0, 20.0, -0.3, -1.0), unit(0, 2, 11.5, 19.5),
         unit(1, 0, 42.0, 13.0), unit(1, 1, 32.5, 3.5), unit(1, 2, 32.5, 19.5)]
frames = [frame_inputs(N, {(0, 1): {'dir': 'N', 'aim': 250.0, 'kick': i == 0}}) for i in range(40)]
names.append(scenario('wall_bounce', N, units, {'x': 20.0, 'y': 20.0, 'owner': 't0u1', 'lastTouch': 't0u1', 'lastTeam': 0}, frames))

# 6) tackle: t1 owns, t0 close in front
units = [unit(0, 0, 11.5, 13.5), unit(0, 1, 21.0, 13.7, 1.0, 0.0), unit(0, 2, 11.5, 19.5),
         unit(1, 0, 42.0, 13.0), unit(1, 1, 20.0, 13.0, 1.0, 0.0), unit(1, 2, 32.5, 19.5)]
frames = [frame_inputs(N, {(0, 1): {'dir': 'D', 'aim': 0, 'kick': False}, (1, 1): {'dir': 'R', 'aim': 0, 'kick': False}}) for _ in range(20)]
names.append(scenario('tackle', N, units, {'x': 20.62, 'y': 13.0, 'owner': 't1u1', 'lastTouch': 't1u1', 'lastTeam': 1}, frames))

# 7) goal then kickoff reset + freeze
units = [unit(0, 0, 11.5, 13.5), unit(0, 1, 30.0, 13.0, 1.0, 0.0), unit(0, 2, 11.5, 19.5),
         unit(1, 0, 40.0, 22.5), unit(1, 1, 32.5, 3.5), unit(1, 2, 32.5, 19.5)]
frames = [frame_inputs(N, {(0, 1): {'dir': 'N', 'aim': 0, 'kick': i == 0},
                           (0, 0): {'dir': 'R', 'aim': 0, 'kick': False}}) for i in range(40)]
names.append(scenario('goal_kickoff', N, units, {'x': 30.62, 'y': 13.0, 'owner': 't0u1', 'lastTouch': 't0u1', 'lastTeam': 0}, frames))

# 8) halftime reset
units = [unit(0, 0, 11.5, 13.5), unit(0, 1, 22.0, 13.0, 1.0, 0.0), unit(0, 2, 11.5, 19.5),
         unit(1, 0, 42.0, 13.0), unit(1, 1, 32.5, 3.5), unit(1, 2, 32.5, 19.5)]
frames = [frame_inputs(N, {(0, 1): {'dir': 'R', 'aim': 0, 'kick': False}}) for _ in range(20)]
names.append(scenario('halftime', N, units, {'x': 22.0, 'y': 13.0}, frames, frame=1191, half=1, score=[1, 0], kickoffTeam=0))

# 9) solo 1v1 kickoff, both keepers
N1 = 1
units = [unit(0, 0, 11.5, 13.5), unit(1, 0, 32.5, 13.5)]
frames = [frame_inputs(N1, {(0, 0): {'dir': 'R', 'aim': 0, 'kick': False}, (1, 0): {'dir': 'L', 'aim': 180, 'kick': False}}) for _ in range(20)]
names.append(scenario('solo_race', N1, units, {'x': 22, 'y': 13}, frames))

ok = 0
for nm in names:
    r = subprocess.run(['node', 'tools/js_scen.js', f'{OUT}/{nm}.json', f'{OUT}/{nm}.trace.json'],
                       cwd='/workspace', capture_output=True, text=True)
    print(nm, '->', r.stdout.strip() or r.stderr.strip())
    if r.returncode != 0:
        continue
    r2 = subprocess.run(['python3', 'tools/py_check.py', f'{OUT}/{nm}.trace.json'],
                        cwd='/workspace', capture_output=True, text=True)
    line = [l for l in r2.stdout.strip().split('\n') if l.startswith('total')]
    print('   check:', line[0] if line else r2.stdout[-300:], r2.stderr[-300:] if r2.returncode else '')
    if line and line[0].endswith('0'):
        ok += 1
print('validated', ok, '/', len(names))
