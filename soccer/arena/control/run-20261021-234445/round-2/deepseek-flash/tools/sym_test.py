"""Mirror-symmetry test for the brain.

Build a world, mirror it (x -> W-x, teams swapped), plan with Brain(0) and
Brain(1), mirror the second plan back and compare the two input scripts.
Any difference reveals a left/right bias in the brain.
"""
import sys, math, json
sys.path.insert(0, '/workspace')
sys.path.insert(0, '/workspace/tools')
import soccer
import brain as B
from soccer_meta import get_meta

META = get_meta()
W, H = META['W'], META['H']
MIRROR_DIR = {'N': 'N', 'U': 'U', 'D': 'D', 'L': 'R', 'R': 'L',
              'UL': 'UR', 'UR': 'UL', 'DL': 'DR', 'DR': 'DL'}


def mirror_world(w):
    # PENALTY_BOXES/GOALS are keyed by the goal a team *defends*, and the
    # x-mirror together with the team-label swap leaves that mapping unchanged
    # (team 0 always defends the left goal). So they must NOT be swapped.
    m = soccer.World(w.W, w.H, list(w.tiles), w.rules,
                     {k: dict(v) for k, v in w.pen.items()},
                     {k: dict(v) for k, v in w.goals.items()}, w.teamSize)
    m.spawns = {}
    for t in (0, 1):
        m.spawns[t] = [(w.W - x, y) for (x, y) in w.spawns[1 - t]]
    m.frame = w.frame
    m.half = w.half
    m.score = [w.score[1], w.score[0]]
    m.kickoffTeam = 1 - w.kickoffTeam
    m.freeze = w.freeze
    m.status = w.status
    m.golden = w.golden
    m.goldenEnd = w.goldenEnd
    for u in w.units:
        v = dict(u)
        v['id'] = 't%du%d' % (1 - u['team'], u['index'])
        v['team'] = 1 - u['team']
        v['x'] = w.W - u['x']
        v['fx'] = -u['fx']
        m.units.append(v)
    # canonical unit order (team 0 first, then index): the engine's tie-breaks
    # are array-order sensitive, so a non-canonical order would fake a bias
    m.units.sort(key=lambda x: (x['team'], x['index']))
    b = dict(w.ball)
    b['x'] = w.W - b['x']
    b['vx'] = -b['vx']
    for k in ('owner', 'lastTouch'):
        if b[k]:
            b[k] = 't%d%s' % (1 - int(b[k][1]), b[k][2:])
    m.ball = b
    return m


def mirror_inp(inp):
    out = {'dir': MIRROR_DIR[inp['dir']], 'aim': None, 'kick': inp['kick']}
    if inp['aim'] is not None:
        out['aim'] = (180.0 - float(inp['aim'])) % 360.0
    return out


def cmp_frames(a, b, tol=1e-6):
    bad = []
    for fi in range(len(a)):
        for ui in range(len(a[fi])):
            x = a[fi][ui]
            y = b[fi][ui]
            if x['dir'] != y['dir'] or x['kick'] != y['kick']:
                bad.append((fi, ui, x, y))
            elif (x['aim'] is None) != (y['aim'] is None):
                bad.append((fi, ui, x, y))
            elif x['aim'] is not None:
                d = abs(math.atan2(math.sin(math.radians(x['aim'] - y['aim'])),
                                   math.cos(math.radians(x['aim'] - y['aim']))))
                if d > tol:
                    bad.append((fi, ui, x, y))
    return bad


def scenario(states):
    for idx, (desc, setup) in enumerate(states):
        w = soccer.World(W, H, META['tiles'], META['rules'], META['penaltyBoxes'],
                         META['goals'], setup['n'])
        w.spawns = {int(k): v for k, v in META['spawns_by_n'][str(setup['n'])].items()}
        for u in setup['units']:
            team, i, x, y, fx, fy = u
            uu = w.add_unit(team, i, 't%du%d' % (team, i))
            uu.update({'x': x, 'y': y, 'fx': fx, 'fy': fy})
        w.ball.update(setup['ball'])
        w.frame = setup.get('frame', 0)
        w.half = setup.get('half', 1)
        w.score = setup.get('score', [0, 0])
        w.kickoffTeam = setup.get('kick', 0)
        m = mirror_world(w)
        f0 = B.Brain(0).plan(w)
        f1 = B.Brain(1).plan(m)
        f1m = [[mirror_inp(inp) for inp in fr] for fr in f1]
        bad = cmp_frames(f0, f1m)
        print(desc, 'mismatches', len(bad), bad[:2] if bad else '')


def base(n, fill):
    units = []
    for team in (0, 1):
        for i in range(n):
            units.append(fill(team, i))
    return units


def spawn_units(n):
    sp = META['spawns_by_n'][str(n)]
    out = []
    for team in (0, 1):
        for i in range(n):
            x, y = sp[str(team)][i]
            out.append((team, i, x + 0.5, y + 0.5, 1.0 if team == 0 else -1.0, 0.0))
    return out


if __name__ == '__main__':
    states = [('kickoff n=5', {'n': 5, 'units': spawn_units(5),
                              'ball': {'x': 22.0, 'y': 13.0}}),
              ('kickoff n=3', {'n': 3, 'units': spawn_units(3),
                              'ball': {'x': 22.0, 'y': 13.0}})]
    # mid-field possession for team 0
    u = spawn_units(5)
    u[2] = (0, 2, 19.0, 9.0, 1.0, 0.0)
    u[8] = (1, 3, 26.0, 15.0, -1.0, 0.0)
    states.append(('carry n=5', {'n': 5, 'units': u,
                                 'ball': {'x': 19.6, 'y': 9.0, 'owner': 't0u2',
                                          'lastTouch': 't0u2', 'lastTeam': 0}}))
    # deep defence
    u2 = spawn_units(5)
    u2[0] = (0, 0, 4.0, 14.0, 1.0, 0.0)
    u2[5] = (1, 0, 39.5, 12.0, -1.0, 0.0)
    states.append(('deep n=5', {'n': 5, 'units': u2,
                                'ball': {'x': 10.0, 'y': 12.0, 'owner': 't1u2',
                                         'lastTouch': 't1u2', 'lastTeam': 1}}))
    scenario(states)
