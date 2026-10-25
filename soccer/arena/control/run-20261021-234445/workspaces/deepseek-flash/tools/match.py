"""Full-match runner: plays two brains head-to-head in the Python engine."""
import sys, math, random
sys.path.insert(0, '/workspace')
import soccer
from soccer_meta import get_meta
import brain as brainmod

META = get_meta()
RULES = META['rules']
W, H = META['W'], META['H']


def new_match(seed, n):
    w = soccer.World(W, H, META['tiles'], RULES, META['penaltyBoxes'], META['goals'], n)
    w.spawns = {int(k): v for k, v in META['spawns_by_n'][str(n)].items()}
    w.kickoffTeam = abs(seed) % 2
    for team in (0, 1):
        for i in range(n):
            u = w.add_unit(team, i, f't{team}u{i}')
            sx, sy = w.spawns[team][i]
            u['x'] = sx + 0.5
            u['y'] = sy + 0.5
            u['fx'] = 1.0 if team == 0 else -1.0
    w.ball = {'x': W / 2.0, 'y': H / 2.0, 'vx': 0.0, 'vy': 0.0,
              'owner': None, 'lastTouch': None, 'lastTeam': None}
    w.freeze = 0
    w.frame = 0
    w.status = 'playing'
    return w


def team_size_for_seed(seed):
    x = ((int(seed) ^ 0x9e3779b9) & 0xFFFFFFFF)
    x ^= (x << 13) & 0xFFFFFFFF; x &= 0xFFFFFFFF
    x ^= (x >> 17); x &= 0xFFFFFFFF
    x ^= (x << 5) & 0xFFFFFFFF; x &= 0xFFFFFFFF
    return 1 + (x % 6)


class IdleBot:
    def __init__(self, team):
        self.team = team
    def plan(self, w):
        n = w.teamSize
        return [[{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)] for _ in range(20)]


class ChaseBot:
    """A plausible generic opponent: everyone chases the ball; the owner dribbles
    at the goal and shoots when within range; the keeper tracks the ball."""

    def __init__(self, team, shoot_range=16.0, keeper=True):
        self.team = team
        self.opp = 1 - team
        self.s = 1 if team == 0 else -1
        self.shoot_range = shoot_range
        self.use_keeper = keeper

    def plan(self, w):
        n = w.teamSize
        sim = w.clone()
        frames = []
        goal_x = (w.W - 1.0) if self.s > 0 else 1.0
        own_x = 1.0 if self.s > 0 else (w.W - 1.0)
        for f in range(20):
            mine = {}
            for u in [x for x in sim.units if x['team'] == self.team]:
                b = sim.ball
                if b['owner'] == u['id']:
                    distg = math.hypot(u['x'] - goal_x, u['y'] - 13.0)
                    if distg < self.shoot_range:
                        ang = math.degrees(math.atan2(13.0 - u['y'], goal_x - u['x']))
                        mine[u['id']] = {'dir': 'N', 'aim': ang, 'kick': True}
                    else:
                        ang = math.degrees(math.atan2(13.0 - u['y'], goal_x - u['x']))
                        d = brainmod.oct_name(ang)
                        mine[u['id']] = {'dir': d, 'aim': ang, 'kick': False}
                elif u['index'] == 0 and self.use_keeper and len([x for x in sim.units if x['team'] == self.team]) > 1:
                    # keeper tracks the ball along the goal line
                    kx = own_x + self.s * 2.5
                    ty = max(6.5, min(19.5, 13.0 + (b['y'] - 13.0) * 0.35))
                    ang = math.degrees(math.atan2(ty - u['y'], kx - u['x']))
                    mine[u['id']] = {'dir': brainmod.oct_name(ang), 'aim': None, 'kick': False}
                else:
                    ang = math.degrees(math.atan2(b['y'] - u['y'], b['x'] - u['x']))
                    mine[u['id']] = {'dir': brainmod.oct_name(ang), 'aim': None, 'kick': False}
                # never enter opponent box: crude clamp
                box = META['penaltyBoxes'][str(1 - self.team)]
                if box['x1'] <= u['x'] <= box['x2'] and box['y1'] <= u['y'] <= box['y2']:
                    pass
            inputs = {}
            for u in sim.units:
                if u['team'] == self.team:
                    inputs[u['id']] = mine[u['id']]
                else:
                    # opponent model for this bot: mirror itself
                    o = u
                    b = sim.ball
                    if b['owner'] == o['id']:
                        distg = math.hypot(o['x'] - own_x, o['y'] - 13.0)
                        if distg < self.shoot_range:
                            ang = math.degrees(math.atan2(13.0 - o['y'], own_x - o['x']))
                            inputs[o['id']] = {'dir': 'N', 'aim': ang, 'kick': True}
                        else:
                            ang = math.degrees(math.atan2(13.0 - o['y'], own_x - o['x']))
                            inputs[o['id']] = {'dir': brainmod.oct_name(ang), 'aim': ang, 'kick': False}
                    else:
                        ang = math.degrees(math.atan2(b['y'] - o['y'], b['x'] - o['x']))
                        inputs[o['id']] = {'dir': brainmod.oct_name(ang), 'aim': None, 'kick': False}
            sim.step(inputs)
            frames.append([mine['t%du%d' % (self.team, i)] for i in range(n)])
        return frames


