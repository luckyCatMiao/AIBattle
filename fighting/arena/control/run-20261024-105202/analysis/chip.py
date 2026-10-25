import json, sys, re
rep_path = sys.argv[1]
rep = json.load(open(rep_path, encoding="utf-8"))
seat = rep["seats"].index("deepseek-flash")
fin = rep["final"]
ev_by_id = {}
for s in rep["frames"]:
    for e in s.get("events") or []:
        ev_by_id[e.get("id")] = e
evs = [ev_by_id[k] for k in sorted(ev_by_id)]
ends=[]; cum=0
for i,r in enumerate(fin["roundLog"]):
    cum += r["frames"]
    if i==len(fin["roundLog"])-1: cum=fin["frame"]
    ends.append((cum,r["round"],r))
def rnd(fr):
    for e,n,r in ends:
        if fr<=e: return n,r
    return ends[-1][1],ends[-1][2]
print(rep["id"])
for e,n,r in ends:
    sel=[x for x in evs if rnd(x.get("frame",0))[0]==n]
    def chip(owner):
        v=0; c=0
        for x in sel:
            if x.get("type")=="block" and x.get("owner")==owner:
                m=re.search(r"削防 (\d+)", x.get("text",""))
                if m: v+=int(m.group(1)); c+=1
        return v,c
    oc,occ=chip(seat); xc,xcc=chip(1-seat)
    print(f" R{n}: chip on us={oc} ({occ} blocks), chip on opp={xc} ({xcc} blocks)")
