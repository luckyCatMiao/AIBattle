#!/usr/bin/env python3
"""Randomised-but-competent opponent for offline evaluation (tooling only).

Usage: python3 tools/noisy_agent.py SEED [AIM_NOISE_DEG]

The agent is agent.py with randomised tactic parameters and a little per-frame
noise, so that a fixed simulation seed still yields many different games.
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent as A

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 0
NOISE = float(sys.argv[2]) if len(sys.argv) > 2 else 4.0
rng = random.Random(SEED)


def _u(a, b):
    return rng.uniform(a, b)


# randomised tactic parameters (kept inside a sensible band)
A.P.shoot_range = _u(12.0, 24.0)
A.P.shot_reach = _u(0.6, 1.1)
A.P.shot_clear = _u(-0.30, 0.15)
A.P.pass_reach = _u(0.6, 1.0)
A.P.pass_min_clear = _u(0.02, 0.40)
A.P.keeper_out_frac = _u(0.08, 0.34)
A.P.keeper_out_max = _u(0.8, 2.4)
A.P.keeper_out_min = _u(0.4, 0.9)
A.P.loose_chase = rng.randint(1, 3)
A.P.press_count = rng.randint(1, 3)
A.BOX_MARGIN = _u(0.9, 2.6)

DIRS = A.DIRS
DIR_NAMES = A.DIR_NAMES


def noisy_decide(w, team, n, boxes):
    out = A.decide_frame(w, team, n, boxes)
    for inp in out:
        a = inp.get('aim')
        if isinstance(a, (int, float)) and rng.random() < 0.55:
            inp['aim'] = (a + rng.gauss(0.0, NOISE)) % 360.0
        if rng.random() < 0.012:
            inp['dir'] = rng.choice(DIR_NAMES)
        if rng.random() < 0.004:
            inp['kick'] = not inp.get('kick', False)
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
            our = noisy_decide(w, my_team, n, boxes)
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
            if inp.get('dir') not in DIRS:
                inp['dir'] = 'N'
            inp['kick'] = bool(inp.get('kick', False))
    return frames


def main():
    import json
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
