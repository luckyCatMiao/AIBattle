import json
import math
import sys

DT = .05
SUB = .0125
KINDS = (1, -1)
JUMP_AGES = (-1, 2, 4, 6)
HOME = 3.05


def clamp(x, a, b):
    return max(a, min(b, x))


def landing(x, y, vx, vy):
    for _ in range(400):
        drag = .025 * math.hypot(vx, vy)
        vx *= 1 - drag * SUB
        vy = vy * (1 - drag * SUB) - 9.8 * SUB
        x += vx * SUB
        y += vy * SUB
        if y > 11:
            y, vy = 11, -abs(vy) * .25
        if y <= .07 or x < -.5 or x > 13.9:
            break
    return x


def flight_trace(x, y, vx, vy):
    net_y = actual_net_y = None
    for _ in range(400):
        drag = .025 * math.hypot(vx, vy)
        vx *= 1 - drag * SUB
        vy = vy * (1 - drag * SUB) - 9.8 * SUB
        nx, ny = x + vx * SUB, y + vy * SUB
        if net_y is None and (x - 6.7) * (nx - 6.7) <= 0 and abs(nx - x) > 1e-9:
            net_y = y + (ny - y) * (6.7 - x) / (nx - x)
            actual_net_y = min(y, ny)
        if ny > 11:
            ny, vy = 11, -abs(vy) * .25
        x, y = nx, ny
        if y <= .07 or x < -.2 or x > 13.6:
            break
    return x, net_y, actual_net_y


def solve_speed(x, y, angle, direction, target):
    lo, hi = 5, 34
    for _ in range(14):
        speed = (lo + hi) / 2
        end = landing(x, y, direction * speed * math.cos(angle), speed * math.sin(angle))
        if (end - target) * direction < 0:
            lo = speed
        else:
            hi = speed
    return (lo + hi) / 2


def serve_velocity(s, team, net_height):
    direction = 1 if team == 0 else -1
    target = 6.7 + direction * 3.2
    for angle in (.72, .85, 1.0, 1.15, 1.3):
        speed = solve_speed(s['x'], s['y'], angle, direction, target)
        vx, vy = direction * speed * math.cos(angle), speed * math.sin(angle)
        _, net_y, _ = flight_trace(s['x'], s['y'], vx, vy)
        if net_y is None or net_y >= net_height + .10:
            break
    return vx, vy


def trajectory(obs, horizon=45):
    s = obs['shuttle']
    x, y, vx, vy = [s[k] for k in ('x', 'y', 'vx', 'vy')]
    freeze = round(obs.get('serveLeft', 0) * 20) if obs['phase'] == 'serve' else 0
    if freeze:
        vx, vy = serve_velocity(s, obs['server'], obs['court']['netHeight'])
    result = []
    alive = s['alive']
    for frame in range(horizon):
        points = []
        if frame < freeze - 1:
            result.append(points)
            continue
        for _ in range(4):
            if not alive:
                break
            drag = .025 * math.hypot(vx, vy)
            vx *= 1 - drag * SUB
            vy = vy * (1 - drag * SUB) - 9.8 * SUB
            nx, ny = x + vx * SUB, y + vy * SUB
            if ny > 11:
                ny, vy = 11, -abs(vy) * .25
            if (x - 6.7) * (nx - 6.7) < 0 and min(y, ny) < obs['court']['netHeight'] + .07:
                x = 6.7 - (1 if vx > 0 else -1) * .16
                vx *= -.08
                vy *= .2
            else:
                x, y = nx, ny
            points.append((x, y))
            if y <= .07 or x < -.15 or x > 13.55:
                alive = False
        result.append(points)
    return result


def player_step(p, action):
    move = action.get('move', 0)
    sprint = action.get('sprint', False) and p['onGround'] and move != 0 and p['stamina'] > 5
    p['charge'] = max(0, p.get('charge', 0) - .3)
    speed = 3.7 * (.62 + .38 * p['stamina'] / 100) * (1 - .55 * p['charge']) * (1.45 if sprint else 1)
    accel = 1.3 if p['onGround'] else .455
    if move:
        p['vx'] += clamp(move * speed - p['vx'], -accel, accel)
    else:
        p['vx'] *= math.exp(-.6 if p['onGround'] else -.075)
    drain = (26 if sprint else 9 if abs(p['vx']) > 3.2 else 0)
    if drain:
        p['stamina'] = max(0, p['stamina'] - drain * DT)
    elif abs(p['vx']) < .8 and p['onGround']:
        p['stamina'] = min(100, p['stamina'] + .3)
    if action.get('jump') and p['onGround'] and p['stamina'] > 15:
        p['vy'], p['onGround'] = 5.3, False
        p['stamina'] -= 10
    if not p['onGround']:
        p['vy'] -= 1.1
    p['x'] = clamp(p['x'] + p['vx'] * DT, .35 if p['team'] == 0 else 7.05, 6.35 if p['team'] == 0 else 13.05)
    p['y'] += p['vy'] * DT
    if p['y'] <= 0:
        p['y'], p['vy'], p['onGround'] = 0, 0, True
    p['swingCd'] -= DT
    if p['swing'] > 0:
        p['swing'] -= 1
        p['swingElapsed'] += 1
    if action.get('swing') and p['swing'] == 0 and p['swingCd'] <= .000001:
        p['stamina'] = max(0, p['stamina'] - 7)
        p['swing'], p['swingElapsed'], p['swingType'], p['swingCd'] = 9, 0, action['swing'], .85


