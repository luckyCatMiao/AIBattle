"""Reproduce the controller comparison quoted in review.md.

Usage: python bench_drift.py [seed ...]
Runs each controller solo over 3 laps with the public physics (sim.py) and prints
finish time, lap count and off-road percentage.  No opponent is present, so the
numbers are only for comparing controllers, not for predicting match results.
"""
import sys

from race import load_tracks, run_race
from agent import PARAMS
from controller import Controller
from controller2 import DriftController
from controller3 import HybridController
from drift3 import Drift3Controller
from solmimic import SolMimic
from driftbang import DriftBang

SEEDS = [int(x) for x in (sys.argv[1:] or ['5011', '5012', '6011', '6022'])]

CASES = [
    ('submitted (grip corners)', Controller, PARAMS),
    ('controller2 always-drift', DriftController, {'kappa_k': 2.0, 'brake_decel': 22.0}),
    ('controller3 hybrid-drift', HybridController, {'drift_corner': True}),
    ('drift3 slip-limited', Drift3Controller, {}),
    ('solmimic', SolMimic, {}),
    ('driftbang', DriftBang, {'kappa_k': 30.0, 'brake_decel': 6.0, 'drift_kappa': 0.2}),
]

data = load_tracks(SEEDS)
for name, cls, params in CASES:
    times, offs, bad = [], [], 0
    for s in SEEDS:
        r = run_race(data[str(s)], params, ctrl_class=cls, max_seconds=120.0)
        if not r['finished']:
            bad += 1
            continue
        times.append(r['time'])
        offs.append(r['offroad_pct'])
    if times:
        print('%-28s fin=%d/%d mean=%6.2f worst=%6.2f off=%5.2f%%'
              % (name, len(times), len(SEEDS), sum(times) / len(times), max(times),
                 sum(offs) / len(offs)))
    else:
        print('%-28s no finisher' % name)
