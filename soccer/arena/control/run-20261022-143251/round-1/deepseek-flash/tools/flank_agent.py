#!/usr/bin/env python3
"""Experimental flank-rush agent (tooling only, not the submission).

Reuses agent.py's physics clone through import and replaces the decision layer
with a simple strategy aimed at testing the near-post flank shot.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent as A

DIRS = A.DIRS


def corner_target(team, u, boxes):
    """Attacking corner next to the goal line, outside the opponent box."""
    att = 1.0 if team == 0 else -1.0
    gx = A.attack_goal_x(team)
    # pick the nearer flank, but if a foe is closer to that corner use the other
    ys = [3.2, 22.8]
    tx = gx - att * 1.2
    best, bd = None, 1e9
    for y in ys:
        d = math.hypot(tx - u['x'], y - u['y'])
        if d < bd:
            bd, best = d, (tx, y)
    return best


def shoot_aim(w, team, b, boxes):
    """Aim at the goal-mouth point that is hardest for the enemy keeper."""
    gx = A.attack_goal_x(team)
    others = [u for u in w.units if u['team'] != team]
    kp = None
    for o in others:
        if o['index'] == 0:
            kp = o
    best, bc = (gx, 13.0), -1e9
    for ty in (10.8, 11.4, 12.1, 13.0, 13.9, 14.6, 15.2):
        c = A.path_clearance(b['x'], b['y'], gx, ty, others, 0.95)
        # also want to be far from keeper
        if kp is not None:
            c += 0.5 * min(2.5, math.hypot(kp['x'] - gx, kp['y'] - ty))
        if c > bc:
            bc, best = c, (gx, ty)
    return best


def decide(w, team, n, boxes):
    mine = [u for u in w.units if u['team'] == team]
    foes = [u for u in w.units if u['team'] != team]
    b = w.ball
    out = [{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)]
    owner = b['owner']
    my_owner = None
    for u in mine:
        if u['id'] == owner:
            my_owner = u
    att = 1.0 if team == 0 else -1.0
    gx = A.attack_goal_x(team)
    ownx = A.own_goal_x(team)
    keeper = mine[0] if n >= 2 else None
    field = [u for u in mine if not (u['index'] == 0 and n >= 2)]

    # keeper: goal-line, mouth, collect loose balls near goal
    if keeper is not None and keeper is not my_owner:
        in_box = A.in_penalty_box(team, b['x'], b['y'], boxes)
        dgoal = math.hypot(b['x'] - ownx, b['y'] - 13.0)
        target = None
        if in_box or (owner is None and dgoal < 8.0):
            path = A.ball_path(w, 40)
            ipt = A.intercept_point(keeper, path) if path else (b['x'], b['y'])
            if ipt is not None and math.hypot(ipt[0] - ownx, ipt[1] - 13.0) < 14.0:
                target = A.safe_target(team, ipt[0], ipt[1], boxes, 0.7)
        if target is None:
            ky = A.clamp(b['y'], 11.0, 15.0)
            target = A.safe_target(team, ownx + att * 1.1, ky, boxes, 0.4)
        out[keeper['index']] = {'dir': A.go_to_dir(w, keeper, target, team, boxes),
                                'aim': None, 'kick': False}

    # keeper with ball: clear forward
    if keeper is not None and keeper is my_owner:
        tgt = A.kick_to_space_simple(w, keeper, team, field, foes, boxes)
        if tgt is not None:
            ang = A.angle_deg(tgt[0] - b['x'], tgt[1] - b['y'])
        else:
            ang = A.angle_deg(att, 0.0)
        out[keeper['index']] = {'dir': 'N', 'aim': ang, 'kick': True}

    # carrier action (field, or solo unit)
    carrier = my_owner if (my_owner is not None and (n == 1 or my_owner is not keeper)) else None
    if carrier is not None and carrier is not keeper:
        bx, by = b['x'], b['y']
        near_goal = att * (bx - (gx - att * 3.0)) > 0.0  # within 3 of goal line
        on_flank = by < 6.0 or by > 20.0
        dgoal = math.hypot(gx - bx, 13.0 - by)
        acted = False
        # point-blank flank shot, or any open shot in range
        if near_goal and on_flank:
            sx, sy = shoot_aim(w, team, b, boxes)
            out[carrier['index']] = {'dir': 'N',
                                     'aim': A.angle_deg(sx - bx, sy - by), 'kick': True}
            acted = True
        elif dgoal < 20.0:
            sx, sy, sc = A.best_shot(w, carrier['id'], team, w.units)
            if sc > 0.1:
                out[carrier['index']] = {'dir': 'N',
                                         'aim': A.angle_deg(sx - bx, sy - by), 'kick': True}
                acted = True
        if not acted:
            # if a foe is right on us, kick to space or past them
            nf = min(foes, key=lambda o: math.hypot(o['x'] - bx, o['y'] - by)) if foes else None
            dfoe = math.hypot(nf['x'] - bx, nf['y'] - by) if nf else 99.0
            if nf is not None and dfoe < 2.2:
                ang = A.solo_kick_aim(w, team, bx, by, foes, boxes)
                if ang is not None:
                    out[carrier['index']] = {'dir': 'N', 'aim': ang, 'kick': True}
                    acted = True
            if not acted:
                tx, ty = corner_target(team, carrier, boxes)
                # if already near the corner, press along the goal line
                if att * (bx - (gx - att * 2.5)) > 0.0:
                    ty = A.clamp(by, 2.5, 23.5)
                    tx = gx - att * 0.8
                out[carrier['index']] = {'dir': A.go_to_dir(w, carrier, (tx, ty), team, boxes),
                                         'aim': None, 'kick': False}

    # field players without ball
    for f in field:
        if f is carrier:
            continue
        if owner is not None and owner != f['id'] and my_owner is None:
            # opponent has the ball: nearest presses, others guard flanks/goal
            ranked = sorted(field, key=lambda u: math.hypot(u['x'] - b['x'], u['y'] - b['y']))
            if f is ranked[0]:
                ux, uy = A.normxy(ownx - b['x'], 13.0 - b['y'])
                target = (b['x'] + ux * 0.6, b['y'] + uy * 0.6)
            else:
                # guard the flank closest to the ball, goal side
                fy = 3.5 if b['y'] < 13.0 else 22.5
                target = (ownx + att * 1.5, fy)
            target = A.safe_target(team, target[0], target[1], boxes, 0.7)
            out[f['index']] = {'dir': A.go_to_dir(w, f, target, team, boxes),
                               'aim': None, 'kick': False}
        else:
            # loose ball: chase predicted intercept
            path = A.ball_path(w, 80)
            ipt = A.intercept_point(f, path) if path else (b['x'], b['y'])
            if ipt is None:
                ipt = (b['x'], b['y'])
            ipt = A.safe_target(team, ipt[0], ipt[1], boxes, 0.7)
            out[f['index']] = {'dir': A.go_to_dir(w, f, ipt, team, boxes),
                               'aim': None, 'kick': False}
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
        except Exception as e:
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
            if inp.get('dir') not in DIRS:
                inp['dir'] = 'N'
            inp['kick'] = bool(inp.get('kick', False))
    return frames


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = __import__('json').loads(line)
        except Exception:
            continue
        try:
            win = compute_window(obs)
        except Exception:
            win = A.neutral_window(int(obs.get('teamSize', 3)) if isinstance(obs, dict) else 3)
        sys.stdout.write(__import__('json').dumps({'inputs': win}, separators=(',', ':')) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
