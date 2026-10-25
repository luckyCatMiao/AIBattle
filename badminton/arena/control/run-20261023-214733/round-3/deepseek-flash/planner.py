"""Planning core for the badminton agent (offline development version).

Depends on engine_py for the exact physics. At submission time this module is
bundled with engine_py into a single self-contained agent.py.
"""
import math
import os

import engine_py as E

R = E.RULES
DT = E.DT
SUB = E.SUB
# Sprint only above this stamina: below it the 1.45x multiplier is small while
# the 26/s drain is not, so sprinting mostly just empties the tank.
SPRINT_MIN_STAMINA = float(os.environ.get("BAD_SPRINT_MIN", "18"))
# Wait-then-dash servo: idle while the target is still reachable at free speed.
SERVO_DELAY = os.environ.get("BAD_SERVO_DELAY", "0") != "0"
# Reach model: exact kinematics instead of max-speed + ramp + 0.55 fudge.
REACH_V2 = os.environ.get("BAD_REACH_V2", "0") != "0"


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


# --------------------------------------------------------------------------
# Racket geometry
# --------------------------------------------------------------------------
def racket_offsets(elapsed, swtype):
    frac = clamp(elapsed / float(R["swingFrames"]), 0.0, 1.0)
    arc = E.OVERHEAD if swtype > 0 else E.UNDERARM
    up = arc["fromUp"] + (arc["toUp"] - arc["fromUp"]) * frac
    fwd = arc["fromFwd"] + (arc["toFwd"] - arc["fromFwd"]) * frac
    return up, fwd


def reach_of(stamina):
    return R["reachRadius"] * (0.82 + 0.18 * stamina / 100.0)


def max_speed_of(stamina):
    return R["playerSpeed"] * (0.62 + 0.38 * stamina / 100.0)


# Feet height on frames 1..8 after a jump (engine Euler integration: vy=5.3,
# gravity 22, position updated after the gravity step).  Apex 0.51 at frame 4.
JUMP_Y = (0.21, 0.365, 0.465, 0.51, 0.50, 0.435, 0.315, 0.14)


def jump_frame_for(py_req, t, tol=0.11):
    """Jump frame (1-based in the window) putting the feet at py_req on frame t.

    Returns (jump_frame, residual) or None when no frame fits within tol.
    """
    best = None
    for n, y in enumerate(JUMP_Y, start=1):
        jf = t - n
        if jf < 1:
            continue
        d = abs(y - py_req)
        if best is None or d < best[0]:
            best = (d, jf)
    if best is None or best[0] > tol:
        return None
    return best[1], best[0]


# --------------------------------------------------------------------------
# Shuttle prediction
# --------------------------------------------------------------------------
def shuttle_step(state, dt, net=True):
    """Advance a shuttle dict by dt. Returns 'net' if it hit the net."""
    x, y, vx, vy = state["x"], state["y"], state["vx"], state["vy"]
    sp = math.hypot(vx, vy)
    drag = R["shuttleDrag"] * sp
    vx -= vx * drag * dt
    vy -= vy * drag * dt
    vy -= R["gravity"] * dt
    prev_x, prev_y = x, y
    nx = x + vx * dt
    ny = y + vy * dt
    if ny > R["ceiling"]:
        ny = R["ceiling"]
        vy = -abs(vy) * 0.25
    if net:
        crossed = (prev_x - R["netX"]) * (nx - R["netX"]) < 0
        if crossed:
            y_at_net = min(prev_y, ny)
            if y_at_net < R["netHeight"] + R["shuttleRadius"]:
                x = R["netX"] - E.sign(vx) * (R["netThickness"] + R["shuttleRadius"])
                vx *= -0.08
                vy *= 0.2
                state.update(x=x, y=y, vx=vx, vy=vy, alive=True)
                return "net"
    x, y = nx, ny
    landed = False
    if x < -0.15 or x > R["courtLength"] + 0.15:
        landed = True
        state.update(x=x, y=y, vx=0.0, vy=0.0, alive=False)
        return "out"
    if y <= R["shuttleRadius"]:
        y = R["shuttleRadius"]
        landed = True
        state.update(x=x, y=y, vx=0.0, vy=0.0, alive=False)
        return "land"
    state.update(x=x, y=y, vx=vx, vy=vy, alive=True)
    return None


def predict_shuttle(shuttle, nframes):
    """Predict the shuttle for nframes frames.

    Returns list of length nframes+1; entry f is the list of substep samples
    (x, y, alive) taken during frame f (index 0 = current state, empty list).
    """
    st = {k: shuttle[k] for k in ("x", "y", "vx", "vy", "alive")}
    out = [[(st["x"], st["y"], st["alive"])]]
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
            # pad remaining frames
            for _ in range(nframes - f):
                out.append([(st["x"], st["y"], False)])
            break
    while len(out) < nframes + 1:
        out.append([(st["x"], st["y"], False)])
    return out