def move_to(p, target, sprint=False):
    error = target - p['x']
    speed = 3.7 * (.62 + .38 * p['stamina'] / 100)
    if sprint and p['onGround'] and p['stamina'] > 5:
        speed *= 1.45
    velocity = clamp(error / .09, -speed, speed)
    if not sprint:
        velocity = clamp(velocity, -3.12, 3.12)
    move = clamp(velocity / speed, -1, 1)
    if abs(error) < .035 and abs(p['vx']) < .3:
        move = 0
    return {'move': move, 'sprint': bool(sprint and abs(error) > .25), 'jump': False, 'swing': 0, 'charge': False}


def contact(p, pts):
    elapsed = p['swingElapsed']
    if p['swing'] <= 0 or elapsed < 2 or elapsed >= 7:
        return None
    frac = elapsed / 9
    if p['swingType'] > 0:
        up, fwd = 2.1 - .85 * frac, .05 + .75 * frac
    else:
        up, fwd = .28 + .94 * frac, .5 + .18 * frac
    rx, ry = p['x'] + p['facing'] * fwd, p['y'] + up
    radius = .38 * (.82 + .18 * p['stamina'] / 100)
    for x, y in pts:
        if (p['team'] == 0 and x > 7) or (p['team'] == 1 and x < 6.4):
            continue
        distance = math.hypot(x - rx, y - ry)
        if distance <= radius:
            return x, y, radius - distance
    return None


def shot_quality(x, y, kind, move, team, opp, net_height):
    direction = 1 if team == 0 else -1
    high = clamp((y - 1.8) / .55, 0, 1)
    near = clamp(1 - (abs(x - 6.7) - 3.2) / 2.5, 0, 1)
    if kind > 0 and high * near > .55:
        short, deep = 6.7 + direction * 1.6, 12.4 if team == 0 else 1.0
        target = short if abs(short - opp['x']) >= abs(deep - opp['x']) else deep
        angles, fallback = (-.42, -.30, -.18, -.06, .06, .16, .26, .34), .30
    elif kind > 0 and high > .5 and abs(opp['x'] - 6.7) > 3 and abs(x - 6.7) > 2.6:
        target = 6.7 + direction * 2.7
        angles, fallback = (.42, .55, .68), .60
    elif kind > 0:
        target = 11.9 if team == 0 else 1.5
        angles, fallback = (.60, .72, .85), .75
    else:
        target = 11.4 if team == 0 else 2.0
        angles, fallback = (1.05, 1.20), 1.15
    target += direction * clamp(move * direction, 0, 1) * .6
    for angle in angles:
        speed = solve_speed(x, y, angle, direction, target)
        end, net_y, actual_net_y = flight_trace(x, y, direction * speed * math.cos(angle), speed * math.sin(angle))
        if (net_y is None or net_y >= net_height + .10) and -.05 < end < 13.45:
            break
    else:
        angle = fallback
        speed = solve_speed(x, y, angle, direction, target)
        end, net_y, actual_net_y = flight_trace(x, y, direction * speed * math.cos(angle), speed * math.sin(angle))
    safe = actual_net_y is not None and actual_net_y >= net_height + .07 and (end - 6.7) * direction > 0 and -.05 < end < 13.45
    return 0 if safe else -40


