#!/usr/bin/env python3
"""Analyse a harness dump: for every kick, follow the ball and classify the
outcome (goal / saved / loose / intercepted).  Tooling only."""
import json, sys, math

W, H = 44, 26


def mouth_cross(bx, by, vx, vy, team_att):
    """Where does a loose ball cross the attacked goal line?  Returns y or None."""
    x, y = bx, by
    for _ in range(200):
        for s in range(4):
            x += vx * 0.05 / 4
            y += vy * 0.05 / 4
            if 10.5 <= y <= 15.5:
                if team_att > 0 and x >= W - 1.0:
                    return y
                if team_att < 0 and x <= 1.0:
                    return y
            if x < 0 or y < 0 or x > W or y > H:
                return None
        vx *= 0.978
        vy *= 0.978
        if math.hypot(vx, vy) < 0.02:
            return None
    return None


def main(path):
    rows = [json.loads(l) for l in open(path, encoding='utf-8')]
    print(f'{len(rows)} windows')
    for i, r in enumerate(rows):
        for team, key in ((0, 'w0'), (1, 'w1')):
            w = r.get(key) or []
            for fi, fr in enumerate(w):
                for ui, inp in enumerate(fr):
                    if not inp.get('kick'):
                        continue
                    b = r['ball']
                    if b['owner'] != f't{team}u{ui}':
                        continue
                    att = 1 if team == 0 else -1
                    aim = inp.get('aim')
                    if isinstance(aim, (int, float)):
                        a = math.radians(aim)
                    else:
                        a = None
                    own = [u for u in r['units'] if u['id'].startswith(f't{team}')]
                    u = [x for x in own if x['id'] == f't{team}u{ui}'][0]
                    if a is None:
                        continue
                    vx, vy = math.cos(a) * 11, math.sin(a) * 11
                    sx, sy = u['x'] + math.cos(a) * 0.59, u['y'] + math.sin(a) * 0.59
                    cy = mouth_cross(sx, sy, vx, vy, att)
                    dgoal = math.hypot((43 if team == 0 else 0) - u['x'], 13 - u['y'])
                    print(f'  win{i:3d} f{r["frame"]:5d} team{team} u{ui} at ({u["x"]:5.1f},{u["y"]:5.1f})'
                          f' aim {aim:6.1f} dgoal {dgoal:5.1f} -> cross y {cy if cy is None else round(cy,2)}')


if __name__ == '__main__':
    main(sys.argv[1])
