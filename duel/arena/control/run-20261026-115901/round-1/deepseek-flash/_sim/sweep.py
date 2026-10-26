# -*- coding: utf-8 -*-
"""自测：并行评估多组参数（我 vs 若干对手），按 胜=1 / 平=0.5 / 负=0 打分。

用法: python -u _sim/sweep.py
"""
import multiprocessing as mp
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, WS)

import duel  # noqa: E402

OPP_CLS = {'greedy': 'GreedyBot', 'hunter': 'HunterBot', 'flee': 'FleeBot',
           'random': 'RandomBot', 'still': 'StillBot', 'mirror': 'MirrorBot',
           'sniper': 'SniperBot', 'rusher': 'RusherBot', 'spray': 'SprayBot', 'duck': 'DuckBot'}


def work(task):
    cfg_name, cfg, opp_name, seed, seat = task
    import agent as A
    A.TUNE.update(cfg)
    import bots
    cls = getattr(bots, OPP_CLS[opp_name])
    me = A.Agent()
    opp = cls(seed=seed)
    ctrls = [me, opp] if seat == 0 else [opp, me]
    res = duel.run_match(seed, ctrls[0], ctrls[1])
    w = res['winner']
    out = 'draw' if w is None else ('win' if w == seat else 'loss')
    return {'cfg': cfg_name, 'opp': opp_name, 'out': out, 'frames': res['frames'],
            'bullets': res['bullets'], 'myshots': res['shots'][seat], 'myhits': res['hits'][seat],
            'opshots': res['shots'][1 - seat], 'ophits': res['hits'][1 - seat]}


def evaluate(configs, opps, seeds, workers=14, label=''):
    tasks = [(cn, cfg, op, s, seat)
             for cn, cfg in configs.items() for op in opps for s in seeds for seat in (0, 1)]
    t0 = time.time()
    with mp.Pool(workers) as pool:
        rs = pool.map(work, tasks, chunksize=1)
    print('== %s (%d 局, %.0fs)' % (label, len(tasks), time.time() - t0))
    agg = {}
    for r in rs:
        a = agg.setdefault(r['cfg'], {'win': 0, 'loss': 0, 'draw': 0, 'frames': 0.0, 'n': 0,
                                      'ms': 0, 'mh': 0, 'os': 0, 'oh': 0, 'per': {}})
        a[r['out']] += 1
        a['n'] += 1
        a['frames'] += r['frames'] / 20.0
        a['ms'] += r['myshots']
        a['mh'] += r['myhits']
        a['os'] += r['opshots']
        a['oh'] += r['ophits']
        a['per'].setdefault(r['opp'], [0, 0, 0])
        a['per'][r['opp']][{'win': 0, 'draw': 1, 'loss': 2}[r['out']]] += 1
    rows = []
    for cn in configs:
        a = agg[cn]
        score = (a['win'] + 0.5 * a['draw']) / a['n']
        rows.append((score, cn, a))
    rows.sort(reverse=True)
    for score, cn, a in rows:
        print('%-18s score %.3f  W/L/D=%2d/%2d/%2d  平均时长%5.1fs  我命中%5.2f%% 敌命中%5.2f%%  %s' % (
            cn, score, a['win'], a['loss'], a['draw'], a['frames'] / a['n'],
            100.0 * a['mh'] / max(1, a['ms']), 100.0 * a['oh'] / max(1, a['os']),
            ' '.join('%s:%d/%d/%d' % (k, v[0], v[1], v[2]) for k, v in sorted(a['per'].items()))))
    return rows


if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    seeds = [7000 + 13 * i for i in range(n)]
    opps = sys.argv[2].split(',') if len(sys.argv) > 2 else ['greedy', 'rusher', 'sniper', 'still']
    configs = {'base': {}}
    if len(sys.argv) > 3:
        import json
        configs = json.loads(sys.argv[3])
    evaluate(configs, opps, seeds, workers=min(16, os.cpu_count() or 4))
