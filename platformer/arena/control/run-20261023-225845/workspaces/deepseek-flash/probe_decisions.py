# -*- coding: utf-8 -*-
"""用回放帧重建观察，逐步跑 agent_r1.decide，定位每一步用的是新计划还是旧计划。"""
import gzip, json, sys, os
import agent_r1 as A
RUN = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
with gzip.open(os.path.join(RUN, 'r1-g2.json.gz'), 'rt', encoding='utf-8') as fh:
    d = json.load(fh)
level = json.load(open('level_8012_r1.json', encoding='utf-8'))
frames = d['frames']
team = d['seats'].index('deepseek-flash')  # 1
cache = {}
log = []
for f0 in range(20, 540, 5):
    fr = frames[f0]
    if fr['phase'] != 'race' or fr['status'] != 'playing':
        continue
    obs = {
        'id': d['id'], 'seed': d['seed'], 'frame': f0, 'status': fr['status'], 'phase': fr['phase'],
        'yourPlayer': team, 'round': fr['round'],
        'runners': fr['runners'], 'monsters': fr['monsters'],
        'level': level,
    }
    before = cache.get('plan')
    out = A.decide(obs, cache)
    after = cache.get('plan')
    newplan = after is not before
    # 记录实际输入（回放里的窗口）
    wi = None
    for w in d['windows']:
        if w['frame'] == f0 + 5:
            wi = w; break
    actual = None
    if wi is not None:
        actual = [[(a.get('move'), a.get('jump')) for a in fr2] for fr2 in wi['inputs'][team]]
    if 470 <= f0 <= 510 or newplan:
        log.append((f0, newplan, out[0], actual,
                    (after['acts'][:12] if after else None)))
for row in log:
    print('frame', row[0], 'NEW' if row[1] else 'old')
    print('  out   ', row[2])
    print('  actual', row[3])
    print('  plan  ', row[4])
