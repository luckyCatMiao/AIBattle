import sys, math
sys.path.insert(0, '/workspace')
import soccer
from soccer_meta import get_meta

META = get_meta(); RULES = META['rules']; W, H = META['W'], META['H']
OCT = [('R', 0.0), ('DR', 45.0), ('D', 90.0), ('DL', 135.0),
       ('L', 180.0), ('UL', 225.0), ('U', 270.0), ('UR', 315.0)]


def dir_toward(dx, dy):
    if abs(dx) < 1e-9 and abs(dy) < 1e-9:
        return 'N'
    a = math.degrees(math.atan2(dy, dx))
    best, bd = 'N', 9
    for name, ang in OCT:
        d = abs(math.atan2(math.sin(math.radians(a - ang)), math.cos(math.radians(a - ang))))
        if d < bd:
            bd, best = d, name
    return best


def make_world(n=2):
    w = soccer.World(W, H, META['tiles'], RULES, META['penaltyBoxes'], META['goals'], n)
    w.spawns = {int(k): v for k, v in META['spawns_by_n'][str(n)].items()}
    w.ball = {'x': 0, 'y': 0, 'vx': 0, 'vy': 0, 'owner': None, 'lastTouch': None, 'lastTeam': None}
    return w


def place(w, team, index, x, y, fx=1.0, fy=0.0):
    u = w.add_unit(team, index, f't{team}u{index}')
    u.update({'x': x, 'y': y, 'fx': fx, 'fy': fy})
    return u


def line_target(ku, bx, by):
    gx = 43.0 if ku['team'] == 1 else 1.0
    s = -1 if ku['team'] == 1 else 1
    box = META['penaltyBoxes'][str(ku['team'])]
    kx = gx + s * 2.6
    den = bx - gx
    t = (kx - gx) / den if abs(den) > 0.2 else 0.0
    t = max(-0.6, min(1.6, t))
    ty = 13.0 + t * (by - 13.0)
    ty = max(box['y1'] + 0.5, min(box['y2'] - 0.5, ty))
    return kx, ty


def run(sx, sy, gy, kmode='line', shot_frame=1, frames=140, kpos=None):
    w = make_world(2)
    sh = place(w, 0, 0, sx, sy, 1.0, 0.0)
    w.ball.update({'x': sx + 0.62, 'y': sy, 'owner': 't0u0', 'lastTouch': 't0u0', 'lastTeam': 0})
    if kpos is None:
        kx, ky = line_target({'team': 1}, sx + 0.62, sy)
        kpos = (kx, ky)
    ku = place(w, 1, 0, kpos[0], kpos[1], -1.0, 0.0)
    ang = math.degrees(math.atan2(gy - sy, 43.0 - sx))
    kdir = 'N'
    # keeper's first-window target is chosen from the pre-shot ball position
    pre = (w.ball['x'], w.ball['y'])
    for f in range(frames):
        inp = {}
        if f == shot_frame:
            inp['t0u0'] = {'dir': 'N', 'aim': ang, 'kick': True}
        if f % 20 == 0:
            b = w.ball
            if kmode == 'line':
                tx, ty = line_target(ku, b['x'], b['y'])
            elif kmode == 'chase':
                tx, ty = b['x'], b['y']
            elif kmode == 'idle':
                tx, ty = ku['x'], ku['y']
            elif kmode == 'hold':
                tx, ty = 40.5, 13.0
            kdir = dir_toward(tx - ku['x'], ty - ku['y'])
        inp['t1u0'] = {'dir': kdir, 'aim': None, 'kick': False}
        w.step(inp)
        if w.score[0] > 0:
            return 'G'
        if w.ball['owner'] == 't1u0':
            return 'S'
        if w.status != 'playing':
            break
    return '.'


if __name__ == '__main__':
    gy_list = [10.65, 11.2, 11.8, 12.4, 13.0, 13.6, 14.2, 14.8, 15.35]
    positions = []
    for x in (22, 25, 28, 31, 34, 37, 40):
        positions.append((x, 4.6)); positions.append((x, 21.4))
    for x in (22, 26, 30, 33):
        positions.append((x, 13.0)); positions.append((x, 8.0)); positions.append((x, 18.0))
    for mode in ('line', 'hold', 'chase'):
        print('=== keeper', mode)
        for (sx, sy) in positions:
            row = ''.join(run(sx, sy, gy, mode) for gy in gy_list)
            print(f'  ({sx:4.1f},{sy:4.1f}) [{row}]  targets ' + ' '.join(f'{g:g}' for g in gy_list))
