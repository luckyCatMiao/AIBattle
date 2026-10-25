import json, sys
from collections import Counter
rep_path, win_path = sys.argv[1], sys.argv[2]
rep = json.load(open(rep_path, encoding="utf-8"))
wins = json.load(open(win_path, encoding="utf-8"))
# run spans identified manually from runs.py
runs = {
 "r3-g1": [(844,1594,"踩踏",26),(2038,2419,"高踢",9),(3079,3709,"踩踏",22)],
 "r3-g2": [(559,1609,"踩踏",36),(3094,3724,"短弓柄",43)],
}[rep["id"]]
for f0,f1,name,n in runs:
    sub=[w for w in wins if f0 <= (w.get("window_frame") or 0) <= f1]
    notes=Counter((w.get("note") or "(none)") for w in sub)
    atk=sum(1 for w in sub if any(x.get("btn") for x in (w.get("inputs") or [])))
    fwd=sum(sum(1 for x in (w.get("inputs") or []) if x.get("dir")=="F") for w in sub)
    guard=sum(sum(1 for x in (w.get("inputs") or []) if x.get("dir") in ("B","DB")) for w in sub)
    print(f"{rep['id']} {name} {f0}..{f1} ({n} starts, {(f1-f0)/20:.2f}s): windows={len(sub)} atk_windows={atk} F_frames={fwd} guard_frames={guard}")
    print("   notes:", dict(notes.most_common(8)))
