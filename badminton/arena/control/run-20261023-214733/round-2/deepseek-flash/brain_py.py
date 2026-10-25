"""Agent brain (development version). Bundled into agent.py for submission."""
import math
import os
import sys

import engine_py as E
import planner as P
from planner import (clamp, racket_offsets, reach_of, max_speed_of, predict_shuttle,
                     predict_serve, player_state_from_obs, sim_player, servo_inputs,
                     plan_control, shot_from_contact, simulate_shot, opponent_can_reach,
                     shuttle_step, DummyMatch)

R = E.RULES
DT = E.DT
SUB = E.SUB

KIND_BASE = {"smash": 100.0, "drop": 62.0, "clear": 38.0, "lift": 22.0}

DEBUG = bool(os.environ.get("BAD_DEBUG"))


def log(*a):
    if DEBUG:
        print(*a, file=sys.stderr)


def neutral_window():
    return [E.neutral() for _ in range(10)]


def opp_x_at(opp, t):
    x = opp["x"] + opp["vx"] * t * DT
    if opp["team"] == 0:
        return clamp(x, 0.35, R["netX"] - 0.35)
    return clamp(x, R["netX"] + 0.35, R["courtLength"] - 0.35)


def in_window(p):
    return (p["swing"] > 0 and p["swingElapsed"] >= R["swingWindup"]
            and p["swingElapsed"] < R["swingWindup"] + R["swingActive"])


def shot_frames(sx, sy, shot, facing, nframes):
    """Substep samples per frame of a struck shuttle (index 0 = contact frame)."""
    st = {"x": sx, "y": sy,
          "vx": facing * shot["speed"] * math.cos(shot["angle"]),
          "vy": shot["speed"] * math.sin(shot["angle"]),
          "alive": True}
    out = [[(sx, sy, True)]]
    for f in range(1, nframes + 1):
        samples = []
        for _ in range(R["substeps"]):
            if not st["alive"]:
                samples.append((st["x"], st["y"], False))
                continue
            res = shuttle_step(st, SUB)
            samples.append((st["x"], st["y"], st["alive"]))
            if res in ("land", "out"):
                break
        out.append(samples)
        if not st["alive"]:
            for _ in range(nframes - f):
                out.append([(st["x"], st["y"], False)])
            break
    while len(out) < nframes + 1:
        out.append([(st["x"], st["y"], False)])
    return out


def shot_frames_partial(sx, sy, shot, facing, rem_substeps, nframes):
    """Samples of a struck shuttle when the contact happened mid-frame.

    The engine calls tryHit() after each of the four physics substeps, so a
    hit on substep j leaves 3-j substeps of travel inside the contact frame.
    Treating the contact point as the frame boundary (rem=0) lags the real
    trajectory by up to one frame -- ~0.9 grid at smash speed, which is more
    than the 0.38 racket reach.  index 0 is the contact frame.

    rem_substeps may also be a float in [0,3] (fractional-phase estimate);
    the split is then rounded to substeps for the trajectory itself.
    """
    st = {"x": sx, "y": sy,
          "vx": facing * shot["speed"] * math.cos(shot["angle"]),
          "vy": shot["speed"] * math.sin(shot["angle"]),
          "alive": True}
    nrem = int(clamp(round(float(rem_substeps)), 0, R["substeps"] - 1))
    frame0 = [(sx, sy, True)]
    alive = True
    for _ in range(nrem):
        if not alive:
            break
        res = shuttle_step(st, SUB)
        frame0.append((st["x"], st["y"], st["alive"]))
        if res in ("land", "out"):
            alive = False
    out = [frame0]
    for f in range(1, nframes + 1):
        if not alive:
            out.append([(st["x"], st["y"], False)])
            continue
        samples = []
        for _ in range(R["substeps"]):
            if not st["alive"]:
                samples.append((st["x"], st["y"], False))
                continue
            res = shuttle_step(st, SUB)
            samples.append((st["x"], st["y"], st["alive"]))
            if res in ("land", "out"):
                alive = False
                break
        out.append(samples)
    return out


def contact_substep(frame_samples, cx, cy):
    """Index (0..3) of the substep inside a frame whose sample matches (cx,cy)."""
    best = None
    for j, (bx, by, alive) in enumerate(frame_samples):
        d = math.hypot(bx - cx, by - cy)
        if best is None or d < best[0]:
            best = (d, j)
    if best is None:
        return None
    return best[1] if best[0] < 0.25 else None


