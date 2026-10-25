"""Measure the serve-defence block rate against scripted receivers."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import engine_py as E
from brain_py import Brain


def run(s_swing, rx=7.85, jump_at=None, rx_swing_frames=10):
    g = E.Match(seed=1)
    brain = Brain()
    while g.status == "playing" and g.frame < 120:
        o0 = g.view(0)
        w0 = [E.normalize_frame(f)[0] for f in brain.act(o0)]
        frames = []
        p1 = g.batsmen[1]
        for i in range(10):
            fr = g.frame + i
            dx = rx - p1["x"]
            ms = 3.7 * (0.62 + 0.38 * p1["stamina"] / 100)
            inp = {"move": max(-1, min(1, dx * 10 / ms))}
            if fr == s_swing:
                inp["swing"] = 1
            if jump_at is not None and fr == jump_at:
                inp["jump"] = True
            frames.append(inp)
        E.advance_window(g, [[[x] for x in w0], [[x] for x in frames]])
        if g.lastPoint:
            return g
    return g


if __name__ == "__main__":
    print("scan ground smash timing (receiver x=7.85)")
    for s in range(18, 40):
        g = run(s)
        lp = g.lastPoint
        print("swing@%2d -> winner=%s x=%s rally=%s  p0hits=%d p1hits=%d" % (
            s, lp["winner"] if lp else None, lp["x"] if lp else None,
            lp["rally"] if lp else None, g.batsmen[0]["hits"], g.batsmen[1]["hits"]))
    print()
    print("scan jump smash timing")
    for s in range(14, 36):
        for jf in (s - 3, s - 2, s - 4):
            g = run(s, jump_at=jf)
            lp = g.lastPoint
            print("swing@%2d jump@%2d -> winner=%s x=%s p0hits=%d p1hits=%d" % (
                s, jf, lp["winner"] if lp else None, lp["x"] if lp else None,
                g.batsmen[0]["hits"], g.batsmen[1]["hits"]))
