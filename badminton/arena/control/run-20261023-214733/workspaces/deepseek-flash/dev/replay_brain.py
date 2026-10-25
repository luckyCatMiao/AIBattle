import gzip
import json
import os
import sys

WS = r"D:\extraProj\AIBattle\badminton\arena\control\run-20261023-214733\workspaces\deepseek-flash"
sys.path.insert(0, WS)

import brain_py as B

path = sys.argv[1]
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 60
with gzip.open(path, "rt", encoding="utf-8") as f:
    d = json.load(f)
team = d["seats"].index("deepseek-flash")
brain = B.Brain()
for fr in range(0, min(limit, len(d["frames"])), 10):
    obs = dict(d["frames"][fr])
    obs["yourPlayer"] = team
    act = brain.act(obs)
    swings = [(i, a.get("swing")) for i, a in enumerate(act) if a.get("swing")]
    moves = [round(a.get("move", 0), 2) for a in act]
    print(f"window {fr}-{fr+9} team={team} phase={obs.get('phase')} score={obs.get('score')} swings={swings} move={moves}")
