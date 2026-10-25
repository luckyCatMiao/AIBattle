"""Python port of the public badminton simulation (catalog.js + simulation.js).

Used only for offline self-testing. The physics here is a line-by-line port of
the public rules source so that plans produced by the agent can be verified
before submission.
"""
import math

RULES = {
    "hz": 20.0,
    "substeps": 4,
    "decisionFrames": 10,
    "courtLength": 13.4,
    "netX": 6.7,
    "netHeight": 1.55,
    "netMin": 1.35,
    "netMax": 1.95,
    "netThickness": 0.09,
    "ceiling": 11.0,
    "gravity": 9.8,
    "shuttleDrag": 0.025,
    "shuttleRadius": 0.07,
    "matchPoints": 11,
    "maxPoints": 15,
    "winBy": 2,
    "matchSeconds": 240,
    "serveFreeze": 0.8,
    "pointFreeze": 0.7,
    "playerSpeed": 3.7,
    "playerAccel": 26.0,
    "playerFriction": 12.0,
    "playerHeight": 1.8,
    "shoulderHeight": 1.45,
    "jumpSpeed": 5.3,
    "playerGravity": 22.0,
    "playerRadius": 0.22,
    "staminaRunDrain": 9.0,
    "staminaRegen": 6.0,
    "staminaSwingCost": 7.0,
    "staminaChargeDrain": 12.0,
    "staminaSprintDrain": 26.0,
    "sprintMultiplier": 1.45,
    "sprintMinStamina": 5.0,
    "chargeRate": 1.3,
    "chargeDecay": 6.0,
    "chargeMoveFactor": 0.45,
    "chargeBoost": 0.55,
    "swingFrames": 9,
    "swingWindup": 2,
    "swingActive": 5,
    "swingCooldown": 0.40,
    "hitLock": 0.30,
    "reachRadius": 0.38,
}
OVERHEAD = {"fromUp": 2.10, "fromFwd": 0.05, "toUp": 1.25, "toFwd": 0.80}
UNDERARM = {"fromUp": 0.28, "fromFwd": 0.50, "toUp": 1.22, "toFwd": 0.68}
SHOT = {
    "overheadSpeed": 9.0, "overheadBoost": 3.0, "overheadSmashBonus": 7.5,
    "overheadAngleLow": 0.60, "overheadAngleHigh": -0.42,
    "clearHeight": 1.80, "smashHeight": 2.35,
    "liftSpeed": 9.0, "liftBoost": 2.0, "liftAngle": 1.05,
}
SERVE = {"vx": 7.0, "vy": 6.2, "height": 1.35, "offset": 0.45, "targetFromNet": 3.2}

DT = 1.0 / RULES["hz"]
SUB = DT / RULES["substeps"]


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


def js_round(v):
    return math.floor(v + 0.5)


def round2(v):
    return js_round(v * 100) / 100.0


def sign(v):
    return 1 if v > 0 else (-1 if v < 0 else 0)


def make_rng(seed):
    """Port of catalog.makeRng (LCG with 32-bit wrap-around)."""
    s = int(seed) % (2 ** 32) or 1

    def _r():
        nonlocal s
        s = (s * 1664525 + 1013904223) % (2 ** 32)
        return s / 4294967296.0

    return _r


def home_x(team):
    return RULES["courtLength"] * 0.25 if team == 0 else RULES["courtLength"] * 0.75


def make_player(team, name):
    return {
        "id": "p%d" % team, "team": team, "index": team, "name": name,
        "x": home_x(team), "y": 0.0, "vx": 0.0, "vy": 0.0, "onGround": True,
        "facing": 1 if team == 0 else -1,
        "swing": 0, "swingElapsed": 0, "swingType": 1, "swingCd": 0.0,
        "lastHitFrame": -999, "held": neutral(), "sprinting": False,
        "hits": 0, "smashes": 0, "errors": 0, "points": 0,
        "stamina": 100.0, "charge": 0.0,
    }


