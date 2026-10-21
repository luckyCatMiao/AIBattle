"""Offline match runner + bot opponents (Python, exact physics port)."""
import math, random, sys
import physics
from physics import W, H, DIRS, UNIT_R, BALL_R, RULES, in_goal_mouth, js_round
import policy
from policy import (SPEED, CONTROL_R, DRIBBLE, GOAL_Y, ang_deg, dist,
                    attack_x, own_goal_center, attack_sign, simulate_move)


def make_obs(w, team):
    units = []
    for u in w.units:
        units.append({
            'id': u.id, 'team': u.team, 'index': u.index, 'name': u.id,
            'x': round(u.x, 3), 'y': round(u.y, 3),
            'facing': {'x': round(u.facing[0], 3), 'y': round(u.facing[1], 3)},
            'hasBall': w.ball.owner == u.id,
            'kickCd': round(u.kick_cd / 20.0, 3),
            'controlLock': round(u.control_lock / 20.0, 3),
            'goals': u.goals, 'kicks': u.kicks, 'touches': u.touches,
        })
    b = w.ball
    return {
        'frame': w.frame, 'status': w.status, 'phase': 'live', 'yourTeam': team,
        'score': list(w.score), 'half': w.half,
        'timeLeft': round(max(0.0, (w.golden_end - w.frame) / 20.0)
                          if w.golden else
                          (RULES['matchSeconds'] - w.frame / 20.0), 1),
        'golden': w.golden, 'freeze': round(w.freeze / 20.0, 1),
        'units': units,
        'ball': {'x': round(b.x, 3), 'y': round(b.y, 3),
                 'vx': round(b.vx, 3), 'vy': round(b.vy, 3),
                 'owner': b.owner, 'lastTouch': b.last_touch, 'lastTeam': b.last_team},
        'stats': [{'kicks': 0, 'possession': 0}, {'kicks': 0, 'possession': 0}],
    }


class SimpleBot:
    """Chase the ball; the owner kicks at a chosen goal corner."""

    def __init__(self, corner_choice='open'):
        self.corner_choice = corner_choice

    def plan(self, obs):
        team = int(obs['yourTeam'])
        w = physics.World()
        w.frame = int(obs['frame'])
        w.freeze = int(round(float(obs['freeze']) * 20))
        w.golden = bool(obs['golden'])
        w.score = list(obs['score'])
        w.half = int(obs['half'])
        by_id = {u.id: u for u in w.units}
        for ou in obs['units']:
            u = by_id[ou['id']]
            u.x, u.y = float(ou['x']), float(ou['y'])
            f = ou['facing']
            l = math.hypot(f['x'], f['y']) or 1
            u.facing = (f['x'] / l, f['y'] / l)
            u.kick_cd = int(round(float(ou['kickCd']) * 20))
            u.control_lock = int(round(float(ou['controlLock']) * 20))
        ob = obs['ball']
        w.ball.x, w.ball.y = float(ob['x']), float(ob['y'])
        w.ball.vx, w.ball.vy = float(ob['vx']), float(ob['vy'])
        w.ball.owner = ob['owner']

        frames = []
        for _ in range(20):
            mine = [u for u in w.units if u.team == team]
            opps = [u for u in w.units if u.team != team]
            owner = w.unit(w.ball.owner) if w.ball.owner else None
            ins = [None, None, None]
            gx = attack_x(team)
            for u in mine:
                if owner is u:
                    if u.kick_cd <= 0 and u.control_lock <= 0:
                        if self.corner_choice == 'center':
                            ty = GOAL_Y
                        else:
                            ty = 10.9 if u.y < GOAL_Y else 15.1
                        a = ang_deg(gx - u.x, ty - u.y)
                        ins[u.index] = {'dir': 'N', 'aim': a, 'kick': True}
                    else:
                        d, aimv = self._move(u, (gx, GOAL_Y), mine, opps, True)
                        ins[u.index] = {'dir': d, 'aim': aimv, 'kick': False}
                else:
                    # nearest chases the ball, others also close in
                    d, aimv = self._move(u, (w.ball.x, w.ball.y), mine, opps, False)
                    ins[u.index] = {'dir': d, 'aim': aimv, 'kick': False}
            frames.append(ins)
            w.step({team: ins, 1 - team: None})
        return {'inputs': frames}

    def _move(self, u, target, mine, opps, carrier):
        best = None
        spd = SPEED * physics.DT
        for name, (dx, dy) in DIRS.items():
            nx, ny = simulate_move(u, dx * spd, dy * spd)
            if dx or dy:
                fl = math.hypot(dx, dy)
                fx, fy = dx / fl, dy / fl
            else:
                fx, fy = u.facing
            sc = -dist((nx, ny), target)
            if carrier:
                bxp, byp = nx + fx * DRIBBLE, ny + fy * DRIBBLE
                for o in opps:
                    db = math.hypot(bxp - o.x, byp - o.y)
                    if db < 1.0:
                        sc -= (1.0 - db) * 5
            if best is None or sc > best[0]:
                best = (sc, name, ang_deg(fx, fy))
        return best[1], best[2]


