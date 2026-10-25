import json, sys, subprocess, os, copy

rep_path, out_path = sys.argv[1], sys.argv[2]
agent_path = r"D:\extraProj\AIBattle\fighting\arena\control\run-20261024-105202\workspaces\deepseek-flash\agent.py"
with open(rep_path, "r", encoding="utf-8") as f:
    rep = json.load(f)

seat = rep["seats"].index("deepseek-flash")
print("our seat", seat)
env = dict(os.environ)
env["PYTHONIOENCODING"] = "utf-8"
p = subprocess.Popen([sys.executable, "-I", agent_path], stdin=subprocess.PIPE,
                     stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                     text=True, encoding="utf-8", bufsize=1, env=env, cwd=os.path.dirname(agent_path))

rows = []
mismatch = 0
parse_err = 0
for i, w in enumerate(rep["windows"]):
    snap = copy.deepcopy(rep["frames"][i])
    snap["yourPlayer"] = seat
    snap.pop("catalog", None)
    p.stdin.write(json.dumps(snap, ensure_ascii=False) + "\n")
    p.stdin.flush()
    line = p.stdout.readline()
    if not line:
        print("agent died at window", i, p.stderr.read())
        break
    try:
        out = json.loads(line)
    except Exception as e:
        parse_err += 1
        out = {"inputs": [], "note": "PARSE_ERR:" + repr(e)}
    got = out.get("inputs") or []
    exp = w["inputs"][seat]
    same = got == exp
    if not same:
        mismatch += 1
    F = snap.get("fighters") or []
    me, op = (F[seat], F[1 - seat]) if len(F) > 1 else ({}, {})
    rows.append({
        "i": i, "window_frame": w.get("frame"), "round": snap.get("round"), "roundFrame": snap.get("roundFrame"),
        "sim_seconds": round(w.get("frame", 0) / 20.0, 2),
        "me_char": me.get("char"), "op_char": op.get("char"),
        "me_hp": me.get("hp"), "op_hp": op.get("hp"),
        "me_meter": me.get("meter"), "op_meter": op.get("meter"),
        "me_state": me.get("state"), "op_state": op.get("state"),
        "me_guard": me.get("guard"), "op_guard": op.get("guard"),
        "dx": round(abs(me.get("x", 0) - op.get("x", 0)), 1),
        "op_move": (op.get("move") or {}).get("name"),
        "note": out.get("note"),
        "same": same,
        "inputs": got,
    })

p.stdin.close()
p.wait(timeout=30)
err = p.stderr.read()
if err.strip():
    print("stderr:", err[:3000])
print("windows", len(rows), "mismatch", mismatch, "parse_err", parse_err)

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)

# aggregate notes per round
from collections import Counter
for rnd in sorted(set(r["round"] for r in rows if r["round"])):
    sub = [r for r in rows if r["round"] == rnd]
    print(f"\nround {rnd}: {len(sub)} windows")
    print(" notes:", dict(Counter(r["note"] for r in sub).most_common(20)))
    atk = sum(1 for r in sub if any(x.get("btn") for x in r["inputs"]))
    fwd = sum(1 for r in sub if sum(1 for x in r["inputs"] if x.get("dir") == "F") >= 8)
    guard = sum(1 for r in sub if sum(1 for x in r["inputs"] if x.get("dir") in ("B", "DB")) >= 8)
    print(f" windows with button press: {atk}; >=8 F frames: {fwd}; >=8 B/DB frames: {guard}")
    # hp delta
    print(f" hp start/end: {sub[0]['me_hp']}/{sub[-1]['me_hp']} vs {sub[0]['op_hp']}/{sub[-1]['op_hp']}")
