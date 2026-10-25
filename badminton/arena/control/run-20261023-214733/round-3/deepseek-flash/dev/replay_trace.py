import gzip
import json
import sys

p = sys.argv[1]
f0, f1 = int(sys.argv[2]), int(sys.argv[3])
with gzip.open(p, "rt", encoding="utf-8") as f:
    d = json.load(f)
fr = d["frames"]
prev = None
for i in range(f0, min(f1 + 1, len(fr))):
    x = fr[i]
    b = x["batsmen"]
    key = (b[0]["hits"], b[0]["smashes"], b[1]["hits"], b[1]["smashes"], x["phase"], x.get("lastPoint") and x["lastPoint"].get("reason"))
    if key != prev:
        sh = x["shuttle"]
        print(f"{i:4d} t={x['tick']*0.05:6.2f} phase={x['phase']:8s} score={x['score']} srv={x['server']} rally={x['rally']} "
              f"p0=({b[0]['x']:.2f},{b[0]['stamina']:.1f},h{b[0]['hits']},s{b[0]['smashes']},sw{b[0]['swing']}/{b[0]['swingType']}/{b[0]['swingElapsed']}) "
              f"p1=({b[1]['x']:.2f},{b[1]['stamina']:.1f},h{b[1]['hits']},s{b[1]['smashes']},sw{b[1]['swing']}/{b[1]['swingType']}/{b[1]['swingElapsed']}) "
              f"ball=({sh['x']:.2f},{sh['y']:.2f},{sh['vx']:.2f},{sh['vy']:.2f},alive={sh['alive']},last={sh['lastTeam']})")
        prev = key
