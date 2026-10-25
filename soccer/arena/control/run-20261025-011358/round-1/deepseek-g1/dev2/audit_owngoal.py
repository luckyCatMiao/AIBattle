# -*- coding: utf-8 -*-
"""审计：把整场真实观察按窗口喂给 agent.py，统计有多少次踢球方向直指自家球门。

用法: python dev2/audit_owngoal.py <replay.json.gz> <team>
"""
import gzip
import json
import math
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 44.0, 26.0


def own_goal_line(team):
    return 0.0 if team == 0 else W - 1.0


def aims_at_own_goal(x, y, deg, team):
    """从 (x,y) 沿 deg 直线走，第一个碰到的边界是不是自家球门线（y∈[10,16]）。"""
    r = math.radians(deg)
    dx, dy = math.cos(r), math.sin(r)
    gx = own_goal_line(team)
    tx = (gx - x) / dx if abs(dx) > 1e-9 else 1e9
    ty = ((0.0 - y) / dy) if dy < 0 else (((H - 1.0) - y) / dy if dy > 0 else 1e9)
    if tx <= 0 or tx > ty:
        return False
    yy = y + dy * tx
    return 10.0 <= yy <= 16.0


def main():
    replay, team = sys.argv[1], int(sys.argv[2])
    with gzip.open(replay, 'rt', encoding='utf-8') as fh:
        d = json.load(fh)
    by_frame = {fr['frame']: fr for fr in d['frames']}
    env = dict(os.environ)
    env.pop('SOCCER_DEBUG', None)
    p = subprocess.Popen([sys.executable, os.path.join(ROOT, 'agent.py')],
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, encoding='utf-8', env=env)
    total_kicks = 0
    own_goal_kicks = []
    windows = 0
    for frame in range(0, 2400, 20):
        fr = by_frame.get(frame)
        if fr is None:
            continue
        obs = dict(fr)
        obs['yourTeam'] = team
        p.stdin.write(json.dumps(obs, ensure_ascii=False) + '\n')
        p.stdin.flush()
        line = p.stdout.readline()
        if not line:
            break
        out = json.loads(line)
        windows += 1
        pos = {int(u['index']): (float(u['x']), float(u['y']))
               for u in fr['units'] if int(u['team']) == team}
        for fi, row in enumerate(out['inputs']):
            for ui, u in enumerate(row):
                if not u.get('kick'):
                    continue
                total_kicks += 1
                x, y = pos.get(ui, (None, None))
                if x is None:
                    continue
                if aims_at_own_goal(x, y, float(u['aim']), team):
                    own_goal_kicks.append((frame + fi, ui, round(float(u['aim']), 1)))
    p.stdin.close()
    err = p.stderr.read()
    p.wait(timeout=10)
    print('windows=%d kicks=%d own_goal_aimed=%d %s' % (
        windows, total_kicks, len(own_goal_kicks), own_goal_kicks[:20]))
    if err.strip():
        print('stderr:', err[-500:])


if __name__ == '__main__':
    main()