class MotionBot:
    """Plans its window by greedy per-frame control toward fixed targets:
    ball chaser + one keeper + one support.  Slightly stronger baseline."""

    def __init__(self, shoot_range=12.0):
        self.shoot_range = shoot_range

    def plan(self, obs):
        team = int(obs['yourTeam'])
        w = physics.World()
        w.frame = int(obs['frame']); w.freeze = int(round(float(obs['freeze']) * 20))
        w.golden = bool(obs['golden']); w.score = list(obs['score']); w.half = int(obs['half'])
        by_id = {u.id: u for u in w.units}
        for ou in obs['units']:
            u = by_id[ou['id']]
            u.x, u.y = float(ou['x']), float(ou['y'])
            f = ou['facing']
            l = math.hypot(f['x'], f['y']) or 1
            u.facing = (f['x'] / l, f['y'] / l)
            u.kick_cd = int(round(float(ou['kickCd']) * 20))
            u.control_lock = int(round(float(ou['controlLock']) * 20))
        ob = obs['ball']
        w.ball.x, w.ball.y = float(ob['x']), float(ob['y'])
        w.ball.vx, w.ball.vy = float(ob['vx']), float(ob['vy'])
        w.ball.owner = ob['owner']
        gx = attack_x(team)
        og = own_goal_center(team)

        frames = []
        for _ in range(20):
            mine = [u for u in w.units if u.team == team]
            opps = [u for u in w.units if u.team != team]
            owner = w.unit(w.ball.owner) if w.ball.owner else None
            ins = [None, None, None]
            if owner is not None and owner.team == team:
                mates = [u for u in mine if u is not owner]
                dg = dist((owner.x, owner.y), (gx, GOAL_Y))
                can = owner.kick_cd <= 0 and owner.control_lock <= 0
                shot = None
                if can:
                    best = None
                    for yt in (10.9, 11.6, 12.3, 13.0, 13.7, 14.4, 15.1):
                        cl = policy.lane_clearance((owner.x, owner.y), (gx, yt), mine + opps, owner)
                        sc = cl - 0.01 * dg
                        if best is None or sc > best[0]:
                            best = (sc, cl, yt)
                    shot = best
                if can and shot is not None and (shot[1] > 0.25 or (dg < 7 and shot[1] > -0.8)):
                    a = ang_deg(gx - owner.x, shot[2] - owner.y)
                    ins[owner.index] = {'dir': 'N', 'aim': a, 'kick': True}
                else:
                    d, aimv = self._move(owner, (gx, GOAL_Y), opps, carrier=True)
                    ins[owner.index] = {'dir': d, 'aim': aimv, 'kick': False}
                # other two: one support ahead, one back
                pts = [(owner.x + attack_sign(team) * 8, owner.y - 4.5),
                       (owner.x + attack_sign(team) * 8, owner.y + 4.5),
                       (owner.x - attack_sign(team) * 6, (owner.y + GOAL_Y) / 2)]
                for k, m in enumerate(mates):
                    pt = pts[min(k, len(pts) - 1)]
                    pt = (min(W - 1.2, max(1.2, pt[0])), min(H - 1.5, max(1.5, pt[1])))
                    d, aimv = self._move(m, pt, opps, carrier=False)
                    ins[m.index] = {'dir': d, 'aim': aimv, 'kick': False}
            elif owner is not None:
                # defend: closest presses, others goal-side
                s = sorted(mine, key=lambda u: dist((u.x, u.y), (w.ball.x, w.ball.y)))
                presser, rest = s[0], s[1:]
                d, aimv = self._move(presser, (w.ball.x, w.ball.y), opps, carrier=False)
                ins[presser.index] = {'dir': d, 'aim': aimv, 'kick': False}
                rest.sort(key=lambda u: dist((u.x, u.y), og))
                keeper = rest[0]
                d, aimv = self._move(keeper, og, opps, carrier=False)
                ins[keeper.index] = {'dir': d, 'aim': aimv, 'kick': False}
                if len(rest) > 1:
                    third = rest[1]
                    d, aimv = self._move(third, ((w.ball.x + og[0]) / 2, (w.ball.y + og[1]) / 2), opps, carrier=False)
                    ins[third.index] = {'dir': d, 'aim': aimv, 'kick': False}
            else:
                s = sorted(mine, key=lambda u: dist((u.x, u.y), (w.ball.x, w.ball.y)))
                d, aimv = self._move(s[0], (w.ball.x, w.ball.y), opps, carrier=False)
                ins[s[0].index] = {'dir': d, 'aim': aimv, 'kick': False}
                rest = s[1:]
                for k, u in enumerate(rest):
                    if k == 0:
                        pt = ((w.ball.x + og[0]) / 2, (w.ball.y + og[1]) / 2)
                    else:
                        pt = (w.ball.x + attack_sign(team) * 8, w.ball.y + (5 if w.ball.y < GOAL_Y else -5))
                    pt = (min(W - 1.2, max(1.2, pt[0])), min(H - 1.5, max(1.5, pt[1])))
                    d, aimv = self._move(u, pt, opps, carrier=False)
                    ins[u.index] = {'dir': d, 'aim': aimv, 'kick': False}
            frames.append(ins)
            w.step({team: ins, 1 - team: None})
        return {'inputs': frames}

    def _move(self, u, target, opps, carrier):
        return policy.Agent.move_best(self, None, 0, u, target,
                                      [u], opps, carrier=carrier) if False else self._mv(u, target, opps, carrier)

    def _mv(self, u, target, opps, carrier):
        best = None
        spd = SPEED * physics.DT
        for name, (dx, dy) in DIRS.items():
            nx, ny = simulate_move(u, dx * spd, dy * spd)
            if dx or dy:
                fl = math.hypot(dx, dy)
                fx, fy = dx / fl, dy / fl
            else:
                fx, fy = u.facing
            sc = -dist((nx, ny), target)
            if carrier:
                bxp, byp = nx + fx * DRIBBLE, ny + fy * DRIBBLE
                for o in opps:
                    db = math.hypot(bxp - o.x, byp - o.y)
                    if db < 1.0:
                        sc -= (1.0 - db) * 5
            if best is None or sc > best[0]:
                best = (sc, name, ang_deg(fx, fy))
        return best[1], best[2]