def neutral():
    return {"move": 0.0, "jump": False, "swing": 0, "charge": False, "sprint": False}


def make_shuttle(x, y):
    return {"x": x, "y": y, "vx": 0.0, "vy": 0.0, "lastTeam": None, "owner": None,
            "lastHitFrame": -999, "alive": True, "trail": []}


class Match:
    def __init__(self, seed=1, players=None, match_id="test"):
        if players is None:
            players = [{"name": "A", "kind": "api"}, {"name": "B", "kind": "api"}]
        self.id = match_id
        self.seed = seed
        net_rng = make_rng(int(seed) * 2654435761 + 97)
        self.netHeight = round((RULES["netMin"] + net_rng() * (RULES["netMax"] - RULES["netMin"])) * 100) / 100.0
        self.status = "playing"
        self.phase = "serve"
        self.winner = None
        self.reason = ""
        self.event_id = 0
        self.players = players
        self.frame = 0
        self.tick = 0
        self.score = [0, 0]
        self.server = 0
        self.serveTimer = 0
        self.pointTimer = 0
        self.rally = 0
        self.longestRally = 0
        self.lastPoint = None
        self.batsmen = [make_player(0, players[0]["name"]), make_player(1, players[1]["name"])]
        self.shuttle = None
        self.events = []
        self.pendingLanding = None
        self.begin_serve()

    # ---- events -------------------------------------------------------
    def emit(self, type_, data=None):
        self.event_id += 1
        ev = {"id": self.event_id, "t": round2(self.frame / RULES["hz"]),
              "frame": self.frame, "type": type_}
        if data:
            ev.update(data)
        self.events.append(ev)

    def begin_serve(self):
        p = self.batsmen[self.server]
        for b in self.batsmen:
            b.update({"x": home_x(b["team"]), "y": 0.0, "vx": 0.0, "vy": 0.0,
                      "onGround": True, "swing": 0, "swingElapsed": 0,
                      "swingCd": 0.0, "lastHitFrame": -999})
        self.shuttle = make_shuttle(p["x"] + p["facing"] * SERVE["offset"], SERVE["height"])
        self.shuttle["lastTeam"] = self.server
        self.phase = "serve"
        self.serveTimer = js_round(RULES["serveFreeze"] * RULES["hz"])
        self.rally = 0
        self.pendingLanding = None

    # ---- physics helpers ---------------------------------------------
    @staticmethod
    def in_swing_window(p):
        return (p["swing"] > 0 and p["swingElapsed"] >= RULES["swingWindup"]
                and p["swingElapsed"] < RULES["swingWindup"] + RULES["swingActive"])

    @staticmethod
    def racket_at(p, elapsed, swtype=None):
        if swtype is None:
            swtype = p["swingType"]
        frac = clamp(elapsed / float(RULES["swingFrames"]), 0.0, 1.0)
        arc = OVERHEAD if swtype > 0 else UNDERARM
        up = arc["fromUp"] + (arc["toUp"] - arc["fromUp"]) * frac
        fwd = arc["fromFwd"] + (arc["toFwd"] - arc["fromFwd"]) * frac
        return p["x"] + p["facing"] * fwd, p["y"] + up

    # ---- player -------------------------------------------------------
    def update_player(self, p):
        inp = p["held"] or {}
        try:
            move = clamp(float(inp.get("move", 0) or 0), -1.0, 1.0)
        except (TypeError, ValueError):
            move = 0.0
        accel = RULES["playerAccel"] if p["onGround"] else RULES["playerAccel"] * 0.35
        tired = 0.62 + 0.38 * p["stamina"] / 100.0
        charge_held = bool(inp.get("charge")) and p["onGround"] and p["stamina"] > 1
        sprint_held = (bool(inp.get("sprint")) and not charge_held and p["onGround"]
                       and move != 0 and p["stamina"] > RULES["sprintMinStamina"])
        if charge_held:
            p["charge"] = clamp(p["charge"] + RULES["chargeRate"] * DT, 0.0, 1.0)
        else:
            p["charge"] = max(0.0, p["charge"] - RULES["chargeDecay"] * DT)
        charged = 1.0 - (1.0 - RULES["chargeMoveFactor"]) * p["charge"]
        max_speed = RULES["playerSpeed"] * tired * charged * (RULES["sprintMultiplier"] if sprint_held else 1.0)
        p["sprinting"] = sprint_held

        if move != 0:
            p["vx"] += clamp(move * max_speed - p["vx"], -accel * DT, accel * DT)
        elif p["onGround"]:
            p["vx"] *= math.exp(-RULES["playerFriction"] * DT)
        else:
            p["vx"] *= math.exp(-1.5 * DT)

        running = abs(p["vx"]) > 3.2
        drain = 0.0
        if charge_held:
            drain += RULES["staminaChargeDrain"]
        if sprint_held:
            drain += RULES["staminaSprintDrain"]
        elif running:
            drain += RULES["staminaRunDrain"]
        if drain > 0:
            p["stamina"] = max(0.0, p["stamina"] - drain * DT)
        elif abs(p["vx"]) < 0.8 and p["onGround"]:
            p["stamina"] = min(100.0, p["stamina"] + RULES["staminaRegen"] * DT)

        if inp.get("jump") and p["onGround"] and p["stamina"] > 15:
            p["vy"] = RULES["jumpSpeed"]
            p["onGround"] = False
            p["stamina"] = max(0.0, p["stamina"] - 10)
        if not p["onGround"]:
            p["vy"] -= RULES["playerGravity"] * DT

        p["x"] += p["vx"] * DT
        p["y"] += p["vy"] * DT
        if p["y"] <= 0:
            p["y"] = 0.0
            p["vy"] = 0.0
            p["onGround"] = True

        lo = 0.35 if p["team"] == 0 else RULES["netX"] + 0.35
        hi = RULES["netX"] - 0.35 if p["team"] == 0 else RULES["courtLength"] - 0.35
        p["x"] = clamp(p["x"], lo, hi)

        if p["swingCd"] > 0:
            p["swingCd"] -= DT
        if p["swing"] > 0:
            p["swing"] -= 1
            p["swingElapsed"] += 1
        swing_dir = inp.get("swing", 0) or 0
        if isinstance(swing_dir, bool):
            swing_dir = 1 if swing_dir else 0
        if swing_dir != 0 and p["swing"] == 0 and p["swingCd"] <= 0:
            p["stamina"] = max(0.0, p["stamina"] - RULES["staminaSwingCost"])
            p["swing"] = RULES["swingFrames"]
            p["swingElapsed"] = 0
            p["swingType"] = 1 if swing_dir > 0 else -1
            p["swingCd"] = RULES["swingCooldown"] + RULES["swingFrames"] * DT

    # ---- shuttle ------------------------------------------------------
    def step_shuttle(self, dt):
        s = self.shuttle
        if not s["alive"]:
            return
        sp = math.hypot(s["vx"], s["vy"])
        drag = RULES["shuttleDrag"] * sp
        s["vx"] -= s["vx"] * drag * dt
        s["vy"] -= s["vy"] * drag * dt
        s["vy"] -= RULES["gravity"] * dt

        prev_x, prev_y = s["x"], s["y"]
        nx = s["x"] + s["vx"] * dt
        ny = s["y"] + s["vy"] * dt

        if ny > RULES["ceiling"]:
            ny = RULES["ceiling"]
            s["vy"] = -abs(s["vy"]) * 0.25

        crossed = (prev_x - RULES["netX"]) * (nx - RULES["netX"]) < 0
        if crossed:
            y_at_net = min(prev_y, ny)
            if y_at_net < self.netHeight + RULES["shuttleRadius"]:
                s["x"] = RULES["netX"] - sign(s["vx"]) * (RULES["netThickness"] + RULES["shuttleRadius"])
                s["vx"] *= -0.08
                s["vy"] *= 0.2
                self.emit("net", {"team": s["lastTeam"], "x": round2(s["x"]), "y": round2(s["y"])})
                return

        s["x"] = nx
        s["y"] = ny

        if s["x"] < -0.15 or s["x"] > RULES["courtLength"] + 0.15:
            s["alive"] = False
            s["vx"] = 0.0
            s["vy"] = 0.0
            self.pendingLanding = {"x": s["x"], "y": s["y"], "out": True}
            return
        if s["y"] <= RULES["shuttleRadius"]:
            s["y"] = RULES["shuttleRadius"]
            s["alive"] = False
            s["vx"] = 0.0
            s["vy"] = 0.0
            self.pendingLanding = {"x": s["x"], "y": 0.0}

    # ---- shot solving --------------------------------------------------
    @staticmethod
    def flight_landing(x, y, vx, vy):
        dt = SUB
        t = 0.0
        while t < 5.0:
            sp = math.hypot(vx, vy)
            vx -= vx * RULES["shuttleDrag"] * sp * dt
            vy -= vy * RULES["shuttleDrag"] * sp * dt
            vy -= RULES["gravity"] * dt
            x += vx * dt
            y += vy * dt
            if y > RULES["ceiling"]:
                y = RULES["ceiling"]
                vy = -abs(vy) * 0.25
            if y <= RULES["shuttleRadius"]:
                return x
            if x < -0.5 or x > RULES["courtLength"] + 0.5:
                return x
            t += dt
        return x

    @staticmethod
    def solve_speed(x0, y0, angle, dir_, target_x):
        lo, hi = 5.0, 34.0
        for _ in range(14):
            mid = (lo + hi) / 2.0
            land = Match.flight_landing(x0, y0, dir_ * mid * math.cos(angle), mid * math.sin(angle))
            if (land - target_x) * dir_ < 0:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2.0

    @staticmethod
    def shot_trace(x0, y0, angle, speed, dir_, net_h=None):
        if net_h is None:
            net_h = RULES["netHeight"]
        x, y = x0, y0
        vx = dir_ * speed * math.cos(angle)
        vy = speed * math.sin(angle)
        dt = SUB
        net_y = None
        t = 0.0
        while t < 5.0:
            sp = math.hypot(vx, vy)
            vx -= vx * RULES["shuttleDrag"] * sp * dt
            vy -= vy * RULES["shuttleDrag"] * sp * dt
            vy -= RULES["gravity"] * dt
            px, py = x, y
            x += vx * dt
            y += vy * dt
            if net_y is None and (px - RULES["netX"]) * (x - RULES["netX"]) <= 0 and abs(x - px) > 1e-9:
                f = (RULES["netX"] - px) / (x - px)
                net_y = py + (y - py) * f
            if y > RULES["ceiling"]:
                y = RULES["ceiling"]
                vy = -abs(vy) * 0.25
            net_hit = net_y is not None and net_y < net_h + RULES["shuttleRadius"] + 0.03
            if y <= RULES["shuttleRadius"]:
                return {"netY": net_y, "landX": x, "netHit": net_hit}
            if x < -0.2 or x > RULES["courtLength"] + 0.2:
                return {"netY": net_y, "landX": x, "netHit": net_hit}
            t += dt
        net_hit = net_y is not None and net_y < net_h + RULES["shuttleRadius"] + 0.03
        return {"netY": net_y, "landX": x, "netHit": net_hit}

    @staticmethod
    def serve_launch(x0, y0, dir_, target, net_h=None):
        """Pick the serve angle/speed the engine will use (raised for high nets)."""
        if net_h is None:
            net_h = RULES["netHeight"]
        angle, speed = 0.72, 0.0
        for a in (0.72, 0.85, 1.0, 1.15, 1.3):
            angle = a
            speed = Match.solve_speed(x0, y0, a, dir_, target)
            tr = Match.shot_trace(x0, y0, a, speed, dir_, net_h)
            if not tr["netHit"]:
                break
        return angle, speed

    @staticmethod
    def choose_shot(x, y, dir_, kind, target, net_h=None):
        if net_h is None:
            net_h = RULES["netHeight"]
        ranges = {
            "smash": [-0.42, -0.30, -0.18, -0.06, 0.06, 0.16, 0.26, 0.34],
            "clear": [0.60, 0.72, 0.85],
            "drop": [0.42, 0.55, 0.68],
            "lift": [1.05, 1.20],
        }
        for angle in ranges[kind]:
            speed = Match.solve_speed(x, y, angle, dir_, target)
            tr = Match.shot_trace(x, y, angle, speed, dir_, net_h)
            if not tr["netHit"] and -0.05 < tr["landX"] < RULES["courtLength"] + 0.05:
                return angle, speed
        angle = 0.30 if kind == "smash" else (0.75 if kind == "clear" else (0.60 if kind == "drop" else 1.15))
        return angle, Match.solve_speed(x, y, angle, dir_, target)

    @staticmethod
    def shot_kind_and_target(sx, sy, swing_type, facing, opp_x):
        """Replicates the kind/target selection inside strike()."""
        dir_ = facing
        if swing_type > 0:
            t = clamp((sy - SHOT["clearHeight"]) / (SHOT["smashHeight"] - SHOT["clearHeight"]), 0.0, 1.0)
            dist_net = abs(sx - RULES["netX"])
            near = clamp(1.0 - (dist_net - 3.2) / 2.5, 0.0, 1.0)
            smash = t * near
            opp_deep = abs(opp_x - RULES["netX"]) > 3.0
            if smash > 0.55:
                kind = "smash"
                short_x = RULES["netX"] + dir_ * 1.6
                deep_x = RULES["courtLength"] - 1.0 if dir_ > 0 else 1.0
                target = short_x if abs(short_x - opp_x) >= abs(deep_x - opp_x) else deep_x
            elif t > 0.5 and opp_deep and dist_net > 2.6:
                kind = "drop"
                target = RULES["netX"] + dir_ * 2.7
            else:
                kind = "clear"
                target = 11.9 if dir_ > 0 else RULES["courtLength"] - 11.9
        else:
            kind = "lift"
            target = 11.4 if dir_ > 0 else RULES["courtLength"] - 11.4
        return kind, target

    # ---- strike / hit --------------------------------------------------
    def strike(self, p, sx, sy):
        s = self.shuttle
        forward = clamp((p["held"].get("move", 0) or 0) * p["facing"], 0.0, 1.0)
        opp = self.batsmen[1 - p["team"]]
        kind, target = self.shot_kind_and_target(sx, sy, p["swingType"], p["facing"], opp["x"])
        target += p["facing"] * forward * 0.6
        angle, speed = self.choose_shot(sx, sy, p["facing"], kind, target, self.netHeight)
        speed *= 1.0 + RULES["chargeBoost"] * p["charge"]
        p["charge"] = 0.0
        s["vx"] = p["facing"] * speed * math.cos(angle)
        s["vy"] = speed * math.sin(angle)
        s["x"] = sx
        s["y"] = sy
        s["lastTeam"] = p["team"]
        s["owner"] = p["id"]
        s["lastHitFrame"] = self.frame
        s["trail"] = []
        p["lastHitFrame"] = self.frame
        p["hits"] += 1
        self.rally += 1
        self.longestRally = max(self.longestRally, self.rally)
        self.emit("hit", {"team": p["team"], "kind": kind, "x": round2(sx),
                          "y": round2(sy), "speed": round2(speed)})

    def try_hit(self, p, sx, sy):
        if not self.in_swing_window(p):
            return False
        if self.frame - p["lastHitFrame"] < RULES["hitLock"] * RULES["hz"]:
            return False
        s = self.shuttle
        if not s["alive"]:
            return False
        if p["team"] == 0 and s["x"] > RULES["netX"] + 0.3:
            return False
        if p["team"] == 1 and s["x"] < RULES["netX"] - 0.3:
            return False
        rx, ry = self.racket_at(p, p["swingElapsed"], p["swingType"])
        reach = RULES["reachRadius"] * (0.82 + 0.18 * p["stamina"] / 100.0)
        if math.hypot(sx - rx, sy - ry) > reach:
            return False
        self.strike(p, sx, sy)
        return True

    # ---- point ---------------------------------------------------------
    def resolve_point(self):
        land = self.pendingLanding
        if not land:
            return
        self.pendingLanding = None
        s = self.shuttle
        last = 0 if s["lastTeam"] is None else s["lastTeam"]
        if land.get("out"):
            winner = 1 - last
            reason = "出界"
        else:
            side = 0 if land["x"] < RULES["netX"] else 1
            winner = 1 - last if side == last else last
            reason = "落在自己半场" if side == last else "落在对方半场"
        self.score[winner] += 1
        self.batsmen[winner]["points"] += 1
        self.server = winner
        self.lastPoint = {"winner": winner, "reason": reason, "rally": self.rally,
                          "x": round2(land["x"]), "out": bool(land.get("out"))}
        self.emit("point", {"team": winner, "score": list(self.score), "reason": reason,
                            "rally": self.rally, "x": round2(land["x"])})
        a, b = self.score
        hi, lo = max(a, b), min(a, b)
        if (hi >= RULES["matchPoints"] and hi - lo >= RULES["winBy"]) or hi >= RULES["maxPoints"]:
            self.finish(0 if a > b else 1, "比分 %d:%d" % (a, b))
            return
        self.phase = "point"
        self.pointTimer = js_round(RULES["pointFreeze"] * RULES["hz"])

    def finish(self, winner, reason):
        if self.status == "finished":
            return
        self.status = "finished"
        self.phase = "finished"
        self.winner = winner
        self.reason = reason
        self.emit("finish", {"team": winner, "reason": reason, "score": list(self.score)})

    # ---- main step -----------------------------------------------------
    def step(self):
        if self.status != "playing":
            return
        self.frame += 1
        self.tick += 1

        if self.phase == "serve":
            self.serveTimer -= 1
            if self.serveTimer <= 0:
                p = self.batsmen[self.server]
                target = RULES["netX"] + p["facing"] * SERVE["targetFromNet"]
                angle, speed = self.serve_launch(self.shuttle["x"], self.shuttle["y"],
                                                 p["facing"], target, self.netHeight)
                self.shuttle["vx"] = p["facing"] * speed * math.cos(angle)
                self.shuttle["vy"] = speed * math.sin(angle)
                self.shuttle["lastTeam"] = self.server
                self.shuttle["lastHitFrame"] = self.frame
                self.phase = "rally"
                self.emit("serve", {"team": self.server})

        for p in self.batsmen:
            self.update_player(p)

        if self.phase == "rally":
            s = self.shuttle
            for _ in range(RULES["substeps"]):
                self.step_shuttle(SUB)
                for p in self.batsmen:
                    if self.try_hit(p, s["x"], s["y"]):
                        break
                if not s["alive"] or self.pendingLanding:
                    break
            if s["alive"]:
                s["trail"].append({"x": round2(s["x"]), "y": round2(s["y"])})
                if len(s["trail"]) > 14:
                    s["trail"].pop(0)
            if self.pendingLanding:
                self.resolve_point()
        elif self.phase == "point":
            self.pointTimer -= 1
            if self.pointTimer <= 0:
                self.begin_serve()

        if self.status == "playing" and self.frame >= RULES["matchSeconds"] * RULES["hz"]:
            a, b = self.score
            if a == b:
                self.finish(None, "时间到，%d:%d 平局" % (a, b))
            else:
                self.finish(0 if a > b else 1, "时间到，%d:%d" % (max(a, b), min(a, b)))

    # ---- observation ---------------------------------------------------
    def public_player(self, p):
        return {
            "id": p["id"], "team": p["team"], "index": p["index"], "name": p["name"],
            "x": round2(p["x"]), "y": round2(p["y"]), "vx": round2(p["vx"]), "vy": round2(p["vy"]),
            "onGround": p["onGround"], "facing": p["facing"], "sprinting": bool(p["sprinting"]),
            "swing": p["swing"], "swingElapsed": p["swingElapsed"], "swingType": p["swingType"],
            "swinging": self.in_swing_window(p),
            "swingCd": round2(max(0.0, p["swingCd"])),
            "stamina": round2(p["stamina"]), "charge": round2(p["charge"]),
            "hits": p["hits"], "smashes": p["smashes"], "points": p["points"],
        }

    def view(self, viewer=None):
        s = self.shuttle
        return {
            "id": self.id, "seed": self.seed, "tick": self.tick, "frame": self.frame,
            "status": self.status, "phase": self.phase, "winner": self.winner,
            "reason": self.reason, "yourPlayer": viewer,
            "players": [dict(p) for p in self.players],
            "score": list(self.score), "server": self.server,
            "serveLeft": round2(max(0.0, self.serveTimer / RULES["hz"])),
            "pointLeft": round2(max(0.0, self.pointTimer / RULES["hz"])),
            "rally": self.rally, "longestRally": self.longestRally,
            "lastPoint": self.lastPoint,
            "timeLeft": round2(max(0.0, RULES["matchSeconds"] - self.frame / RULES["hz"])),
            "batsmen": [self.public_player(p) for p in self.batsmen],
            "shuttle": None if s is None else {
                "x": round2(s["x"]), "y": round2(s["y"]), "vx": round2(s["vx"]),
                "vy": round2(s["vy"]), "alive": s["alive"], "lastTeam": s["lastTeam"],
                "owner": s["owner"], "trail": s["trail"][-14:],
            },
            "court": {"length": RULES["courtLength"], "netX": RULES["netX"],
                      "netHeight": self.netHeight, "ceiling": RULES["ceiling"]},
            "rules": dict(RULES),
            "events": self.events[-60:],
        }


