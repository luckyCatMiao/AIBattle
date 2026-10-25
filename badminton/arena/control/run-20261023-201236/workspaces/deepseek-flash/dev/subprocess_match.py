"""Run a full match with two real `python agent.py` subprocesses."""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import engine_py as E


class ProcAgent:
    def __init__(self, script, cwd):
        self.p = subprocess.Popen([sys.executable, script], cwd=cwd,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True,
                                  encoding="utf-8", bufsize=1)
        self.max_dt = 0.0
        self.total = 0.0
        self.n = 0

    def act(self, obs):
        line = json.dumps(obs, ensure_ascii=False)
        t0 = time.time()
        self.p.stdin.write(line + "\n")
        self.p.stdin.flush()
        out = self.p.stdout.readline()
        dt = time.time() - t0
        self.max_dt = max(self.max_dt, dt)
        self.total += dt
        self.n += 1
        if not out:
            raise RuntimeError("agent died")
        return json.loads(out)

    def close(self):
        try:
            self.p.stdin.close()
            self.p.wait(timeout=5)
        except Exception:
            self.p.kill()


def run(script, seed=7001, max_windows=3000):
    g = E.Match(seed=seed, match_id="subproc")
    a0 = ProcAgent(script, ROOT)
    a1 = ProcAgent(script, ROOT)
    w = 0
    while g.status == "playing" and w < max_windows:
        o0 = g.view(0)
        o1 = g.view(1)
        r0 = a0.act(o0)["inputs"]
        r1 = a1.act(o1)["inputs"]
        if len(r0) != 10 or len(r1) != 10:
            raise RuntimeError("bad window length")
        E.advance_window(g, [r0, r1])
        w += 1
    a0.close()
    a1.close()
    return g, a0, a1


if __name__ == "__main__":
    script = os.path.join(ROOT, "agent.py")
    t0 = time.time()
    g, a0, a1 = run(script)
    print("score", g.score, "winner", g.winner, "frames", g.frame, "wall %.1fs" % (time.time() - t0))
    print("agent0 max %.3fs avg %.3fs | agent1 max %.3fs avg %.3fs" % (
        a0.max_dt, a0.total / max(1, a0.n), a1.max_dt, a1.total / max(1, a1.n)))
    err0 = a0.p.stderr.read() if a0.p.stderr else ""
    if err0.strip():
        print("stderr agent0:", err0[:2000])
