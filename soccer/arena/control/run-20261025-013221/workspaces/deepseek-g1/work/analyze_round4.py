#!/usr/bin/env python3
"""Round-4 public replay analysis: goals, shots, possession, fouls.

Reads only the public replays r4-g*.json.gz and results.json.  Does not read
the opponent's workspace or code.
"""
import gzip
import json
import math
import os
import sys

WORK = os.path.dirname(os.path.abspath(__file__))
CONTROL = os.path.abspath(os.path.join(WORK, '..', '..', '..'))  # run-... directory
RESULTS = os.path.join(CONTROL, 'results.json')
ME = 'deepseek-g1'
GOAL_X = {0: 43.0, 1: 1.0}
GOAL_Y = 13.0


def line_to_goal(x, y, angle, team, max_dist=25.0):
    """Does the straight kick ray cross the opponent goal mouth inside range?"""
    gx = GOAL_X[team]
    dx = math.cos(angle)
    if team == 0 and dx <= 0.05:
        return None
    if team == 1 and dx >= -0.05:
        return None
    t = (gx - x) / dx
    if t < 0 or t > max_dist:
        return None
    yy = y + math.sin(angle) * t
    if 10.0 <= yy <= 16.0:
        return {'dist': round(t, 2), 'goal_y': round(yy, 2)}
    return None


def last_kick_before(kicks, team, frame, max_back=80):
    prev = [k for k in kicks if k['team'] == team and 0 <= frame - k['frame'] <= max_back]
    return prev[-1] if prev else None


def kick_detail(k, team, event_frame):
    gx, gy = GOAL_X[team], GOAL_Y
    dx, dy = math.cos(k['angle']), math.sin(k['angle'])
    dist = math.hypot(gx - k['x'], gy - k['y'])
    entry = None
    if abs(dx) > 1e-6:
        t = (gx - k['x']) / dx
        if t >= 0:
            yy = k['y'] + dy * t
            entry = round(yy, 2)
    return {
        'unit': k['unit'], 'frame': k['frame'], 't': k['t'],
        'from': [k['x'], k['y']], 'angle': round(k['angle'], 3),
        'dist_to_goal_center': round(dist, 2),
        'flight_s': round((event_frame - k['frame']) / 20.0, 2),
        'ray_entry_y': entry,
        'wide': (k['y'] <= 9.0 or k['y'] >= 19.0),
    }