def predict_serve(shuttle, release_in_frames, server_facing, nframes):
    """Predict a serve from the frozen shuttle state until nframes frames.

    release_in_frames: how many frames until the serve leaves the server's
    racket (0 or negative means it has already been released).
    """
    st = {k: shuttle[k] for k in ("x", "y", "vx", "vy", "alive")}
    out = [[(st["x"], st["y"], st["alive"])]]
    target = R["netX"] + server_facing * E.SERVE["targetFromNet"]
    release = max(1, int(release_in_frames))
    for f in range(1, nframes + 1):
        if f < release:
            # frozen on the server's racket
            out.append([(st["x"], st["y"], st["alive"])])
            continue
        if f == release:
            angle, speed = E.Match.serve_launch(st["x"], st["y"], server_facing, target,
                                                R["netHeight"])
            st["vx"] = server_facing * speed * math.cos(angle)
            st["vy"] = speed * math.sin(angle)
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


# --------------------------------------------------------------------------
# Player simulation
# --------------------------------------------------------------------------
def player_state_from_obs(b, team):
    p = E.make_player(team, "me")
    for k in ("x", "y", "vx", "vy", "onGround", "facing", "swing", "swingElapsed",
              "swingType", "swingCd", "stamina", "charge"):
        if k in b:
            p[k] = b[k]
    p["stamina"] = float(b.get("stamina", 100.0))
    p["charge"] = float(b.get("charge", 0.0))
    p["lastHitFrame"] = -999
    return p


class DummyMatch:
    """Minimal host object so we can reuse Match.update_player."""
    def __init__(self):
        self.frame = 0
        self.events = []
        self.event_id = 0
        self.batsmen = []
        self.shuttle = None
        self.pendingLanding = None

    def emit(self, *a, **k):
        pass


def sim_player(p, inputs, nframes):
    """Simulate a player for nframes with the given per-frame input dicts.

    Returns a list of snapshots (dicts) per frame, index 0 = start state.
    """
    host = DummyMatch()
    q = {k: (dict(v) if isinstance(v, dict) else v) for k, v in p.items()}
    traj = [dict(q)]
    for i in range(nframes):
        q["held"] = inputs[i] if i < len(inputs) else E.neutral()
        E.Match.update_player(host, q)
        traj.append(dict(q))
    return traj


def servo_inputs(p, target_x, at_frame, jump_at=None, nframes=None, hold_after=False,
                 allow_sprint=True):
    """Produce per-frame inputs that bring the player to target_x at at_frame.

    Stamina note: the engine only regenerates when |vx| < 0.8, and creeping at
    1-3 grid/s sits in a dead zone that neither drains nor regenerates.  When
    the distance can still be covered at the free speed (just under the 3.2
    run-drain threshold) after waiting one more frame, wait: the idle frame
    banks 6 stamina/s and the later dash stays under the drain threshold.
    """
    if nframes is None:
        nframes = max(at_frame, 1)
    p0 = p
    inputs = []
    free_speed = 3.10
    for i in range(nframes):
        f = i + 1
        left = at_frame - i
        dx = target_x - p0["x"]
        base = max_speed_of(p0["stamina"])
        can_sprint = (allow_sprint and p0["stamina"] > SPRINT_MIN_STAMINA
                      and p0["onGround"])
        top = base * (R["sprintMultiplier"] if can_sprint else 1.0)
        if left > 0:
            if not SERVO_DELAY:
                v_des = clamp(dx / (left * DT), -top, top)
                v_req = v_des
            else:
                v_req = dx / (left * DT)
                if abs(v_req) > free_speed:
                    # Deadline is too tight for the free speed: go now.
                    v_des = clamp(v_req, -top, top)
                elif (abs(dx) <= 1.0 and left > 1
                        and abs(dx) + 0.45 <= free_speed * (left - 1) * DT):
                    # Can still make it after one idle frame: stop and coast.
                    v_des = 0.0
                elif 0.30 < abs(dx) <= 1.0:
                    # Dash at the free speed so the surplus frames are spent
                    # standing still (regenerating) instead of creeping.
                    v_des = free_speed if dx > 0 else -free_speed
                else:
                    v_des = v_req
        else:
            v_des = 0.0
        sprint = abs(v_des) > base + 0.03
        denom = base * (R["sprintMultiplier"] if sprint else 1.0)
        mv = clamp(v_des / denom, -1.0, 1.0) if denom > 1e-6 else 0.0
        if hold_after and f > at_frame:
            mv = 0.0
            sprint = False
        inp = {"move": mv, "sprint": sprint}
        if jump_at is not None and f == jump_at:
            inp["jump"] = True
        inputs.append(inp)
        # advance a copy to keep the servo state current
        q = dict(p0)
        q["held"] = inp
        E.Match.update_player(DummyMatch(), q)
        p0 = q
    return inputs


def reach_at(p, frames):
    """Fastest forward/backward reachable x after `frames` frames."""
    fwd = servo_inputs(p, 100.0, frames)
    back = servo_inputs(p, -100.0, frames)
    tf = sim_player(p, fwd, frames)
    tb = sim_player(p, back, frames)
    return tf[-1]["x"], tb[-1]["x"]


