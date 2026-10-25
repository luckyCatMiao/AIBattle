import sys, math, json
sys.path.insert(0, '/workspace')
import soccer
from soccer_meta import get_meta

META = get_meta()
RULES = META['rules']
W, H = META['W'], META['H']


def make_world(team_attack=0, n=3):
    w = soccer.World(W, H, META['tiles'], RULES, META['penaltyBoxes'], META['goals'], n)
    w.spawns = META['spawns_by_n'][str(n)]
    w.ball = {'x': 0, 'y': 0, 'vx': 0, 'vy': 0, 'owner': None, 'lastTouch': None, 'lastTeam': None}
    return w


def place(w, team, index, x, y, fx=1.0, fy=0.0):
    u = w.add_unit(team, index, f't{team}u{index}')
    u.update({'x': x, 'y': y, 'fx': fx, 'fy': fy})
    return u


def keeper_target(w, ku, mode, ball_state):
    gx = 1.0 if ku['team'] == 0 else 43.0
    box = META['penaltyBoxes'][str(ku['team'])]
    bx, by = ball_state['x'], ball_state['y']
    if mode == 'static':
        return None
    if mode == 'center':
        return gx + (3.0 if ku['team'] == 0 else -3.0), 13.0
    if mode == 'track':
        # stand on the ball->goal-center line, 2.5 from goal line
        kx = gx + (2.5 if ku['team'] == 0 else -2.5)
        t = (kx - gx) / ((bx - gx) or 1e-6)
        ty = 13.0 + t * (by - 13.0)
        return kx, max(box['y1'] + 0.4, min(box['y2'] - 0.4, ty))
    return None


def dir_toward(dx, dy):
    if abs(dx) < 1e-9 and abs(dy) < 1e-9:
        return 'N'
    a = math.atan2(dy, dx)
    octs = [('R', 0.0), ('DR', math.pi / 4), ('D', math.pi / 2), ('DL', 3 * math.pi / 4),
            ('L', math.pi), ('UL', -3 * math.pi / 4), ('U', -math.pi / 2), ('UR', -math.pi / 4)]
    best = None
    bd = 9
    for name, ang in octs:
        d = abs(math.atan2(math.sin(a - ang), math.cos(a - ang)))
        if d < bd:
            bd = d
            best = name
    return best


def shoot_experiment(shooter_pos, target_y, keeper_mode, keeper_pos=None, delay_frames=20, frames=200,
                     other_units=()):
    """Returns 'goal','save','miss'."""
    w = make_world()
    gx = 43.0
    sx, sy = shooter_pos
    sh = place(w, 0, 1, sx, sy, 1.0, 0.0)
    w.ball.update({'x': sx + 0.62, 'y': sy, 'owner': 't0u1', 'lastTouch': 't0u1', 'lastTeam': 0,
                   'vx': 0.0, 'vy': 0.0})
    kx, ky = keeper_pos if keeper_pos else (41.0, 13.0)
    ku = place(w, 1, 0, kx, ky, -1.0, 0.0)
    for (t, i, x, y) in other_units:
        place(w, t, i, x, y)
    ang = math.degrees(math.atan2(target_y - sy, gx - sx))
    outcome = 'miss'
    for f in range(frames):
        if w.status != 'playing':
            break
        if w.golden:
            break
        inp = {}
        if f == 0:
            inp['t0u1'] = {'dir': 'N', 'aim': ang, 'kick': True}
        # keeper behaviour
        if f < delay_frames:
            bs = {'x': w.ball['x'], 'y': w.ball['y']}
            tgt = None if keeper_mode in ('static',) else keeper_target(w, ku, keeper_mode, bs)
        else:
            tgt = keeper_target(w, ku, keeper_mode, {'x': w.ball['x'], 'y': w.ball['y']})
        if tgt is not None:
            dx, dy = tgt[0] - ku['x'], tgt[1] - ku['y']
            inp['t1u0'] = {'dir': dir_toward(dx, dy), 'aim': None, 'kick': False}
        w.step(inp)
        if w.score[0] > 0:
            return 'goal'
        if w.ball['owner'] == 't1u0':
            return 'save'
    return outcome


if __name__ == '__main__':
    import itertools
    modes = ['static', 'center', 'track']
    corners = [('near', 10.8), ('far', 15.2), ('center', 13.0)]
    xs = [14, 20, 26, 30, 33]
    for mode in modes:
        print('=== keeper mode', mode)
        for x in xs:
            for cy in [5.0, 8.0, 13.0, 18.0, 21.0]:
                res = {}
                for cname, ty in corners:
                    r = shoot_experiment((x, cy), ty, mode)
                    res[cname] = r
                print(f'  shot from ({x},{cy}): ' + ' '.join(f'{k}={v}' for k, v in res.items()))
