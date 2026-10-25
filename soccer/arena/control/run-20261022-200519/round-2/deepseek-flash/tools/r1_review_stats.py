#!/usr/bin/env python3
"""Extract round-1 review metrics from a soccer replay.

Usage: python -I tools/r1_review_stats.py <replay.json.gz>
Reads only the file path given on the command line.
"""
import gzip
import json
import math
import sys

W, H = 44.0, 26.0
DT = 0.05
KICK_POWER = 11.0
FRICTION = 0.978
BALL_R = 0.22
GOAL_Y_LO, GOAL_Y_HI = 10.0, 16.0


def sim_kick(x, y, angle_rad):
    """Return ('goal', side, t) / ('end', x, y) after the kick, no bounces
    until a wall is hit; goal line is x<=1 or x>=43 inside the mouth."""
    vx = math.cos(angle_rad) * KICK_POWER
    vy = math.sin(angle_rad) * KICK_POWER
    for step in range(80):  # 4 s
        # four substeps like the game's update_ball
        for _ in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if GOAL_Y_LO <= y <= GOAL_Y_HI:
                if x <= 1.0:
                    return 'goal', 1, (step + 1) * DT
                if x >= W - 1.0:
                    return 'goal', 0, (step + 1) * DT
            if y <= BALL_R or y >= H - BALL_R:
                vy = -vy * 0.72
                y = min(max(y, BALL_R), H - BALL_R)
        vx *= FRICTION
        vy *= FRICTION
        if math.hypot(vx, vy) < 0.02:
            break
    return 'end', x, y, 0.0


def analyze(path):
    d = json.load(gzip.open(path, 'rt', encoding='utf-8'))
    seats = d['seats']
    print('=' * 78)
    print(f"{d['id']} seed={d['seed']} teamSize={d['teamSize']} seats={seats}")
    print(f"frames={len(d['frames'])} sim_seconds={len(d['frames'])/20:.2f} "
          f"reported_duration={d['duration']} score={d['final']['score']} "
          f"stats={d['final']['stats']}")

    # unique events (game copies the running log into every frame)
    ev_by_key = {}
    for f in d['frames']:
        for e in f.get('events', []):
            key = (e.get('type'), e.get('id'))
            ev_by_key[key] = e
    events = sorted(ev_by_key.values(), key=lambda e: (e.get('frame', 0), e.get('id', 0)))
    types = {}
    for e in events:
        types[e['type']] = types.get(e['type'], 0) + 1
    print('event_counts', types)

    goals = [e for e in events if e['type'] == 'goal']
    saves = [e for e in events if e['type'] == 'save']
    kicks = [e for e in events if e['type'] == 'kick']

    print('\nGOALS')
    for e in goals:
        print(f"  f={e['frame']} t={e['t']:.2f}s team={e['team']} scorer={e['scorer']} "
              f"own={e.get('ownGoal')} score={e['score']}")
    print('\nSAVES')
    for e in saves:
        print(f"  f={e['frame']} t={e['t']:.2f}s team={e['team']} unit={e['unit']}")

    # possession directly from frames
    poss = [0, 0]
    for f in d['frames']:
        owner = f['ball'].get('owner')
        if owner:
            team = int(owner[1])
            poss[team] += 1
    print('\npossession_frames_from_replay', poss,
          'seconds', [round(p / 20.0, 2) for p in poss])

    # per-team/per-unit kicks and shot classification
    print('\nKICKS / SHOTS')
    for team in (0, 1):
        tk = [e for e in kicks if e.get('team') == team]
        units = {}
        for e in tk:
            units[e['unit']] = units.get(e['unit'], 0) + 1
        on_target, off_target, own_half = [], [], []
        goal_shots = []
        for e in tk:
            ang = e['angle']
            res = sim_kick(e['x'], e['y'], ang)
            if res[0] == 'goal':
                # only count as a shot attempt if it was struck toward the
                # opponent goal from a plausible shooting position
                on_target.append((e, res))
            else:
                # cone test: would the straight line pass within 3.5 cells of
                # the goal centre at the goal line?
                gx = 43.0 if team == 0 else 1.0
                dx, dy = gx - e['x'], 13.0 - e['y']
                dist = math.hypot(dx, dy)
                delta = math.atan2(math.sin(ang - math.atan2(dy, dx)),
                                   math.cos(ang - math.atan2(dy, dx)))
                if abs(delta) < math.radians(14) and dist > 1.0:
                    off_target.append((e, res, math.degrees(delta)))
                if (e['x'] - 22.0) * (1 if team == 0 else -1) < 0:
                    own_half.append(e)
        print(f"  team {team} ({seats[team]}): kicks={len(tk)} units={units} "
              f"on_target_traj={len(on_target)} near_goal_miss={len(off_target)}")
        for e, res in on_target:
            print(f"    ON TARGET f={e['frame']} t={e['t']:.2f} {e['unit']} "
                  f"from=({e['x']:.2f},{e['y']:.2f}) angle={math.degrees(e['angle']):.1f} "
                  f"cross_t={res[2]:.2f}s side={res[1]}")
        for e, res, da in off_target:
            print(f"    MISS f={e['frame']} t={e['t']:.2f} {e['unit']} "
                  f"from=({e['x']:.2f},{e['y']:.2f}) angle={math.degrees(e['angle']):.1f} "
                  f"delta={da:.1f}deg end=({res[1]:.2f},{res[2]:.2f})")

    # unit final stats from the last frame
    last = d['frames'][-1]
    print('\nFINAL UNITS')
    for u in last['units']:
        print(f"  {u['id']} team={u['team']} idx={u['index']} keeper={u.get('keeper')} "
              f"pos=({u['x']:.2f},{u['y']:.2f}) goals={u.get('goals')} kicks={u.get('kicks')} "
              f"touches={u.get('touches')}")


if __name__ == '__main__':
    for p in sys.argv[1:]:
        analyze(p)
