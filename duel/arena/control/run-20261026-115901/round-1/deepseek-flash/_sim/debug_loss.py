# -*- coding: utf-8 -*-
"""自测：找出并复盘失败局（打印最后若干窗口的态势）。"""
import os
import sys
import math

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, WS)

import duel  # noqa: E402
import bots  # noqa: E402
import agent as A  # noqa: E402


def replay(seed, opp_name, seat, trace_from_sec=None, opp_kw=None):
    cls = getattr(bots, {'greedy':'GreedyBot','hunter':'HunterBot','flee':'FleeBot','random':'RandomBot','still':'StillBot','mirror':'MirrorBot','sniper':'SniperBot','rusher':'RusherBot'}[opp_name])
    opp = cls(seed=seed, **(opp_kw or {}))
    me = A.Agent()
    m = duel.Match(seed, names=('A', 'B'))
    ctrls = [me, opp] if seat == 0 else [opp, me]
    hist = []
    while m.status == 'playing':
        wins = [None, None]
        for i in range(2):
            if not m.p[i]['alive']:
                wins[i] = [{'dir': 'N', 'aim': None, 'fire': False}] * 3
                continue
            obs = m.snapshot(i)
            wins[i] = duel.norm_inputs(ctrls[i].act(obs))
        for k in range(3):
            if m.status != 'playing':
                break
            for i in range(2):
                m.p[i]['held'] = wins[i][k]
            m.step()
            if trace_from_sec is None or m.now >= trace_from_sec:
                mi, oi = seat, 1 - seat
                mp, op = m.p[mi], m.p[oi]
                near = sorted(math.hypot(mp['x'] - b['x'], mp['y'] - b['y']) for b in m.bullets
                              if b['owner'] == oi)[:3]
                near = ['%.2f' % v for v in near]
                hist.append('t=%6.2f f=%4d me=(%5.1f,%5.1f)cd=%2d opp=(%5.1f,%5.1f) d=%5.2f 敌弹=%3d 最近敌弹=%s 我弹=%3d %s' % (
                    m.now, m.frame, mp['x'], mp['y'], mp['cooldown'], op['x'], op['y'],
                    math.hypot(mp['x'] - op['x'], mp['y'] - op['y']),
                    sum(1 for b in m.bullets if b['owner'] == oi),
                    ','.join(near), sum(1 for b in m.bullets if b['owner'] == mi),
                    m.reason if m.status != 'playing' else ''))
    return m, hist


def main():
    seeds = [7000 + 13 * i for i in range(8)]
    for nm in ('rusher',):
        for s in seeds:
            for seat in (0, 1):
                m, hist = replay(s, nm, seat)
                out = 'draw' if m.winner is None else ('win' if m.winner == seat else 'LOSS')
                if out == 'LOSS':
                    print('=== %s seed=%d seat=%d %s frames=%d' % (nm, s, seat, out, m.frame))
                    for line in hist[-30:]:
                        print(line)
    print('done')


if __name__ == '__main__':
    main()
