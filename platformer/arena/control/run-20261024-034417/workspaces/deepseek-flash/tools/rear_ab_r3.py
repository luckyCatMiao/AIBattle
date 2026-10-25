#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""第 3 轮：对每个决策窗口分别以 PF_REAR=开/关 运行同一提交 agent，统计计划差异。"""
import gzip, json, sys, os

sys.stdout.reconfigure(encoding='utf-8')
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
import agent

RUN = os.path.dirname(os.path.dirname(BASE))


def run(fn, my):
    d = json.loads(gzip.decompress(open(os.path.join(RUN, fn), 'rb').read()).decode('utf-8', 'replace'))
    ctx_on, ctx_off = {}, {}
    n = diff = 0
    by_round = {}
    examples = []
    for w in d['windows']:
        end = w['frame']
        obs = json.loads(json.dumps(d['frames'][end - 5]))
        obs['yourPlayer'] = my
        obs['level'] = d['levels'][str(obs.get('round') or 1)]
        agent.REAR_MODEL = True
        p_on = agent.handle(obs, ctx_on)
        agent.REAR_MODEL = False
        p_off = agent.handle(obs, ctx_off)
        n += 1
        if p_on != p_off:
            diff += 1
            rnd = int(obs.get('round') or 1)
            by_round[rnd] = by_round.get(rnd, 0) + 1
            if len(examples) < 12:
                examples.append((end, rnd, obs['runners'][my]['x'], obs['runners'][1 - my]['x'], p_on, p_off))
    print('%s player=%d windows=%d plan_diffs=%d by_round=%s' % (fn, my, n, diff, by_round))
    for e in examples:
        print('  end=%d R%d x=%.2f oppx=%.2f on=%s off=%s' % e)


if __name__ == '__main__':
    run(sys.argv[1], int(sys.argv[2]))
