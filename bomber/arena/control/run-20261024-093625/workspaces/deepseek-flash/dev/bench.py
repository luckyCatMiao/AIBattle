# -*- coding: utf-8 -*-
"""Benchmark per-decision latency by replaying recorded frames through agent.decide().
usage: python -I dev/bench.py dev/rec/x.json [seat]"""
import json, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent as A

def main():
    p = sys.argv[1]; seat = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    d = json.load(open(p, encoding='utf-8'))
    times = []
    for i, s in enumerate(d['frames']):
        if s.get('status') != 'playing':
            continue
        obs = dict(s); obs['yourPlayer'] = seat
        t0 = time.perf_counter()
        try:
            A.decide(obs)
        except Exception as e:
            print('EXC at', i, repr(e))
        dt = (time.perf_counter() - t0) * 1000
        times.append((dt, i))
    times.sort()
    if not times:
        print('no frames'); return
    n = len(times)
    def pct(q):
        return times[min(n - 1, int(q * n))][0]
    print('decisions', n, 'median %.1fms p90 %.1f p99 %.1f max %.1f (at frame %d)' % (
        pct(0.5), pct(0.9), pct(0.99), times[-1][0], times[-1][1]))
    print('over 1s:', sum(1 for t, _ in times if t > 1000), ' over 4s:', sum(1 for t, _ in times if t > 4000))

if __name__ == '__main__':
    main()
