# -*- coding: utf-8 -*-
"""对 dumpgame 的每个窗口做射门机会审计：
 - 当前模型（trust=0.6, react=1.0）能否找到必进球
 - 静态模型（对手不动）能否找到
 - 每个窗口「若此刻起脚」在真实几何下最好的 margin 是多少
用法: python dev3/oracle.py dev3/g3b.jsonl 0
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent_core as AC
import pysim

path = sys.argv[1]
me = int(sys.argv[2]) if len(sys.argv) > 2 else 0
recs = [json.loads(l) for l in open(path, encoding='utf-8')]

GL = 43.0 if me == 0 else 1.0
rows = []
for i, r in enumerate(recs):
    obs = r.get('obs0' if me == 0 else 'obs1')
    if not obs:
        continue
    units = obs['units']
    mine = [u for u in units if u['team'] == me]
    opp = [u for u in units if u['team'] != me]
    b = obs['ball']
    owner = b.get('owner')
    if owner not in [u['id'] for u in mine]:
        continue
    car = next(u for u in mine if u['id'] == owner)
    O = (float(car['x']), float(car['y']))
    opps = [(float(o['x']), float(o['y']), 0.0, 0.0) for o in opp]
    cur = AC.best_shot(O, GL, opps, 1.0, trust=0.6)
    stat = AC.best_shot(O, GL, opps, 0.0, trust=0.0)
    # 最接近的对手到「球到球门中心」连线的距离
    import math
    best_lane = 99.0
    for ty in AC._TY_GRID:
        dx, dy = GL - b['x'], ty - b['y']
        L = math.hypot(dx, dy) or 1
        for (ox, oy, _, _) in opps:
            d = abs((ox - b['x']) * dy - (oy - b['y']) * dx) / L
            if d < best_lane:
                best_lane = d
    rows.append((i, round(b['x'], 1), round(b['y'], 1), bool(cur), bool(stat),
                 round(cur[1], 2) if cur else None, round(best_lane, 2)))

n = len(rows)
print('possession windows:', n)
print('current-model shot:', sum(1 for r in rows if r[3]))
print('static-model shot :', sum(1 for r in rows if r[4]))
print('lane clear (<0.82):', sum(1 for r in rows if r[6] < 0.82))
import collections
z = collections.Counter()
for r in rows:
    x = r[1]
    fx = x if me == 0 else 44 - x
    z['near(<22)' if fx < 22 else ('mid(22-30)' if fx < 30 else 'deep(>=30)')] += 1
print('我方持球时球 x 分区:', dict(z))
print('示例 (win, bx, by, cur_shot, static_shot, cur_margin, nearest_lane_dist):')
for r in rows[:40]:
    print('  ', r)