def _obs_to_world(obs):
    """Shared helper: build a planning World from an observation."""
    w = physics.World()
    w.frame = int(obs['frame']); w.freeze = int(round(float(obs['freeze']) * 20))
    w.golden = bool(obs['golden']); w.score = list(obs['score']); w.half = int(obs['half'])
    by_id = {u.id: u for u in w.units}
    for ou in obs['units']:
        u = by_id[ou['id']]
        u.x, u.y = float(ou['x']), float(ou['y'])
        f = ou['facing']
        l = math.hypot(f['x'], f['y']) or 1
        u.facing = (f['x'] / l, f['y'] / l)
        u.kick_cd = int(round(float(ou['kickCd']) * 20))
        u.control_lock = int(round(float(ou['controlLock']) * 20))
    ob = obs['ball']
    w.ball.x, w.ball.y = float(ob['x']), float(ob['y'])
    w.ball.vx, w.ball.vy = float(ob['vx']), float(ob['vy'])
    w.ball.owner = ob['owner']
    return w


class ParkBot:
    """Two posts plus a keeper; owner clears long.  Tests our breaking-down."""

    def plan(self, obs):
        team = int(obs['yourTeam'])
        w = _obs_to_world(obs)
        gx = attack_x(team)
        og = own_goal_center(team)
        sign = attack_sign(team)
        frames = []
        for _ in range(20):
            mine = [u for u in w.units if u.team == team]
            opps = [u for u in w.units if u.team != team]
            owner = w.unit(w.ball.owner) if w.ball.owner else None
            ins = [None, None, None]
            # keeper tracks ball y
            ky = min(15.4, max(10.6, w.ball.y))
            targets = {
                0: (og[0] - sign * 1.2, ky),
                1: (og[0] - sign * 3.5, 11.0),
                2: (og[0] - sign * 3.5, 15.0),
            }
            for u in mine:
                if owner is u:
                    if u.kick_cd <= 0 and u.control_lock <= 0:
                        # clear toward the opponent half / corner
                        ty = 6.0 if u.y < GOAL_Y else 20.0
                        if dist((u.x, u.y), (gx, GOAL_Y)) < 22:
                            ty = 10.9 if u.y < GOAL_Y else 15.1
                        a = ang_deg(gx - u.x, ty - u.y)
                        ins[u.index] = {'dir': 'N', 'aim': a, 'kick': True}
                    else:
                        d, aimv = _bmove(u, targets[u.index])
                        ins[u.index] = {'dir': d, 'aim': aimv, 'kick': False}
                else:
                    d, aimv = _bmove(u, targets[u.index])
                    ins[u.index] = {'dir': d, 'aim': aimv, 'kick': False}
            frames.append(ins)
            w.step({team: ins, 1 - team: None})
        return {'inputs': frames}


