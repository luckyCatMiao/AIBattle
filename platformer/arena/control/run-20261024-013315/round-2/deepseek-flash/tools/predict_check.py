import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent

data = json.load(open(sys.argv[1]))
round_no = data.get('round', 1)
GEN = agent.generate_level(data['seed'] * 131 + round_no * 977)
errs = {'plat': 0, 'saw': 0, 'mon': 0}
maxe = {'plat': 0.0, 'saw': 0.0, 'mon': 0.0}
prev_mon = {}
for i, rec in enumerate(data['frames']):
    t = rec['timeExact']
    # platforms
    if len(rec['platforms']) != len(GEN['platforms']):
        errs['plat'] += 1
        print('platform count mismatch', i, len(rec['platforms']), len(GEN['platforms']))
    else:
        for a, pf in zip(rec['platforms'], GEN['platforms']):
            pr = agent.platform_rect(pf, t, t - agent.DT)
            e = max(abs(pr['x'] - a['x']), abs(pr['y'] - a['y']), abs(pr['dx'] - a['dx']))
            maxe['plat'] = max(maxe['plat'], e)
            if e > 0.02:
                errs['plat'] += 1
                if errs['plat'] < 4: print('plat mismatch', i, pr, a)
    # saws
    if len(rec['saws']) != len(GEN['saws']):
        errs['saw'] += 1
        print('saw count mismatch', i, len(rec['saws']), len(GEN['saws']))
    else:
        for a, s in zip(rec['saws'], GEN['saws']):
            sx, sy = agent.saw_pos(s, t)
            e = max(abs(sx - a['x']), abs(sy - a['y']))
            maxe['saw'] = max(maxe['saw'], e)
            if e > 0.02:
                errs['saw'] += 1
                if errs['saw'] < 4: print('saw mismatch', i, (sx, sy), a)
    # monsters: 用上一帧观测预测本帧
    cur = {m['id']: m for m in rec['monsters']}
    for mid, m in cur.items():
        if mid in prev_mon:
            p = prev_mon[mid]
            nx = p['x'] + p['dir'] * agent.MON_SPEED * agent.DT
            wall = agent.solid_world((GEN['w'], GEN['h'], GEN['tiles']), nx + p['dir'] * 0.5, p['y'] + 0.4)
            gap = not agent.solid_world((GEN['w'], GEN['h'], GEN['tiles']), nx + p['dir'] * 0.6, p['y'] - 0.2)
            predx = p['x'] if (wall or gap) else nx
            e = abs(predx - m['x'])
            maxe['mon'] = max(maxe['mon'], e)
            if e > 0.02:
                errs['mon'] += 1
                if errs['mon'] < 4: print('mon mismatch', i, p, m, 'pred', predx, 'wall', wall, 'gap', gap)
    prev_mon = cur
print('frames', len(data['frames']), 'errs', errs, 'maxerr', maxe)
