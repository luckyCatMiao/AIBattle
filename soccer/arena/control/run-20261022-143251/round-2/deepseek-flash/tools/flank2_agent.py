#!/usr/bin/env python3
"""Tooling prototype: agent.py's defence + a two-man flank attack.

The base decision (defence, keeper, loose balls) comes from agent.decide_frame.
Only the possession phase is overridden: one field player makes a run to the
attacking corner (outside the penalty box), the carrier passes to him when the
lane is open, and once there the winger shoots into the mouth.
"""
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent as A


def attack_corner(team, side):
    """Attacking corner near the goal line, outside the opponent box."""
    gx = A.attack_goal_x(team)
    att = 1.0 if team == 0 else -1.0
    return gx - att * 1.0, 3.0 if side < 0 else 23.0


def decide(w, team, n, boxes):
    out = A.decide_frame(w, team, n, boxes)
    if n < 2:
        return out
    mine = [u for u in w.units if u['team'] == team]
    foes = [u for u in w.units if u['team'] != team]
    b = w.ball
    owner = None
    for u in mine:
        if u['id'] == b['owner']:
            owner = u
    keeper = mine[0]
    field = [u for u in mine if u['index'] != 0]
    if owner is None or owner is keeper or owner not in field:
        return out
    att = 1.0 if team == 0 else -1.0
    gx = A.attack_goal_x(team)

    # choose the winger: closest field player other than the carrier to a corner
    cands = []
    for f in field:
        if f is owner:
            continue
        for side in (-1, 1):
            cx, cy = attack_corner(team, side)
            cands.append((math.hypot(f['x'] - cx, f['y'] - cy), f, side, (cx, cy)))
    cands.sort(key=lambda t: t[0])
    winger = cands[0][1] if cands else None
    corner = (cands[0][2], cands[0][3]) if cands else None

    # winger run
    if winger is not None:
        side, (cx, cy) = corner
        # once at the corner, hold near the flag on the flank
        tx, ty = cx, cy
        if abs(winger['y'] - cy) < 2.5 and att * (winger['x'] - (gx - att * 6.0)) > 0:
            ty = cy
        tx, ty = A.safe_target(team, tx, ty, boxes, A.BOX_MARGIN)
        out[winger['index']] = {'dir': A.go_to_dir(w, winger, (tx, ty), team, boxes),
                                'aim': None, 'kick': False}

    # carrier: pass to the corner if the winger is close enough and the lane is clear
    dgoal = math.hypot(gx - b['x'], 13.0 - b['y'])
    best = None
    if winger is not None:
        side, _ = corner
        cx, cy = attack_corner(team, side)
        # lead the pass slightly toward the corner
        for tx, ty in ((cx, cy), (cx - att * 4.0, cy)):
            c = A.path_clearance(b['x'], b['y'], tx, ty, foes, 0.85)
            gain = att * (tx - b['x'])
            if gain < 3.0:
                continue
            val = c + 0.05 * gain
            if best is None or val > best[0]:
                best = (val, c, tx, ty)
    if best is not None and best[1] > 0.15:
        val, c, tx, ty = best
        ang = A.angle_deg(tx - b['x'], ty - b['y'])
        out[owner['index']] = {'dir': 'N', 'aim': ang, 'kick': True}
    # otherwise keep the base decision for the carrier (shoot / pass / dribble)

    # if the winger owns the ball near the corner, shoot at the mouth
    if owner is winger:
        near = att * (b['x'] - (gx - att * 3.0)) > 0.0
        flank = b['y'] < 6.5 or b['y'] > 19.5
        if near and flank:
            sx, sy, sc = A.best_shot(w, owner['id'], team, w.units)
            # pick the target farthest from the enemy keeper
            kp = None
            for o in foes:
                if o['index'] == 0:
                    kp = o
            bestt, bestv = (sx, sy), -1e9
            for ty2 in (10.6, 11.3, 12.1, 13.0, 13.9, 14.7, 15.4):
                c = A.path_clearance(b['x'], b['y'], gx, ty2, foes, 1.0)
                if kp is not None:
                    c += 0.45 * min(3.0, math.hypot(kp['x'] - gx, kp['y'] - ty2))
                if c > bestv:
                    bestv, bestt = c, (gx, ty2)
            ang = A.angle_deg(bestt[0] - b['x'], bestt[1] - b['y'])
            out[owner['index']] = {'dir': 'N', 'aim': ang, 'kick': True}
    return out


def compute_window(obs):
    n = int(obs.get('teamSize', 3))
    my_team = int(obs.get('yourTeam', 0))
    if obs.get('status') != 'playing':
        return A.neutral_window(n)
    try:
        w, boxes = A.build_world(obs)
    except Exception:
        return A.neutral_window(n)
    frames = []
    goal_hit = False
    for fi in range(20):
        if goal_hit:
            frames.append([{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)])
            continue
        try:
            our = decide(w, my_team, n, boxes)
        except Exception:
            our = [{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)]
        for u in w.units:
            if u['team'] == my_team:
                u['held'] = our[u['index']]
            else:
                u['held'] = {'dir': 'N', 'aim': None, 'kick': False}
        A.step(w, boxes)
        if w.goal_scored is not None:
            goal_hit = True
        frames.append(our)
    for fr in frames:
        for inp in fr:
            a = inp.get('aim')
            if isinstance(a, (int, float)) and math.isfinite(a):
                inp['aim'] = round(float(a) % 360.0, 2)
            elif a is not None:
                inp['aim'] = None
            if inp.get('dir') not in A.DIRS:
                inp['dir'] = 'N'
            inp['kick'] = bool(inp.get('kick', False))
    return frames


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
        except Exception:
            continue
        try:
            win = compute_window(obs)
        except Exception:
            win = A.neutral_window(int(obs.get('teamSize', 3)) if isinstance(obs, dict) else 3)
        sys.stdout.write(json.dumps({'inputs': win}, separators=(',', ':')) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
