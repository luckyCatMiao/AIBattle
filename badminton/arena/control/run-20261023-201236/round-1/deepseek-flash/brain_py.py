"""Agent brain (development version). Bundled into agent.py for submission."""
import math
import os
import sys

import engine_py as E
import planner as P
from planner import (clamp, racket_offsets, reach_of, max_speed_of, predict_shuttle,
                     predict_serve, player_state_from_obs, sim_player, servo_inputs,
                     plan_control, shot_from_contact, simulate_shot, opponent_can_reach,
                     shuttle_step)

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


class Brain:
    def __init__(self, def_mode=None, smash_lover=False, no_sprint=False, nudge=False, learn=True, clear_lover=False):
        self.debug_hits = []
        self.def_mode = def_mode or os.environ.get("BAD_DEF", "mid")
        self.smash_lover = smash_lover
        self.clear_lover = clear_lover
        self.no_sprint = no_sprint
        self.nudge = nudge
        self.learn = learn
        self.seen_event = 0
        self.return_contacts = []       # (x, y, offset) of opponent serve returns
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
        self._observe(obs, team)
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
            if ball.get("lastTeam") == team:
                return self._defend(obs, me, opp, team)
            return self._rally_plan(obs, me, opp, team)
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
                    for (bx, by, alive) in samples:
                        if team == 0 and bx > R["netX"] + 0.3:
                            continue
                        if team == 1 and bx < R["netX"] - 0.3:
                            continue
                        dy = by - (py + up)
                        if abs(dy) > reach:
                            continue
                        half = math.sqrt(max(0.0, reach * reach - dy * dy))
                        if best is None or half > best[2]:
                            best = (bx - facing * fwd, half, half, bx, by)
                    if best is None:
                        continue
                    lo = 0.35 if team == 0 else R["netX"] + 0.35
                    hi = R["netX"] - 0.35 if team == 0 else R["courtLength"] - 0.35
                    cands.append({"t": t, "e": e, "swtype": swtype,
                                  "px": clamp(best[0], lo, hi),
                                  "margin": best[1], "bx": best[3], "by": best[4]})
        return cands

    def _reachable_range(self, me, t):
        fwd = servo_inputs(me, 100.0, t)
        back = servo_inputs(me, -100.0, t)
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
        if not ok:
            score -= 400.0
        score += min(cand["margin"], 0.38) * 30.0
        return score, shot, traj

    # ------------------------------------------------------------------
    # Verification: simulate our own inputs against the predicted ball
    # ------------------------------------------------------------------
    def _verify_hit(self, me, inputs, pred, team, nframes):
        """Return (frame, ball, held_move, swing_type) for the first real contact."""
        traj = sim_player(me, inputs, nframes)
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
                if math.hypot(bx - rx, by - ry) <= reach:
                    mv = float(inputs[f - 1].get("move", 0.0)) if f - 1 < len(inputs) else 0.0
                    return f, (bx, by), mv, p["swingType"]
        return None

    @staticmethod
    def _shot_is_safe(traj, facing):
        if not traj:
            return False
        lx = traj[-1][1]
        if facing > 0:
            return (lx > R["netX"] + 0.05) and (lx < R["courtLength"] + 0.15)
        return (lx < R["netX"] - 0.05) and (lx > -0.15)

    # ------------------------------------------------------------------
    # Window construction
    # ------------------------------------------------------------------
    def _build_inputs(self, me, cand, hold_until=0, hold_x=None, nudge=False):
        t = cand["t"]
        e = cand["e"]
        horizon = max(10, t + 1)
        if hold_until > 0 and hold_x is not None and hold_until < t:
            seg1 = servo_inputs(me, hold_x, hold_until, nframes=hold_until, hold_after=False)
            cur = sim_player(me, seg1, len(seg1))[-1]
            rem = t - hold_until
            seg2 = servo_inputs(cur, cand["px"], rem, nframes=max(1, rem), hold_after=False)
            inputs = seg1 + seg2
        else:
            inputs = plan_control(me, cand["px"], t, horizon, hold_after=False)
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

    def _hold_window(self, me, team, target_x=None):
        if target_x is None:
            return [{"move": 0.0, "jump": False, "swing": 0, "charge": False,
                     "sprint": False} for _ in range(10)]
        inputs = plan_control(me, target_x, 10, 10, hold_after=False)
        return self._format(inputs)

    # ------------------------------------------------------------------
    # Serve receiving: attack the serve
    # ------------------------------------------------------------------
    def _receive_serve(self, obs, me, opp, team):
        ball = obs["shuttle"]
        rel = int(round(float(obs.get("serveLeft", 0)) * R["hz"]))
        server_facing = 1 if obs.get("server") == 0 else -1
        pred = predict_serve(ball, rel, server_facing, 46)
        got = self._intercept(obs, me, opp, team, pred, budget=10, early_bias=0.4)
        if got is not None:
            return got
        return self._hold_window(me, team)

    # ------------------------------------------------------------------
    # Defence: force the short smash at the tie point, then chase it
    # ------------------------------------------------------------------
    def _tie_x(self, team):
        if self.def_mode == "camp":
            return 6.35 if team == 0 else R["netX"] + 0.35
        if self.def_mode == "mid":
            return 4.0 if team == 0 else R["courtLength"] - 4.0
        return 2.95 if team == 0 else 10.45

    def _defend(self, obs, me, opp, team):
        ball = obs["shuttle"]
        if obs.get("phase") == "serve":
            rel = int(round(float(obs.get("serveLeft", 0)) * R["hz"]))
            server_facing = 1 if obs.get("server") == 0 else -1
            pred = predict_serve(ball, rel, server_facing, 52)
        else:
            pred = predict_shuttle(ball, 52)
        tie = self._tie_x(team)
        opp_team = 1 - team
        if ball.get("lastTeam") == opp_team and obs.get("phase") != "serve":
            got = self._intercept(obs, me, opp, team, pred, budget=10)
            if got is not None:
                return got
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
            if 1 <= t_contact <= 40:
                got = self._intercept(obs, me, opp, team, variants[0], budget=12,
                                      only_after=max(1, t_contact),
                                      hold_until=t_contact, hold_x=tie,
                                      variants=variants)
                if got is not None:
                    return got
                land = self._predicted_landing(variants[0])
                if land is not None:
                    lo = 0.35 if team == 0 else R["netX"] + 0.35
                    hi = R["netX"] - 0.35 if team == 0 else R["courtLength"] - 0.35
                    return self._hold_window(me, team, clamp(land, lo, hi))
        return self._hold_window(me, team, tie)

    @staticmethod
    def _predicted_landing(pred):
        for f in range(len(pred) - 1, 0, -1):
            for (bx, by, alive) in pred[f]:
                if not alive:
                    return bx
        return None

    def _project_from_contact(self, pred, cx, cy, t, me, opp, team):
        opp_team = 1 - team
        swtype = 1 if cy > 1.2 else -1
        ms = max_speed_of(opp["stamina"])
        est_fwd = 0.0
        forwards = [0.0, 0.5, 1.0]
        variants = []
        for fwd in forwards:
            sh = shot_from_contact(cx, cy, swtype, opp["facing"], me["x"], forward=fwd)
            sf = shot_frames(cx, cy, sh, opp["facing"], 55)
            combined = []
            for f in range(t + 56):
                if f < t:
                    combined.append(pred[f] if f < len(pred) else [(cx, cy, False)])
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
        for fwd in forwards:
            sh = shot_from_contact(c["bx"], c["by"], c["swtype"], opp["facing"],
                                   me["x"], forward=fwd)
            sf = shot_frames(c["bx"], c["by"], sh, opp["facing"], 55)
            combined = []
            for f in range(t + 56):
                if f < t:
                    combined.append(pred[f] if f < len(pred) else [(c["bx"], c["by"], False)])
                else:
                    k = f - t
                    combined.append(sf[k] if k < len(sf) else [(c["bx"], c["by"], False)])
            variants.append(combined)
        log("project opp: t=%d e=%d type=%d at (%.2f,%.2f) -> %s fwd=%s" % (
            t, c["e"], c["swtype"], c["bx"], c["by"], shot["kind"],
            [round(x, 2) for x in forwards]))
        return t, variants

    # ------------------------------------------------------------------
    # Generic interception
    # ------------------------------------------------------------------
    def _intercept(self, obs, me, opp, team, pred, budget=10, only_after=0,
                   hold_until=0, hold_x=None, early_bias=0.3, variants=None):
        preds = [pred] if not variants else variants
        cands = self._candidates(pred, me, team, min(42, len(pred) - 1))
        scored = []
        for c in cands:
            if c["t"] < only_after:
                continue
            lo, hi = self._reachable_range(me, c["t"])
            if c["px"] < lo - 0.06 or c["px"] > hi + 0.06:
                continue
            score, shot, traj = self._eval_contact(c, me, opp, team, pred)
            score -= c["t"] * early_bias
            scored.append((score, c, shot))
        scored.sort(key=lambda x: -x[0])
        best = None
        for score, c, shot in scored[:budget]:
            inputs = self._build_inputs(me, c, hold_until, hold_x,
                                        nudge=(self.nudge and only_after == 0 and hold_until == 0))
            hits = []
            for pv in preds:
                hits.append(self._verify_hit(me, inputs, pv, team, max(12, c["t"] + 2)))
            good = sum(1 for h in hits if h is not None)
            if good == 0:
                continue
            # Re-evaluate the shot exactly as the engine will strike it (the
            # held move nudges the target) and drop self-destructive shots.
            h0 = hits[0]
            fwd = clamp(h0[2] * me["facing"], 0.0, 1.0)
            real = shot_from_contact(h0[1][0], h0[1][1], h0[3], me["facing"],
                                     opp_x_at(opp, h0[0]), forward=fwd)
            real_traj = simulate_shot(h0[1][0], h0[1][1], real, me["facing"], nframes=60)
            if not self._shot_is_safe(real_traj, me["facing"]):
                score -= 400.0
                if score < 0:
                    continue
            rank = (good, score)
            if best is None or rank > best[0]:
                best = (rank, inputs, c, shot, hits, score)
            if good == len(preds):
                break
        if best is None:
            return None
        rank, inputs, c, shot, hits, score = best
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
        got = self._intercept(obs, me, opp, team, pred)
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
