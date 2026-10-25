"""Simple baseline bots used for offline testing (not part of the submission)."""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import engine_py as E


def other(team):
    return 1 - team


def predict_shuttle_positions(shuttle, n_frames, net=True):
    """Forward-simulate the shuttle exactly as the engine does, without hits.

    Returns a list of (frame, x, y, vx, vy, alive) sampled after each substep,
    plus a frame-level index. frames are relative: index i = after i frames.
    """
    x, y = shuttle["x"], shuttle["y"]
    vx, vy = shuttle["vx"], shuttle["vy"]
    alive = shuttle["alive"]
    out = [(0, x, y, vx, vy, alive)]
    netx = E.RULES["netX"]
    for f in range(1, n_frames + 1):
        for _ in range(E.RULES["substeps"]):
            if not alive:
                break
            sp = math.hypot(vx, vy)
            drag = E.RULES["shuttleDrag"] * sp
            vx -= vx * drag * E.SUB
            vy -= vy * drag * E.SUB
            vy -= E.RULES["gravity"] * E.SUB
            px, py = x, y
            nx = x + vx * E.SUB
            ny = y + vy * E.SUB
            if ny > E.RULES["ceiling"]:
                ny = E.RULES["ceiling"]
                vy = -abs(vy) * 0.25
            crossed = (px - netx) * (nx - netx) < 0
            if crossed:
                y_at_net = min(py, ny)
                if y_at_net < E.RULES["netHeight"] + E.RULES["shuttleRadius"]:
                    x = netx - E.sign(vx) * (E.RULES["netThickness"] + E.RULES["shuttleRadius"])
                    vx *= -0.08
                    vy *= 0.2
                    out.append((f, x, y, vx, vy, alive))
                    # net-hit: ball will now drop almost straight down
                    alive = True
                    # continue simulating the drop
                    continue
            x, y = nx, ny
            if x < -0.15 or x > E.RULES["courtLength"] + 0.15:
                alive = False
            elif y <= E.RULES["shuttleRadius"]:
                y = E.RULES["shuttleRadius"]
                alive = False
            out.append((f, x, y, vx, vy, alive))
        if not alive:
            break
    return out


class Tracker:
    """Moves toward the ball's x and swings when it is close."""

    def __init__(self, swing_type=1, swing_period=10, lead=0.05):
        self.swing_type = swing_type
        self.swing_period = swing_period
        self.lead = lead

    def act(self, obs):
        team = obs["yourPlayer"]
        me = obs["batsmen"][team]
        ball = obs["shuttle"]
        frames = []
        for i in range(10):
            move = 0.0
            swing = 0
            jump = False
            if obs["phase"] in ("serve", "rally") and ball and ball["alive"]:
                if ball["lastTeam"] != team:
                    d = ball["x"] - me["x"]
                    if abs(d) > 0.12:
                        move = max(-1.0, min(1.0, d * 3.0))
                    if abs(d) < 0.8 and ball["y"] < 2.3 and ball["y"] > 0.3:
                        if (obs["frame"] + i) % self.swing_period == 0:
                            swing = self.swing_type
            frames.append({"move": move, "swing": swing, "jump": jump})
        return frames


class Wild(Tracker):
    def act(self, obs):
        team = obs["yourPlayer"]
        me = obs["batsmen"][team]
        ball = obs["shuttle"]
        frames = []
        for i in range(10):
            t = obs["frame"] + i
            move = 0.0
            swing = 0
            if ball and ball["alive"]:
                d = ball["x"] - me["x"]
                move = max(-1.0, min(1.0, d * 2.0))
                if (t % 7) == 0:
                    swing = 1 if (t // 7) % 4 else -1
            frames.append({"move": move, "swing": swing,
                           "charge": (t % 97) < 3, "sprint": (t % 89) < 4,
                           "jump": (t % 61) == 0})
        return frames


class Idle:
    def act(self, obs):
        return [{"move": 0} for _ in range(10)]
