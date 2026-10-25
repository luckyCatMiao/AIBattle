import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent

rows = [json.loads(l) for l in open('tools/tmp/obs5021.jsonl')]
target = None
for r in rows:
    o = r['obs']
    if o['round'] == 1 and abs(o['time'] - 20.0) < 1e-6:
        target = o; break
level = agent.generate_level(5021 * 131 + 977)
obs = dict(target)
obs['level'] = {'width': level['w'], 'height': level['h'], 'goalX': level['goalX'], 'startX': level['startX'], 'tiles': level['tiles']}
obs['seed'] = 5021; obs['round'] = 1; obs['phase'] = 'race'; obs['status'] = 'playing'
ctx = agent.reset_ctx(obs)
geom = ctx['geom']
fds, mask = agent.build_frame_data(ctx, obs, float(target['time']), 60)
runner = target['runners'][0]
init = (runner['x'], runner['y'], runner['vx'], runner['vy'], runner['onGround'])
print('init', init)
for direction in (0.0, -1.0):
    s = init
    for k in range(1, 6):
        fd = fds[k-1]
        r = agent.step_player(s[0], s[1], s[2], s[3], s[4], direction, 0, geom, fd['prects'], fd['gone'])
        if r is None or agent.hazard_hit(r[0], r[1], geom, fd, mask):
            print('dir', direction, 'prefix dies at k', k); s = None; break
        s = r
        st2 = agent.search_survive(geom, fds, k, s, 36, mask)
        print('dir', direction, 'k', k, 'state', tuple(round(v,3) for v in s), '->', None if st2 is None else (round(st2[0],2), st2[1:5], st2[5]))
        if st2 is not None:
            break
    if s is not None:
        break
# 追踪实际输出计划 [-1,-1,-1,1,1jump]
print('--- trace actual plan ---')
plan = [(-1.0,False),(-1.0,False),(-1.0,False),(1.0,False),(1.0,True)]
x,y,vx,vy,og = init
for i,(mv,jp) in enumerate(plan):
    fd = fds[i]
    r = agent.step_player(x,y,vx,vy,og,mv,jp,geom,fd['prects'],fd['gone'])
    print(f'frame {i+1} mv={mv} jump={jp} ->', None if r is None else tuple(round(v,3) for v in r),
          'haz', None if r is None else agent.hazard_hit(r[0],r[1],geom,fd))
    if r is None: break
    x,y,vx,vy,og = r
