import json, sys
from collections import Counter

rep_path, win_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
rep = json.load(open(rep_path, encoding="utf-8"))
wins = json.load(open(win_path, encoding="utf-8"))
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
def rnd(fr):
    for a,b,n,r in bounds:
        if a <= fr < b: return n,r
    return bounds[-1][2], bounds[-1][3]

L=[]
L.append(f"== {rep['id']} seed={rep['seed']} our_seat={seat}")
L.append(f"final frame={fin['frame']} now={fin['now']} -> {fin['frame']/20:.2f}s simulated; wall={rep['duration']}s; windows={len(rep['windows'])}")
L.append("\n-- late_push activation (roundFrame>=1580 and hp_ratio <= opp+2%) --")
for a,b,n,r in bounds:
    sub=[w for w in wins if w.get("round")==n]
    act=None
    for w in sub:
        rf=(w.get("window_frame") or 0)-a
        if rf < 1580: continue
        mh=w.get("me_hp") or 0; oh=w.get("op_hp") or 0
        if mh <= oh + 0.02*1000:
            act=w; break
    if not act:
        L.append(f"R{n}: not triggered (round {b-a} frames = {(b-a)/20:.2f}s; finish phase starts at frame 1580)")
        continue
    f0=act.get("window_frame")
    end=min(b, fin["frame"]+1)
    hits=[e for e in evs if f0 <= e.get("frame",0) < b and e.get("type")=="hit"]
    ours=[e for e in hits if e.get("owner")==seat]
    opp=[e for e in hits if e.get("owner")!=seat]
    L.append(f"R{n}: first qualifying window win{act.get('i')}@f{f0} (roundFrame {f0-a}, {(f0-a)/20:.2f}s), hp {act.get('me_hp')} vs {act.get('op_hp')}, meter {act.get('me_meter')} vs {act.get('op_meter')}; active until round end f{b} = {(b-f0)/20:.2f}s")
    L.append(f"    damage during: ours {sum(e.get('damage',0) for e in ours)} ({len(ours)} hits) vs opp {sum(e.get('damage',0) for e in opp)} ({len(opp)} hits)")
    L.append("    our hits: " + "; ".join(f"f{e['frame']} dmg{e.get('damage')}" for e in ours))
    L.append("    opp hits: " + "; ".join(f"f{e['frame']} dmg{e.get('damage')}" for e in opp))

L.append("\n-- long repeated-move whiff runs (same move >=3 consecutive starts) --")
total_whiff=0
for a,b,n,r in bounds:
    seq=[e for e in evs if a <= e.get("frame",0) < b and e.get("type")=="move"]
    runs=[]
    for e in seq:
        if runs and runs[-1][0]==e.get("name"):
            runs[-1][1].append(e.get("frame"))
        else:
            runs.append([e.get("name"), [e.get("frame")]])
    for name, fs in runs:
        if len(fs)>=3:
            total_whiff += (fs[-1]-fs[0])/20.0
            L.append(f"R{n}: {name} x{len(fs)} f{fs[0]}..{fs[-1]} span={(fs[-1]-fs[0])/20:.2f}s")
L.append(f"total whiff-run span: {total_whiff:.2f}s of {fin['now']:.1f}s simulated = {total_whiff/fin['now']*100:.1f}%")
L.append("\n-- per-round notes --")
for a,b,n,r in bounds:
    sub=[w for w in wins if w.get("round")==n]
    c=Counter(w.get("note") or "" for w in sub)
    L.append(f"R{n} ({len(sub)} windows): " + ", ".join(f"{k or '(empty)'}={v}" for k,v in c.most_common(12)))
open(out_path,"w",encoding="utf-8").write("\n".join(L)+"\n")
print("wrote", out_path)
