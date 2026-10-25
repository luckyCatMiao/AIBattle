"""Measure in-process plan() wall time for Brain2 mirror matches."""
import sys, time, argparse
sys.path.insert(0, '/workspace'); sys.path.insert(0, '/workspace/work')
from v2 import Brain2
from match2 import new_match
import soccer

def run_match(n, seed):
    w = new_match(seed, n)
    a = Brain2(0); b = Brain2(1)
    worst = (0.0, -1, -1); tot = 0.0; cnt = 0
    while w.status == 'playing' and w.frame < 3600:
        t0 = time.perf_counter(); fa = a.plan(w); dt = time.perf_counter() - t0
        tot += dt; cnt += 1
        if dt > worst[0]: worst = (dt, w.frame, 0)
        t0 = time.perf_counter(); fb = b.plan(w); dt = time.perf_counter() - t0
        tot += dt; cnt += 1
        if dt > worst[0]: worst = (dt, w.frame, 1)
        for i in range(20):
            if w.status != 'playing':
                break
            inputs = {}
            for team, frames in ((0, fa), (1, fb)):
                fr = frames[i] if i < len(frames) else None
                for idx in range(n):
                    uid = 't%du%d' % (team, idx)
                    inputs[uid] = fr[idx] if fr and idx < len(fr) else {'dir': 'N', 'aim': None, 'kick': False}
            w.step(inputs)
    return worst, tot, cnt, w.score

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--seeds', type=int, default=2)
    a = ap.parse_args()
    for n in range(1, 7):
        for seed in range(1, a.seeds + 1):
            worst, tot, cnt, score = run_match(n, seed)
            print(f'n={n} seed={seed} score={score} worst={worst[0]*1000:.1f}ms '
                  f'at frame={worst[1]} team={worst[2]} avg={tot/cnt*1000:.1f}ms')
