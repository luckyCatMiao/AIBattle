"""Where does stamina go? Count sprint frames and swing costs by phase."""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import engine_py as E
from brain_py import Brain


class Recorder:
    def __init__(self, inner):
        self.inner = inner

    def act(self, obs):
        return self.inner.act(obs)


def run(seed=1, new=True):
    a0, a1 = Brain(), Brain()
    g = E.Match(seed=seed)
    stats = [{"sprint": {}, "swing": 0, "min": 100.0, "sprint_frames": 0} for _ in range(2)]
    prev_swing = [0, 0]
    w = 0
    while g.status == "playing" and w < 4000:
        o0, o1 = g.view(0), g.view(1)
        w0 = [E.normalize_frame(f)[0] for f in a0.act(o0)]
        w1 = [E.normalize_frame(f)[0] for f in a1.act(o1)]
        for fi in range(E.RULES["decisionFrames"]):
            if g.status != "playing":
                break
            g.batsmen[0]["held"] = w0[fi]
            g.batsmen[1]["held"] = w1[fi]
            g.step()
            for i in range(2):
                p = g.batsmen[i]
                st = stats[i]
                st["min"] = min(st["min"], p["stamina"])
                if p["sprinting"]:
                    st["sprint_frames"] += 1
                    ph = g.phase if g.phase != "point" else "point"
                    if ph == "rally":
                        ph = "rally0" if g.rally == 0 else "rallyN"
                    st["sprint"][ph] = st["sprint"].get(ph, 0) + 1
                if prev_swing[i] == 0 and p["swing"] > 0:
                    st["swing"] += 1
                prev_swing[i] = p["swing"]
        w += 1
    return g, stats


if __name__ == "__main__":
    g, stats = run()
    print("score", g.score, "frames", g.frame)
    for i, st in enumerate(stats):
        print("p%d sprint_frames=%d by_phase=%s swings=%d min_stamina=%.1f end=%.1f" % (
            i, st["sprint_frames"], st["sprint"], st["swing"], st["min"],
            g.batsmen[i]["stamina"]))
