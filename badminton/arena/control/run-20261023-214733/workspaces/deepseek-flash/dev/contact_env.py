"""Given the opponent's serve-return contact, can we reach it?

For several stamina levels, simulate a player starting at the run-up contact
pose (x, vx) and search every swing start/type for a verified contact against
the predicted return trajectory.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import engine_py as E
import planner as P
from planner import (clamp, shot_from_contact, simulate_shot, simulate_shot,
                     sim_player, player_state_from_obs, racket_offsets, reach_of)
from brain_py import Brain, shot_frames


def make_pred(cx, cy, facing, opp_x, fwd, nframes=30):
    sh = shot_from_contact(cx, cy, 1, facing, opp_x, forward=fwd)
    sf = shot_frames(cx, cy, sh, facing, nframes)
    return sh, sf


def try_contact(x0, vx0, stamina, pred, team=0, n=12):
    me = E.make_player(team, "me")
    me.update({"x": x0, "y": 0.0, "vx": vx0, "vy": 0.0, "onGround": True,
               "facing": 1 if team == 0 else -1, "stamina": float(stamina)})
    best = None
    for swtype in (1, -1):
        for idx in range(n):
            inputs = []
            cur = dict(me)
            for i in range(n):
                sprint = (i >= 0) and cur["onGround"] and cur["stamina"] > 5.0
                inp = {"move": float(me["facing"]), "sprint": sprint}
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
                                round(bx, 2), round(by, 2))
                        if best is None or f < best[0]:
                            best = cand
    return best


if __name__ == "__main__":
    cx, cy = 7.63, 2.17
    for fwd in (0.0, 0.5, 1.0):
        sh, sf = make_pred(cx, cy, -1, 2.85, fwd)
        print("fwd=%.1f kind=%s angle=%.3f speed=%.2f" % (fwd, sh["kind"], sh["angle"], sh["speed"]))
        for vx0 in (5.37, 4.8, 4.3, 3.8, 3.2, 2.5, 0.0):
            for stam in (100, 70, 50, 30, 15):
                r = try_contact(2.85, vx0, stam, sf)
                print("  v0=%.2f stam=%3d -> %s" % (vx0, stam, r))
        print()
