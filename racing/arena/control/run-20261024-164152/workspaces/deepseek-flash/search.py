"""Random search over controller parameters."""
import json
import random
import sys
import time

import race

FIXED = dict(corner_vmax=46.0, corner_a=1e9)
RANGES = dict(
    wiggle_amp=(0.20, 0.36),
    wiggle_period=(5, 14),
    cruise_koff=(0.55, 1.0),
    cruise_khead=(0.45, 1.0),
    kappa_k=(3.0, 8.0),
    release_charge=(0.10, 0.50),
    release_energy=(0.70, 0.95),
    la_t=(0.20, 0.40),
    la_base=(1.5, 4.0),
    cruise_zone=(0.35, 0.80),
    cruise_kappa=(0.020, 0.050),
    boost_energy_min=(0.01, 0.10),
    brake_margin=(0.3, 1.5),
)


def sample(rng):
    p = dict(FIXED)
    for k, (a, b) in RANGES.items():
        if isinstance(a, int):
            p[k] = rng.randint(a, b)
        else:
            p[k] = round(rng.uniform(a, b), 3)
    return p


def score(p, data, seeds):
    tot = 0.0
    pen = 0.0
    for s in seeds:
        r = race.run_race(data[str(s)], p)
        if r['time'] is None:
            pen += 400.0
            tot += 300.0
        else:
            tot += r['time']
            pen += r['offroad_pct'] * 2.0
    return tot / len(seeds) + pen / len(seeds)


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    seeds = [int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else '6011 6021 1 4').split()]
    data = race.load_tracks(seeds)
    rng = random.Random(12345)
    best = []
    t0 = time.time()
    for i in range(n):
        p = sample(rng)
        sc = score(p, data, seeds)
        best.append((sc, p))
        best.sort(key=lambda x: x[0])
        best = best[:12]
        if i % 10 == 0:
            print(i, '%.1f' % sc, 'best %.1f' % best[0][0], 'elapsed %.0fs' % (time.time() - t0), flush=True)
    print('TOP:')
    for sc, p in best:
        print('%.2f' % sc, json.dumps(p, sort_keys=True))
    json.dump([{'score': sc, 'params': p} for sc, p in best], open('best_params.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
