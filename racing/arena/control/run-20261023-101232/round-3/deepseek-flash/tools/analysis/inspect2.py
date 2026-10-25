import json, gzip, sys
p = sys.argv[1]
with gzip.open(p, 'rt', encoding='utf-8') as f:
    d = json.load(f)
print("events:")
for e in d["events"]:
    print(e)
print("final:", json.dumps(d["final"], ensure_ascii=False))
print("rules:", json.dumps(d["rules"], ensure_ascii=False))
tr = d["track"]
print("track keys:", list(tr.keys()))
print("track meta:", {k:v for k,v in tr.items() if k not in ("tiles","points","checkpoints","start","grid","audit")})
print("track length/halfwidth:", tr.get("length"), tr.get("halfWidth"))
print("audit:", json.dumps(tr.get("audit"), ensure_ascii=False))
print("checkpoints:", json.dumps(tr.get("checkpoints"), ensure_ascii=False)[:2000])
print("start:", json.dumps(tr.get("start"), ensure_ascii=False))
print("grid:", json.dumps(tr.get("grid"), ensure_ascii=False))
print("windows:", d.get("windows"), "frameMs:", d.get("frameMs"), "duration:", d.get("duration"), "errors:", d.get("errors"))
