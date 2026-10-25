import gzip
import json
import sys

paths = sys.argv[1:]
tot = {"D": 0, "S": 0, "Dserve": 0, "Dhold": 0, "Sserve": 0, "Shold": 0,
       "Dfirstloss": 0, "Sfirstloss": 0, "D1rally": 0, "S1rally": 0,
       "hitsD": 0, "hitsS": 0, "smashD": 0, "smashS": 0}
for p in paths:
    with gzip.open(p, "rt", encoding="utf-8") as f:
        d = json.load(f)
    seats = d["seats"]
    D = seats.index("deepseek-flash")
    fr = d["frames"]
    serves = [e for e in d["events"] if e["type"] == "serve"]
    points = [e for e in d["events"] if e["type"] == "point"]
    print("==", d["id"], "net", d["court"]["netHeight"], "Dteam", D,
          "score(D-S)", d["final"]["score"][D], d["final"]["score"][1 - D])
    streak = {"D": 0, "S": 0}
    maxstreak = {"D": 0, "S": 0}
    lastwin = None
    for i, (s, pt) in enumerate(zip(serves, points)):
        winner = "D" if pt["team"] == D else "S"
        server = "D" if s["team"] == D else "S"
        tot[winner] += 1
        tot[server + "serve"] += 1
        if winner == server:
            tot[server + "hold"] += 1
        if server == "D" and winner == "S" and pt["rally"] == 1:
            tot["Dfirstloss"] += 1
        if server == "S" and winner == "D" and pt["rally"] == 1:
            tot["Sfirstloss"] += 1
        if winner == "D" and pt["rally"] == 1:
            tot["D1rally"] += 1
        if winner == "S" and pt["rally"] == 1:
            tot["S1rally"] += 1
        if winner == lastwin:
            streak[winner] += 1
        else:
            streak = {"D": 0, "S": 0}
            streak[winner] = 1
            lastwin = winner
        maxstreak[winner] = max(maxstreak[winner], streak[winner])
        print(f"P{i+1:02d} {pt['score'][D]}:{pt['score'][1-D]} srv={server} win={winner} "
              f"rally={pt['rally']} reason={pt['reason']}")
    b = fr[-1]["batsmen"]
    print("hits D/S", b[D]["hits"], b[1 - D]["hits"], "smashes", b[D]["smashes"], b[1 - D]["smashes"],
          "end stamina", round(b[D]["stamina"], 1), round(b[1 - D]["stamina"], 1),
          "max streak", maxstreak)
    tot["hitsD"] += b[D]["hits"]
    tot["hitsS"] += b[1 - D]["hits"]
    tot["smashD"] += b[D]["smashes"]
    tot["smashS"] += b[1 - D]["smashes"]
print("== TOTAL", tot)
print("D points", tot["D"], "S points", tot["S"])
print("D serve", tot["Dserve"], "hold", tot["Dhold"], "first-return loss", tot["Dfirstloss"])
print("S serve", tot["Sserve"], "hold", tot["Shold"], "first-return loss", tot["Sfirstloss"])
print("D 1-rally wins", tot["D1rally"], "S 1-rally wins", tot["S1rally"])
print("hits", tot["hitsD"], tot["hitsS"], "smashes", tot["smashD"], tot["smashS"])
