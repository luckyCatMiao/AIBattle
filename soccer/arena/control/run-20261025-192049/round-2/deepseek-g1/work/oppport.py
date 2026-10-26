# -*- coding: utf-8 -*-
"""Python port of the opponent's policy (sol_agent.js) for prediction / planning.

Ported line by line from the frozen opponent source handed to us in
opponent/sol_agent.js.  Only `previous.policy` (their round-1 module) is not
available; callers can substitute a fallback via PREVIOUS.

Coordinate convention: `local()` mirrors the world so that the modelled team
always attacks +x.  All helper functions below work in that mirrored frame.
"""
import math

S = math.sqrt(0.5)
D = [('N', 0, 0), ('U', 0, -1), ('D', 0, 1), ('L', -1, 0), ('R', 1, 0),
     ('UL', -S, -S), ('UR', S, -S), ('DL', -S, S), ('DR', S, S)]
DMAP = {d[0]: (d[1], d[2]) for d in D}
MIRROR = {'L': 'R', 'R': 'L', 'UL': 'UR', 'UR': 'UL', 'DL': 'DR', 'DR': 'DL'}


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def angle(x, y):
    return (math.degrees(math.atan2(y, x)) % 360.0 + 360.0) % 360.0


def safe(x, y):
    return (x >= 1.4 and x <= 42.6 and y >= 1.4 and y <= 24.6
            and not (x >= 33.0 and y >= 5.0 and y <= 21.0))


class U(object):
    __slots__ = ('id', 'team', 'index', 'x', 'y', 'fx', 'fy', 'hasBall', 'keeper')

    def __init__(self, d):
        self.id = d['id']
        self.team = d['team']
        self.index = d['index']
        self.x = d['x']
        self.y = d['y']
        f = d.get('facing') or {}
        self.fx = f.get('x', 1.0)
        self.fy = f.get('y', 0.0)
        self.hasBall = d.get('hasBall')


def local(units, ball, team, n):
    """Mirror the state so that `team` attacks +x."""
    us = []
    for d in units:
        u = U(d)
        if team:
            u.x = 44.0 - u.x
            u.fx = -u.fx
            u.team = 0 if d['team'] == team else 1
        else:
            u.team = 0 if d['team'] == team else 1
        us.append(u)
    b = {'x': (44.0 - ball['x']) if team else ball['x'],
         'y': ball['y'],
         'vx': (-ball['vx']) if team else ball['vx'],
         'vy': ball['vy'],
         'owner': ball.get('owner')}
    return {'units': us, 'us': [u for u in us if u.team == 0],
            'them': [u for u in us if u.team == 1], 'ball': b, 'n': n}


def move(u, t, speed=3.15):
    best, bv = 'N', 1e9
    for name, dx, dy in D:
        x = u.x + dx * speed * 0.05
        y = u.y + dy * speed * 0.05
        if not safe(x, y):
            continue
        v = math.hypot(t[0] - x, t[1] - y)
        if name == 'N':
            v += 0.025
        if u.x > 33.5 and t[0] < 33.5 and u.y < 6 and t[1] > 6:
            v += max(0.0, x - 33.45) * 0.3
        if v < bv:
            bv, best = v, name
    return best


def shot(u, s):
    best = {'score': -100.0, 'aim': 0.0, 'time': 0.0}
    gy = 10.65
    while gy <= 15.36:
        dx, dy = 43.0 - u.x, gy - u.y
        ln = math.hypot(dx, dy)
        if ln <= 24.7 and dx >= 0:
            ux, uy = dx / ln, dy / ln
            x, y = u.x + ux * 0.59, u.y + uy * 0.59
            v, mn, blocked, t = 11.0, 10.0, False, 0.0
            for _ in range(145):
                x += ux * v * 0.05
                y += uy * v * 0.05
                t += 0.05
                v *= 0.978
                if x >= 43:
                    break
                if x < 1.2 or y < 1.23 or y > 24.77:
                    blocked = True
                    break
                for e in s['them']:
                    dd = math.hypot(x - e.x, y - e.y) - 0.82 - 3.15 * max(0.0, t - 0.72)
                    if dd < mn:
                        mn = dd
                for a in s['us']:
                    if a.id == u.id:
                        continue
                    if t < 0.65:
                        dd = math.hypot(x - a.x, y - a.y) - 0.86
                        if dd < mn:
                            mn = dd
            if x >= 43 and not blocked:
                score = mn - 0.035 * t
                if score > best['score']:
                    best = {'score': score, 'aim': angle(dx, dy), 'time': t}
        gy += 0.47
    return best


