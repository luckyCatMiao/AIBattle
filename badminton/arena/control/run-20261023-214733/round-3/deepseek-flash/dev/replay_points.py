import gzip
import json
import os
import sys

PATH = sys.argv[1]
with gzip.open(PATH, "rt", encoding="utf-8") as f:
    d = json.load(f)
frames = d["frames"]
seats = d["seats"]
names = d["names"]
team_name = {i: names[i] for i in range(2)}
me = seats.index("deepseek-flash") if "deepseek-flash" in seats else None
print("game", d["id"], "seed", d["seed"], "net", d["court"]["netHeight"], "seats", seats, "names", names, "me_team", me)
print("score", d["final"]["score"], "winner_team", d["winner"], "frames", len(frames))

# serve events and point events
serves = [e for e in d["events"] if e["type"] == "serve"]
points = [e for e in d["events"] if e["type"] == "point"]
assert len(serves) == len(points)
print("points", len(points), "holds", sum(1 for s, p in zip(serves, points) if s["team"] == p["team"]),
      "breaks", sum(1 for s, p in zip(serves, points) if s["team"] != p["team"]))

def counts_at(fr):
    b = frames[fr]["batsmen"]
    return [(b[0]["hits"], b[0]["smashes"]), (b[1]["hits"], b[1]["smashes"])]

prev_point_frame = 0
for i, (s, p) in enumerate(zip(serves, points)):
    sf, pf = s["frame"], p["frame"]
    c0 = counts_at(max(0, sf - 1))
    c1 = counts_at(pf)
    dh = [c1[t][0] - c0[t][0] for t in range(2)]
    ds = [c1[t][1] - c0[t][1] for t in range(2)]
    st0 = frames[max(0, sf - 1)]["batsmen"]
    st1 = frames[pf]["batsmen"]
    stam = [(round(st1[t]["stamina"] - st0[t]["stamina"], 1), round(st1[t]["stamina"], 1)) for t in range(2)]
    server = s["team"]
    recv = 1 - server
    scorer = p["team"]
    won_by = "hold" if scorer == server else "break"
    mywin = "W" if scorer == me else "L"
    print(f"P{i+1:02d} {p['score'][0]}:{p['score'][1]} srv={team_name[server][:6]}({server}) rcv={team_name[recv][:6]} win={team_name[scorer][:6]}({scorer}) {mywin} {won_by} rally={p['rally']} reason={p['reason']} x={p['x']} dur={(pf-sf)*0.05:.1f}s hits={dh[me]} smash={ds[me]} opp_hits={dh[1-me]} opp_smash={ds[1-me]} stam={stam[me]}/{stam[1-me]}")
