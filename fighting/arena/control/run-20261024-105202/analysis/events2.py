import json, sys
from collections import Counter

path, out = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as f:
    rep = json.load(f)

ev_by_id = {}
for s in rep["frames"]:
    for e in s.get("events") or []:
        ev_by_id[e.get("id")] = e
evs = [ev_by_id[k] for k in sorted(ev_by_id)]
fin = rep["final"]
bounds = []
cum = 0
for r in fin["roundLog"]:
    bounds.append((cum, cum + r["frames"], r["round"]))
    cum += r["frames"]
def rnd_of(frame):
    for a, b, n in bounds:
        if a <= frame < b:
            return n
    return bounds[-1][2]

L = []
L.append(f"== {rep['id']} seed={rep['seed']} seats={rep['seats']} teams={rep['teams']}")
L.append(f"duration(wall)={rep['duration']} scores={rep['scores']} windows={len(rep['windows'])} snapshots={len(rep['frames'])} final_frame={fin['frame']} now={fin['now']}")
L.append(f"events total {len(evs)}")
for rnd in (1, 2, 3):
    sel = [e for e in evs if rnd_of(e.get("frame", 0)) == rnd]
    L.append(f"\n=== ROUND {rnd}: {len(sel)} events ===")
    L.append("types: " + str(dict(Counter(e.get("type") for e in sel))))
    dmg = {0: 0, 1: 0}; hits = {0: 0, 1: 0}; blocks = {0: 0, 1: 0}
    for e in sel:
        if e.get("type") == "hit":
            dmg[e.get("owner")] += e.get("damage", 0); hits[e.get("owner")] += 1
        if e.get("type") == "block":
            blocks[e.get("owner")] += 1
    L.append(f"hit damage by owner: {dmg} hits: {hits} block events: {blocks}")
    for e in sel:
        typ = e.get("type")
        if typ in ("move", "hit", "block", "projectile", "super", "ko", "roundEnd", "round", "jump", "whiff", "down", "suddenDeath", "matchEnd", "guardBreak", "throw"):
            parts = [f"f{e.get('frame')} t{e.get('t')}", typ]
            for k in ("owner", "name", "damage", "combo", "text", "x"):
                if k in e:
                    parts.append(f"{k}={e[k]}")
            L.append("  " + " ".join(parts))

with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(L) + "\n")
print("wrote", out)
