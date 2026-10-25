"""Per-point hit timeline with exact frame numbers for post-match citations.
Usage: python -I -X utf8 dev/hitframes.py <replay.json.gz> [point numbers...]
Reads replay only; writes nothing.
"""
import gzip, json, math, sys

OURS = "deepseek-flash"

def load(p):
    with gzip.open(p, "rt", encoding="utf-8") as f:
        return json.load(f)

def kind(h):
    if h["swingType"] == -1:
        return "lift"
    ang = math.atan2(h["vy"], abs(h["vx"]))
    if ang < -0.15: return "smash"
    if ang < 0.30: return "drive"
    if ang < 0.80: return "clear"
    return "lift"

def main():
    d = load(sys.argv[1])
    want = set(int(x) for x in sys.argv[2:])
    us = d["seats"].index(OURS)
    frames = d["frames"]
    ev = d["events"]
    hits = []
    prev = [0, 0]
    for i, fr in enumerate(frames):
        for t in (0, 1):
            b = fr["batsmen"][t]
            while b["hits"] > prev[t]:
                nx = frames[min(i+1, len(frames)-1)]["shuttle"]
                hits.append({"f": i, "team": t, "x": b["x"], "y": b["y"],
                             "air": not b["onGround"], "st": b["stamina"],
                             "swingType": b["swingType"],
                             "sx": fr["shuttle"]["x"], "sy": fr["shuttle"]["y"],
                             "vx": nx["vx"], "vy": nx["vy"],
                             "sp": math.hypot(nx["vx"], nx["vy"])})
                prev[t] += 1
    serves = [e for e in ev if e["type"] == "serve"]
    points = [e for e in ev if e["type"] == "point"]
    print(f"== {d['id']} net={d['court']['netHeight']:.2f} seats={d['seats']} ==")
    for i, e in enumerate(points, 1):
        if want and i not in want: continue
        sv = [s for s in serves if s["frame"] <= e["frame"]][-1]
        rh = [h for h in hits if sv["frame"] <= h["f"] <= e["frame"]]
        print(f"P{i:02d} serve_f={sv['frame']} point_f={e['frame']} t={e['t']:.2f} "
              f"start={e['score'][us]}:{e['score'][1-us]} -> " +
              (f"{e['score'][us]}:{e['score'][1-us]}" if False else "") +
              f"rally={e['rally']} winner={'us' if e['team']==us else 'sol'} endx={e['x']:.2f}")
        for h in rh:
            who = "US " if h["team"] == us else "sol"
            print(f"   f={h['f']:4d} t={h['f']*0.05:6.2f} {who} "
                  f"{'J' if h['air'] else ' '} {kind(h):5s} v={h['sp']:5.1f} "
                  f"contact=({h['sx']:.2f},{h['sy']:.2f}) body=({h['x']:.2f},{h['y']:.2f}) "
                  f"st={h['st']:5.1f}")
        print()

if __name__ == "__main__":
    main()
