import gzip
import json
import sys

p = sys.argv[1]
f0, f1 = int(sys.argv[2]), int(sys.argv[3])
with gzip.open(p, "rt", encoding="utf-8") as f:
    d = json.load(f)
fr = d["frames"]
for i in range(f0, min(f1 + 1, len(fr))):
    x = fr[i]
    b = x["batsmen"]
    sh = x["shuttle"]
    print(f"{i:4d} ph={x['phase']:7s} rally={x['rally']} p0 x={b[0]['x']:.2f} vx={b[0]['vx']:.2f} sw={b[0]['swing']}/{b[0]['swingType']}/{b[0]['swingElapsed']} st={b[0]['stamina']:.1f} h={b[0]['hits']} | "
          f"p1 x={b[1]['x']:.2f} vx={b[1]['vx']:.2f} sw={b[1]['swing']}/{b[1]['swingType']}/{b[1]['swingElapsed']} st={b[1]['stamina']:.1f} h={b[1]['hits']} | "
          f"ball=({sh['x']:.2f},{sh['y']:.2f}) v=({sh['vx']:.1f},{sh['vy']:.1f}) last={sh['lastTeam']}")
