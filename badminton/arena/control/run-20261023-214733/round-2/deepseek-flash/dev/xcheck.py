"""Generate a fixed input sequence, run it through the Python engine and compare
with the JS reference output produced by dev/xcheck.js."""
import io
import json
import os
import random
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import engine_py as E

WINDOWS = 160


def gen_inputs():
    rng = random.Random(12345)
    windows = []
    for w in range(WINDOWS):
        win = []
        for team in (0, 1):
            frames = []
            for i in range(10):
                t = w * 10 + i
                # deterministic scripted behaviour with randomness: chase the net,
                # swing often, jump occasionally; charge/sprint sparingly.
                move = 0.0
                if (t // 40) % 3 == 0:
                    move = 1.0 if team == 0 else -1.0
                elif (t // 40) % 3 == 1:
                    move = -0.6 if team == 0 else 0.6
                else:
                    move = rng.choice([-1.0, -0.5, 0.0, 0.5, 1.0])
                frame = {
                    "move": move,
                    "jump": (t % 37 == 0) or rng.random() < 0.02,
                    "swing": 1 if (t % 9 < 2 and rng.random() < 0.6) else 0,
                    "charge": rng.random() < 0.03,
                    "sprint": rng.random() < 0.03,
                }
                frames.append([frame])
            win.append(frames)
        windows.append(win)
    return {"seed": 7001, "windows": windows}


def main():
    spec = gen_inputs()
    with io.open(os.path.join(HERE, "inputs.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f)
    subprocess.run(["node", os.path.join(HERE, "xcheck.js")], check=True)
    with io.open(os.path.join(HERE, "ref_out.json"), encoding="utf-8") as f:
        ref = json.load(f)["snapshots"]

    g = E.Match(seed=spec["seed"], match_id="xcheck")
    snaps = []
    for win in spec["windows"]:
        if g.status != "playing":
            break
        w0 = [E.normalize_frame(f) for f in win[0]]
        w1 = [E.normalize_frame(f) for f in win[1]]
        E.advance_window(g, [w0, w1])
        snaps.append(g.view(0))

    print("ref", len(ref), "py", len(snaps))
    n = min(len(ref), len(snaps))
    bad = 0
    for i in range(n):
        a, b = ref[i], snaps[i]
        for key in ("frame", "phase", "score", "server", "serveTimer" if False else "serveLeft",
                    "pointLeft", "rally", "longestRally", "timeLeft", "status", "winner"):
            if a.get(key) != b.get(key):
                print("win", i, "key", key, "js", a.get(key), "py", b.get(key))
                bad += 1
        for j in range(2):
            pa, pb = a["batsmen"][j], b["batsmen"][j]
            for key in ("x", "y", "vx", "vy", "onGround", "swing", "swingElapsed",
                        "swingType", "swingCd", "stamina", "charge", "hits", "smashes"):
                if pa.get(key) != pb.get(key):
                    print("win", i, "p", j, key, "js", pa.get(key), "py", pb.get(key))
                    bad += 1
                    if bad > 40:
                        return
        sa, sb = a["shuttle"], b["shuttle"]
        for key in ("x", "y", "vx", "vy", "alive", "lastTeam"):
            if sa.get(key) != sb.get(key):
                print("win", i, "shuttle", key, "js", sa.get(key), "py", sb.get(key))
                bad += 1
                if bad > 40:
                    return
    print("mismatches:", bad)


if __name__ == "__main__":
    main()
