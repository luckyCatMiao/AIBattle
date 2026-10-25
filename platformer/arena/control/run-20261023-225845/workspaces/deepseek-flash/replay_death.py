#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""复盘一次死亡：载入死亡前若干窗口的观察，用不同参数重跑规划器。"""
import json
import sys
import agent


def run_case(obs, horizon, beam, tail=24):
    w = agent.World(obs['level'])
    me = obs['runners'][obs['yourPlayer']]
    acts = agent.plan(w, me, obs.get('monsters') or [], horizon=horizon, beam_size=beam, tail=tail)
    return acts


def main():
    path = sys.argv[1]
    d = json.load(open(path, 'r', encoding='utf-8'))
    ring = d['ring']
    print('deaths: seed=%s myTeam=%s round=%s reason=%s lastX=%.2f' %
          (d['seed'], d['myTeam'], d['round'], d['reason'], d['lastX']))
    for i, r in enumerate(ring):
        o = r['obs']
        me = o['runners'][o['yourPlayer']]
        print('\n=== window %d frame %d  me(x=%.2f y=%.2f vx=%.2f vy=%.2f og=%s) monsters=%s'
              % (i, o['frame'], me['x'], me['y'], me['vx'], me['vy'], me['onGround'],
                 [(m['x'], m['dir']) for m in o['monsters']]))
        print('    actual action:', [(f[0]['move'], f[0]['jump']) for f in r['win']['inputs']])
        import time
        for (hz, bm) in ((46, 200), (88, 320), (88, 800), (140, 320)):
            t0 = time.time()
            acts = run_case(o, hz, bm)
            print('    h=%-3d beam=%-3d -> %s  (%.0fms)' % (hz, bm, acts, (time.time() - t0) * 1000))


if __name__ == '__main__':
    main()
