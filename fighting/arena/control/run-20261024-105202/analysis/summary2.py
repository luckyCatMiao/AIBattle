import json, sys
from collections import Counter

rep_path, win_path = sys.argv[1], sys.argv[2]
rep = json.load(open(rep_path, encoding="utf-8"))
wins = json.load(open(win_path, encoding="utf-8"))
seat = rep["seats"].index("deepseek-flash")
fin = rep["final"]
ev_by_id = {}
for s in rep["frames"]:
    for e in s.get("events") or []:
        ev_by_id[e.get("id")] = e
evs = [ev_by_id[k] for k in sorted(ev_by_id)]
ends = []
cum = 0
for i, r in enumerate(fin["roundLog"]):
    cum += r["frames"]
    if i == len(fin["roundLog"]) - 1:
        cum = fin["frame"]
    ends.append((cum, r["round"], r))
def rnd(fr):
    for e, n, r in ends:
        if fr <= e:
            return n, r
    return ends[-1][1], ends[-1][2]

print(f"== {rep['id']}")
print("round | frames | sec | winner | wHp | lHp | our dmg/hits | opp dmg/hits | our blocks | opp blocks | our supers | opp supers | our hp start/end | opp hp start/end")
for e, n, r in ends:
    sel = [x for x in evs if rnd(x.get("frame",0))[0] == n]
    def dh(o):
        h=[x for x in sel if x.get("type")=="hit" and x.get("owner")==o]
        return sum(x.get("damage",0) for x in h), len(h)
    def bl(o): return sum(1 for x in sel if x.get("type")=="block" and x.get("owner")==o)
    def su(o): return sum(1 for x in sel if x.get("type")=="super" and x.get("owner")==o)
    od,oh=dh(seat); xd,xh=dh(1-seat)
    sub=[w for w in wins if w.get("round")==n]
    hp0=(sub[0].get("me_hp"),sub[0].get("op_hp")) if sub else (None,None)
    hp1=(sub[-1].get("me_hp"),sub[-1].get("op_hp")) if sub else (None,None)
    start = 0 if n == 1 else ends[n-2][0]
    frames = e - start
    print(f"R{n} | {frames} | {frames/20:.2f} | {'us' if r['winner']=='DeepSeek V4.1 Flash' else 'Sol'} | {r['winnerHp']} | {r['loserHp']} | {od}/{oh} | {xd}/{xh} | {bl(seat)} | {bl(1-seat)} | {su(seat)} | {su(1-seat)} | {hp0}->{hp1} | {hp0[1] if hp0[0] is not None else None}->{hp1[1] if hp1[0] is not None else None}")
tot_our=sum(x.get('damage',0) for x in evs if x.get('type')=='hit' and x.get('owner')==seat)
tot_opp=sum(x.get('damage',0) for x in evs if x.get('type')=='hit' and x.get('owner')!=seat)
print("event hit damage total: ours", tot_our, "opp", tot_opp)
print("official damageDealt:", {p['name']:p['damageDealt'] for p in fin['players']})
print("official hits:", {p['name']:p['hits'] for p in fin['players']})