class Brain:
    def __init__(self, def_mode=None, smash_lover=False, no_sprint=False, nudge=False, learn=True, clear_lover=False):
        self.debug_hits = []
        self.def_mode = def_mode or os.environ.get("BAD_DEF", "mid")
        self.smash_lover = smash_lover
        self.clear_lover = clear_lover
        self.no_sprint = no_sprint
        self.nudge = nudge
        self.learn = learn
        self.runup = os.environ.get("BAD_RUNUP", "1") != "0"
        self.rally_sprint = os.environ.get("BAD_RALLY_SPRINT", "1") != "0"
        self.move_pen = float(os.environ.get("BAD_MOVE_PEN", "6"))
        # Net-clearance safety: the engine checks min(y_prev,y_next) per
        # substep, which for a fast descending smash is up to ~0.1 lower
        # than the interpolated crossing used by shot_trace().
        self.net_margin = float(os.environ.get("BAD_NET_MARGIN", "0.10"))
        self.deadbait = os.environ.get("BAD_BAIT", "1") != "0"
        self.bait_hold_until = -1
        self.seen_event = 0
        self.return_contacts = []       # (x, y, offset) of opponent serve returns
        self.last_return_swtype = None  # 1 overhead / -1 underarm, learned from hit kind
        self.last_return_speed = None   # initial speed of that return, for target inversion
        self.plan_tail = []             # inputs of the current plan past frame 10
        self.plan_tail_frame0 = -1      # absolute frame that plan_tail[0] applies to
        self.serve_release = None       # frame our current serve left the racket
        self.serve_hit_pending = False

    # ------------------------------------------------------------------
    def act(self, obs):
        try:
            return self._act(obs)
        except Exception:
            if DEBUG:
                import traceback
                traceback.print_exc()
            return neutral_window()

    def _act(self, obs):
        team = obs.get("yourPlayer")
        if obs.get("status") != "playing" or team is None:
            return neutral_window()
        # A single process may serve several games of a round (seats swap and
        # the net height changes).  Learning state is per game.
        key = (obs.get("id"), obs.get("seed"))
        if key != getattr(self, "match_key", None):
            self.match_key = key
            self.seen_event = 0
            self.return_contacts = []
            self.last_return_swtype = None
            self.last_return_speed = None
            self.plan_tail = []
            self.plan_tail_frame0 = -1
            self.serve_release = None
            self.serve_hit_pending = False
            self.bait_hold_until = -1
        self._observe(obs, team)
        court = obs.get("court") or {}
        nh = court.get("netHeight")
        if nh is not None:
            try:
                E.RULES["netHeight"] = float(nh)
            except (TypeError, ValueError):
                pass
        me = player_state_from_obs(obs["batsmen"][team], team)
        opp = player_state_from_obs(obs["batsmen"][1 - team], 1 - team)
        phase = obs.get("phase")
        if phase == "serve":
            if obs.get("server") == team:
                return self._defend(obs, me, opp, team)
            return self._receive_serve(obs, me, opp, team)
        if phase == "rally":
            ball = obs.get("shuttle")
            if not ball or not ball.get("alive"):
                return neutral_window()
            # A swing planned in the previous window may continue into this
            # one.  The observation is taken before the hit, so planning from
            # the incoming ball here would freeze us on the spot right after
            # our own contact (seen when a serve return left the player at the
            # net for ~9 frames).  Replay the plan's tail, then recover.
            tail_win = self._plan_tail_window(obs, me, opp, team, ball)
            if tail_win is not None:
                return tail_win
            if ball.get("lastTeam") == team:
                return self._defend(obs, me, opp, team)
            return self._rally_plan(obs, me, opp, team)
        self.plan_tail = []
        return neutral_window()

    def _observe(self, obs, team):
        """Track the serve release frame and the opponent's serve-return hits."""
        try:
            frame = obs.get("frame")
            if frame is None:
                return
            if obs.get("phase") == "serve" and obs.get("server") == team:
                rel = int(round(float(obs.get("serveLeft", 0)) * R["hz"]))
                self.serve_release = frame + rel
                self.serve_hit_pending = True
            for e in obs.get("events") or []:
                eid = e.get("id")
                if eid is None or eid <= self.seen_event:
                    continue
                self.seen_event = eid
                if (e.get("type") == "hit" and e.get("team") == 1 - team
                        and getattr(self, "serve_hit_pending", False)
                        and self.serve_release is not None and e.get("frame") is not None):
                    off = e["frame"] - self.serve_release
                    cx, cy = e.get("x"), e.get("y")
                    self.serve_hit_pending = False
                    if 0 < off < 40 and cx is not None and cy is not None:
                        self.return_contacts.append((cx, cy, off))
                        self.return_contacts = self.return_contacts[-6:]
                        kind = e.get("kind")
                        if kind in ("smash", "clear", "drop"):
                            self.last_return_swtype = 1
                        elif kind == "lift":
                            self.last_return_swtype = -1
                        if e.get("speed") is not None:
                            self.last_return_speed = e.get("speed")
        except Exception:
            pass

    def _learned_contact(self):
        """A stable opponent serve-return contact, if the last two agree."""
        rc = self.return_contacts
        if len(rc) < 2:
            return None
        x1, y1, o1 = rc[-2]
        x2, y2, o2 = rc[-1]
        if abs(x1 - x2) > 0.35 or abs(y1 - y2) > 0.35 or abs(o1 - o2) > 3:
            return None
        return (x2, y2, o2)

    # ------------------------------------------------------------------
    # Candidate enumeration
    # ------------------------------------------------------------------
    def _candidates(self, ball_pred, me, team, horizon):
        facing = me["facing"]
        reach = reach_of(me["stamina"])
        cands = []
        midswing = me["swing"] > 0
        for t in range(1, min(horizon, len(ball_pred) - 1) + 1):
            samples = [s for s in ball_pred[t] if s[2]]
            if not samples:
                break
            if midswing:
                e = me["swingElapsed"] + t
                if e < R["swingWindup"] or e >= R["swingWindup"] + R["swingActive"]:
                    continue
                types = (me["swingType"],)
                elist = (e,)
            else:
                types = (1, -1)
                elist = [x for x in range(R["swingWindup"], R["swingWindup"] + R["swingActive"])
                         if t - x >= 1]
            py = me["y"]
            for swtype in types:
                for e in elist:
                    up, fwd = racket_offsets(e, swtype)
                    best = None
                    for j, (bx, by, alive) in enumerate(samples):
                        if team == 0 and bx > R["netX"] + 0.3:
                            continue
                        if team == 1 and bx < R["netX"] - 0.3:
                            continue
                        dy = by - (py + up)
                        if abs(dy) > reach:
                            continue
                        half = math.sqrt(max(0.0, reach * reach - dy * dy))
                        if best is None or half > best[2]:
                            best = (bx - facing * fwd, half, half, bx, by, j)
                    if best is None:
                        continue
                    lo = 0.35 if team == 0 else R["netX"] + 0.35
                    hi = R["netX"] - 0.35 if team == 0 else R["courtLength"] - 0.35
                    cands.append({"t": t, "e": e, "swtype": swtype,
                                  "px": clamp(best[0], lo, hi),
                                  "margin": best[1], "bx": best[3], "by": best[4],
                                  "j": best[5]})
        return cands

    def _reachable_range(self, me, t, allow_sprint=True):
        fwd = servo_inputs(me, 100.0, t, allow_sprint=allow_sprint)
        back = servo_inputs(me, -100.0, t, allow_sprint=allow_sprint)
        xf = sim_player(me, fwd, t)[-1]["x"]
        xb = sim_player(me, back, t)[-1]["x"]
        return min(xb, xf), max(xb, xf)

    def _eval_contact(self, cand, me, opp, team, ball_pred):
        facing = me["facing"]
        t = cand["t"]
        ox = opp_x_at(opp, t)
        shot = shot_from_contact(cand["bx"], cand["by"], cand["swtype"], facing, ox)
        traj = simulate_shot(cand["bx"], cand["by"], shot, facing, nframes=60)
        kind = shot["kind"]
        score = KIND_BASE.get(kind, 20.0)
        if self.clear_lover:
            score += {"smash": -150.0, "drop": 0.0, "clear": 120.0, "lift": 110.0}.get(kind, 0.0)
        dist_net = abs(cand["bx"] - R["netX"])
        if kind == "smash":
            score += (cand["by"] - 2.0) * 25.0
            score += max(0.0, 3.2 - dist_net) * 4.0
        elif kind == "drop":
            score += max(0.0, 3.0 - dist_net) * 6.0
        can, f = opponent_can_reach(traj, ox, opp["stamina"], opp["team"])
        if not can:
            score += 130.0
        else:
            score -= 10.0
        # A shot that crosses the net at blockable height while the opponent is
        # camping near the net is likely to come straight back: penalise it.
        cross_h = None
        prev = (cand["bx"], cand["by"])
        for (f, x, y) in traj:
            if (prev[0] - R["netX"]) * (x - R["netX"]) <= 0 and abs(x - prev[0]) > 1e-9:
                fr = (R["netX"] - prev[0]) / (x - prev[0])
                cross_h = prev[1] + (y - prev[1]) * fr
                break
            prev = (x, y)
        if (not self.smash_lover) and cross_h is not None and abs(ox - R["netX"]) < 1.9 and cross_h < 2.25:
            score -= 85.0
        # Reject shots that hit the net / land on our own side / fly out: the
        # engine's chooseShot falls back to a fixed angle when no candidate
        # clears the net, which is a self-inflicted lost point.
        ok = False
        if traj:
            lx, ly = traj[-1][1], traj[-1][2]
            if facing > 0:
                ok = (lx > R["netX"] + 0.05) and (lx < R["courtLength"] + 0.15)
            else:
                ok = (lx < R["netX"] - 0.05) and (lx > -0.15)
        if not ok or not self._trace_ok(cand["bx"], cand["by"], shot, facing, self.net_margin):
            score -= 400.0
        score += min(cand["margin"], 0.38) * 30.0
        return score, shot, traj

    # ------------------------------------------------------------------
    # Verification: simulate our own inputs against the predicted ball
    # ------------------------------------------------------------------
    def _verify_hit(self, me, inputs, pred, team, nframes):
        """Return (frame, ball, held_move, swing_type, best_clearance).

        best_clearance is the largest (reach - distance) achieved anywhere in
        the swing's active window.  Plans whose best alignment is only just
        inside the reach radius are fragile: the reach scales with stamina
        (0.38 -> 0.311 at zero stamina), so a sub-1% numeric difference
        between the plan and the real engine can turn a "hit" into a whiff.
        Callers use it to prefer solid contacts.
        """
        traj = sim_player(me, inputs, nframes)
        first = None
        best_clear = -1.0
        for f in range(1, min(nframes, len(traj) - 1) + 1):
            p = traj[f]
            if not in_window(p):
                continue
            rx, ry = E.Match.racket_at(p, p["swingElapsed"], p["swingType"])
            reach = reach_of(p["stamina"])
            samples = pred[f] if f < len(pred) else []
            for (bx, by, alive) in samples:
                if not alive:
                    continue
                if team == 0 and bx > R["netX"] + 0.3:
                    continue
                if team == 1 and bx < R["netX"] - 0.3:
                    continue
                d = math.hypot(bx - rx, by - ry)
                if d <= reach:
                    if first is None:
                        mv = (float(inputs[f - 1].get("move", 0.0))
                              if f - 1 < len(inputs) else 0.0)
                        first = (f, (bx, by), mv, p["swingType"])
                    if reach - d > best_clear:
                        best_clear = reach - d
        if first is None:
            return None
        return first + (best_clear,)

    @staticmethod
    def _shot_is_safe(traj, facing):
        if not traj:
            return False
        lx = traj[-1][1]
        if facing > 0:
            return (lx > R["netX"] + 0.05) and (lx < R["courtLength"] + 0.15)
        return (lx < R["netX"] - 0.05) and (lx > -0.15)

    @staticmethod
    def _trace_ok(sx, sy, shot, facing, margin=0.08):
        """Engine-identical trace: reject fallback shots and marginal net clears.

        chooseShot() falls back to a fixed angle without any net check when no
        candidate clears; at high nets that fallback lands on our own side.
        A small clearance margin also protects against a predicted contact
        being a few centimetres off the real one.
        """
        tr = E.Match.shot_trace(sx, sy, shot["angle"], shot["speed"], facing,
                                R["netHeight"])
        if tr["netHit"]:
            return False
        ny = tr["netY"]
        if ny is not None and ny < R["netHeight"] + margin:
            return False
        lx = tr["landX"]
        if facing > 0:
            return (R["netX"] + 0.05) < lx < (R["courtLength"] + 0.15)
        return -0.15 < lx < (R["netX"] - 0.05)

    # ------------------------------------------------------------------
    # Window construction
    # ------------------------------------------------------------------
    def _build_inputs(self, me, cand, hold_until=0, hold_x=None, nudge=False,
                      allow_sprint=True):
        t = cand["t"]
        e = cand["e"]
        horizon = max(10, t + 1)
        if hold_until > 0 and hold_x is not None and hold_until < t:
            seg1 = servo_inputs(me, hold_x, hold_until, nframes=hold_until, hold_after=False,
                                allow_sprint=allow_sprint)
            cur = sim_player(me, seg1, len(seg1))[-1]
            rem = t - hold_until
            seg2 = servo_inputs(cur, cand["px"], rem, nframes=max(1, rem), hold_after=False,
                                allow_sprint=allow_sprint)
            inputs = seg1 + seg2
        else:
            inputs = plan_control(me, cand["px"], t, horizon, hold_after=False,
                                  allow_sprint=allow_sprint)
        if me["swing"] <= 0:
            idx = (t - e) - 1
            if 0 <= idx < len(inputs):
                inputs[idx]["swing"] = cand["swtype"]
                if nudge:
                    inputs[idx]["move"] = float(me["facing"])
                    inputs[idx]["sprint"] = False
        return inputs

    @staticmethod
    def _format(inputs):
        out = []
        for i in range(10):
            inp = inputs[i] if i < len(inputs) else E.neutral()
            out.append({"move": round(float(inp.get("move", 0.0)), 4),
                        "jump": bool(inp.get("jump", False)),
                        "swing": int(inp.get("swing", 0)),
                        "sprint": bool(inp.get("sprint", False)),
                        "charge": False})
        return out

    def _hold_window(self, me, team, target_x=None, allow_sprint=False):
        if target_x is None:
            return [{"move": 0.0, "jump": False, "swing": 0, "charge": False,
                     "sprint": False} for _ in range(10)]
        inputs = plan_control(me, target_x, 10, 10, hold_after=False,
                              allow_sprint=allow_sprint)
        return self._format(inputs)

    def _plan_tail_window(self, obs, me, opp, team, ball):
        """Replay the part of the previous plan that falls in this window.

        A swing scheduled late in a window contacts the ball in the next one.
        This observation predates that contact, so planning from the incoming
        ball would ignore our own hit and stand still.  Use the stored tail
        of the plan, then spend any remaining frames recovering towards the
        defensive middle (the next window re-plans with fresh information).
        """
        if not self.plan_tail:
            return None
        # Only while the planned swing is actually in flight: outside that
        # window a stored plan is stale (the ball may have been struck
        # elsewhere) and replaying it would fight the fresh planning.
        if me.get("swing", 0) <= 0:
            self.plan_tail = []
            return None
        if ball is not None and ball.get("lastTeam") == team:
            # Our contact already happened: recovery is handled by _defend.
            self.plan_tail = []
            return None
        frame = obs.get("frame", 0)
        idx = (frame + 1) - self.plan_tail_frame0
        if idx < 0:
            return None
        if idx >= len(self.plan_tail):
            self.plan_tail = []
            return None
        pat = [dict(x) for x in self.plan_tail[idx:idx + 10]]
        if len(pat) < 10:
            cur = sim_player(me, pat, len(pat))[-1] if pat else me
            rem = 10 - len(pat)
            seg = servo_inputs(cur, self._mid_point(team), rem, nframes=rem,
                               hold_after=True)
            pat.extend(seg[:rem])
        self.plan_tail = []
        return self._format(pat)

    # ------------------------------------------------------------------
    # Serve receiving: attack the serve
    # ------------------------------------------------------------------
    def _receive_serve(self, obs, me, opp, team):
        ball = obs["shuttle"]
        rel = int(round(float(obs.get("serveLeft", 0)) * R["hz"]))
        server_facing = 1 if obs.get("server") == 0 else -1
        pred = predict_serve(ball, rel, server_facing, 46)
        got = self._intercept(obs, me, opp, team, pred, budget=18, early_bias=0.4)
        if got is not None:
            return got
        return self._hold_window(me, team)

    # ------------------------------------------------------------------
    # Defence: force the short smash at the tie point, then chase it
    # ------------------------------------------------------------------
    def _mid_point(self, team):
        return 4.0 if team == 0 else R["courtLength"] - 4.0

    def _tie_point(self, team):
        return 2.95 if team == 0 else 10.45

    def _camp_point(self, team):
        return 6.35 if team == 0 else R["netX"] + 0.35

    def _tie_x(self, team):
        if self.def_mode == "camp":
            return self._camp_point(team)
        if self.def_mode == "mid":
            return self._mid_point(team)
        return self._tie_point(team)

    def _def_x(self, team, serve_return=False):
        """Stance to use while waiting for the opponent's return.

        Standing at the tie point (< 3.05 from our baseline) makes the
        opponent's smash target the slow near-net corner instead of the
        34 m/s deep corner, which is physically unreachable.  General rally
        defence keeps the configured mode.
        """
        if serve_return:
            return self._tie_point(team)
        return self._tie_x(team)

    def _hold_then_go(self, me, hold_x, hold_frames, then_x):
        """Window: stand at hold_x for hold_frames, then run to then_x."""
        hold_frames = int(clamp(hold_frames, 0, 10))
        if hold_frames > 0:
            seg1 = servo_inputs(me, hold_x, hold_frames, nframes=hold_frames,
                                hold_after=False)
            cur = sim_player(me, seg1, hold_frames)[-1]
        else:
            seg1 = []
            cur = me
        rem = 10 - hold_frames
        if rem > 0:
            seg2 = servo_inputs(cur, then_x, rem, nframes=rem, hold_after=True)
        else:
            seg2 = []
        return self._format(seg1 + seg2)

    # ------------------------------------------------------------------
    # Serve-return run-up
    #
    # The opponent's smash target is chosen from our x at the strike frame:
    # x < 3.05 (mirror > 10.35) forces the slow near-net corner (target 5.1,
    # ~0.35 s flight), anything else gets the 34 m/s deep corner which is
    # physically impossible to return.  Standing still on the tie point and
    # accelerating *after* the strike wastes the first 0.2 s; instead we wait
    # at a launch point and time a sprint so that we are at x ~ 2.6 already
    # moving at full speed when the opponent strikes, while still being below
    # the threshold at that exact frame.
    # ------------------------------------------------------------------
    def _launch_x(self, team):
        return 2.11 if team == 0 else R["courtLength"] - 2.11

    # ------------------------------------------------------------------
    # Serve-return defence ("deep-corner bait")
    #
    # The opponent's serve-return smash targets whichever corner is farther
    # from us: standing closer to the net than the bisector (3.65 from the
    # net) forces the DEEP corner (12.4 / 1.0).  The incoming trajectory is
    # therefore known once we know their contact point and timing, and we can
    # pre-schedule the counter swing several frames before the ball arrives.
    #
    # Three things make this reliable (see _deep_bait_window):
    #   * project the contact mid-frame (the engine hits between substeps);
    #   * invert the reported return speed to recover the striker's forward
    #     nudge, which controls the target to +-0.05 (0.4 grid of x error
    #     otherwise -- more than the 0.38 racket reach);
    #   * search a set of stances and swing timings, including a swing that
    #     starts in the previous window and sweeps into this one.
    # ------------------------------------------------------------------
    def _bait_x(self, team):
        mode = os.environ.get("BAD_BAIT_MODE", "search")
        if mode == "net":
            return R["netX"] - 0.35 if team == 0 else R["netX"] + 0.35
        if mode == "mid":
            return 2.0 if team == 0 else R["courtLength"] - 2.0
        if mode == "search":
            return self._bait_stances(team)[0]
        return 3.30 if team == 0 else R["courtLength"] - 3.30

    def _serve_contact(self, obs, me, opp, team, pred):
        """Predicted (t_contact, contact_x, contact_y) of the serve return."""
        frame = obs.get("frame", 0)
        learned = self._learned_contact() if self.learn else None
        if learned is not None and self.serve_release is not None:
            cx, cy, off = learned
            return float(self.serve_release + off - frame), cx, cy
        me_pred = dict(me)
        me_pred["x"] = self._bait_x(team)
        me_pred["vx"] = 0.0
        self.last_projection = None
        got = self._project_opponent(pred, me_pred, opp, team)
        if got is None or self.last_projection is None:
            return None, None, None
        c = self.last_projection["c"]
        return float(got[0]), c["bx"], c["by"]

    def _bait_stances(self, team):
        """Candidate stances on our side, as distances from the net.

        d < 3.65 keeps the opponent's serve-return target on the DEEP corner
        (12.4 / 1.0), so the incoming trajectory is the same for all of them;
        only our racket geometry differs.  The planner tests each.
        """
        env = os.environ.get("BAD_BAIT_D", "3.40,2.30,1.70,1.10,0.50")
        out = []
        for part in env.split(","):
            try:
                d = float(part)
            except ValueError:
                continue
            x = (R["netX"] - d) if team == 0 else (R["netX"] + d)
            lo = 0.35 if team == 0 else R["netX"] + 0.35
            hi = R["netX"] - 0.35 if team == 0 else R["courtLength"] - 0.35
            x = clamp(x, lo, hi)
            if all(abs(x - y) > 0.05 for y in out):
                out.append(x)
        return out or [(R["netX"] - 3.3) if team == 0 else (R["netX"] + 3.3)]

    def _deep_bait_window(self, obs, me, opp, team, ball, pred):
        stances = self._bait_stances(team)
        bait = stances[0]
        hold = plan_control(me, bait, 10, 10, hold_after=False, allow_sprint=False)
        t_c, cx, cy = self._serve_contact(obs, me, opp, team, pred)
        if t_c is None or cx is None:
            return self._format(hold)
        if t_c < 1.0:
            # The predicted contact already happened: the observed trajectory
            # is the real return, so chase it directly instead of re-creating it.
            got = self._intercept(obs, me, opp, team, pred, budget=18,
                                  allow_sprint=False)
            if got is not None:
                return got
            return self._format(hold)
        if t_c > 13.5:
            return self._format(hold)
        swtype = getattr(self, "last_return_swtype", None) or (1 if cy > 1.2 else -1)
        kind, _target = E.Match.shot_kind_and_target(cx, cy, swtype, opp["facing"], bait)
        if kind != "smash":
            log("serve return predicted %s (no bait swing) t=%.1f c=(%.2f,%.2f)" % (
                kind, t_c, cx, cy))
            return self._format(hold)
        if self.serve_release is None:
            return self._format(hold)
        proj = self._project_from_contact(pred, cx, cy, max(1, int(round(t_c))),
                                          {"x": bait}, opp, team)
        if proj is None:
            return self._format(hold)
        variants = proj[1]
        tc = int(round(t_c))
        lo = max(0, tc - 6)
        hi = min(9, tc + 4)
        # The counter contact is 3-7 frames after the opponent's contact, which
        # may fall in the next window.  A swing scheduled at the end of this
        # window keeps sweeping into the next one, and the early hold check in
        # _defend() freezes the stance while it is in flight.  Extend the
        # simulation accordingly (neutral frames = standing still).
        nv = max(14, tc + 9)
        best = None
        for stance in stances:
            if stance != bait:
                hold_s = plan_control(me, stance, 10, 10, hold_after=False,
                                      allow_sprint=False)
            else:
                hold_s = hold
            for swtype in (1, -1):
                for idx in range(lo, hi + 1):
                    trial = [dict(x) for x in hold_s]
                    trial[idx]["swing"] = swtype
                    cover = 0
                    hit0 = None
                    for vi, pv in enumerate(variants[:3]):
                        h = self._verify_hit(me, trial, pv, team, nv)
                        if h is not None and h[0] <= nv:
                            cover += 1
                            if vi == 0:
                                hit0 = h
                    if cover == 0:
                        continue
                    score = 0.0
                    clr = hit0[4] if hit0 is not None else -1.0
                    if hit0 is not None:
                        f, (bx, by), mv, st = hit0[:4]
                        cand = {"t": f, "e": 0, "swtype": st, "px": me["x"],
                                "margin": 0.2, "bx": bx, "by": by}
                        score, _shot, _traj = self._eval_contact(cand, me, opp, team,
                                                                 variants[0])
                        if score < 0.0:
                            continue
                    # Prefer a plan that reliably meets the best-estimate
                    # trajectory (hit0), then coverage, then shot quality; among
                    # equal plans keep the one nearest to the anchor stance.
                    key = (hit0 is not None, cover, min(clr, 0.20), score,
                           -abs(stance - bait), -abs(idx - (tc - 2)))
                    if best is None or key > best[0]:
                        best = (key, trial, swtype, idx, hit0, stance)
        if best is None:
            log("deep bait: no swing verified t=%d c=(%.2f,%.2f)" % (tc, cx, cy))
            return self._format(hold)
        if best[4] is not None:
            self.bait_hold_until = obs.get("frame", 0) + best[4][0] + 2
        else:
            self.bait_hold_until = obs.get("frame", 0) + nv
        log("deep bait swing cover=%d/%d t=%d c=(%.2f,%.2f) type=%d idx=%d stance=%.2f hit=%s" % (
            best[0][1], len(variants), tc, cx, cy, best[2], best[3], best[5], best[4]))
        return self._format(best[1])

    def _serve_return_defense(self, obs, me, opp, team, ball, pred):
        if self.deadbait:
            return self._deep_bait_window(obs, me, opp, team, ball, pred)
        frame = obs.get("frame", 0)
        learned = self._learned_contact() if self.learn else None
        t_contact = None
        if self.serve_release is not None:
            # Bias the predicted contact late: being early only costs speed,
            # being late pushes us past the 3.05 threshold and flips the
            # opponent's target to the unreachable deep corner.
            off = float(learned[2]) if learned is not None else 14.0
            t_contact = self.serve_release + off - frame
        me_pred = dict(me)
        me_pred["x"] = self._launch_x(team)
        me_pred["vx"] = 0.0
        projected = None
        if learned is not None and t_contact is not None and 1.0 <= t_contact <= 40.0:
            cx, cy, off = learned
            projected = self._project_from_contact(pred, cx, cy,
                                                   int(round(t_contact)),
                                                   me_pred, opp, team)
            if projected is not None:
                log("learned serve return (%.2f,%.2f) off=%d t=%.1f" % (cx, cy, off, t_contact))
        if projected is None:
            projected = self._project_opponent(pred, me_pred, opp, team)
        variants = None
        if projected is not None:
            t_proj, variants = projected
            if t_contact is None:
                t_contact = float(t_proj)
        if t_contact is None:
            t_contact = 8.0
        inputs, _swung = self._runup_inputs(me, team, t_contact, variants, opp)
        return self._format(inputs)

    def _runup_inputs(self, me, team, t_contact, variants, opp):
        facing = me["facing"]
        launch = self._launch_x(team)
        n = 10
        tpre = max(0.0, float(t_contact) - 4.0)
        npre = max(0, min(n, int(math.floor(tpre + 1e-6))))
        inputs = []
        cur = dict(me)
        if npre > 0:
            seg = servo_inputs(cur, launch, npre, nframes=npre, hold_after=False,
                               allow_sprint=False)
            inputs.extend(seg[:npre])
            cur = sim_player(cur, seg[:npre], npre)[-1]
        while len(inputs) < n:
            inp = {"move": float(facing),
                   "sprint": bool(cur["stamina"] > 8.0 and cur["onGround"])}
            inputs.append(inp)
            q = dict(cur)
            q["held"] = inp
            E.Match.update_player(DummyMatch(), q)
            cur = q
        if not variants:
            return inputs, False
        # Try to strike inside this very window: when the opponent contacts
        # early in the window the return lands before the next window can
        # react, so the swing has to be pre-scheduled from the prediction.
        best = None
        for swtype in (1, -1):
            for idx in range(n):
                trial = [dict(x) for x in inputs]
                trial[idx]["swing"] = swtype
                hits = 0
                hit0 = None
                for vi, pv in enumerate(variants[:3]):
                    h = self._verify_hit(me, trial, pv, team, n)
                    if h is not None and h[0] <= n:
                        hits += 1
                        if vi == 0:
                            hit0 = h
                if hit0 is None:
                    continue
                f, (bx, by), mv, st = hit0[:4]
                cand = {"t": f, "e": 0, "swtype": st, "px": me["x"],
                        "margin": 0.2, "bx": bx, "by": by}
                score, shot, traj = self._eval_contact(cand, me, opp, team, variants[0])
                score += 120.0 * min(hit0[4], 0.2)
                if score < -200.0:
                    continue
                key = (hits, score)
                if best is None or key > best[0]:
                    best = (key, trial)
        if best is not None:
            log("runup strike cover=%d/%d score=%.1f" % (best[0][0], min(3, len(variants)),
                                                         best[0][1]))
            return best[1], True
        return inputs, False

    def _defend(self, obs, me, opp, team):
        ball = obs["shuttle"]
        # A pre-scheduled counter swing (deep bait) must not be disturbed: its
        # racket/ball alignment assumes we stand still while it sweeps.
        if (me.get("swing", 0) > 0
                and obs.get("frame", 0) < getattr(self, "bait_hold_until", -1)):
            return self._hold_window(me, team, me["x"])
        if obs.get("phase") == "serve":
            rel = int(round(float(obs.get("serveLeft", 0)) * R["hz"]))
            server_facing = 1 if obs.get("server") == 0 else -1
            pred = predict_serve(ball, rel, server_facing, 52)
        else:
            pred = predict_shuttle(ball, 52)
        # While our own serve is still frozen we keep the usual stance: moving
        # before release would shift the serve origin.  Once the serve is in
        # the air (rally == 0, lastTeam == us) we defend the return from the
        # tie point and do not leave it until the opponent actually strikes.
        serve_return = (obs.get("phase") == "rally" and obs.get("rally", 0) == 0
                        and ball.get("lastTeam") == team)
        if obs.get("phase") == "serve" and obs.get("server") == team:
            # beginServe() builds the shuttle at the server's home position and
            # never moves it again during the freeze, so walking around before
            # release does NOT change the serve.  Use the 0.8 s freeze to walk
            # to the run-up launch point instead of hugging the baseline.
            if self.deadbait:
                return self._hold_window(me, team, self._bait_x(team))
            if self.runup:
                return self._hold_window(me, team, self._launch_x(team))
            rel = int(round(float(obs.get("serveLeft", 0)) * R["hz"]))
            if rel > 0:
                return self._hold_then_go(me, me["x"], rel, self._tie_point(team))
        if serve_return and (self.deadbait or self.runup):
            got = self._serve_return_defense(obs, me, opp, team, ball, pred)
            if got is not None:
                return got
        tie = self._def_x(team, serve_return=serve_return)
        opp_team = 1 - team
        if (ball.get("lastTeam") == opp_team and obs.get("phase") != "serve"
                and me.get("swing", 0) > 0
                and obs.get("frame", 0) < self.bait_hold_until):
            # A deep-bait counter swing is already in flight: keep the stance
            # so the pre-computed racket/ball alignment is preserved.
            return self._hold_window(me, team, me["x"])
        if ball.get("lastTeam") == opp_team and obs.get("phase") != "serve":
            got = self._intercept(obs, me, opp, team, pred, budget=18)
            if got is not None:
                return got
            # No verified interception: at least run at the predicted landing
            # if it is on our side; otherwise keep the defensive stance.
            land = self._predicted_landing(pred)
            if land is not None:
                lo = 0.35 if team == 0 else R["netX"] + 0.35
                hi = R["netX"] - 0.35 if team == 0 else R["courtLength"] - 0.35
                if lo <= land <= hi:
                    return self._hold_window(me, team, clamp(land, lo, hi))
            return self._hold_window(me, team, tie)
        # project the opponent's attack
        me_pred = dict(me)
        me_pred["x"] = tie
        me_pred["vx"] = 0.0
        projected = None
        if self.learn and obs.get("phase") == "serve" and obs.get("server") == team:
            learned = self._learned_contact()
            if learned is not None:
                cx, cy, off = learned
                rel = int(round(float(obs.get("serveLeft", 0)) * R["hz"]))
                t_learn = rel + off
                if 1 <= t_learn <= 40:
                    projected = self._project_from_contact(pred, cx, cy, t_learn, me_pred, opp, team)
                    if projected is not None:
                        log("learned opp contact (%.2f,%.2f) t=%d" % (cx, cy, t_learn))
        if projected is None:
            projected = self._project_opponent(pred, me_pred, opp, team)
        if projected is not None:
            t_contact, variants = projected
            if serve_return and t_contact >= 4:
                # The opponent will strike later in this window.  Stay on the
                # tie point for the whole window: any forward move now would
                # push our x past the 3.05 threshold and turn the return back
                # into the 34 m/s deep-corner smash.  The next window starts
                # after the strike and can chase the actual (slow) ball.
                return self._hold_window(me, team, tie)
            if 1 <= t_contact <= 40:
                got = self._intercept(obs, me, opp, team, variants[0], budget=18,
                                      only_after=max(1, t_contact),
                                      hold_until=t_contact, hold_x=tie,
                                      variants=variants)
                if got is not None:
                    return got
                land = self._predicted_landing(variants[0])
                if land is not None:
                    lo = 0.35 if team == 0 else R["netX"] + 0.35
                    hi = R["netX"] - 0.35 if team == 0 else R["courtLength"] - 0.35
                    # Do not chase the projected landing before the opponent
                    # has hit: that moves us off the tie point and flips the
                    # opponent's target back to the unreachable deep corner.
                    if serve_return or t_contact >= 2:
                        return self._hold_then_go(me, tie, t_contact,
                                                  clamp(land, lo, hi))
                    return self._hold_window(me, team, clamp(land, lo, hi))
        return self._hold_window(me, team, tie)

    @staticmethod
    def _predicted_landing(pred):
        for f in range(len(pred) - 1, 0, -1):
            for (bx, by, alive) in pred[f]:
                if not alive:
                    return bx
        return None

    def _project_from_contact(self, pred, cx, cy, t, me, opp, team, swtype=None):
        opp_team = 1 - team
        if swtype is None:
            swtype = getattr(self, "last_return_swtype", None)
        if swtype is None:
            swtype = 1 if cy > 1.2 else -1
        ms = max_speed_of(opp["stamina"])
        est_fwd = clamp((opp["vx"] / ms) * opp["facing"], 0.0, 1.0) if ms > 1e-6 else 0.0
        # The opponent's smash target is deepX + 0.6*forward, and forward is the
        # only unknown left.  The hit event reports the shot speed, which is
        # strictly increasing in forward, so invert it: this pins the target to
        # ~0.05 grid instead of guessing 0/0.5/1.0 (a 0.4 grid of x error at the
        # interception point is more than the racket reach).
        fwd_best = est_fwd
        sp = getattr(self, "last_return_speed", None)
        if sp is not None:
            try:
                sp = float(sp)
            except (TypeError, ValueError):
                sp = None
        if sp is not None:
            best = None
            for i in range(0, 9):
                f = i / 8.0
                sh = shot_from_contact(cx, cy, swtype, opp["facing"], me["x"], forward=f)
                d = abs(sh["speed"] - sp)
                if best is None or d < best[0]:
                    best = (d, f)
            if best is not None and best[0] < 2.0:
                for i in range(-2, 3):
                    f = clamp(best[1] + i * 0.06, 0.0, 1.0)
                    sh = shot_from_contact(cx, cy, swtype, opp["facing"], me["x"],
                                           forward=f)
                    d = abs(sh["speed"] - sp)
                    if d < best[0]:
                        best = (d, f)
                fwd_best = best[1]
        forwards = []
        for f in (fwd_best, est_fwd, 0.0, 1.0):
            if all(abs(f - g) > 0.2 for g in forwards):
                forwards.append(f)
        rem = 1
        if 0 <= t < len(pred):
            j = contact_substep(pred[t], cx, cy)
            if j is not None:
                rem = R["substeps"] - 1 - j
        variants = []
        for fwd in forwards:
            sh = shot_from_contact(cx, cy, swtype, opp["facing"], me["x"], forward=fwd)
            sf = shot_frames_partial(cx, cy, sh, opp["facing"], rem, 55)
            combined = []
            for f in range(t + 56):
                if f < t:
                    combined.append(pred[f] if f < len(pred) else [(cx, cy, False)])
                elif f == t:
                    combined.append(sf[0])
                else:
                    k = f - t
                    combined.append(sf[k] if k < len(sf) else [(cx, cy, False)])
            variants.append(combined)
        return t, variants

    def _project_opponent(self, pred, me, opp, team):
        opp_team = 1 - team
        cands = self._candidates(pred, opp, opp_team, 40)
        if not cands:
            return None
        best = None
        for c in cands:
            lo, hi = self._reachable_range(opp, c["t"])
            if c["px"] < lo - 0.08 or c["px"] > hi + 0.08:
                continue
            score, shot, traj = self._eval_contact(c, opp, me, opp_team, pred)
            score -= c["t"] * 0.4
            if best is None or score > best[0]:
                best = (score, c, shot)
        if best is None:
            return None
        _, c, shot = best
        t = c["t"]
        # The struck shuttle also gets a forward nudge from the striker's held
        # move; model a few possibilities so the plan is robust.
        ms = max_speed_of(opp["stamina"])
        est_fwd = clamp((opp["vx"] / ms) * opp["facing"], 0.0, 1.0) if ms > 1e-6 else 0.0
        forwards = []
        for f in (0.0, est_fwd, 1.0):
            if all(abs(f - g) > 0.2 for g in forwards):
                forwards.append(f)
        variants = []
        j = c.get("j")
        rem = R["substeps"] - 1 - j if j is not None else 1
        for fwd in forwards:
            sh = shot_from_contact(c["bx"], c["by"], c["swtype"], opp["facing"],
                                   me["x"], forward=fwd)
            sf = shot_frames_partial(c["bx"], c["by"], sh, opp["facing"], rem, 55)
            combined = []
            for f in range(t + 56):
                if f < t:
                    combined.append(pred[f] if f < len(pred) else [(c["bx"], c["by"], False)])
                elif f == t:
                    combined.append(sf[0])
                else:
                    k = f - t
                    combined.append(sf[k] if k < len(sf) else [(c["bx"], c["by"], False)])
            variants.append(combined)
        log("project opp: t=%d e=%d type=%d at (%.2f,%.2f) -> %s fwd=%s" % (
            t, c["e"], c["swtype"], c["bx"], c["by"], shot["kind"],
            [round(x, 2) for x in forwards]))
        self.last_projection = {"t": t, "c": c, "shot": shot,
                                "forwards": forwards}
        return t, variants

    # ------------------------------------------------------------------
    # Generic interception
    # ------------------------------------------------------------------
    def _intercept(self, obs, me, opp, team, pred, budget=18, only_after=0,
                   hold_until=0, hold_x=None, early_bias=0.3, variants=None,
                   allow_sprint=True):
        preds = [pred] if not variants else variants
        cands = self._candidates(pred, me, team, min(42, len(pred) - 1))
        scored = []
        for c in cands:
            if c["t"] < only_after:
                continue
            lo, hi = self._reachable_range(me, c["t"], allow_sprint=allow_sprint)
            if c["px"] < lo - 0.06 or c["px"] > hi + 0.06:
                continue
            score, shot, traj = self._eval_contact(c, me, opp, team, pred)
            score -= c["t"] * early_bias
            # Chasing a "better" contact far from where we stand costs legs.
            # In flat-drive loops the early clear is only ~16 points better
            # than the nearby lift, while the extra run can decide a long
            # rally's stamina.  Configurable for offline comparison.
            score -= self.move_pen * abs(c["px"] - me["x"])
            scored.append((score, c, shot))
        scored.sort(key=lambda x: -x[0])
        best = None
        best_marginal = None
        for score, c, shot in scored[:budget]:
            inputs = self._build_inputs(me, c, hold_until, hold_x,
                                        nudge=(self.nudge and only_after == 0 and hold_until == 0),
                                        allow_sprint=allow_sprint)
            hits = []
            for pv in preds:
                hits.append(self._verify_hit(me, inputs, pv, team, max(12, c["t"] + 2)))
            good = sum(1 for h in hits if h is not None)
            if good == 0:
                continue
            h0 = next(h for h in hits if h is not None)
            fwd = clamp(h0[2] * me["facing"], 0.0, 1.0)
            real = shot_from_contact(h0[1][0], h0[1][1], h0[3], me["facing"],
                                     opp_x_at(opp, h0[0]), forward=fwd)
            real_traj = simulate_shot(h0[1][0], h0[1][1], real, me["facing"], nframes=60)
            if (not self._shot_is_safe(real_traj, me["facing"])
                    or not self._trace_ok(h0[1][0], h0[1][1], real, me["facing"], self.net_margin)):
                score -= 400.0
                if score < 0:
                    continue
            clearance = h0[4] if len(h0) > 4 else 0.0
            # A contact that only just fits inside the reach radius can miss in
            # the real engine (the reach shrinks with stamina).  Prefer plans
            # with >=0.05 grid of margin; fall back to marginal ones only if
            # nothing solid exists.
            if clearance >= 0.05:
                score += 60.0 * min(clearance, 0.20)
                rank = (good, 1, score)
                if best is None or rank > best[0]:
                    best = (rank, inputs, c, shot, hits, score)
                if good == len(preds):
                    break
            else:
                rank = (good, 0, score)
                if best_marginal is None or rank > best_marginal[0]:
                    best_marginal = (rank, inputs, c, shot, hits, score)
        if best is None:
            best = best_marginal
        if best is None:
            return None
        rank, inputs, c, shot, hits, score = best
        self.plan_tail = [dict(x) for x in inputs[10:]]
        self.plan_tail_frame0 = obs.get("frame", 0) + 11
        log("intercept: t=%d e=%d type=%d px=%.2f score=%.1f %s cover=%d/%d hit@%s" % (
            c["t"], c["e"], c["swtype"], c["px"], score, shot["kind"],
            rank[0], len(preds), [h[0] if h else None for h in hits]))
        return self._format(inputs)

    # ------------------------------------------------------------------
    # Rally
    # ------------------------------------------------------------------
    def _rally_plan(self, obs, me, opp, team):
        ball = obs["shuttle"]
        pred = predict_shuttle(ball, 46)
        land = None
        for f in range(len(pred) - 1, 0, -1):
            for (bx, by, alive) in pred[f]:
                if not alive:
                    land = (bx, by)
                    break
            if land:
                break
        if land is not None:
            if team == 0 and land[0] < -0.1:
                return self._hold_window(me, team, 4.0)
            if team == 1 and land[0] > R["courtLength"] + 0.1:
                return self._hold_window(me, team, R["courtLength"] - 4.0)
        got = self._intercept(obs, me, opp, team, pred,
                              allow_sprint=self.rally_sprint)
        if got is not None:
            return got
        tx = None
        for f in range(1, len(pred) - 1):
            for (bx, by, alive) in pred[f]:
                if not alive:
                    tx = bx
                    break
            if tx is not None:
                break
        if tx is not None:
            return self._hold_window(me, team, clamp(tx, 0.35 if team == 0 else 7.05,
                                                    6.35 if team == 0 else 13.05))
        return self._hold_window(me, team)
