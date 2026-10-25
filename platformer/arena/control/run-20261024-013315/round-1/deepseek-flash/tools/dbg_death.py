import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent

rows = [json.loads(l) for l in open('tools/tmp/obs5021.jsonl')]
# 找 round 1, t=20.0 附近
target = None
for r in rows:
    o = r['obs']
    if o['round'] == 1 and abs(o['time'] - 20.0) < 1e-6:
        target = o
        break
print('found', target is not None)
level = agent.generate_level(5021 * 131 + 977)
obs = dict(target)
obs['level'] = {'width': level['w'], 'height': level['h'], 'goalX': level['goalX'], 'startX': level['startX'], 'tiles': level['tiles']}
obs['seed'] = 5021
obs['round'] = 1
obs['phase'] = 'race'
obs['status'] = 'playing'
ctx = agent.reset_ctx(obs)
geom = ctx['geom']
fds, mask = agent.build_frame_data(ctx, obs, float(target['time']), 60)
runner = target['runners'][0]
init = (runner['x'], runner['y'], runner['vx'], runner['vy'], runner['onGround'])
print('init', init)
st = agent.search_survive(geom, fds, 0, init, 40, mask)
print('search result', None if st is None else (st[0], st[1], st[2], st[3], st[4], st[5]))
acts = st[5]
x, y, vx, vy, og = init
for i, a in enumerate(acts):
    fd = fds[i]
    r = agent.step_player(x, y, vx, vy, og, 1.0, a, geom, fd['prects'], fd['gone'])
    print(f'frame {i+1} jump={a} ->', r, 'haz', None if r is None else agent.hazard_hit(r[0], r[1], geom, fd))
    if r is None:
        break
    x, y, vx, vy, og = r
# 打印随后观测
for r in rows:
    o = r['obs']
    if o['round'] == 1 and 20.0 <= o['time'] <= 20.6:
        print('obs t', o['time'], 'runner', o['runners'][0], 'gone', o['gone'], 'crumbling', o['crumbling'])
print('saw gen', level['saws'][3])
for t in [19.75, 20.0, 20.25, 20.5, 20.75]:
    print('saw@', t, agent.saw_pos(level['saws'][3], t))
