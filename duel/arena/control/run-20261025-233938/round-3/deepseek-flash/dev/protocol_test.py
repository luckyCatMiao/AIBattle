#!/usr/bin/env python3
"""Protocol / latency validation for agent.py.

Feeds the official example observation plus synthetic worst-case observations
through the documented stdin/stdout protocol and checks the response shape.
"""
import json
import os
import random
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable
DIRS = {"N", "U", "D", "L", "R", "UL", "UR", "DL", "DR"}


def check(resp):
    assert isinstance(resp, dict), "response must be an object"
    ins = resp.get("inputs")
    assert isinstance(ins, list), "inputs must be a list"
    assert len(ins) == 3, "exactly 3 frames required, got %d" % len(ins)
    for f in ins:
        assert isinstance(f, dict), "frame must be an object"
        assert f.get("dir", "N") in DIRS, "bad dir"
        aim = f.get("aim")
        assert aim is None or aim in DIRS, "bad aim"
        assert isinstance(f.get("fire", False), bool), "bad fire"


def ask(proc, obs):
    t0 = time.time()
    proc.stdin.write(json.dumps(obs) + "\n")
    proc.stdin.flush()
    line = proc.stdout.readline()
    dt = time.time() - t0
    if not line:
        raise RuntimeError("no response")
    return json.loads(line), dt


def main():
    with open(os.path.join(ROOT, "example.json"), encoding="utf-8") as fh:
        ex = json.load(fh)
    proc = subprocess.Popen([PY, "agent.py"], cwd=ROOT, stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                            encoding="utf-8")
    try:
        resp, dt = ask(proc, ex)
        check(resp)
        print("example observation: ok, %.1f ms -> %s" % (dt * 1000, resp["inputs"]))

        rng = random.Random(7)
        base = dict(ex)
        for nbullets in (60, 150, 260):
            obs = json.loads(json.dumps(ex))
            obs["frame"] = 1200
            obs["now"] = 60.0
            obs["timeLeft"] = 60.0
            obs["players"][0]["x"], obs["players"][0]["y"] = 20.3, 15.2
            obs["players"][0]["cooldown"] = 0
            obs["players"][1]["x"], obs["players"][1]["y"] = 26.7, 9.4
            obs["players"][1]["cooldown"] = 7
            bullets = []
            for i in range(nbullets):
                d = rng.choice(["U", "D", "L", "R", "UL", "UR", "DL", "DR"])
                ux, uy = {"U": (0, -1), "D": (0, 1), "L": (-1, 0), "R": (1, 0),
                          "UL": (-0.7071, -0.7071), "UR": (0.7071, -0.7071),
                          "DL": (-0.7071, 0.7071), "DR": (0.7071, 0.7071)}[d]
                bullets.append({"id": "b%d" % i, "owner": i % 2,
                                "x": round(rng.uniform(1.5, 38.5), 3),
                                "y": round(rng.uniform(1.5, 28.5), 3),
                                "vx": round(ux * 8.5, 3), "vy": round(uy * 8.5, 3),
                                "speed": 8.5, "bounces": rng.randint(0, 9)})
            obs["bullets"] = bullets
            resp, dt = ask(proc, obs)
            check(resp)
            print("%3d bullets: ok, %.1f ms" % (nbullets, dt * 1000))

        obs = json.loads(json.dumps(ex))
        obs["status"] = "finished"
        obs["winner"] = 0
        resp, dt = ask(proc, obs)
        check(resp)
        assert all(f["dir"] == "N" and not f["fire"] for f in resp["inputs"]), "finished -> neutral"
        print("finished observation: ok, neutral output")

        # malformed observations must not crash the process
        for bad in ({"players": []}, {"players": [{"index": 0}], "yourPlayer": 0},
                    {"status": "playing", "yourPlayer": 0, "players": [
                        {"index": 0, "x": "x"}, {"index": 1, "x": 1}]}):
            resp, _ = ask(proc, bad)
            check(resp)
        print("malformed observations: ok, still responding")
        err = proc.stderr.read1(4096) if hasattr(proc.stderr, "read1") else b""
        print("stderr bytes:", len(err))
    finally:
        try:
            proc.stdin.close()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
    print("ALL PROTOCOL CHECKS PASSED")


if __name__ == "__main__":
    main()