def plan_control(p, target_x, at_frame, nframes, jump_at=None, hold_after=True,
                 allow_sprint=True):
    """Servo to target_x at at_frame, with one correction pass, then verification."""
    inputs = servo_inputs(p, target_x, at_frame, jump_at, nframes, hold_after,
                          allow_sprint=allow_sprint)
    for _ in range(2):
        traj = sim_player(p, inputs, nframes)
        if at_frame >= len(traj):
            break
        actual = traj[at_frame]["x"]
        err = target_x - actual
        if abs(err) < 0.005:
            break
        target_x2 = target_x + err
        inputs = servo_inputs(p, target_x2, at_frame, jump_at, nframes, hold_after,
                              allow_sprint=allow_sprint)
        target_x = target_x2
    return inputs


# --------------------------------------------------------------------------
# Shot evaluation
# --------------------------------------------------------------------------
def shot_from_contact(sx, sy, swtype, facing, opp_x, charge=0.0, forward=0.0):
    kind, target = E.Match.shot_kind_and_target(sx, sy, swtype, facing, opp_x)
    target += facing * clamp(forward, 0.0, 1.0) * 0.6
    angle, speed = E.Match.choose_shot(sx, sy, facing, kind, target)
    speed *= 1.0 + R["chargeBoost"] * charge
    return {"kind": kind, "target": target, "angle": angle, "speed": speed}


def simulate_shot(sx, sy, shot, facing, nframes=60):
    """Full flight samples of a struck shuttle: list of (frame, x, y)."""
    st = {"x": sx, "y": sy,
          "vx": facing * shot["speed"] * math.cos(shot["angle"]),
          "vy": shot["speed"] * math.sin(shot["angle"]),
          "alive": True}
    out = []
    for f in range(1, nframes + 1):
        for _ in range(R["substeps"]):
            if not st["alive"]:
                break
            res = shuttle_step(st, SUB)
            if res in ("land", "out"):
                break
        out.append((f, st["x"], st["y"]))
        if not st["alive"]:
            break
    return out


def opponent_can_reach(traj, opp_x, opp_stamina, team_of_opp, extra_move=0.0):
    """Rough check whether the opponent can intercept the shot before it lands.

    The old model added a full acceleration ramp *on top* of max-speed travel
    and a 0.55 grid fudge on top of the racket reach, which made almost every
    shot look reachable: a 34 grid/s smash landing 1.4 away in 0.2 s was
    scored the same as a 15 grid/s floater.  Use the kinematics of a player
    starting from rest and only the racket reach as slack.
    """
    maxs = max_speed_of(opp_stamina)
    reach = reach_of(opp_stamina)
    t_acc = maxs / R["playerAccel"] if R["playerAccel"] > 0 else 0.0
    for (f, x, y) in traj:
        t = f * DT
        # ball must be on the opponent's side to be hittable
        if team_of_opp == 0 and x > R["netX"] + 0.3:
            continue
        if team_of_opp == 1 and x < R["netX"] - 0.3:
            continue
        if y > 2.35 or y < 0.05:
            continue
        # distance covered from rest in t seconds
        if REACH_V2:
            if t <= t_acc:
                travel = 0.5 * R["playerAccel"] * t * t
            else:
                travel = (0.5 * R["playerAccel"] * t_acc * t_acc
                          + maxs * (t - t_acc))
            margin = 0.12
        else:
            travel = maxs * t + 0.5 * R["playerAccel"] * min(t, t_acc) ** 2
            margin = 0.55
        d = abs(x - opp_x)
        if d <= travel + reach + margin + extra_move:
            return True, f
    return False, None


# --------------------------------------------------------------------------
# Interception planning
# --------------------------------------------------------------------------
def best_contacts(ball_pred, team, p, opp, horizon, stamina_hint=None):
    """Enumerate candidate (frame, elapsed, swtype) contacts for the player.

    Returns a list of dicts sorted by (score desc).
    """
    facing = p["facing"]
    st = stamina_hint if stamina_hint is not None else p["stamina"]
    reach = reach_of(st)
    cands = []
    for t in range(1, min(horizon, len(ball_pred) - 1) + 1):
        samples = [s for s in ball_pred[t] if s[2]]
        if not samples:
            continue
        for swtype in (1, -1):
            for e in range(R["swingWindup"], R["swingWindup"] + R["swingActive"]):
                up, fwd = racket_offsets(e, swtype)
                best = None
                for (bx, by, alive) in samples:
                    if team == 0 and bx > R["netX"] + 0.3:
                        continue
                    if team == 1 and bx < R["netX"] - 0.3:
                        continue
                    # feet height: assume ground unless already airborne
                    py = p["y"]
                    dy = by - (py + up)
                    if abs(dy) > reach:
                        continue
                    half = math.sqrt(max(0.0, reach * reach - dy * dy))
                    px = bx - facing * fwd
                    if best is None or half > best[2]:
                        best = (px, half, half)
                if best is None:
                    continue
                cands.append({"t": t, "e": e, "swtype": swtype, "px": best[0],
                              "margin": best[1]})
    return cands
