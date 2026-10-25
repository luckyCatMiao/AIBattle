import json, sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    rep = json.load(f)
for k in ("id","round","game","seats","names","teams","seed","windows","duration","scores","errors","technicalFailure","winner","reason"):
    print(k, "=", json.dumps(rep.get(k), ensure_ascii=False))
print("final =", json.dumps(rep.get("final"), ensure_ascii=False)[:3000])
frames = rep["frames"]
print("snapshots =", len(frames), "last_frame_idx =", frames[-1]["frame"], "last_now =", frames[-1]["now"])
print("roundLog =", json.dumps(frames[-1].get("roundLog"), ensure_ascii=False))
