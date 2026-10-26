# -*- coding: utf-8 -*-
"""自测：走位抗压基准——我 vs 疯狂铺子弹的 spray，统计「我存活多久 / 死几次」。

分数 = 我的存活秒数（未死记 120s）；死得越晚越好。
用法: python -u _sim/bench_dodge.py [seeds] [json_configs]
"""
import json
import multiprocessing as mp
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, WS)

import duel  # noqa: E402

OPP_CLS = {'spray': 'SprayBot', 'rusher': 'RusherBot', 'sniper': 'SniperBot',
           'greedy': 'GreedyBot'}


def work(task):
    cfg_name, cfg, opp_name, seed, seat = task
    import agent as A
    A.TUNE.update(cfg)
    import bots
    me = A.Agent()
    opp = getattr(bots, OPP_CLS[opp_name])(seed=seed)
    ctrls = [me, opp] if seat == 0 else [opp, me]
    res = duel.run_match(seed, ctrls[0], ctrls[1])
    w = res['winner']
    out = 'draw' if w is None else ('win' if w == seat else 'loss')
    return {'cfg': cfg_name, 'opp': opp_name, 'out': out, 'frames': res['frames'],
            'bullets': res['bullets'], 'myshots': res['shots'][seat], 'myhits': res['hits'][seat],
            'opshots': res['shots'][1 - seat], 'ophits': res['hits'][1 - seat]}


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    seeds = [7000 + 13 * i for i in range(n)]
    configs = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {'base': {}}
    opps = (sys.argv[3].split(',') if len(sys.argv) > 3 else ['spray'])
    tasks = [(cn, cfg, op, s, seat) for cn, cfg in configs.items() for op in opps
             for s in seeds for seat in (0, 1)]
    t0 = time.time()
    with mp.Pool(min(16, os.cpu_count() or 4)) as pool:
        rs = pool.map(work, tasks, chunksize=1)
    print('== %d 局, %.0fs' % (len(tasks), time.time() - t0))
    agg = {}
    for r in rs:
        a = agg.setdefault(r['cfg'], {'win': 0, 'loss': 0, 'draw': 0, 'frames': 0.0, 'n': 0,
                                      'mh': 0, 'ms': 0, 'oh': 0, 'os': 0, 'bul': 0})
        a[r['out']] += 1
        a['n'] += 1
        a['frames'] += r['frames'] / 20.0
        a['bul'] += r['bullets']
        a['ms'] += r['myshots']
        a['mh'] += r['myhits']
        a['os'] += r['opshots']
        a['oh'] += r['ophits']
    rows = []
    for cn, a in agg.items():
        rows.append((a['frames'] / a['n'], cn, a))
    rows.sort(reverse=True)
    for sc, cn, a in rows:
        print('%-18s 平均存活 %6.1fs  W/L/D=%2d/%2d/%2d  终局弹%4.0f  我命中%5.2f%% 敌命中%5.2f%%' % (
            cn, sc, a['win'], a['loss'], a['draw'], a['bul'] / a['n'],
            100.0 * a['mh'] / max(1, a['ms']), 100.0 * a['oh'] / max(1, a['os'])))


if __name__ == '__main__':
    main()
