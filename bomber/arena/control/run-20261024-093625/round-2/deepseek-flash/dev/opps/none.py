#!/usr/bin/env python3
import sys, json
N = {"inputs": [{"dir": "N", "btn": None} for _ in range(20)]}
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    sys.stdout.write(json.dumps(N) + "\n")
    sys.stdout.flush()
