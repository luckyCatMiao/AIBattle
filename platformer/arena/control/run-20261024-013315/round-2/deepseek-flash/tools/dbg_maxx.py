import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent

seed, rnd = 1, 2
gen = agent.generate_level(seed * 131 + rnd * 977)
geom = (gen['w'], gen['h'], gen['tiles'])
sx = 128
# 构造一个 obs
t0 = 10.0
L = {'width': gen['w'], 'height': gen['h'], 'goalX': gen['goalX'], 'startX': gen['startX'], 'tiles': gen['tiles']}


def pstate(t):
    plats = []
    for pf in gen['platforms']:
        pr = agent.platform_rect(pf, t, t)
        plats.append({'x': pr['x'], 'y': pr['y'], 'w': pr['w'], 'h': pr['h'], 'dx': 0})
    plants = [{'x': p['x'], 'y': p['y'], 'height': agent.plant_height(p, t), 'period': p['period'], 'phase': p['phase']} for p in gen['plants']]
    saws = [{'x': agent.saw_pos(s, t)[0], 'y': agent.saw_pos(s, t)[1], 'r': s['r']} for s in gen['saws']]
    return plats, plants, saws


plats, plants, saws = pstate(t0)
obs = {'level': L, 'seed': seed, 'round': rnd, 'phase': 'race', 'status': 'playing', 'time': t0,
       'platforms': plats, 'plants': plants, 'saws': saws, 'monsters': [], 'gone': [], 'crumbling': []}
ctx = agent.reset_ctx(obs)
print('gen_valid', ctx['gen_valid'], 'stuck', ctx['stuck'])
fds, mask = agent.build_frame_data(ctx, obs, t0, 60)
# 找障碍
non_spike = [x for (x, n) in agent.spike_runs(geom)]
print('spike runs', agent.spike_runs(geom))
for s in gen['saws']:
    print('saw', s['fromx'], s['tox'], 'period', s['period'])
for p in gen['plants']:
    print('plant', p['x'], 'period', p['period'])
for pf in gen['platforms']:
    print('plat', pf['fromx'], pf['tox'])

for start_x in [118.0, 120.0, 122.0, 124.0, 126.0, 127.0]:
    best = agent.search_maxx(geom, fds, 0, (start_x, 3.0, 6.8, 0.0, True), 30, None)
    print('start', start_x, '-> best mx', round(best[0], 3), 'acts', best[1])
