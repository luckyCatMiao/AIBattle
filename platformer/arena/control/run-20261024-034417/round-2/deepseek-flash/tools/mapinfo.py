import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.dont_write_bytecode = True
import agent

def info(seed, rnd):
    g = agent.generate_level(seed*131 + rnd*977)
    w = g['w']; tiles = g['tiles']; h = g['h']
    print(f"seed={seed} round={rnd} w={w} goal={g['goalX']} plats={len(g['platforms'])} plants={len(g['plants'])} saws={len(g['saws'])}")
    runs = agent.spike_runs((w,h,tiles))
    print("  spike runs:", runs)
    # 地形段
    segs = []
    cur = None
    for x in range(w):
        top = agent.column_top((w,h,tiles), x)
        if cur and cur[2] == top:
            cur[1] = x
        else:
            if cur: segs.append(tuple(cur))
            cur = [x, x, top]
    if cur: segs.append(tuple(cur))
    out = []
    for (a,b,top) in segs:
        tag = 'PIT' if top <= -90 else ('GND' if top==3 else f'H{top}')
        if b-a+1 >= 2 or tag=='PIT': out.append(f"{a}-{b}:{tag}")
    print("  terrain:", ' '.join(out))
    for p in g['platforms']:
        print(f"  plat x{p['fromx']:.1f}->{p['tox']:.1f} y{p['fromy']:.1f} per{p['period']:.2f} ph{p['phase']:.2f}")
    for p in g['plants']:
        print(f"  plant x{p['x']:.1f} per{p['period']:.2f} ph{p['phase']:.2f}")
    for s in g['saws']:
        print(f"  saw x{s['fromx']:.1f}->{s['tox']:.1f} y{s['fromy']:.1f} per{s['period']:.2f} ph{s['phase']:.2f}")

if __name__ == '__main__':
    seed = int(sys.argv[1]); rounds = [int(v) for v in (sys.argv[2] or '1,2,3').split(',')]
    for r in rounds: info(seed, r)