def main():
    with open(RESULTS, encoding='utf-8') as f:
        results = json.load(f)
    rnd = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    out_name = sys.argv[2] if len(sys.argv) > 2 else f'round{rnd}_analysis.json'
    games = [g for g in results if g.get('round') == rnd]
    out = []
    for meta in games:
        gid = meta['id']
        path = os.path.join(CONTROL, gid + '.json.gz')
        with gzip.open(path, 'rt', encoding='utf-8') as f:
            rep = json.load(f)
        seats = rep['seats']
        me_team = seats.index(ME)
        opp_team = 1 - me_team
        ev = rep['final']['events']
        stats = rep['final']['stats']
        frames = rep.get('frames') or []

        goals = [e for e in ev if e['type'] == 'goal']
        saves = [e for e in ev if e['type'] == 'save']
        fouls = [e for e in ev if e['type'] == 'foul']
        kicks = [e for e in ev if e['type'] == 'kick']

        def own(team):
            return 'me' if team == me_team else 'opp'

        # ---- goal detail: last kick by the scoring team --------------------
        gdet = []
        for e in goals:
            team = e['team']
            k = last_kick_before(kicks, team, e['frame'], max_back=140)
            gdet.append({
                't': e['t'], 'frame': e['frame'], 'team': own(team),
                'scorer': e.get('scorer'), 'ownGoal': e.get('ownGoal', False),
                'score': e['score'],
                'last_kick': kick_detail(k, team, e['frame']) if k else None,
            })

        # ---- save detail: last kick by the attacking (non-saving) team ---
        sdet = []
        for e in saves:
            attack_team = 1 - e['team']  # saving team is e['team']
            k = last_kick_before(kicks, attack_team, e['frame'], max_back=120)
            sdet.append({
                't': e['t'], 'frame': e['frame'], 'by': own(e['team']),
                'shooter_team': own(attack_team), 'unit': e.get('unit'),
                'last_kick': kick_detail(k, attack_team, e['frame']) if k else None,
            })

        # ---- on-target = goals + saves by the opponent keeper -------------
        on_target_me = sum(1 for e in goals if e['team'] == me_team) + \
            sum(1 for e in saves if e['team'] == opp_team)
        on_target_opp = sum(1 for e in goals if e['team'] == opp_team) + \
            sum(1 for e in saves if e['team'] == me_team)

        # ---- geometric shot rays (upper bound) -----------------------------
        shots_me, shots_opp = [], []
        for k in kicks:
            hit = line_to_goal(k['x'], k['y'], k['angle'], k['team'])
            if hit:
                rec = {'t': k['t'], 'frame': k['frame'], 'unit': k['unit'],
                       'from': [k['x'], k['y']], 'angle': round(k['angle'], 3), **hit}
                (shots_me if k['team'] == me_team else shots_opp).append(rec)

        # ---- possession location from per-frame ball owner -----------------
        poss_frames_me = poss_frames_opp = 0
        att_half_me = att_half_opp = 0
        att_third_me = att_third_opp = 0
        long_runs = {me_team: 0, opp_team: 0}
        run_team, run_len = None, 0
        for fr in frames:
            ball = fr.get('ball') or {}
            owner = ball.get('owner')
            if owner:
                team = int(owner[1])
                poss_frames_me += team == me_team
                poss_frames_opp += team == opp_team
                x = ball.get('x', 0.0)
                attack_dir = 1 if team == 0 else -1
                if (x - 22.0) * attack_dir > 0:
                    if team == me_team:
                        att_half_me += 1
                    else:
                        att_half_opp += 1
                if (x - 29.33) * attack_dir > 0:
                    if team == me_team:
                        att_third_me += 1
                    else:
                        att_third_opp += 1
                if team == run_team:
                    run_len += 1
                else:
                    if run_team in long_runs:
                        long_runs[run_team] = max(long_runs[run_team], run_len)
                    run_team, run_len = team, 1
            else:
                if run_team in long_runs:
                    long_runs[run_team] = max(long_runs[run_team], run_len)
                run_team, run_len = None, 0
        if run_team in long_runs:
            long_runs[run_team] = max(long_runs[run_team], run_len)

        # ---- first goal / time in lead -------------------------------------
        first_goal = gdet[0] if gdet else None
        first_goal_team = first_goal['team'] if first_goal else None
        lead_frames = {ME: 0, 'sol': 0}
        for fr in frames:
            sc = fr.get('score')
            if not sc:
                continue
            diff = sc[me_team] - sc[opp_team]
            if diff > 0:
                lead_frames[ME] += 1
            elif diff < 0:
                lead_frames['sol'] += 1

        row = {
            'id': gid, 'game': meta['game'], 'seed': rep['seed'],
            'teamSize': rep['teamSize'], 'seat': me_team,
            'score_me': meta['scores'][ME],
            'score_opp': meta['scores'][next(k for k in meta['scores'] if k != ME)],
            'winner': meta['winner'], 'reason': meta['reason'],
            'duration': meta['duration'], 'frames': meta['frames'],
            'windows': meta['windows'], 'sim_seconds': round((len(frames) - 1) / 20.0, 2),
            'kicks_me': stats[me_team]['kicks'], 'kicks_opp': stats[opp_team]['kicks'],
            'poss_me': stats[me_team]['possession'], 'poss_opp': stats[opp_team]['possession'],
            'fouls_me': stats[me_team]['fouls'], 'fouls_opp': stats[opp_team]['fouls'],
            'saves_me': sum(1 for e in saves if e['team'] == me_team),
            'saves_opp': sum(1 for e in saves if e['team'] == opp_team),
            'goals_me': sum(1 for e in goals if e['team'] == me_team),
            'goals_opp': sum(1 for e in goals if e['team'] == opp_team),
            'on_target_me': on_target_me, 'on_target_opp': on_target_opp,
            'shots_me': len(shots_me), 'shots_opp': len(shots_opp),
            'poss_frames_me': poss_frames_me, 'poss_frames_opp': poss_frames_opp,
            'att_half_me': att_half_me, 'att_half_opp': att_half_opp,
            'att_third_me': att_third_me, 'att_third_opp': att_third_opp,
            'longest_poss_frames_me': long_runs[me_team],
            'longest_poss_frames_opp': long_runs[opp_team],
            'lead_frames_me': lead_frames[ME], 'lead_frames_opp': lead_frames['sol'],
            'first_goal_team': first_goal_team,
            'goal_events': gdet,
            'save_events': sdet,
            'shot_rays_me': shots_me,
            'shot_rays_opp': shots_opp,
        }
        out.append(row)

    with open(os.path.join(WORK, out_name), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # ---- compact console table --------------------------------------------
    hdr = (f"{'id':6} {'sz':>2} {'seat':>4} {'score':>5} {'dur':>6} {'sim':>6} "
           f"{'kick':>7} {'poss':>9} {'foul':>5} {'sav':>5} {'onT':>5} {'ray':>5} "
           f"{'attH':>9} {'goals':>9}")
    print(hdr)
    for r in out:
        print(f"{r['id']:6} {r['teamSize']:2d} {r['seat']:4d} "
              f"{r['score_me']}-{r['score_opp']:<3} {r['duration']:6.2f} {r['sim_seconds']:6.2f} "
              f"{r['kicks_me']:3d}/{r['kicks_opp']:<3d} {r['poss_me']:4d}/{r['poss_opp']:<4d} "
              f"{r['fouls_me']:2d}/{r['fouls_opp']:<2d} {r['saves_me']:2d}/{r['saves_opp']:<2d} "
              f"{r['on_target_me']:2d}/{r['on_target_opp']:<2d} {r['shots_me']:2d}/{r['shots_opp']:<2d} "
              f"{r['att_half_me']:4d}/{r['att_half_opp']:<4d} "
              f"{r['goals_me']}:{r['goals_opp']}")

    def agg(k_me, k_opp):
        return sum(r[k_me] for r in out), sum(r[k_opp] for r in out)

    wins = sum(1 for r in out if r['winner'] == ME)
    losses = sum(1 for r in out if r['winner'] not in (ME, None))
    draws = sum(1 for r in out if r['winner'] is None)
    print('\nrecord', wins, 'W', draws, 'D', losses, 'L')
    print('totals me/opp: kicks', agg('kicks_me', 'kicks_opp'),
          'poss', agg('poss_me', 'poss_opp'),
          'fouls', agg('fouls_me', 'fouls_opp'),
          'saves', agg('saves_me', 'saves_opp'),
          'on_target', agg('on_target_me', 'on_target_opp'),
          'rays', agg('shots_me', 'shots_opp'),
          'goals', agg('goals_me', 'goals_opp'),
          'att_half', agg('att_half_me', 'att_half_opp'))


if __name__ == '__main__':
    main()
