import json, sys
from collections import Counter

rep_path, win_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(rep_path, "r", encoding="utf-8") as f:
    rep = json.load(f)
with open(win_path, "r", encoding="utf-8") as f:
    wins = json.load(f)
seat = rep["seats"].index("deepseek-flash")
ev_by_id = {}
for s in rep["frames"]:
    for e in s.get("events") or []:
        ev_by_id[e.get("id")] = e
evs = [ev_by_id[k] for k in sorted(ev_by_id)]

# map frame -> window row
def w_at(frame):
    # windows start at frames[i]; find last with window_frame <= frame
    lo, hi = 0, len(rep["windows"])
    while lo < hi:
        mid = (lo + hi) // 2
        if rep["windows"][mid]["frame"] <= frame:
            lo = mid + 1
        else:
            hi = mid
    return wins[max(0, lo - 1)]

def compress(inputs):
    out = []
    for x in inputs or []:
        d = x.get("dir") or "N"
        b = x.get("btn")
        s = d if not b else d + "+" + b
        if out and out[-1][0] == s:
            out[-1][1] += 1
        else:
            out.append([s, 1])
    return " ".join(f"{s}x{n}" if n > 1 else s for s, n in out)

L = []
L.append(f"== {rep['id']} our seat {seat}")
for rnd in (1, 2, 3):
    L.append(f"\n--- ROUND {rnd} hits/blocks/supers with our agent note ---")
    for e in evs:
        fr = e.get("frame", 0)
        w = w_at(fr)
        if w.get("round") != rnd:
            continue
        typ = e.get("type")
        if typ not in ("hit", "block", "super", "whiff", "ko", "roundEnd", "suddenDeath"):
            continue
        who = "US" if e.get("owner") == seat else "OPP"
        L.append(f"f{fr} {typ:12s} {who} dmg={e.get('damage','')} combo={e.get('combo','')} name={e.get('name','')} text={e.get('text','')}")
        L.append(f"    win{w.get('i')}@f{w.get('window_frame')} note={w.get('note')} dx={w.get('dx')} me={w.get('me_char')} {w.get('me_state')} hp{w.get('me_hp')} mt{w.get('me_meter')} g{w.get('me_guard')} | op={w.get('op_char')} {w.get('op_state')} hp{w.get('op_hp')} mt{w.get('op_meter')} g{w.get('op_guard')} move={w.get('op_move')}")
        L.append(f"    inputs={compress(w.get('inputs'))}")

# windows with attack-intent notes and next-window outcome
L.append("\n--- ATTACK INTENT WINDOWS AND NEXT 30 FRAMES ---")
intent = ("punish", "super-punish", "super-counter", "super-late", "super-combo", "combo", "counterpoke", "poke", "killpoke", "cancel-super", "blockpunish", "blocktake", "blockcounter", "air-overhead", "jumpin", "atk")
for w in wins:
    note = w.get("note") or ""
    if not any(note.startswith(k) for k in intent):
        continue
    f0 = w.get("window_frame", 0)
    f1 = f0 + 30
    evs2 = [e for e in evs if f0 <= e.get("frame", 0) < f1 and e.get("type") in ("hit", "block", "whiff", "super", "ko")]
    out = "; ".join(f"f{e.get('frame')} {e.get('type')} {('US' if e.get('owner')==seat else 'OPP')} dmg={e.get('damage','')}" for e in evs2)
    L.append(f"R{w.get('round')} win{w.get('i')}@f{f0} note={note} dx={w.get('dx')} me={w.get('me_state')} hp{w.get('me_hp')} op={w.get('op_state')} hp{w.get('op_hp')} move={w.get('op_move')} | next: {out or 'NONE'}")

with open(out_path, "w", encoding="utf-8") as f:
    f.write("\n".join(L) + "\n")
print("wrote", out_path)