def decide(obs, rescue=False):
    team = obs['yourPlayer']
    p0 = obs['batsmen'][team].copy()
    p0['team'], p0['facing'] = team, 1 if team == 0 else -1
    s = obs['shuttle']
    home = HOME if team == 0 else 13.4 - HOME
    if obs['phase'] not in ('serve', 'rally') or not s['alive']:
        return [{} for _ in range(10)]
    if s['lastTeam'] == team:
        p = p0.copy()
        actions = []
        for _ in range(10):
            a = move_to(p, home)
            player_step(p, a)
            actions.append(a)
        return actions
    path = trajectory(obs)
    # Leave clearly long incoming shots; the margin covers rounded observations.
    terminal = next((points[-1] for points in reversed(path) if points), None)
    if obs['phase'] == 'rally' and terminal and (terminal[0] < -.15 or terminal[0] > 13.55):
        end = landing(s['x'], s['y'], s['vx'], s['vy'])
        if end < -.4 or end > 13.8:
            return [{} for _ in range(10)]
    candidates = []
    # Sample intended impact frame, swing age, and ground/jump height.
    for t, points in enumerate(path):
        if not points or t < 1:
            continue
        sx, sy = points[1 if len(points) > 1 else 0]
        if not (.2 < sy < 2.85):
            continue
        if (team == 0 and sx > 7) or (team == 1 and sx < 6.4):
            continue
        for kind in KINDS:
            for elapsed in ((2, 3, 4, 5, 6) if rescue else (2, 4, 6)):
                start = t - elapsed
                existing = p0['swing'] > 0 and p0['swingElapsed'] + t + 1 == elapsed and p0['swingType'] == kind
                if not existing and (start < 0 or start * DT < p0['swingCd'] - DT - .005):
                    continue
                up = 2.1 - .85 * elapsed / 9 if kind == 1 else .28 + .94 * elapsed / 9
                fwd = .05 + .75 * elapsed / 9 if kind == 1 else .5 + .18 * elapsed / 9
                for jump_age in JUMP_AGES:
                    if jump_age >= 0 and (not p0['onGround'] or p0['stamina'] <= 25 or t < jump_age):
                        continue
                    jump_at = t - jump_age if jump_age >= 0 else -1
                    if jump_age >= 0:
                        height = sum((5.3 - 1.1 * (j + 1)) * DT for j in range(jump_age + 1))
                    elif p0['onGround']:
                        height = 0
                    else:
                        height = max(0, p0['y'] + p0['vy'] * DT * (t + 1) - .55 * DT * (t + 1) * (t + 2))
                    if abs(sy - up - height) > .37:
                        continue
                    goal = clamp(sx - p0['facing'] * fwd, .35 if team == 0 else 7.05, 6.35 if team == 0 else 13.05)
                    for sprint in (False, True):
                        if sprint and (p0['stamina'] < 30 or abs(goal - p0['x']) < .7):
                            continue
                        if abs(goal - p0['x']) > (t + 1) * DT * (5.37 if sprint else 3.7) + .45:
                            continue
                        for offset in ((-.20, 0, .20) if rescue else (0,)):
                            candidates.append((t, kind, start, jump_at, goal + offset, sprint))
    best_score, best_actions = -1e9, None
    choices = []
    for t, kind, start, jump_at, goal, sprint in candidates:
        p = p0.copy()
        actions = []
        for frame in range(min(t + 2, len(path))):
            a = move_to(p, goal, sprint)
            a['jump'] = frame == jump_at
            a['swing'] = kind if frame == start else 0
            player_step(p, a)
            actions.append(a)
            hit = contact(p, path[frame])
            if hit:
                x, y, margin = hit
                high = clamp((y - 1.8) / .55, 0, 1)
                near = clamp(1 - (abs(x - 6.7) - 3.2) / 2.5, 0, 1)
                smash = kind > 0 and high * near > .55
                score = 6 + (4 if smash else 1.0 if kind > 0 else 0) + margin * 8 - frame * .045
                score -= (p0['stamina'] - p['stamina']) * .14
                score -= 1.2 if jump_at >= 0 else 0
                choices.append((score, actions[:], x, y, kind))
                break
    checked = {}
    for score, actions, x, y, kind in sorted(choices, key=lambda c: c[0], reverse=True):
        if score + 1.3 < best_score:
            break
        key = (round(x, 2), round(y, 2), kind, round(actions[-1]['move'], 2))
        if key not in checked:
            checked[key] = min(shot_quality(x + dx, y + dy, kind, actions[-1]['move'], team, {'x':opp_x}, obs['court']['netHeight'])
                               for dx, dy in ((0, 0), (-.025, -.025), (.025, -.025), (0, .025))
                               for opp_x in (obs['batsmen'][1-team]['x'], 3.0 if team else 10.4, 4.8 if team else 8.6))
        score += checked[key]
        if score > best_score:
            best_score, best_actions = score, actions
    if best_actions is not None:
        # After predicted contact recover rather than continuing a blind swing.
        p = p0.copy()
        for a in best_actions:
            player_step(p, a)
        while len(best_actions) < 10:
            a = move_to(p, home)
            player_step(p, a)
            best_actions.append(a)
        return best_actions[:10]
    if not rescue:
        return decide(obs, rescue=True)
    # No currently feasible contact: approach a future descending ball.
    target = home
    for points in path:
        if points and points[-1][1] < 1.9:
            x, y = points[-1]
            if (team == 0 and x < 6.8) or (team == 1 and x > 6.6):
                target = x - p0['facing'] * .45
                break
    p, actions = p0.copy(), []
    for _ in range(10):
        a = move_to(p, target, abs(target - p['x']) > 1.7 and p['stamina'] > 40)
        player_step(p, a)
        actions.append(a)
    return actions


def main():
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    for line in sys.stdin:
        try:
            obs = json.loads(line)
            print(json.dumps({'inputs': [[a] for a in decide(obs)]}, separators=(',', ':')), flush=True)
        except Exception as exc:
            print(str(exc), file=sys.stderr, flush=True)
            print(json.dumps({'inputs': [[{}] for _ in range(10)]}), flush=True)


if __name__ == '__main__':
    main()
