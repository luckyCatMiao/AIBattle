#!/usr/bin/env python3
"""Counterfactual: replay the r2-g19 red-card window with the final policy.

State at frame 2200 comes from the official replay; Sol keeps its official
inputs for frames 2200-2219; our side is re-decided by policy2.py.  Prints the
position of t0u3 each frame and whether it entered the opponent box.
"""
import gzip, json, math, sys, importlib.util
sys.path.insert(0, '.')
import pysim

spec = importlib.util.spec_from_file_location('pol', 'policy2.py')
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)
P.set_engine(pysim.step)

with gzip.open('matches/r2-g19.json.gz', 'rt', encoding='utf-8') as f:
    d = json.load(f)
fr = next(x for x in d['frames'] if x['frame'] == 2200)
units = [{'team': u[1], 'index': u[2], 'x': u[3], 'y': u[4],
          'facing': {'x': u[5], 'y': u[6]}, 'kickCd': u[13] / 20.0,
          'controlLock': u[14] / 20.0} for u in fr['units']]
st = pysim.state_from_obs({'teamSize': d['teamSize'], 'units': units,
                           'ball': dict(fr['ball']), 'score': fr['score'],
                           'frame': 2200, 'golden': fr['golden'],
                           'half': fr['half'], 'freeze': fr['freeze']})
our = d['seats'].index('deepseek-g1')
opp = 1 - our
rows = P.decide(st, our, st.n, pysim)
win = next(w for w in d['windows'] if w['frame'] == 2200)
sol_in = win['inputs'][opp]
min_y = 99.0
max_x = -99.0
for f in range(20):
    inp = []
    for u in st.units:
        if u.team == our:
            c = rows[f].get((our, u.index)) or ('N', None, False)
            if c[1] is not None and not isinstance(c[1], tuple):
                c = (c[0], (math.cos(c[1]), math.sin(c[1])), c[2])
            inp.append(c)
        else:
            c = sol_in[f][u.index]
            aim = c.get('aim')
            vec = None
            if isinstance(aim, (int, float)):
                aa = math.radians(aim)
                vec = (math.cos(aa), math.sin(aa))
            inp.append((c['dir'], vec, bool(c.get('kick'))))
    g = pysim.step(st, inp, st.kickoffTeam)
    u3 = next((u for u in st.units if u.team == our and u.index == 3), None)
    if u3 is None:
        print(f, 't0u3 removed (card) at step', f)
        break
    in_box = 34.0 <= u3.x <= 43.0 and 6.0 <= u3.y <= 20.0
    min_y = min(min_y, u3.y)
    max_x = max(max_x, u3.x)
    print('%2d  x=%.2f y=%.2f  in_box=%s  goal=%s' % (f, u3.x, u3.y, in_box, g))
print('min_y=%.2f max_x=%.2f' % (min_y, max_x))