def ball_path(s, steps=85):
    path = []
    x, y = s['ball']['x'], s['ball']['y']
    vx, vy = s['ball']['vx'], s['ball']['vy']
    for i in range(steps):
        path.append({'x': x, 'y': y, 't': i * 0.05})
        x += vx * 0.05
        y += vy * 0.05
        if y < 1.23:
            y = 2.46 - y
            vy = -vy * 0.72
        if y > 24.77:
            y = 49.54 - y
            vy = -vy * 0.72
        if x < 1.23:
            x = 2.46 - x
            vx = -vx * 0.72
        if x > 42.77:
            x = 85.54 - x
            vx = -vx * 0.72
        vx *= 0.978
        vy *= 0.978
    return path


def intercept(u, path):
    for p in path:
        if safe(p['x'], p['y']) and dist((u.x, u.y), (p['x'], p['y'])) <= 3.15 * p['t'] + 0.65:
            return {'x': p['x'], 'y': p['y'], 'cost': p['t']}
    p = path[-1]
    if not safe(p['x'], p['y']):
        p = {'x': min(33.35, p['x']), 'y': clamp(p['y'], 1.5, 24.5)}
    return {'x': p['x'], 'y': p['y'], 'cost': dist((u.x, u.y), (p['x'], p['y'])) / 3.15}


def carry(u, s, variant='main'):
    sh = shot(u, s)
    pressure = min([math.hypot(e.x - u.x, e.y - u.y) for e in s['them']] or [9.0])
    thr = {'attack': -2.0, 'wide': 0.25, 'link': -0.45}.get(variant, -0.12)
    if sh['score'] > thr or (u.x > 30.5 and sh['score'] > -0.85 and pressure < 2):
        return {'dir': 'N', 'aim': sh['aim'], 'kick': True}
    target = {'x': 33.25, 'y': clamp(u.y, 9, 17)}
    if u.x > 31.5:
        if u.y < 12.8:
            side = 4.6
        elif u.y > 13.2:
            side = 21.4
        else:
            kp = [e for e in s['them'] if e.index == 0]
            side = 4.6 if (kp and kp[0].y > 13) else 21.4
        target = {'x': 39.7 if (u.y < 4.9 or u.y > 21.1) else 32.75, 'y': side}
    pas = None
    if (pressure < 2.4 or (u.index == 0 and s['n'] > 1 and u.x < 12)
            or (variant == 'link' and s['n'] > 1)):
        bv = -1e9
        options = [{'x': a.x, 'y': a.y, 'receiver': a}
                   for a in s['us'] if a.id != u.id and a.x > u.x + 2]
        if u.x < 28:
            for dy in (-10, -5, 0, 5, 10):
                options.append({'x': min(33.0, u.x + (6 if abs(dy) == 10 else 12)),
                                'y': clamp(u.y + dy, 2, 24)})
        for p in options:
            ln = math.hypot(p['x'] - u.x, p['y'] - u.y)
            if ln < 3 or ln > 20:
                continue
            ux, uy = (p['x'] - u.x) / ln, (p['y'] - u.y) / ln
            margin, t, v = 10.0, 0.0, 11.0
            x, y = u.x + ux * 0.6, u.y + uy * 0.6
            k = 0
            while k < 100 and math.hypot(x - u.x, y - u.y) < ln - 0.5:
                x += ux * v * 0.05
                y += uy * v * 0.05
                v *= 0.978
                t += 0.05
                for e in s['them']:
                    dd = math.hypot(x - e.x, y - e.y) - 0.82 - 3.15 * max(0.0, t - 0.35)
                    if dd < margin:
                        margin = dd
                k += 1
            val = 3 * min(margin, 2) + (p['x'] - u.x) * 0.16
            if p.get('receiver') is not None:
                val += 1.5
            val -= abs(p['y'] - 13) * 0.02
            if variant == 'link':
                ours = min([dist((a.x, a.y), (p['x'], p['y'])) / 3.15
                            for a in s['us'] if a.id != u.id] or [9.0])
                theirs = min([dist((a.x, a.y), (p['x'], p['y'])) / 3.15
                              for a in s['them']] or [9.0])
                val += clamp(theirs - ours, -3, 3) * 2
                if p.get('receiver') is not None:
                    val += max(-2, shot(p['receiver'], s)['score']) * 0.4
            if val > bv:
                bv = val
                pas = {'dir': 'N', 'aim': angle(p['x'] - u.x, p['y'] - u.y),
                       'kick': True, 'margin': margin}
        if pas is not None and (pas['margin'] > -0.2 or pressure < 1.2 or u.x < 10):
            return pas
    best, bv = None, -1e9
    for name, dx, dy in D:
        x, y = u.x + dx * 0.09135, u.y + dy * 0.09135
        if not safe(x, y):
            continue
        value = -math.hypot(target['x'] - x, target['y'] - y)
        for e in s['them']:
            dd = math.hypot(x - e.x, y - e.y)
            if dd < 2.5:
                value -= 1.4 * (2.5 - dd) ** 2
        if value > bv:
            bv, best = value, name
    e = min(s['them'], key=lambda z: dist((z.x, z.y), (u.x, u.y))) if s['them'] else None
    if pressure < 3 and e is not None:
        aim = angle(u.x - e.x, u.y - e.y)
    else:
        aim = angle(target['x'] - u.x, target['y'] - u.y)
    return {'dir': best or 'N', 'aim': aim, 'kick': False}


