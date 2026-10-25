# -*- coding: utf-8 -*-
"""Validate one config on tracks, both seats. python tools/validate.py <tracks.json> [--limit N]"""
import json,sys
HERE=__import__('os').path.dirname(__import__('os').path.abspath(__file__)); ROOT=__import__('os').path.dirname(HERE)
sys.path.insert(0,HERE); sys.path.insert(0,ROOT)
import agent
from run import run_one
cfg=json.loads(sys.argv[1]) if len(sys.argv)>1 and sys.argv[1].startswith('{') else {}
tracks=json.load(open(sys.argv[2] if len(sys.argv)>2 else 'tools/data/tracks_val.json'))
agent.P.clear(); agent.P.update(agent.DEFAULT_PARAMS); agent.P.update(cfg)
rows=[]
for tr in tracks:
    for seat in (0,1):
        r=run_one(tr, seat=seat); r['seat']=seat; r['L']=tr["length"]; r['half']=tr["halfWidth"]; rows.append(r)
fin=[r for r in rows if r["status"]=="finished" and r["laps"]>=3]
fly=[t for r in fin for t in r["lapTimes"][1:]]
norm=[ (r["L"]/ (sum(r["lapTimes"][1:])/max(len(r["lapTimes"])-1,1))) for r in fin if len(r["lapTimes"])>=2]
byt={}
for r in fin:
    if len(r["lapTimes"])>=3:
        for i,t in enumerate(r["lapTimes"][1:]):
            byt.setdefault(i+2,[]).append(t)
print("runs=%d finished=%d offFrames=%d meanFly=%.3f worstFly=%.2f meanSpeed=%.2f"%(
    len(rows),len(fin),sum(r["offFrames"] for r in rows),sum(fly)/len(fly),max(fly),sum(norm)/len(norm)))
print("per-lap mean:", {k:round(sum(v)/len(v),3) for k,v in sorted(byt.items())})
print("off seeds:", [(r['seed'],r['seat'],r['offFrames'],r['lapTimes']) for r in rows if r['offFrames']>0][:20])
print("unfinished:", [(r['seed'],r['seat'],r['laps'],r['lapTimes']) for r in rows if r['laps']<3][:10])
