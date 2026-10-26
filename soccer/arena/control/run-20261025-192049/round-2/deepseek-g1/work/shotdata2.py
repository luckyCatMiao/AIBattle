# -*- coding: utf-8 -*-
"""Extract every kick from replays, tag goal/save/outcome, plus keeper geometry."""
import gzip, json, os, sys, math

FIELDS = ['id', 'team', 'index', 'x', 'y', 'fx', 'fy', 'hasBall', 'keeper',
          'inOwnBox', 'kicks', 'goals', 'touches', 'kickCd', 'controlLock']
W = 44.0


def unpack(frame):
    out = dict(frame)
    us = []
    for arr in frame.get('units', []):
        d = dict(zip(FIELDS, arr))
        d['facing'] = {'x': d.pop('fx'), 'y': d.pop('fy')}
        us.append(d)
    out['units'] = us
    return out


def frames_until_x(x0, y0, ang, x_target):
    """approx frames for a kicked ball from (x0,y0) to cross x_target, with wall bounces ignored."""
    vx, vy = 11.0 * math.cos(ang), 11.0 * math.sin(ang)
    x, y = x0, y0
    for f in range(200):
        for s in range(4):
            x += vx * 0.05 / 4
            y += vy * 0.05 / 4
        vx *= 0.978
        vy *= 0.978
        if (vx > 0 and x >= x_target) or (vx < 0 and x <= x_target):
            return f + 1, y
    return None, None


def main():
    dirs = sys.argv[1:]
    for P in dirs:
        for g in range(1, 21):
            p = os.path.join(P, 'r1-g%d.json.gz' % g)
            if not os.path.exists(p):
                continue
            d = json.load(gzip.open(p, 'rt', encoding='utf-8'))
            n = d['teamSize']
            fr = d['frames']
            ev = d['final']['events']
            me = 0 if d['seats'][0] == 'deepseek-g1' else 1
            opp = 1 - me
            # goal frames per team
            goals = [(e['frame'], e['team']) for e in ev if e['type'] == 'goal']
            saves = [(e['frame'], e['team']) for e in ev if e['type'] == 'save']
            print('### g%d n=%d score=%s' % (g, n, d['scores']))
            for k in [e for e in ev if e['type'] == 'kick']:
                f0 = k['frame']
                team = k['team']
                ang = k['angle']
                x0, y0 = k['x'], k['y']
                gx = 43.0 if team == 0 else 1.0
                # does the ray reach the goal mouth?
                t, yy = frames_until_x(x0, y0, ang, gx - 1.0 if gx > 20 else gx + 1.0)
                if t is None or yy is None or not (9.5 <= yy <= 16.5):
                    continue
                # keeper pos at kick frame
                f = unpack(fr[min(f0, len(fr) - 1)])
                kp = None
                for u in f['units']:
                    if u['team'] != team and u['index'] == 0:
                        kp = u
                # goal within 3.0s?
                hit = [gg for gg in goals if gg[1] == team and f0 <= gg[0] <= f0 + 60]
                sv = [s for s in saves if f0 <= s[0] <= f0 + 60]
                dist = abs(gx - x0)
                extra = ''
                if kp is not None:
                    # keeper y at the crossing x of its own line? use path y when ball at keeper x
                    tx = 40.7 if team == 0 else 3.3
                    t2, yk = frames_until_x(x0, y0, ang, tx)
                    extra = 'kp=(%.1f,%.1f) pathy@kp=%.1f sep=%.1f' % (
                        kp['x'], kp['y'], yk if yk is not None else -9,
                        abs((yk if yk is not None else 0) - kp['y']))
                # clearance vs non-keeper opponents at kick time
                cl = 9.0
                for u in f['units']:
                    if u['team'] == team:
                        continue
                    # distance from unit to the shot line
                    dx, dy = math.cos(ang), math.sin(ang)
                    ex, ey = u['x'] - x0, u['y'] - y0
                    proj = ex * dx + ey * dy
                    if proj < 0:
                        continue
                    perp = abs(ex * dy - ey * dx)
                    cl = min(cl, perp)
                print('  %s kick t=%.1f from (%.1f,%.1f) ang=%.0f d=%.1f aim_y=%.1f %s lineclr=%.1f %s' % (
                    'ME ' if team == me else 'OPP', f0 / 20.0, x0, y0, math.degrees(ang) % 360, dist,
                    yy, extra, cl,
                    'GOAL' if hit else ('save' if sv else '')))


if __name__ == '__main__':
    main()
