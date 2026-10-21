"""Adversarial styles not used during tuning: man-marking and chaos."""
import sys, math, random
sys.path.insert(0,'/workspace')
import physics, policy, soccer_test as T
from physics import W, H, DIRS
from policy import SPEED, CONTROL_R, DRIBBLE, GOAL_Y, ang_deg, dist, attack_x, own_goal_center, attack_sign, simulate_move


class ManMarkBot:
    """Man-mark every opponent goal-side; counter down the middle."""
    def __init__(self, mark_gap=1.3, shoot_range=14.0):
        self.mark_gap = mark_gap
        self.shoot_range = shoot_range

    def plan(self, obs):
        team = int(obs['yourTeam'])
        w = T._obs_to_world(obs)
        gx = attack_x(team); og = own_goal_center(team)
        sign = attack_sign(team)
        frames = []
        for _ in range(20):
            mine = [u for u in w.units if u.team == team]
            opps = [u for u in w.units if u.team != team]
            owner = w.unit(w.ball.owner) if w.ball.owner else None
            ins = [None, None, None]
            if owner is not None and owner.team == team:
                for u in mine:
                    if u is owner:
                        dg = dist((u.x, u.y), (gx, GOAL_Y))
                        if u.kick_cd <= 0 and u.control_lock <= 0 and dg < self.shoot_range:
                            best = None
                            for yt in (10.9, 12.0, 13.0, 14.0, 15.1):
                                cl = policy.lane_clearance((u.x, u.y), (gx, yt),
                                                            mine + opps, u)
                                sc = cl - 0.02 * dg
                                if best is None or sc > best[0]:
                                    best = (sc, yt)
                            if best[1] >= 10.5:
                                a = ang_deg(gx - u.x, best[1] - u.y)
                                ins[u.index] = {'dir': 'N', 'aim': a, 'kick': True}
                                continue
                        d, aim = _mv(u, (gx, GOAL_Y))
                        ins[u.index] = {'dir': d, 'aim': aim, 'kick': False}
                    else:
                        pt = (u.x + sign * 6.0, u.y + (4.0 if u.y < owner.y else -4.0))
                        pt = (min(W-1.2, max(1.2, pt[0])), min(H-1.5, max(1.5, pt[1])))
                        d, aim = _mv(u, pt)
                        ins[u.index] = {'dir': d, 'aim': aim, 'kick': False}
            elif owner is not None:
                # man-mark: assign nearest opponent to each of our units
                free = list(opps)
                for u in sorted(mine, key=lambda z: dist((z.x, z.y), (w.ball.x, w.ball.y))):
                    if not free: break
                    o = min(free, key=lambda z: dist((u.x, u.y), (z.x, z.y)))
                    free.remove(o)
                    if o is owner:
                        gap = 0.7
                    else:
                        gap = self.mark_gap
                    dbx, dby = og[0] - o.x, og[1] - o.y
                    dl = math.hypot(dbx, dby) or 1.0
                    pt = (o.x + dbx / dl * gap, o.y + dby / dl * gap)
                    pt = (min(W-1.2, max(1.2, pt[0])), min(H-1.5, max(1.5, pt[1])))
                    d, aim = _mv(u, pt)
                    ins[u.index] = {'dir': d, 'aim': aim, 'kick': False}
            else:
                s = sorted(mine, key=lambda u: dist((u.x, u.y), (w.ball.x, w.ball.y)))
                for k, u in enumerate(s):
                    if k == 0:
                        pt = (w.ball.x, w.ball.y)
                    else:
                        pt = (w.ball.x - sign * 4.0, w.ball.y + (3.0 if k == 1 else -3.0))
                    pt = (min(W-1.2, max(1.2, pt[0])), min(H-1.5, max(1.5, pt[1])))
                    d, aim = _mv(u, pt)
                    ins[u.index] = {'dir': d, 'aim': aim, 'kick': False}
            frames.append(ins)
            w.step({team: ins, 1 - team: None})
        return {'inputs': frames}


class ChaosBot:
    """Seeded random inputs; kicks at random angles when it can."""
    def __init__(self, seed=1, kick_p=0.5):
        self.rng = random.Random(seed)
        self.kick_p = kick_p

    def plan(self, obs):
        team = int(obs['yourTeam'])
        w = T._obs_to_world(obs)
        frames = []
        keys = list(DIRS.keys())
        for _ in range(20):
            ins = [None, None, None]
            owner = w.unit(w.ball.owner) if w.ball.owner else None
            for u in [x for x in w.units if x.team == team]:
                d = self.rng.choice(keys)
                a = self.rng.randrange(0, 360)
                kick = (owner is u and u.kick_cd <= 0 and u.control_lock <= 0
                        and self.rng.random() < self.kick_p)
                ins[u.index] = {'dir': d, 'aim': a, 'kick': kick}
            frames.append(ins)
            w.step({team: ins, 1 - team: None})
        return {'inputs': frames}


def _mv(u, target):
    best = None
    spd = SPEED * physics.DT
    for name, (dx, dy) in DIRS.items():
        nx, ny = simulate_move(u, dx * spd, dy * spd)
        sc = -dist((nx, ny), target)
        if best is None or sc > best[0]:
            best = (sc, name)
    return best[1], policy.ang_deg(DIRS[best[1]][0], DIRS[best[1]][1]) if best[1] != 'N' else 0


if __name__ == '__main__':
    for name, bot in [('ManMark', ManMarkBot()), ('ManMark2', ManMarkBot(mark_gap=2.0)),
                      ('Chaos1', ChaosBot(1)), ('Chaos2', ChaosBot(2)),
                      ('Chaos3', ChaosBot(3))]:
        for seat in (0, 1):
            a = policy.Agent()
            s, g, st = T.run_match(a, bot) if seat == 0 else T.run_match(bot, a)
            ours, theirs = (s[0], s[1]) if seat == 0 else (s[1], s[0])
            print('%-8s seat%d  %2d-%2d  %s' % (name, seat, ours, theirs,
                                                'W' if ours > theirs else ('L' if ours < theirs else 'D')))