def normalize_unit_input(inp):
    out = neutral()
    if inp is None:
        return out
    if not isinstance(inp, dict):
        raise ValueError("input must be an object")
    if inp.get("move") is not None:
        v = float(inp["move"])
        if v != v or v in (float("inf"), float("-inf")):
            raise ValueError("bad move")
        out["move"] = clamp(v, -1.0, 1.0)
    out["jump"] = bool(inp.get("jump"))
    out["charge"] = bool(inp.get("charge"))
    out["sprint"] = bool(inp.get("sprint"))
    if inp.get("swing") is not None:
        sw = inp["swing"]
        if isinstance(sw, bool):
            out["swing"] = 1 if sw else 0
        else:
            v = float(sw)
            out["swing"] = 1 if v > 0.1 else (-1 if v < -0.1 else 0)
    return out


def normalize_frame(frame):
    if isinstance(frame, list):
        if len(frame) != 1:
            raise ValueError("each frame must hold exactly 1 player")
        return [normalize_unit_input(frame[0])]
    return [normalize_unit_input(frame)]


def advance_window(g, windows):
    steps = 0
    for i in range(RULES["decisionFrames"]):
        if g.status != "playing":
            break
        for b in g.batsmen:
            win = windows[b["team"]] if b["team"] < len(windows) else None
            frame = win[i] if win and i < len(win) else None
            b["held"] = (frame[0] if frame else neutral())
        g.step()
        steps += 1
    return steps


def run_match(agent0, agent1, seed=1, match_id="test", max_windows=2000, on_window=None):
    g = Match(seed=seed, match_id=match_id)
    w = 0
    while g.status == "playing" and w < max_windows:
        o0 = g.view(0)
        o1 = g.view(1)
        w0 = agent0.act(o0)
        w1 = agent1.act(o1)
        win0 = [normalize_frame(f) for f in w0]
        win1 = [normalize_frame(f) for f in w1]
        advance_window(g, [win0, win1])
        w += 1
        if on_window:
            on_window(g, w)
    return g
