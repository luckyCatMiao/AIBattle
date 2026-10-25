import json, sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    rep = json.load(f)

print("top keys:", list(rep.keys()))
frames = rep["frames"]
print("num snapshots:", len(frames))
print("first frame/tick/now:", frames[0]["frame"], frames[0]["tick"], frames[0]["now"])
print("last  frame/tick/now:", frames[-1]["frame"], frames[-1]["tick"], frames[-1]["now"])
print("last status/winner/reason:", frames[-1]["status"], frames[-1]["winner"], frames[-1]["reason"])
print("last players:", json.dumps(frames[-1]["players"], ensure_ascii=False))
print("last fighters:", [(x["char"], x["owner"], x["hp"]) for x in frames[-1]["fighters"]])
print("roundLog:", json.dumps(frames[-1].get("roundLog"), ensure_ascii=False)[:2000])
evs = frames[-1].get("events", [])
print("num last events:", len(evs))
from collections import Counter
c = Counter(e.get("type") for e in evs)
print("event types:", c)
print("last 10 events:", json.dumps(evs[-10:], ensure_ascii=False))
