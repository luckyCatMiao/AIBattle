import json, sys
from collections import Counter

rep_path, win_path = sys.argv[1], sys.argv[2]
with open(rep_path, "r", encoding="utf-8") as f:
    rep = json.load(f)
with open(win_path, "r", encoding="utf-8") as f:
    wins = json.load(f)
seat = rep["seats"].index("deepseek-flash")
fin = rep["final"]
ev_by_id = {}
for s in rep["frames"]:
    for e in s.get("events") or []:
        ev_by_id[e.get("id")] = e
evs = [ev_by_id[k] for k in sorted(ev_by_id)]
bounds = []
cum = 0
for r in fin["roundLog"]:
    bounds.append((cum, cum + r["frames"], r["round"], r))
    cum += r["frames"]
def rnd_of(frame):
    for a, b, n, r in bounds:
        if a <= frame < b:
            return n, r
    return bounds[-1][2], bounds[-1][3]

print(f"== {rep['id']} seed={rep['seed']} seats={rep['seats']} our_seat={seat}")
print(f"final: frame={fin['frame']} now={fin['now']}s wall_duration={rep['duration']}s windows={len(rep['windows'])} snapshots={len(rep['frames'])}")
print(f"official scores={rep['scores']} errors={rep['errors']} tech={rep['technicalFailure']}")
for p in fin["players"]:
    print(f"  P{p['id']} {p['name']}: damageDealt={p['damageDealt']} hits={p['hits']} blocks={p['blocks']} maxCombo={p['maxCombo']} score={p['score']}")
print("\nround | frames | sec | winner | wHp | lHp | our dmg/hits | opp dmg/hits | our blocks | opp blocks | our supers | opp supers")
for a, b, n, r in bounds:
    sel = [e for e in evs if rnd_of(e.get("frame", 0))[0] == n]
    def dmg_hits(owner):
        h = [e for e in sel if e.get("type") == "hit" and e.get("owner") == owner]
        return sum(e.get("damage", 0) for e in h), len(h)
    def blocks(owner):
        return sum(1 for e in sel if e.get("type") == "block" and e.get("owner") == owner)
    def supers(owner):
        return sum(1 for e in sel if e.get("type") == "super" and e.get("owner") == owner)
    od, oh = dmg_hits(seat)
    xd, xh = dmg_hits(1 - seat)
    secs = (b - a) / 20.0
    print(f"R{n} | {b-a} | {secs:.2f} | {'us' if r['winner']=='DeepSeek V4.1 Flash' else 'Sol'} | {r['winnerHp']} | {r['loserHp']} | {od}/{oh} | {xd}/{xh} | {blocks(seat)} | {blocks(1-seat)} | {supers(seat)} | {supers(1-seat)}")

# max meter and meter at round ends
print("\nmeter stats (our / opp):")
for a, b, n, r in bounds:
    sub = [w for w in wins if w.get("round") == n]
    if sub:
        mm = max(w.get("me_meter") or 0 for w in sub)
        om = max(w.get("op_meter") or 0 for w in sub)
        print(f"  R{n}: our max={mm} end={sub[-1].get('me_meter')} ; opp max={om} end={sub[-1].get('op_meter')}")

# our attack windows and hits
print("\nour button windows / hits by round:")
for a, b, n, r in bounds:
    sub = [w for w in wins if w.get("round") == n]
    atk = sum(1 for w in sub if any(x.get("btn") for x in (w.get("inputs") or [])))
    hits = sum(1 for e in evs if rnd_of(e.get("frame", 0))[0] == n and e.get("type") == "hit" and e.get("owner") == seat)
    print(f"  R{n}: windows={len(sub)} button_windows={atk} hits={hits}")
