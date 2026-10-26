# -*- coding: utf-8 -*-
"""自测：并行跑「我 vs 各种对手」循环赛，输出胜负/平局与统计。

用法: python -u _sim/run.py [seeds] [opp...]
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

OPP_NAMES = ['greedy', 'hunter', 'flee', 'random', 'still', 'mirror', 'sniper', 'rusher']


def make_opp(name, seed):
    import bots
    cls = getattr(bots, {
        'greedy': 'GreedyBot', 'hunter': 'HunterBot', 'flee': 'FleeBot',
        'random': 'RandomBot', 'still': 'StillBot', 'mirror': 'MirrorBot',
        'sniper': 'SniperBot', 'rusher': 'RusherBot',
    }[name])
    return cls(seed=seed)


def play_one(task):
    name, seed, seat = task
    import agent as A
    me = A.Agent()
    opp = make_opp(name, seed)
    ctrls = [me, opp] if seat == 0 else [opp, me]
    res = duel.run_match(seed, ctrls[0], ctrls[1])
    w = res['winner']
    out = 'draw' if w is None else ('win' if w == seat else 'loss')
    return {'opp': name, 'seed': seed, 'seat': seat, 'out': out, 'res': res}


def main():
    argv = sys.argv[1:]
    nseed = int(argv[0]) if argv else 12
    names = argv[1:] if len(argv) > 1 else OPP_NAMES
    seeds = [7000 + 13 * i for i in range(nseed)]
    tasks = [(nm, s, seat) for nm in names for s in seeds for seat in (0, 1)]
    t0 = time.time()
    with mp.Pool(min(14, os.cpu_count() or 4)) as pool:
        results = pool.map(play_one, tasks, chunksize=1)
    print('总耗时 %.1fs / %d 局' % (time.time() - t0, len(tasks)))
    agg = {}
    for r in results:
        a = agg.setdefault(r['opp'], {'win': 0, 'loss': 0, 'draw': 0, 'frames': [], 'bullets': [],
                                      'myshots': 0, 'myhits': 0, 'opshots': 0, 'ophits': 0,
                                      'deaths': []})
        a[r['out']] += 1
        res = r['res']
        a['frames'].append(res['frames'] / 20.0)
        a['bullets'].append(res['bullets'])
        a['myshots'] += res['shots'][r['seat']]
        a['myhits'] += res['hits'][r['seat']]
        a['opshots'] += res['shots'][1 - r['seat']]
        a['ophits'] += res['hits'][1 - r['seat']]
        if r['out'] == 'loss':
            a['deaths'].append((res['frames'] / 20.0, res['killer_side'] if 'killer_side' in res else None))
    for nm in names:
        a = agg[nm]
        n = a['win'] + a['loss'] + a['draw']
        print('%-7s W/L/D=%2d/%2d/%2d  n=%2d | 平均时长 %5.1fs 终局弹 %.0f | 我 %d/%d 命中 %.1f%% 敌 %d/%d 命中 %.1f%%' % (
            nm, a['win'], a['loss'], a['draw'], n,
            sum(a['frames']) / len(a['frames']), sum(a['bullets']) / len(a['bullets']),
            a['myhits'], a['myshots'], 100.0 * a['myhits'] / max(1, a['myshots']),
            a['ophits'], a['opshots'], 100.0 * a['ophits'] / max(1, a['opshots'])))
    return agg


if __name__ == '__main__':
    main()
