"""Determinism check: run the same self-play match twice, compare plan traces."""
import sys, time, hashlib, json
sys.path.insert(0, '/workspace')
sys.path.insert(0, '/workspace/tools')
import soccer, brain as B
import match as M

seed = int(sys.argv[1]) if len(sys.argv) > 1 else 3
n = int(sys.argv[2]) if len(sys.argv) > 2 else 6


def run():
    w = M.new_match(seed, n)
    b0, b1 = B.Brain(0), B.Brain(1)
    trace = []
    times = []
    while w.status == 'playing':
        t = time.time()
        f0 = b0.plan(w)
        times.append(time.time() - t)
        t = time.time()
        f1 = b1.plan(w)
        times.append(time.time() - t)
        for fr, who in ((f0, 0), (f1, 1)):
            trace.append(hashlib.md5(json.dumps(fr, sort_keys=True).encode()).hexdigest())
        for i in range(20):
            if w.status != 'playing':
                break
            inputs = {}
            for team, frames in ((0, f0), (1, f1)):
                fr = frames[i]
                for idx in range(n):
                    inputs['t%du%d' % (team, idx)] = fr[idx]
            w.step(inputs)
    return w.score, trace, times


s1, t1, tm1 = run()
s2, t2, tm2 = run()
print('score', s1, s2, 'trace equal', t1 == t2, 'lens', len(t1), len(t2))
if t1 != t2:
    for i, (a, b) in enumerate(zip(t1, t2)):
        if a != b:
            print('first diff at window', i // 2, 'team', i % 2)
            break
print('max plan %.3fs  mean %.3fs  n=%d' % (max(tm1 + tm2), sum(tm1 + tm2) / len(tm1 + tm2), len(tm1 + tm2)))
