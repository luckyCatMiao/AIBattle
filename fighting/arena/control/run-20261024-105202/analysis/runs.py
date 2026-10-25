import json, sys
from collections import Counter
rep = json.load(open(sys.argv[1], encoding="utf-8"))
ev_by_id = {}
for s in rep["frames"]:
    for e in s.get("events") or []:
        ev_by_id[e.get("id")] = e
evs = [ev_by_id[k] for k in sorted(ev_by_id)]
fin = rep["final"]
bounds = []
cum = 0
for r in fin["roundLog"]:
    bounds.append((cum, cum + r["frames"], r["round"]))
    cum += r["frames"]
def rnd(fr):
    for a,b,n in bounds:
        if a <= fr < b: return n
    return 3
for n in (1,2,3):
    seq = [e for e in evs if rnd(e.get("frame",0))==n and e.get("type")=="move"]
    c = Counter(e.get("name") for e in seq)
    print(f"R{n} moves:", dict(c))
    # find runs of same move name
    runs = []
    for e in seq:
        if runs and runs[-1][0] == e.get("name"):
            runs[-1][1].append(e.get("frame"))
        else:
            runs.append([e.get("name"), [e.get("frame")]])
    for name, fs in runs:
        if len(fs) >= 3:
            print(f"  run {name}: n={len(fs)} frames {fs[0]}..{fs[-1]} span={(fs[-1]-fs[0])/20:.2f}s")
