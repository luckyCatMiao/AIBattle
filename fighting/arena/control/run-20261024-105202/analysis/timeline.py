import json, sys

path, out = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as f:
    rep = json.load(f)

names = rep["names"]
lines = []
lines.append(f"== {rep['id']} seed={rep['seed']} seats={rep['seats']} teams={rep['teams']}")
lines.append(f"duration(wall)={rep['duration']} scores={rep['scores']} windows={len(rep['windows'])} snapshots={len(rep['frames'])}")
fin = rep["final"]
lines.append(f"final frame={fin['frame']} now={fin['now']} status={fin['status']} round={fin['round']}")
lines.append("roundLog:")
for r in fin["roundLog"]:
    lines.append("  " + json.dumps(r, ensure_ascii=False))
lines.append("players:")
for p in fin["players"]:
    lines.append("  " + json.dumps(p, ensure_ascii=False))

# per-round events
evs = fin.get("events", [])
for rnd in (1, 2, 3):
    lines.append(f"\n--- ROUND {rnd} events ---")
    for e in evs:
        # events do not carry round; assign via frame ranges from roundLog
        pass

# assign rounds by cumulative frames
bounds = []
cum = 0
for r in fin["roundLog"]:
    bounds.append((cum, cum + r["frames"], r["round"]))
    cum += r["frames"]
def rnd_of(frame):
    for a, b, n in bounds:
        if a <= frame < b:
            return n
    return 3

# print events with round tags and fighter snapshot hp at event time
# build frame-index -> snapshot (decision windows only)
# for hp context, use last snapshot at/before event
snaps = rep["frames"]
def snap_at(frame):
    lo, hi = 0, len(snaps)
    while lo < hi:
        mid = (lo + hi) // 2
        if snaps[mid]["frame"] <= frame:
            lo = mid + 1
        else:
            hi = mid
    return snaps[max(0, lo - 1)] if lo else snaps[0]

for e in evs:
    fr = e.get("frame", 0)
    rnd = rnd_of(fr)
    typ = e.get("type")
    if typ in ("move", "hit", "block", "projectile", "super", "ko", "roundEnd", "round", "jump", "whiff", "down", "suddenDeath", "matchEnd", "guardBreak", "throw"):
        s = snap_at(fr)
        hp = " ".join(f"{x['char']}:{x['owner']}={x['hp']}" for x in s["fighters"])
        extra = []
        for k in ("owner", "name", "damage", "combo", "text", "x"):
            if k in e:
                extra.append(f"{k}={e[k]}")
        lines.append(f"R{rnd} f{fr} t{e.get('t')} {typ} " + " ".join(extra) + " | " + hp)

# round-start snapshots
lines.append("\n--- ROUND START STATES ---")
for a, b, n in bounds:
    s = snap_at(a)
    lines.append(f"R{n} frame={a} fighters=" + json.dumps([{k: x[k] for k in ("char","owner","x","hp","meter","guard","state")} for x in s["fighters"]], ensure_ascii=False))

with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
print("wrote", out, "lines", len(lines))
