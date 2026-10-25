"""Can we bait the 34 m/s deep-corner smash and intercept it?

Standing at x > 3.05 at the opponent's contact makes their target the deep
corner (x=1.0).  solveSpeed saturates and the ball actually lands ~2.7, so a
player already there might return it.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import engine_py as E
import planner as P
from planner import (clamp, shot_from_contact, simulate_shot, sim_player,
                     reach_of, racket_offsets)
from brain_py import shot_frames


def make_pred(cx, cy, facing, opp_x, fwd, nframes=20):
    sh = shot_from_contact(cx, cy, 1, facing, opp_x, forward=fwd)
    sf = shot_frames(cx, cy, sh, facing, nframes)
    return sh, sf


def try_retreat(x0, vx0, stamina, pred, team=0, n=10):
    me = E.make_player(team, "me")
    me.update({"x": x0, "y": 0.0, "vx": vx0, "vy": 0.0, "onGround": True,
               "facing": 1 if team == 0 else -1, "stamina": float(stamina)})
    best = None
    facing = me["facing"]
    for swtype in (1, -1):
        for idx in range(n):
            inputs = []
            cur = dict(me)
            for i in range(n):
                sprint = cur["onGround"] and cur["stamina"] > 5.0
                inp = {"move": -float(facing), "sprint": sprint}
                if i == idx:
                    inp["swing"] = swtype
                inputs.append(inp)
                q = dict(cur)
                q["held"] = inp
                E.Match.update_player(P.DummyMatch(), q)
                cur = q
            traj = sim_player(me, inputs, n)
            for f in range(1, n + 1):
                p = traj[f]
                if not (p["swing"] > 0 and 2 <= p["swingElapsed"] < 7):
                    continue
                rx, ry = E.Match.racket_at(p, p["swingElapsed"], p["swingType"])
                for (bx, by, alive) in (pred[f] if f < len(pred) else []):
                    if not alive:
                        continue
                    d = ((bx - rx) ** 2 + (by - ry) ** 2) ** 0.5
                    if d <= reach_of(p["stamina"]):
                        cand = (f, idx, swtype, round(p["x"], 2), round(p["stamina"], 1),
                                round(bx, 2), round(by, 2), round(d, 2))
                        if best is None or f < best[0]:
                            best = cand
    return best


if __name__ == "__main__":
    cx, cy = 7.63, 2.17
    for fwd in (0.0, 0.5, 1.0):
        sh, sf = make_pred(cx, cy, -1, 3.4, fwd)
        lx = [s[0][1] for s in sf if s][-1]
        print("fwd=%.1f kind=%s angle=%.3f speed=%.2f end=(%.2f,%.2f)" % (
            fwd, sh["kind"], sh["angle"], sh["speed"], sf[-1][-1][0], sf[-1][-1][1]))
        # ball trajectory frames
        for f in range(0, 10):
            print("   f%d %s" % (f, [(round(x, 2), round(y, 2)) for x, y, a in sf[f]]))
        for x0 in (3.1, 3.2, 3.3, 3.4, 3.6):
            for vx0 in (-5.37, -4.0, -3.0, 0.0):
                r = try_retreat(x0, vx0, 100, sf)
                print("  x0=%.2f v0=%.2f -> %s" % (x0, vx0, r))
        print()
