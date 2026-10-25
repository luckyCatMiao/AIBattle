import gzip
import json
import os
import sys

paths = sys.argv[1:]
for p in paths:
    with gzip.open(p, "rt", encoding="utf-8") as f:
        d = json.load(f)
    print(os.path.basename(p), type(d).__name__)
    if isinstance(d, dict):
        for k, v in d.items():
            if isinstance(v, (list, dict)):
                print(" ", k, type(v).__name__, len(v))
            else:
                print(" ", k, repr(v)[:160])
    elif isinstance(d, list):
        print(" len", len(d))
        if d:
            print(" first:", repr(d[0])[:500])
