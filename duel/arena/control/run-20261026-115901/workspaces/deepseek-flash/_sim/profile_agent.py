# -*- coding: utf-8 -*-
"""自测：测量参赛 agent 单窗口耗时（最慢/平均），确认远低于 5 秒硬上限。"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, WS)

import duel  # noqa: E402
import bots  # noqa: E402
import agent as A  # noqa: E402


def timed_match(seed, opp_factory, seat=0):
    me = A.Agent()
    opp = opp_factory(seed=seed)
    m = duel.Match(seed, names=('A', 'B'))
    ctrls = [me, opp] if seat == 0 else [opp, me]
    times = []
    while m.status == 'playing':
        wins = [None, None]
        for i in range(2):
            if not m.p[i]['alive']:
                wins[i] = [{'dir': 'N', 'aim': None, 'fire': False}] * 3
                continue
            obs = m.snapshot(i)
            t0 = time.perf_counter()
            raw = ctrls[i].act(obs)
            if ctrls[i] is me:
                times.append(time.perf_counter() - t0)
            wins[i] = duel.norm_inputs(raw)
        for k in range(3):
            if m.status != 'playing':
                break
            for i in range(2):
                m.p[i]['held'] = wins[i][k]
            m.step()
    return times, m


def main():
    seeds = [7000 + 13 * i for i in range(int(sys.argv[1]) if len(sys.argv) > 1 else 4)]
    allt = []
    for s in seeds:
        t, m = timed_match(s, bots.GreedyBot)
        allt += t
        print('seed %d: windows=%d mean=%.1fms p95=%.1fms max=%.1fms  end=%s frames=%d bullets=%d' % (
            s, len(t), 1000 * sum(t) / len(t),
            1000 * sorted(t)[int(len(t) * 0.95)], 1000 * max(t), m.reason, m.frame, len(m.bullets)))
    print('OVERALL mean=%.1fms max=%.1fms  (limit 5000ms)' % (
        1000 * sum(allt) / len(allt), 1000 * max(allt)))


if __name__ == '__main__':
    main()
