# -*- coding: utf-8 -*-
"""用真实对局的观察序列测 agent_core.decide 的耗时（最坏情况）。"""
import json
import sys
import os
import time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent_core

path = sys.argv[1]
team = int(sys.argv[2]) if len(sys.argv) > 2 else 0
recs = [json.loads(l) for l in open(path, encoding='utf-8')]
ts = []
for r in recs:
    obs = r.get('obs0' if team == 0 else 'obs1')
    if not obs:
        continue
    t0 = time.perf_counter()
    agent_core.decide(obs)
    ts.append(time.perf_counter() - t0)
ts.sort()
n = len(ts)
print('windows=%d  mean=%.3fs  p50=%.3fs  p95=%.3fs  max=%.3fs' % (
    n, sum(ts) / n, ts[n // 2], ts[int(n * 0.95)], ts[-1]))
