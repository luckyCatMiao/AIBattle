import json, gzip, sys, collections
p = sys.argv[1]
with gzip.open(p, 'rt', encoding='utf-8') as f:
    d = json.load(f)
print("id", d["id"], "seed", d["seed"], "frames", len(d["frames"]), "windows", d.get("windows"))
print("winner", d["winner"], "reason", d["reason"], "duration", d.get("duration"), "errors", d.get("errors"), "tech", d.get("technicalFailure"))
print("final:", json.dumps(d["final"], ensure_ascii=False))
print("rules:", json.dumps(d["rules"], ensure_ascii=False))
tr=d["track"]
print("track length=%.3f halfWidth=%.3f" % (tr["length"], tr["halfWidth"]))
print("audit:", json.dumps(tr["audit"], ensure_ascii=False))
print("num checkpoints:", len(tr.get("checkpoints") or []))
print("start:", json.dumps(tr.get("start"), ensure_ascii=False))
print("grid:", json.dumps(tr.get("grid"), ensure_ascii=False))
c=collections.Counter(e["type"] for e in d["events"])
print("event types:", dict(c))
for t in ("lap","cp","finish","boost","collision","offroad","go","countdown"):
    es=[e for e in d["events"] if e["type"]==t]
    if es:
        print("--",t,len(es))
        for e in es[:12]: print("   ", json.dumps(e, ensure_ascii=False))
