import json, sys
for path in sys.argv[1:]:
    rep = json.load(open(path, encoding="utf-8"))
    ss = [w.get("seconds") or [0, 0] for w in rep["windows"]]
    sums = [sum(s[i] for s in ss) for i in (0, 1)]
    maxs = sum(max(s) for s in ss)
    print(rep["id"], "duration", rep["duration"], "seat_sums", [round(x, 3) for x in sums], "sum_max", round(maxs, 3), "windows", len(ss), "final_now", rep["final"]["now"], "final_frame", rep["final"]["frame"])
