import json, sys
rep_path, win_path = sys.argv[1], sys.argv[2]
frames_arg = [int(x) for x in sys.argv[3:]]
with open(rep_path, "r", encoding="utf-8") as f:
    rep = json.load(f)
with open(win_path, "r", encoding="utf-8") as f:
    wins = json.load(f)
seat = rep["seats"].index("deepseek-flash")
# find snapshot at or before each requested frame
snaps = rep["frames"]
for target in frames_arg:
    idx = max(i for i, s in enumerate(snaps) if s["frame"] <= target)
    s = snaps[idx]
    w = wins[min(idx, len(wins)-1)]
    print(f"--- target f{target} snapshot f{s['frame']} round {s['round']} roundFrame {s['roundFrame']}")
    for f_ in s["fighters"]:
        print(f"  {f_['char']} owner={f_['owner']} x={f_['x']:.1f} y={f_['y']} facing={f_['facing']} state={f_['state']} hp={f_['hp']} meter={f_['meter']} guard={f_['guard']} move={f_.get('move')}")
    print(f"  our note={w.get('note')} dx={w.get('dx')} inputs={w.get('inputs')}")
    for p in s.get("projectiles") or []:
        print("  proj", p)
