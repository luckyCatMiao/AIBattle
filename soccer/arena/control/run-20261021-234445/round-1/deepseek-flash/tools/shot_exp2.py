import sys, math
sys.path.insert(0, '/workspace')
import soccer
from soccer_meta import get_meta

META = get_meta()
RULES = META['rules']
W, H = META['W'], META['H']
OCT = [('R', 0.0), ('DR', math.pi / 4), ('D', math.pi / 2), ('DL', 3 * math.pi / 4),
       ('L', math.pi), ('UL', -3 * math.pi / 4), ('U', -math.pi / 2), ('UR', -math.pi / 4)]


def make_world(n=2):
    w = soccer.World(W, H, META['tiles'], RULES, META['penaltyBoxes'], META['goals'], n)
    w.spawns = {int(k): v for k, v in META['spawns_by_n'][str(n)].items()}
    w.ball = {'x': 0, 'y': 0, 'vx': 0, 'vy': 0, 'owner': None, 'lastTouch': None, 'lastTeam': None}
    return w


def place(w, team, index, x, y, fx=1.0, fy=0.0):
    u = w.add_unit(team, index, f't{team}u{index}')
    u.update({'x': x, 'y': y, 'fx': fx, 'fy': fy})
    return u


def dir_toward(dx, dy):
    if abs(dx) < 1e-9 and abs(dy) < 1e-9:
        return 'N'
    a = math.atan2(dy, dx)
    best, bd = 'N', 9
    for name, ang in OCT:
        d = abs(math.atan2(math.sin(a - ang), math.cos(a - ang)))
        if d < bd:
            bd, best = d, name
    return best


def keeper_dir(kind, ku, ball, bx, by):
    gx = 1.0 if ku['team'] == 0 else 43.0
    box = META['penaltyBoxes'][str(ku['team'])]
    if kind == 'idle':
        return 'N'
    if kind == 'chase':
        tx, ty = bx, by
    else:  # 'line': stand on ball-goal-center line at 2.5 from goal line
        kx = gx + (2.5 if ku['team'] == 0 else -2.5)
        t = (kx - gx) / ((bx - gx) or 1e-6)
        ty = 13.0 + t * (by - 13.0)
        tx = kx
    # clamp inside box (keeper never needed outside)
    tx = max(box['x1'] + 0.4, min(box['x2'] - 0.4, tx))
    ty = max(box['y1'] + 0.4, min(box['y2'] - 0.4, ty))
    return dir_toward(tx - ku['x'], ty - ku['y'])


def run(sx, sy, ty_target, kpos=(40.5, 13.0), kmode='line', shot_frame=1, frames=200, n=2, verbose=False):
    w = make_world(n)
    sh = place(w, 0, 0, sx, sy, 1.0, 0.0)
    w.ball.update({'x': sx + 0.62, 'y': sy, 'owner': 't0u0', 'lastTouch': 't0u0', 'lastTeam': 0})
    ku = place(w, 1, 0, kpos[0], kpos[1], -1.0, 0.0)
    ang = math.degrees(math.atan2(ty_target - sy, 43.0 - sx))
    kdir = 'N'
    for f in range(frames):
        inp = {}
        if f == shot_frame:
            inp['t0u0'] = {'dir': 'N', 'aim': ang, 'kick': True}
        if kmode != 'idle' and f % 20 == 0:
            # 1 Hz controller: decides at window boundary from visible state
            kdir = keeper_dir(kmode, ku, w.ball, w.ball['x'], w.ball['y'])
        if kmode != 'idle':
            inp['t1u0'] = {'dir': kdir, 'aim': None, 'kick': False}
        w.step(inp)
        if w.score[0] > 0:
            return 'goal'
        if w.ball['owner'] == 't1u0':
            return 'save'
        if w.status != 'playing':
            break
    b = w.ball
    return 'miss' + ('' if abs(b['x'] - 43) > 1 else '')


if __name__ == '__main__':
    targets = [('near', 10.8), ('far', 15.2), ('center', 13.0)]
    positions = [(20, 13), (24, 13), (28, 13), (32, 13), (33.2, 13), (33.2, 8), (33.2, 5),
                 (36, 4.5), (40, 4.5), (42, 5.0), (36, 21.5), (42, 21.0), (30, 5), (26, 5)]
    for kmode in ['idle', 'line', 'chase']:
        print('===', kmode)
        for (sx, sy) in positions:
            out = []
            for tn, tyv in targets:
                r = run(sx, sy, tyv, kmode=kmode, shot_frame=1)
                out.append(f'{tn}={r[0]}')
            print(f'  ({sx},{sy}) shot@1: ' + ' '.join(out))
        # late shot
        print('  -- shot at frame 10')
        for (sx, sy) in positions:
            out = []
            for tn, tyv in targets:
                r = run(sx, sy, tyv, kmode=kmode, shot_frame=10)
                out.append(f'{tn}={r[0]}')
            print(f'  ({sx},{sy}) shot@10: ' + ' '.join(out))
