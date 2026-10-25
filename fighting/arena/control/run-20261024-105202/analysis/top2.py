import json, sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    rep = json.load(f)
for k in ("id","round","game","seats","names","teams","seed","duration","scores","errors","technicalFailure","winner","reason"):
    print(k, "=", json.dumps(rep.get(k), ensure_ascii=False))
print("windows_count =", len(rep["windows"]))
print("final =", json.dumps(rep.get("final"), ensure_ascii=False)[:1500])
frames = rep["frames"]
print("snapshots =", len(frames), "last_frame_idx =", frames[-1]["frame"], "last_now =", frames[-1]["now"])
print("roundLog =", json.dumps(frames[-1].get("roundLog"), ensure_ascii=False))
# seconds stats
secs = []
for w in rep["windows"]:
    s = w.get("seconds")
    if isinstance(s, list):
        secs.append(s)
if secs:
    import statistics
    for i in (0, 1):
        vals = [s[i] for s in secs if len(s) > i and s[i] is not None]
        print("seat", i, "n", len(vals), "sum", round(sum(vals),3), "mean", round(sum(vals)/len(vals),4), "max", round(max(vals),3))
