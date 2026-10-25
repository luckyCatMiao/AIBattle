#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""逐帧查看回放中的进球前后与任意帧。

用法:
  python -I work/inspect_goal.py <replay.json.gz>            # 打印全部进球的 -25..+3 帧
  python -I work/inspect_goal.py <replay.json.gz> 200 260    # 打印指定帧范围
  python -I work/inspect_goal.py <replay.json.gz> --kicks    # 打印全部踢球事件
"""
import gzip
import json
import math
import sys

W, H = 44, 26
GOAL_CX = {0: 1.0, 1: 43.0}


def load(p):
    if p.endswith('.gz'):
        with gzip.open(p, 'rt', encoding='utf-8') as fh:
            return json.load(fh)
    with open(p, encoding='utf-8') as fh:
        return json.load(fh)


def dg(x, y, team):
    return math.hypot(x - GOAL_CX[team], y - 13.0)


def fmt_frame(f):
    s = 'f=%d t=%.2f score=%s freeze=%d ball=(%.2f,%.2f v=%.2f,%.2f owner=%s)' % (
        f['frame'], f.get('timeLeft') is not None and (120 - f.get('timeLeft') or 0) or 0,
        f.get('score'), f.get('freeze', 0),
        f['ball']['x'], f['ball']['y'], f['ball'].get('vx', 0), f['ball'].get('vy', 0),
        f['ball'].get('owner'))
    for u in f['units']:
        s += '\n    %s idx=%d pos=(%.2f,%.2f) face=(%.2f,%.2f) %s%s%s' % (
            'T%d' % u['team'], u['index'], u['x'], u['y'],
            u.get('facing', {}).get('x', 0), u.get('facing', {}).get('y', 0),
            'KEEPER ' if u.get('keeper') else '',
            'BALL ' if u.get('hasBall') else '',
            'inOwnBox' if u.get('inOwnBox') else '')
    return s


def main():
    p = sys.argv[1]
    d = load(p)
    frames = d['frames']
    ev = d['final'].get('events', [])
    if '--kicks' in sys.argv:
        for e in ev:
            if e.get('type') in ('kick', 'goal', 'save', 'foul', 'tackle'):
                print(json.dumps(e, ensure_ascii=False))
        return
    if len(sys.argv) >= 4 and sys.argv[2].isdigit():
        a, b = int(sys.argv[2]), int(sys.argv[3])
        for i in range(max(0, a), min(len(frames), b)):
            print(fmt_frame(frames[i]))
        return
    goals = [e for e in ev if e.get('type') == 'goal']
    print('seats', d['seats'], 'ts', d['teamSize'], 'score', d['scores'])
    for e in goals:
        fr = e.get('frame') or 0
        print('\n=== GOAL', json.dumps(e, ensure_ascii=False))
        for i in range(max(0, fr - 25), min(len(frames), fr + 3)):
            print(fmt_frame(frames[i]))
    if not goals:
        print('no goals')


if __name__ == '__main__':
    main()
