#!/usr/bin/env python3
import sys, json
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    try: obs=json.loads(line)
    except Exception:
        print(json.dumps({"inputs":[[{"dir":"N","aim":"N"} for _ in range(5)] for _ in range(20)]}),flush=True); continue
    if obs.get('phase')=='buy':
        print(json.dumps({"buys":[]}),flush=True)
    else:
        print(json.dumps({"inputs":[[{"dir":"N","aim":"N"} for _ in range(5)] for _ in range(20)]}),flush=True)