def policy(g, team, variant='main'):
    """g: dict with keys units(list of dict), ball(dict), teamSize."""
    s = local(g['units'], g['ball'], team, g['teamSize'])
    b = s['ball']
    owner = None
    for u in s['units']:
        if u.id == b['owner']:
            owner = u
    our = owner is not None and owner.team == 0
    path = ball_path(s)
    targets = {}
    eligible = [u for u in s['us'] if s['n'] == 1 or u.index != 0]
    picks = sorted(({'u': u, 'p': intercept(u, path)} for u in eligible),
                   key=lambda z: z['p']['cost'])
    chaser = picks[0]['u'] if picks else None
    if owner is not None and not our:
        chaser = sorted(eligible, key=lambda a: dist((a.x, a.y), (b['x'], b['y'])))[0] if eligible else None
    for u in s['us']:
        if our and owner is not None and u.id == owner.id:
            continue
        if s['n'] > 1 and u.index == 0:
            gx, gy = 3.3, 13.0
            if b['vx'] < -0.1:
                hit = None
                for p in path:
                    if p['x'] <= gx + 0.25:
                        hit = p
                        break
                if hit is not None:
                    gy = clamp(hit['y'], 10.65, 15.35)
                else:
                    gy = clamp(13 + (b['y'] - 13) * 0.36, 10.65, 15.35)
            else:
                gy = clamp(13 + (b['y'] - 13) * min(0.6, 3.2 / max(4, b['x'] - 1)),
                           10.65, 15.35)
            if b['x'] < 10:
                gx = clamp(b['x'] - 1.2, 2, 5)
                gy = clamp(b['y'], 9.8, 16.2)
            if owner is None:
                p = intercept(u, path)
                if p['cost'] < 1.25 and p['x'] < 12:
                    gx, gy = p['x'], p['y']
            targets[u.id] = (gx, gy)
            continue
        if chaser is not None and u.id == chaser.id and not our:
            if owner is not None:
                targets[u.id] = (min(33.3, b['x']), b['y'])
            else:
                p = intercept(u, path)
                targets[u.id] = (p['x'], p['y'])
            continue
        try:
            rank = next(i for i, v in enumerate(eligible) if v.id == u.id)
        except StopIteration:
            rank = 0
        r = max(1, len(eligible))
        if our:
            x = clamp(b['x'] + 5 + (rank % 2) * 2, 13, 32.5)
            y = clamp(5.5 + rank * (15.0 / max(1, r - 1)), 3, 23)
            if variant == 'link':
                x = clamp(b['x'] + 7 + (rank % 2) * 2, 10, 32.4)
                y = clamp(b['y'] + (1 if rank % 2 else -1) * (4 + (rank // 2) * 3), 3.5, 22.5)
        else:
            x = clamp(b['x'] - 3.2, 8, 29)
            y = clamp(b['y'] + (rank - (r - 1) / 2.0) * 3.1, 3, 23)
            if owner is not None and rank % 2 == 0:
                x = clamp(owner.x - 2.5, 9, 30)
                y = clamp(owner.y + (rank % 3 - 1) * 2.4, 3, 23)
        if s['n'] >= 4 and u.index == s['n'] - 1:
            x = clamp(b['x'] - 8, 8, 24)
            y = clamp(13 + (b['y'] - 13) * 0.5, 7, 19)
        targets[u.id] = (x, y)
    out = []
    for u in s['us']:
        if our and owner is not None and u.id == owner.id:
            a = carry(u, s, variant)
        else:
            t = targets.get(u.id) or (b['x'], b['y'])
            aim = angle(43 - u.x, 13 - u.y)
            sh = shot(u, s) if dist((u.x, u.y), (b['x'], b['y'])) < 1.5 else None
            kick = bool(sh and sh['score'] > 0)
            if sh is not None and sh['score'] > -0.1:
                aim = sh['aim']
            if u.index == 0 and s['n'] > 1 and u.x < 10:
                aim = angle(15, -6 if u.y < 13 else 6)
                kick = True
            a = {'dir': move(u, t), 'aim': aim, 'kick': kick}
        if team:
            a['aim'] = (180 - a['aim'] + 360) % 360
            a['dir'] = MIRROR.get(a['dir'], a['dir'])
        out.append(a)
    return out


def guard_window(units, team, inputs):
    """Clamp our inputs so we never enter the opponent penalty box (their guardWindow)."""
    ours = sorted([u for u in units if u['team'] == team], key=lambda u: u['index'])
    bounds = []
    for u in ours:
        x = (44.0 - u['x']) if team else u['x']
        bounds.append({'xl': x, 'xh': x, 'yl': u['y'], 'yh': u['y']})
    out = []
    for frame in inputs:
        row = []
        for i, a in enumerate(frame):
            d = a['dir']
            if team:
                d = MIRROR.get(d, d)
            p = bounds[i]
            v = DMAP.get(d, (0, 0))

            def nxt(dx, dy):
                return {'xl': p['xl'] + min(dx * 0.09135, dx * 0.1575),
                        'xh': p['xh'] + max(dx * 0.09135, dx * 0.1575),
                        'yl': p['yl'] + min(dy * 0.09135, dy * 0.1575),
                        'yh': p['yh'] + max(dy * 0.09135, dy * 0.1575)}
            q = nxt(v[0], v[1])
            if q['xh'] >= 32.75 and q['yh'] >= 4.75 and q['yl'] <= 21.25:
                options = [('N', 0, 0)] + [x for x in D if x[1] <= 0]
                best, bv = None, 1e9
                for opt in options:
                    z = nxt(opt[1], opt[2])
                    if z['xh'] >= 32.75 and z['yh'] >= 4.75 and z['yl'] <= 21.25:
                        continue
                    cost = (opt[1] - v[0]) ** 2 + (opt[2] - v[1]) ** 2
                    if cost < bv:
                        bv, best = cost, opt
                if best is not None:
                    d = best[0]
                    q = nxt(best[1], best[2])
                else:
                    d = 'L'
                    q = nxt(-1, 0)
            p.update(q)
            if team:
                d = MIRROR.get(d, d)
            row.append({'dir': d, 'aim': a['aim'], 'kick': a['kick']})
        out.append(row)
    return out
