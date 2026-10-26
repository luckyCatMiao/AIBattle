# -*- coding: utf-8 -*-
"""自测：进攻基准——我 vs 完全静止的靶子，看多久能打中（越短越好）。"""
import multiprocessing as mp
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)
sys.path.insert(0, HERE); sys.path.insert(0, WS)
import duel  # noqa: E402


def work(task):
    cfg, seed, seat, opp_name = task
    import agent as A
    A.TUNE.update(cfg)
    import bots
    me = A.Agent()
    opp = getattr(bots, {'duck': 'DuckBot', 'still': 'StillBot'}[opp_name])(seed=seed)
    ctrls = [me, opp] if seat == 0 else [opp, me]
    res = duel.run_match(seed, ctrls[0], ctrls[1])
    w = res['winner']
    return {'opp': opp_name, 'win': (w == seat), 'draw': (w is None),
            'frames': res['frames'], 'shots': res['shots'][seat], 'hits': res['hits'][seat]}


if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    seeds = [7000 + 13 * i for i in range(n)]
    tasks = [({}, s, seat, op) for op in ('duck', 'still') for s in seeds for seat in (0, 1)]
    with mp.Pool(min(16, os.cpu_count() or 4)) as pool:
        rs = pool.map(work, tasks)
    agg = {}
    for r in rs:
        a = agg.setdefault(r['opp'], {'w': 0, 'd': 0, 'l': 0, 'fr': [], 'sh': 0, 'hi': 0})
        a['w'] += 1 if r['win'] else 0
        a['d'] += 1 if r['draw'] else 0
        a['l'] += 1 if (not r['win'] and not r['draw']) else 0
        a['fr'].append(r['frames'] / 20.0)
        a['sh'] += r['shots']; a['hi'] += r['hits']
    for k, a in agg.items():
        n2 = len(a['fr'])
        print('%-6s 命中率 %5.2f%% (%d/%d)  击杀平均用时 %5.1fs  未杀 %d/%d' % (
            k, 100.0 * a['hi'] / max(1, a['sh']), a['hi'], a['sh'],
            sum(a['fr']) / n2, a['d'], n2))
