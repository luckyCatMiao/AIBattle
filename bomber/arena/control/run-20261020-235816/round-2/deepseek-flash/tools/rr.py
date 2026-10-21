"""Round-robin job runner: rr.py <candidate_key> <opponent_key> <seat> <seeds> <outdir>"""
import sys, os, json
sys.path.insert(0, '/workspace')
from tools.bench import load_agent, run_match, IdleBot, RandomBot, FarmerBot

CANDS = {
    'old':  '/workspace/agent.py',
    'r1':   '/workspace/tools/agent_r1_submitted.py',
    'v2':   '/workspace/tools/agent_v2.py',
    'v3':   '/workspace/tools/agent_v3.py',
    'wb':   '/workspace/tools/agent_w_b.py',
    'wrb':  '/workspace/tools/agent_w_rb.py',
    'wreb': '/workspace/tools/agent_w_reb.py',
    'wre':  '/workspace/tools/agent_w_re.py',
    'wrebt': '/workspace/tools/agent_w_reb_t.py',
    'wrebtf': '/workspace/tools/agent_w_reb_tf.py',
}
_cache = {}
def cls_for(key):
    if key in _cache: return _cache[key]
    if key in CANDS:
        c = load_agent(CANDS[key])
    elif key == 'farmer':
        c = lambda: FarmerBot(7)
    elif key == 'random':
        c = lambda: RandomBot(11)
    elif key == 'idle':
        c = IdleBot
    elif key.endswith('_aggro'):
        base = cls_for(key[:-6])
        class Agg:
            def __init__(self): self.a = base(always_aggro=True, hunt_start=0.0)
            def decide(self, o): return self.a.decide(o)
        c = Agg
    else:
        raise SystemExit('unknown ' + key)
    _cache[key] = c
    return c

def main():
    cand, opp, seat, nseeds, outdir = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
    start = int(sys.argv[6]) if len(sys.argv) > 6 else 1
    C = cls_for(cand); O = cls_for(opp)
    A, B = (C, O) if seat == 0 else (O, C)
    res = []
    for i in range(nseeds):
        seed = start + i
        r = run_match(A, B, seed=seed)
        w = r['wins']
        cw, ow = (w[0], w[1]) if seat == 0 else (w[1], w[0])
        log = r['log']
        deaths = sum(1 for l in log if l[2] is not None and ((l[2] == 1) if seat == 0 else (l[2] == 0)))
        winsdec = sum(1 for l in log if l[2] is not None and ((l[2] == 0) if seat == 0 else (l[2] == 1)))
        res.append({'seed': seed, 'cw': cw, 'ow': ow, 'log': log,
                    'cdeaths': deaths, 'cwins': winsdec,
                    'errors': r['errors'], 'bombs': r['bombcount'] if seat == 0 else r['bombcount'][::-1]})
    path = os.path.join(outdir, '%s__%s__s%d__b%d.json' % (cand, opp, seat, start))
    json.dump(res, open(path, 'w'))

if __name__ == '__main__':
    main()
