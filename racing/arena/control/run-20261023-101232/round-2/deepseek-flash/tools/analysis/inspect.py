import json, gzip, sys
p = sys.argv[1]
with gzip.open(p, 'rt', encoding='utf-8') as f:
    d = json.load(f)
print("keys:", list(d.keys()))
print("id/seed:", d.get("id"), d.get("seed"), "frames:", len(d.get("frames", [])))
fr = d["frames"]
print("frame keys:", list(fr[0].keys()))
print("car keys:", list(fr[0]["cars"][0].keys()))
# find events
evs = []
for f in fr:
    for e in f.get("events", []) or []:
        evs.append((f["frame"], e))
print("num events:", len(evs))
for x in evs[:40]:
    print(x)
# last frame
lf = fr[-1]
print("last frame:", lf["frame"], lf["status"], lf.get("winner"), lf.get("reason"), lf.get("timeLeft"))
for c in lf["cars"]:
    print(c["name"], "lap", c["lap"], "cp", c["nextCp"], "prog", c["progress"], "finish", c["finishTime"], "best", c["bestLap"], "boosts", c["boosts"], "driftTime", c["driftTime"], "coll", c["collisions"])
