# -*- coding: utf-8 -*-
"""Classify every kick in a replay: shot distance, on-target, outcome, and for
goals/conceded goals the keeper position at the moment the ball crosses."""
import gzip, json, glob, math, os, sys

W, H = 44.0, 26.0
DT = 0.05
SQ2 = 0.7071067811865476
_WALL = bytearray(44 * 26)
for _y in range(26):
    for _x in range(44):
        if _x == 0 or _y == 0 or _x == 43 or _y == 25:
            if (_x == 0 or _x == 43) and 10 <= _y < 16:
                continue
            _WALL[_y * 44 + _x] = 1


def tile(x, y):
    tx, ty = int(math.floor(x)), int(math.floor(y))
    if tx < 0 or ty < 0 or tx >= 44 or ty >= 26:
        return 1
    return _WALL[ty * 44 + tx]


def hits_wall(x, y, r):
    k = r * SQ2
    for px, py in ((x - r, y), (x + r, y), (x, y - r), (x, y + r),
                   (x - k, y - k), (x + k, y - k), (x - k, y + k), (x + k, y + k)):
        if tile(px, py):
            return True
    return False


def sim(bx, by, ang, maxf=200):
    vx, vy = 11.0 * math.cos(ang), 11.0 * math.sin(ang)
    x, y = bx, by
    pts = []
    for f in range(maxf):
        for s in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if 10.5 <= y <= 15.5:
                if x <= 1.0:
                    return pts, 1
                if x >= W - 1.0:
                    return pts, 0
            if hits_wall(x, y, 0.22):
                px = x - vx * DT / 4.0
                py = y - vy * DT / 4.0
                if hits_wall(x, py, 0.22):
                    x, y = px, y
                    vx = -vx * 0.72
                if hits_wall(px, y, 0.22):
                    x, y = x, py
                    vy = -vy * 0.72
                if hits_wall(x, y, 0.22):
                    x, y = px, py
                    vx = -vx * 0.72
                    vy = -vy * 0.72
        vx *= 0.978
        vy *= 0.978
        if math.hypot(vx, vy) < 0.02:
            break
        pts.append((x, y))
    return pts, None


def parse_frame(f):
    units = {}
    for u in f['units']:
        uid, team, idx, x, y, fx, fy, hasb = u[0], u[1], u[2], u[3], u[4], u[5], u[6], u[7]
        units[uid] = (team, idx, x, y, hasb)
    return units


def main():
    d = sys.argv[1]
    files = sorted(glob.glob(os.path.join(d, 'r*-g*.json.gz')))
    tg = {0: [0, 0], 1: [0, 0]}      # goals from shots
    tk = {0: [0, 0, 0], 1: [0, 0, 0]}      # shots
    ton = {0: [0, 0], 1: [0, 0]}     # on target
    dists = {0: [], 1: []}
    cond = {0: [], 1: []}            # keeper x,y at goal
    for p in files:
        r = json.load(gzip.open(p, 'rt', encoding='utf-8'))
        seats = r['seats']
        mi = seats.index('deepseek-g1')
        frames = r['frames']
        evs = r['events']
        # map event id -> index
        for k, e in enumerate(evs):
            if e['type'] != 'kick':
                continue
            team = e['team']
            me = team == mi
            gx = 43.0 if team == 0 else 1.0
            ang = e['angle']
            sx = e['x'] + math.cos(ang) * 0.59
            sy = e['y'] + math.sin(ang) * 0.59
            f0 = e['frame']
            pts, gt = sim(sx, sy, ang)
            dgoal = math.hypot(gx - e['x'], 13.0 - e['y'])
            if dgoal > 26:
                continue
            # is the ray crossing the goal mouth?
            if gt is not None and gt == team:
                # find crossing frame
                on = True
            else:
                on = False
            # find first outcome event after the kick
            out = 'dead'
            for e2 in evs[k + 1:]:
                if e2['frame'] <= f0:
                    continue
                if e2['frame'] - f0 > 80:
                    break
                if e2['type'] == 'goal':
                    out = 'goal' if e2['team'] == team else 'own'
                    break
                if e2['type'] == 'save' and e2['team'] != team:
                    out = 'saved'
                    break
                if e2['type'] == 'tackle':
                    out = 'tackled'
                    break
                if e2['type'] == 'kick':
                    out = 'nextkick_same' if e2['team'] == team else 'nextkick_opp'
                    break
                if e2['type'] == 'kickoff':
                    out = 'kickoff'
                    break
            if out in ('dead', 'kickoff'):
                continue
            key = 0 if me else 1
            tk[key][0] += 1
            dists[key].append(dgoal)
            if on:
                ton[key][0] += 1
            if out == 'goal':
                tg[key][0] += 1
                key2 = 1 if me else 0   # conceding side
                cond[key2].append(dgoal)
            if out == 'saved':
                tk[key][1] += 1
            if out == 'tackled':
                tk[key][2] += 1
    print('files', len(files))
    for key, name in ((0, 'US'), (1, 'OPP')):
        n = tk[key][0]
        ds = dists[key]
        print(name, 'shots', n, 'on-target', ton[key][0], 'goals', tg[key][0],
              'saved', tk[key][1], 'tackled', tk[key][2])
        if ds:
            ds2 = sorted(ds)
            print('   dist avg %.1f med %.1f p10 %.1f p90 %.1f' % (
                sum(ds) / len(ds), ds2[len(ds2) // 2], ds2[max(0, len(ds2) // 10)], ds2[min(len(ds2) - 1, len(ds2) * 9 // 10)]))


if __name__ == '__main__':
    main()