class KickBot:
    """Kick the ball forward at every opportunity, everyone chases."""

    def __init__(self, long_kick_dist=18.0):
        self.d = long_kick_dist

    def plan(self, obs):
        team = int(obs['yourTeam'])
        w = _obs_to_world(obs)
        gx = attack_x(team)
        sign = attack_sign(team)
        frames = []
        for _ in range(20):
            mine = [u for u in w.units if u.team == team]
            opps = [u for u in w.units if u.team != team]
            owner = w.unit(w.ball.owner) if w.ball.owner else None
            ins = [None, None, None]
            for u in mine:
                if owner is u:
                    if u.kick_cd <= 0 and u.control_lock <= 0:
                        dg = dist((u.x, u.y), (gx, GOAL_Y))
                        if dg < 24:
                            ty = 10.9 if u.y < GOAL_Y else 15.1
                        else:
                            ty = 6.0 if int(u.index) % 2 == 0 else 20.0
                        a = ang_deg(gx - u.x, ty - u.y)
                        ins[u.index] = {'dir': 'N', 'aim': a, 'kick': True}
                    else:
                        d, aimv = _bmove(u, (gx, GOAL_Y))
                        ins[u.index] = {'dir': d, 'aim': aimv, 'kick': False}
                else:
                    d, aimv = _bmove(u, (w.ball.x, w.ball.y))
                    ins[u.index] = {'dir': d, 'aim': aimv, 'kick': False}
            frames.append(ins)
            w.step({team: ins, 1 - team: None})
        return {'inputs': frames}


def _bmove(u, target):
    best = None
    spd = SPEED * physics.DT
    for name, (dx, dy) in DIRS.items():
        nx, ny = simulate_move(u, dx * spd, dy * spd)
        sc = -dist((nx, ny), target)
        if best is None or sc > best[0]:
            best = (sc, name)
    fx, fy = DIRS[best[1]] if best[1] != 'N' else u.facing
    fl = math.hypot(fx, fy) or 1
    return best[1], ang_deg(fx / fl, fy / fl)

def run_match(pa, pb, max_windows=130, verbose=False):
    """pa plays team 0, pb team 1.  Returns (score, goal_frames)."""
    w = physics.World()
    goals = []
    prev_score = [0, 0]
    for win in range(max_windows):
        if w.status != 'playing':
            break
        oa = make_obs(w, 0)
        ob = make_obs(w, 1)
        wa = pa.plan(oa)
        wb = pb.plan(ob)
        for i in range(20):
            if w.status != 'playing':
                break
            w.step({0: wa['inputs'][i], 1: wb['inputs'][i]})
            if w.score != prev_score:
                goals.append((w.frame / 20.0, list(w.score)))
                prev_score = list(w.score)
        if verbose and win % 10 == 0:
            print('  t=%.0f score=%s ball=(%.1f,%.1f)' % (w.frame / 20, w.score, w.ball.x, w.ball.y))
    return tuple(w.score), goals, w.status


if __name__ == '__main__':
    a = policy.Agent()
    b = SimpleBot()
    s, g, st = run_match(a, b, verbose=True)
    print('agent(team0) vs SimpleBot:', s, 'status', st)
    print('goals:', g)
