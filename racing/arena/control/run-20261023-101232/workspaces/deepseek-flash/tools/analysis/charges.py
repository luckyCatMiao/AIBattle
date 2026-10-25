import json,gzip,sys
for p in sys.argv[1:]:
    d=json.load(gzip.open(p,'rt',encoding='utf-8'))
    ev=d["events"]
    for team,name in ((0,"car0"),(1,"car1")):
        ch=[e for e in ev if e["type"]=="charge" and e.get("team")==team]
        dr=[e for e in ev if e["type"]=="drift" and e.get("team")==team]
        if ch:
            print(d["id"],name,"charges",len(ch),"sum %.3f"%sum(e["amount"] for e in ch),"min %.3f max %.3f"%(min(e["amount"] for e in ch),max(e["amount"] for e in ch)),"drift events",len(dr))
    # boosting frames and drift frames
    fr=d["frames"]
    for i in (0,1):
        b=sum(1 for f in fr if f["cars"][i]["boosting"])
        dr=sum(1 for f in fr if f["cars"][i]["drifting"])
        print("   car%d boost frames %d (%.2fs) drift frames %d (%.2fs)"%(i,b,b/20,dr,dr/20))