class RandomBot:
    def __init__(self, team, seed=1):
        self.team = team
        self.rng = random.Random(seed)

    def plan(self, w):
        n = w.teamSize
        dirs = list(soccer.DIRS.keys())
        return [[{'dir': self.rng.choice(dirs), 'aim': self.rng.uniform(0, 360), 'kick': False}
                 for _ in range(n)] for _ in range(20)]


def run_match(brain0, brain1, seed, n, max_frames=None, verbose=False, collect=None):
    w = new_match(seed, n)
    max_frames = max_frames or (RULES['matchSeconds'] + RULES['goldenGoalSeconds'] + 5) * RULES['hz']
    while w.status == 'playing' and w.frame < max_frames + 300:
        f0 = brain0.plan(w)
        f1 = brain1.plan(w)
        for i in range(20):
            if w.status != 'playing':
                break
            inputs = {}
            for team, frames in ((0, f0), (1, f1)):
                fr = frames[i] if i < len(frames) else None
                for idx in range(n):
                    uid = f't{team}u{idx}'
                    inp = fr[idx] if fr and idx < len(fr) else {'dir': 'N', 'aim': None, 'kick': False}
                    inputs[uid] = inp
            w.step(inputs)
        if collect is not None:
            collect.append((w.frame, tuple(w.score), w.ball['owner'], w.freeze))
        if verbose and w.frame % 200 == 0:
            print(f'  frame {w.frame} score {w.score} ball {w.ball["x"]:.1f},{w.ball["y"]:.1f} owner {w.ball["owner"]}')
    return w


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--n', type=int, default=0)
    ap.add_argument('--seeds', type=int, default=6)
    ap.add_argument('--opp', default='chase')
    ap.add_argument('--verbose', action='store_true')
    a = ap.parse_args()
    scores = []
    tot = 0
    for seed in range(1, a.seeds + 1):
        n = a.n if a.n else team_size_for_seed(seed)
        for seat in (0, 1):
            team = seat
            if a.opp == 'chase':
                opp = ChaseBot(1 - team)
            elif a.opp == 'idle':
                opp = IdleBot(1 - team)
            elif a.opp == 'brain':
                opp = brainmod.Brain(1 - team)
            else:
                opp = RandomBot(1 - team, seed)
            me = brainmod.Brain(team)
            if seat == 0:
                w = run_match(me, opp, seed, n, verbose=a.verbose)
            else:
                w = run_match(opp, me, seed, n, verbose=a.verbose)
            my = w.score[team]
            their = w.score[1 - team]
            scores.append((seed, n, team, my, their))
            print(f'seed {seed} n={n} team={team} -> {my}:{their}  (score {w.score})')
    wins = sum(1 for x in scores if x[3] > x[4])
    draws = sum(1 for x in scores if x[3] == x[4])
    gf = sum(x[3] for x in scores)
    ga = sum(x[4] for x in scores)
    print(f'GAMES {len(scores)} W{wins} D{draws} L{len(scores)-wins-draws}  GF {gf} GA {ga}')
