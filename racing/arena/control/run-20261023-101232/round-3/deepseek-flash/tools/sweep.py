# -*- coding: utf-8 -*-
"""Parameter sweep over tracks: python tools/sweep.py <tracks.json> <configs.json> [--limit N]"""
import json,sys,os
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,HERE); sys.path.insert(0,ROOT)
import agent
from run import run_one

tracks=json.load(open(sys.argv[1]))
cfgs=json.load(open(sys.argv[2]))
limit=None
if "--limit" in sys.argv: limit=int(sys.argv[sys.argv.index("--limit")+1])
if limit: tracks=tracks[:limit]
for cfg in cfgs:
    name=cfg.pop("name",str(cfgs.index(cfg)))
    agent.P.clear(); agent.P.update(agent.DEFAULT_PARAMS); agent.P.update(cfg)
    rows=[run_one(tr) for tr in tracks]
    fin=[r for r in rows if r["status"]=="finished"]
    flying=[t for r in fin for t in r["lapTimes"][1:]]
    tot=[r["total"] for r in fin if r["total"]]
    meanfly=sum(flying)/len(flying) if flying else 99
    worst=max(flying) if flying else 99
    print("%-22s n=%d fin=%d meanFly=%.3f worstFly=%.2f meanTot=%.2f off=%d drift=%.1fs boost=%.1fs charge=%.2f path=%.0f"%(
        name,len(rows),len(fin),meanfly,worst,sum(tot)/max(len(tot),1),
        sum(r["offFrames"] for r in rows),sum(r["driftSec"] for r in rows)/len(rows),
        sum(r["boostSec"] for r in rows)/len(rows),sum(r["charge"] for r in rows)/len(rows),
        sum(r["path"] for r in rows)/len(rows)))
    sys.stdout.flush()
