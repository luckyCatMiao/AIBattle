"""Debug the first symmetry mismatch: record choose_dir targets per frame."""
import sys, math
sys.path.insert(0, '/workspace')
sys.path.insert(0, '/workspace/tools')
import soccer
import brain as B
from soccer_meta import get_meta
import sym_test as S

META = get_meta()
W, H = META['W'], META['H']

REC = {}


def install(brain, tag):
    orig = brain.choose_dir

    def wrap(w, u, target, avoid_box=None, stop=0.0):
        r = orig(w, u, target, avoid_box=avoid_box, stop=stop)
        try:
            REC.setdefault(tag, []).append(
                (int(w.frame), u['id'], (round(u['x'], 6), round(u['y'], 6)),
                 (round(target[0], 6), round(target[1], 6)), r))
        except Exception:
            pass
        return r

    brain.choose_dir = wrap
    return brain


def build(n, units_setup, ball):
    w = soccer.World(W, H, META['tiles'], META['rules'], META['penaltyBoxes'],
                     META['goals'], n)
    w.spawns = {int(k): v for k, v in META['spawns_by_n'][str(n)].items()}
    for u in units_setup:
        team, i, x, y, fx, fy = u
        uu = w.add_unit(team, i, 't%du%d' % (team, i))
        uu.update({'x': x, 'y': y, 'fx': fx, 'fy': fy})
    w.ball.update(ball)
    return w


units = S.spawn_units(5)
w = build(5, units, {'x': 22.0, 'y': 13.0})
m = S.mirror_world(w)
b0 = install(B.Brain(0), 'orig')
b1 = install(B.Brain(1), 'mirr')
f0 = b0.plan(w)
f1 = b1.plan(m)
f1m = [[S.mirror_inp(inp) for inp in fr] for fr in f1]
bad = S.cmp_frames(f0, f1m)
print('bad', len(bad))
for fi, ui, x, y in bad[:6]:
    print('FRAME', fi, 'UNIT', ui, x, y)
    for tag in ('orig', 'mirr'):
        recs = [r for r in REC[tag] if r[0] == fi and r[1].endswith('u%d' % ui)]
        print(' ', tag, recs)
