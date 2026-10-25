# -*- coding: utf-8 -*-
"""In-process parameter sweep. usage: python -I tools/sweep2.py grid.json [nsets]"""
import json, os, sys, itertools
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT); sys.path.insert(0, HERE)
import agent
from run import run_one

TRACKS = json.load(open(os.path.join(HERE, "data", "tracks_val2.json")))

def eval_params(params, tracks):
    agent.P.clear(); agent.P.update(agent.DEFAULT_PARAMS); agent.P.update(params)
    rows = [run_one(t) for t in tracks]
    fin = [r for r in rows if r["status"] == "finished"]
    lapavg = (sum(sum(r["lapTimes"]) / max(len(r["lapTimes"]), 1) for r in fin) / max(len(fin), 1))
    total = (sum(sum(r["lapTimes"]) for r in fin) / max(len(fin), 1))
    worst = max((max(r["lapTimes"]) for r in fin), default=0)
    off = sum(r["offFrames"] for r in rows)
    return dict(avgLap=round(lapavg, 3), avgTotal=round(total, 2), worstLap=round(worst, 2),
                off=off, boost=round(sum(r["boostSec"] for r in rows) / len(rows), 2),
                drift=round(sum(r["driftSec"] for r in rows) / len(rows), 2),
                maxV=round(max(r["maxV"] for r in rows), 1),
                seeds=[(r["seed"], r["lapTimes"], r["offFrames"]) for r in rows])

def main():
    grid = json.load(open(sys.argv[1]))
    nset = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    base = grid.pop("_base", {})
    keys = list(grid.keys())
    combos = [dict(zip(keys, vals)) for vals in itertools.product(*[grid[k] for k in keys])]
    tracks = TRACKS[:nset]
    for c in combos:
        p = dict(base); p.update(c)
        r = eval_params(p, tracks)
        print(json.dumps({kk: r[kk] for kk in ("avgLap", "avgTotal", "worstLap", "off", "boost", "drift", "maxV")}) + "  " + json.dumps(c))
        sys.stdout.flush()

if __name__ == "__main__":
    main()
