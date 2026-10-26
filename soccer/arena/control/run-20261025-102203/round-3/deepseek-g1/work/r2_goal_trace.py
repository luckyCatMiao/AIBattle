# -*- coding: utf-8 -*-
"""Dump compact frame state around goals for one replay.

Usage: python -I work/r2_goal_trace.py <replay.json.gz> <goal_frame> [before] [step]
"""
import gzip, json, sys

path = sys.argv[1]
goal = int(sys.argv[2])
before = int(sys.argv[3]) if len(sys.argv) > 3 else 120
step = int(sys.argv[4]) if len(sys.argv) > 4 else 4

d = json.load(gzip.open(path, 'rt', encoding='utf-8'))
fields = d['unitsFormat']
frames = d['frames']


def fmt_unit(u):
    x = dict(zip(fields, u)) if isinstance(u, list) else u
    return '%s(%s,%s,ball=%s,keep=%s,box=%s)' % (
        x['id'], x['x'], x['y'], x['hasBall'], x['keeper'], x['inOwnBox'])


for f in range(max(0, goal - before), min(goal + 2, len(frames))):
    fr = frames[f]
    if f != goal and (f - (goal - before)) % step:
        continue
    b = fr['ball']
    units = ' '.join(fmt_unit(u) for u in fr['units'])
    print('%4d t=%6.2f ball=(%6.2f,%6.2f) v=(%6.2f,%6.2f) owner=%s last=%s/%s score=%s | %s' % (
        f, f / 20.0, b['x'], b['y'], b['vx'], b['vy'], b['owner'], b['lastTouch'], b['lastTeam'],
        fr['score'], units))
