"""Coordinate refinement around the chosen configuration, stability-aware."""
import json
import random
import time

import race

BASE = {
    "boost_energy_min": 0.08, "brake_margin": 0.482, "corner_a": 1e9,
    "corner_vmax": 46.0, "cruise_kappa": 0.036, "cruise_khead": 0.606,
    "cruise_koff": 0.99, "cruise_zone": 0.535, "kappa_k": 7.281,
    "la_base": 3.143, "la_t": 0.31, "release_charge": 0.137,
    "release_energy": 0.832, "wiggle_amp": 0.285, "wiggle_period": 7,
    "wiggle_vref": 999.0, "off_limit": 99.0,
}
SEEDS = [6011, 6012, 6021, 6022, 1, 4]
RANGES = {
    "wiggle_amp": (0.22, 0.31), "wiggle_period": (5, 10),
    "cruise_koff": (0.75, 1.1), "cruise_khead": (0.45, 0.8),
    "cruise_zone": (0.40, 0.70), "cruise_kappa": (0.028, 0.045),
    "kappa_k": (5.5, 10.0), "la_t": (0.27, 0.36), "la_base": (2.2, 3.8),
    "release_charge": (0.08, 0.25), "release_energy": (0.70, 0.95),
    "boost_energy_min": (0.03, 0.15), "brake_margin": (0.3, 0.9),
}


def evaluate(p, data):
    times = []
    pen = 0.0
    for s in SEEDS:
        r = race.run_race(data[str(s)], p)
        if r['time'] is None:
            times.append(300.0)
            pen += 50.0
        else:
            times.append(r['time'])
            pen += 3.0 * r['offroad_pct']
    mean = sum(times) / len(times)
    worst = max(times)
    return mean + 0.35 * (worst - mean) + pen / len(times), mean, worst


def main():
    import sys
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    data = race.load_tracks(SEEDS)
    rng = random.Random(987)
    best = dict(BASE)
    bs, bm, bw = evaluate(best, data)
    print('start score %.2f mean %.2f worst %.2f' % (bs, bm, bw), flush=True)
    t0 = time.time()
    for it in range(n):
        cand = dict(best)
        keys = rng.sample(list(RANGES), rng.randint(1, 3))
        for k in keys:
            a, b = RANGES[k]
            if isinstance(a, int):
                cand[k] = rng.randint(a, b)
            else:
                cand[k] = round(rng.uniform(a, b), 3)
        sc, m, w = evaluate(cand, data)
        if sc < bs:
            best, bs, bm, bw = cand, sc, m, w
            print('it%d score %.2f mean %.2f worst %.2f' % (it, sc, m, w), flush=True)
        if it % 25 == 0:
            print('...it%d best %.2f elapsed %.0fs' % (it, bs, time.time() - t0), flush=True)
    print('BEST', json.dumps(best, sort_keys=True))
    json.dump({'score': bs, 'mean': bm, 'worst': bw, 'params': best}, open('refined.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
