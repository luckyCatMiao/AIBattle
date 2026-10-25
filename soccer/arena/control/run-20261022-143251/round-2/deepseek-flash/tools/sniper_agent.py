#!/usr/bin/env python3
"""Offline test opponent: a crude 'sol-like' long-shot bot.

It is not sol's code and is only used to A/B our own keeper/1v1 changes.
Behaviour: win loose balls, carry toward the opponent goal, and shoot from
long range at the corner away from the opposing keeper.  It never enters the
opponent penalty box.
"""
import sys
import json
import math

W = 44.0
H = 26.0

DIRS = {
    'N': (0.0, 0.0), 'U': (0.0, -1.0), 'D': (0.0, 1.0),
    'L': (-1.0, 0.0), 'R': (1.0, 0.0),
    'UL': (-0.7071, -0.7071), 'UR': (0.7071, -0.7071),
    'DL': (-0.7071, 0.7071), 'DR': (0.7071, 0.7071),
}


def dir_toward(dx, dy):
    if abs(dx) < 1e-9 and abs(dy) < 1e-9:
        return 'N'
    a = math.atan2(dy, dx)
    names = ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR']
    i = int(round(a / (math.pi / 4.0))) % 8
    return names[i]


def clamp(v, a, b):
    return max(a, min(b, v))


def decide(obs):
    n = int(obs.get('teamSize', 1))
    t = int(obs.get('yourTeam', 0))
    if obs.get('status') != 'playing':
        return [[{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)] for _ in range(20)]
    units = [u for u in obs['units'] if u['team'] == t]
    foes = [u for u in obs['units'] if u['team'] != t]
    b = obs['ball']
    gx = 43.0 if t == 0 else 1.0
    own_gx = 1.0 if t == 0 else 43.0
    box_edge = 34.0 if t == 0 else 10.0

    foe_keeper = None
    for f in foes:
        if f.get('keeper') or f.get('index') == 0:
            foe_keeper = f
            break
    ky = foe_keeper['y'] if foe_keeper else 13.0
    # aim at the corner farther from their keeper
    if ky > 13.0:
        ty = 10.8
    else:
        ty = 15.2

    rows = []
    for fi in range(20):
        row = []
        for u in units:
            out = {'dir': 'N', 'aim': None, 'kick': False}
            dist_ball = math.hypot(b['x'] - u['x'], b['y'] - u['y'])
            has_ball = (b.get('owner') == u['id']) or u.get('hasBall')
            is_keeper = (u.get('index') == 0 and n >= 2)
            if has_ball:
                dgoal = math.hypot(gx - b['x'], 13.0 - b['y'])
                if dgoal < 26.0:
                    out['aim'] = math.degrees(math.atan2(ty - b['y'], gx - b['x'])) % 360.0
                    out['kick'] = True
                else:
                    out['dir'] = dir_toward(gx - u['x'], 13.0 - u['y'])
            elif is_keeper:
                # stay just off the goal line, track the ball's y
                tx = own_gx + (1.2 if t == 0 else -1.2)
                tyk = clamp(b['y'], 9.5, 16.5)
                out['dir'] = dir_toward(tx - u['x'], tyk - u['y'])
            else:
                # chase the ball; if an opponent owns it, get goal-side of it
                if b.get('owner') and not str(b['owner']).startswith('t%d' % t):
                    ux = own_gx - b['x']
                    uy = 13.0 - b['y']
                    l = math.hypot(ux, uy) or 1.0
                    tx = b['x'] + ux / l * 1.6
                    tyd = b['y'] + uy / l * 1.6
                else:
                    tx, tyd = b['x'], b['y']
                out['dir'] = dir_toward(tx - u['x'], tyd - u['y'])
            row.append(out)
        rows.append(row)
    return rows


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
            out = decide(obs)
        except Exception:
            n = 3
            try:
                n = int(json.loads(line).get('teamSize', 3))
            except Exception:
                pass
            out = [[{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)] for _ in range(20)]
        sys.stdout.write(json.dumps({'inputs': out}, separators=(',', ':')) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
