import gzip
import json
import subprocess
import sys

ws = r"D:\extraProj\AIBattle\badminton\arena\control\run-20261023-214733\workspaces\deepseek-flash"
path = sys.argv[1]
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 40
with gzip.open(path, "rt", encoding="utf-8") as f:
    d = json.load(f)
team = d["seats"].index("deepseek-flash")
proc = subprocess.Popen([sys.executable, "-I", "agent.py"], cwd=ws,
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE, text=True, bufsize=1)
for fr in range(0, min(limit, len(d["frames"])), 10):
    obs = dict(d["frames"][fr])
    obs["yourPlayer"] = team
    proc.stdin.write(json.dumps(obs) + "\n")
    proc.stdin.flush()
    line = proc.stdout.readline()
    try:
        act = json.loads(line)
        seq = act.get("inputs", act)
        if isinstance(seq, list) and seq and isinstance(seq[0], list):
            seq = [x[0] if isinstance(x, list) and x else x for x in seq]
        swings = [(i, a.get("swing")) for i, a in enumerate(seq) if a.get("swing")]
        print(f"window {fr}-{fr+9} swings={swings} first={seq[0]}")
    except Exception as e:
        print("bad output", fr, repr(line)[:200], e)
proc.stdin.close()
proc.wait(timeout=5)
err = proc.stderr.read()
print("stderr:", err[:2000])
