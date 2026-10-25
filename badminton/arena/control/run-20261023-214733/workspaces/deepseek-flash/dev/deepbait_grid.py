"""Deep-bait robustness: for a grid of opponent contact points, can a
stationary player at x_b return the deep-corner smash with a pre-timed swing?"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import engine_py as E
import planner as P
from planner import shot_from_contact, sim_player, reach_of
from brain_py import shot_frames


def check(cx, cy, x_b, stamina=100, idx_off=-2, n=10):
    sh = shot_from_contact(cx, cy, 1, -1, x_b, forward=0.0)
    sf = shot_frames(cx, cy, sh, -1, n)
    me = E.make_player(0, "me")
    me.update({"x": x_b, "y": 0.0, "vx": 0.0, "vy": 0.0, "onGround": True,
               "facing": 1, "stamina": float(stamina)})
    idx = max(0, idx_off)  # swing start relative to contact frame (which is frame 0 here)
    inputs = []
    for i in range(n):
        inp = {"move": 0.0, "sprint": False}
        if i == idx:
            inp["swing"] = -1
        inputs.append(inp)
    traj = sim_player(me, inputs, n)
    hit = None
    for f in range(1, n + 1):
        p = traj[f]
        if not (p["swing"] > 0 and 2 <= p["swingElapsed"] < 7):
            continue
        rx, ry = E.Match.racket_at(p, p["swingElapsed"], p["swingType"])
        for (bx, by, alive) in (sf[f] if f < len(sf) else []):
            if not alive:
                continue
            d = ((bx - rx) ** 2 + (by - ry) ** 2) ** 0.5
            if d <= reach_of(p["stamina"]):
                hit = (f, round(rx, 2), round(ry, 2), round(bx, 2), round(by, 2), round(d, 2))
                break
        if hit:
            break
    return sh, sf, hit


if __name__ == "__main__":
    for cy in (2.10, 2.18, 2.26):
        for cx in (7.30, 7.50, 7.70, 7.90):
            print("contact (%.2f,%.2f)" % (cx, cy))
            for x_b in (3.10, 3.25, 3.40, 3.55):
                sh, sf, hit = check(cx, cy, x_b)
                land = sf[-1][-1][0] if sf[-1] else None
                print("   x_b=%.2f kind=%-5s spd=%.1f land=%.2f hit=%s" % (
                    x_b, sh["kind"], sh["speed"], land if land is not None else -1, hit))
        print()
    print("=== timing tolerance (contact 7.63,2.17; x_b=3.4) ===")
    for off in range(-5, 4):
        sh, sf, hit = check(7.63, 2.17, 3.40, idx_off=off)
        print("idx_offset=%d hit=%s" % (off, hit))
    print("=== stamina sensitivity ===")
    for st in (100, 60, 40, 25, 10):
        sh, sf, hit = check(7.63, 2.17, 3.40, stamina=st)
        print("stamina=%d hit=%s" % (st, hit))
