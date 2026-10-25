import json, gzip, sys, math, collections

def load(p):
    with gzip.open(p, 'rt', encoding='utf-8') as f:
        return json.load(f)

def analyze(p):
    d=load(p)
    fr=d["frames"]; tr=d["track"]
    print("="*90)
    print(d["id"], "seed", d["seed"], "frames", len(fr), "duration", d["duration"], "winner", d["winner"], d["reason"])
    print("track len %.3f halfWidth %.3f roadTiles %d attempt %d minSelfDist %.3f" % (
        tr["length"], tr["halfWidth"], tr["audit"]["roadTiles"], tr["audit"]["attempt"], tr["audit"]["minSelfDistance"]))
    names=[c["name"] for c in fr[0]["cars"]]
    print("cars:", names)
    ev=d["events"]
    # per-car events
    for idx,name in enumerate(names):
        print("-"*70); print("CAR", idx, name)
        # summary from last frame
        last=None
        for f in fr:
            c=f["cars"][idx]
            if c["finished"]: last=c; break
        if last is None: last=fr[-1]["cars"][idx]
        print(" final: lap %s nextCp %s prog %.2f finished %s finishTime %s bestLap %s boosts %d driftTime %.2f coll %d offRoad %s" % (
            last["lap"], last["nextCp"], last["progress"], last["finished"], last["finishTime"], last["bestLap"], last["boosts"], last["driftTime"], last["collisions"], last["offRoad"]))
        # use final frame state
        fc=fr[-1]["cars"][idx]
        print(" at last frame: lap %s cp %s prog %.2f speed %.2f boosts %d driftTime %.2f" % (
            fc["lap"], fc["nextCp"], fc["progress"], fc["speed"], fc["boosts"], fc["driftTime"]))
        # lap events
        lev=[e for e in ev if e["type"]=="lap" and e.get("team")==idx]
        print(" laps:", [(e["lap"], e["time"], e["t"]) for e in lev])
        # offroad frames
        off=[f for f in fr if f["cars"][idx]["offRoad"]]
        print(" offroad frames: %d (%.2fs)" % (len(off), len(off)/20))
        if off:
            runs=[]; cur=None
            for f in fr:
                if f["cars"][idx]["offRoad"]:
                    if cur is None: cur=[f["frame"],f["frame"]]
                    else: cur[1]=f["frame"]
                else:
                    if cur: runs.append(tuple(cur)); cur=None
            if cur: runs.append(tuple(cur))
            print(" offroad runs(frame):", runs[:20])
        # boost frames
        bf=[f for f in fr if f["cars"][idx]["boosting"]]
        print(" boosting frames: %d (%.2fs)" % (len(bf), len(bf)/20))
        dfr=[f for f in fr if f["cars"][idx]["drifting"]]
        print(" drifting frames: %d (%.2fs)" % (len(dfr), len(dfr)/20))
        # speed stats
        sp=[f["cars"][idx]["speed"] for f in fr if f["frame"]>=30]
        if sp:
            print(" speed: mean %.2f max %.2f min %.2f" % (sum(sp)/len(sp), max(sp), min(sp)))
        # checkpoint crossing times
        segs=[]; prev=fr[30]["cars"][idx]; t0=None
        cross=[]
        lastkey=(prev["lap"], prev["nextCp"])
        for f in fr[31:]:
            c=f["cars"][idx]
            key=(c["lap"], c["nextCp"])
            if key!=lastkey:
                cross.append((f["frame"], round(f["frame"]/20-1.5,2), c["lap"], c["nextCp"], round(c["progress"],1)))
                lastkey=key
        print(" cp crossings:", cross)
    # gap timeline at each 20 frames
    print("-"*70); print("gap timeline (race t, prog0, prog1, gap0-1, speed0, speed1)")
    for f in fr[30::20]:
        c0,c1=f["cars"][0],f["cars"][1]
        print("t=%6.2f prog %7.1f %7.1f gap %7.1f spd %5.1f %5.1f lap %d/%d" % (
            f["frame"]/20-1.5,c0["progress"],c1["progress"],c0["progress"]-c1["progress"],c0["speed"],c1["speed"],c0["lap"],c1["lap"]))
    return d

if __name__=="__main__":
    for p in sys.argv[1:]:
        analyze(p)
