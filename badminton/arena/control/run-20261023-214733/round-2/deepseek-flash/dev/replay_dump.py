import gzip
import json
import sys

p = sys.argv[1]
with gzip.open(p, "rt", encoding="utf-8") as f:
    d = json.load(f)
print("court:", d["court"])
print("final:", json.dumps(d["final"], ensure_ascii=False, indent=1)[:2000])
print("events:")
for i, e in enumerate(d["events"]):
    print(i, json.dumps(e, ensure_ascii=False))
print("frame sample:")
for i in [0, 1, 2, len(d["frames"]) // 2, len(d["frames"]) - 1]:
    print(i, json.dumps(d["frames"][i], ensure_ascii=False)[:1200])
