# -*- coding: utf-8 -*-
"""Upper-bound experiment: zero boost drain (illegal, exploration only)."""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT); sys.path.insert(0, HERE)
import eng, agent
from run import run_one
_orig_car_init = eng.Car.__init__
def _free_init(self,*a,**k):
    _orig_car_init(self,*a,**k)
    self.boostEnergy = 1.0
eng.Car.__init__ = _free_init

def main():
    cfg = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else {}
    eng.RULES["boostDrain"] = 0.0
    agent.R["boostDrain"] = 0.0
    agent.P.update({"boost_start": 0.0, "boost_phase_vmin": 0.0, "boost_stretch_vmin": 0.0, "boost_vmin": 0.0})
    agent.P.update(cfg)
    tracks = json.load(open(os.path.join(HERE, "data", "tracks_val2.json")))
    lim = int(os.environ.get("LIMIT", "4"))
    rows = []
    for tr in tracks[:lim]:
        r = run_one(tr)
        rows.append(r)
        print(json.dumps(r))
    fin = [r for r in rows if r["status"] == "finished"]
    print("FIN=%d avgLap=%.3f worstLap=%.2f off=%d maxV=%.1f"%(
        len(fin), sum(sum(r["lapTimes"])/max(len(r["lapTimes"]),1) for r in fin)/max(len(fin),1),
        max((max(r["lapTimes"]) for r in fin),default=0), sum(r["offFrames"] for r in rows),
        max((r["maxV"] for r in rows),default=0)))

if __name__ == "__main__":
    main()
