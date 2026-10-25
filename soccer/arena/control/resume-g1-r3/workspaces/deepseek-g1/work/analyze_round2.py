#!/usr/bin/env python3
"""Round-2 public replay analysis: goals, shots, kicks, possession, fouls."""
import gzip
import json
import math
import os
import sys

CONTROL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
RESULTS = os.path.join(CONTROL, 'results.json')
ME = 'deepseek-g1'


def line_to_goal(x, y, angle, team, max_dist=25.0):
    """Does the straight kick ray cross the opponent goal mouth inside kick range?"""
    gx = 43.0 if team == 0 else 1.0
    goal_y1, goal_y2 = 10.0, 16.0
    dx = math.cos(angle)
    if team == 0 and dx <= 0.05:
        return None
    if team == 1 and dx >= -0.05:
        return None
    t = (gx - x) / dx
    if t < 0 or t > max_dist:
        return None
    yy = y + math.sin(angle) * t
    if goal_y1 <= yy <= goal_y2:
        return {'dist': round(t, 2), 'goal_y': round(yy, 2)}
    return None


def main():
    with open(RESULTS, encoding='utf-8') as f:
        results = json.load(f)
    rnd = int(sys.argv[1]) if len(sys.argv) > 1 else 2
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

        goals = [e for e in ev if e['type'] == 'goal']
        saves = [e for e in ev if e['type'] == 'save']
        fouls = [e for e in ev if e['type'] == 'foul']
        kicks = [e for e in ev if e['type'] == 'kick']

        def own(team):
            return 'me' if team == me_team else 'opp'

        # goals detail
        gdet = []
        for e in goals:
            frame = e['frame']
            team = e['team']
            scorer = e.get('scorer')
            prev = [k for k in kicks if k['frame'] <= frame and k['team'] == team]
            last = prev[-1] if prev else None
            kick_info = None
            if last:
                # distance to opponent goal center
                gx, gy = (43.0 if team == 0 else 1.0, 13.0)
                d = math.hypot(gx - last['x'], gy - last['y'])
                kick_info = {
                    'kick_frame': last['frame'],
                    'kick_t': last['t'],
                    'kicker': last['unit'],
                    'from': [last['x'], last['y']],
                    'dist': round(d, 2),
                    'shake': 'setpiece' if any(f['frame'] < frame and f['frame'] > last['frame'] - 200 for f in fouls) else 'open',
                }
            gdet.append({
                't': e['t'], 'frame': frame, 'team': own(team),
                'scorer': scorer, 'ownGoal': e.get('ownGoal', False),
                'score': e['score'], 'last_kick': kick_info,
            })

        # shots: on-target = goals + saves by opponent keeper
        on_target_me = sum(1 for e in goals if e['team'] == me_team) + sum(1 for e in saves if e['team'] == opp_team)
        on_target_opp = sum(1 for e in goals if e['team'] == opp_team) + sum(1 for e in saves if e['team'] == me_team)

        # estimated total shots: kicks whose straight ray crosses goal mouth
        shots_me, shots_opp = [], []
        for k in kicks:
            hit = line_to_goal(k['x'], k['y'], k['angle'], k['team'])
            if hit:
                rec = {'t': k['t'], 'frame': k['frame'], 'unit': k['unit'],
                       'from': [k['x'], k['y']], **hit}
                (shots_me if k['team'] == me_team else shots_opp).append(rec)

        # kicks that led directly to goals/saves (within 40 frames)
        def shot_events(team):
            res = []
            for e in ev:
                if e['type'] not in ('goal', 'save'):
                    continue
                if e['type'] == 'goal' and e['team'] != team:
                    continue
                if e['type'] == 'save' and e['team'] == team:
                    continue
                prev = [k for k in kicks if k['team'] == team and 0 <= e['frame'] - k['frame'] <= 40]
                if prev:
                    k = prev[-1]
                    gx, gy = (43.0 if team == 0 else 1.0, 13.0)
                    res.append({'type': e['type'], 't': e['t'], 'frame': e['frame'],
                                'kick_frame': k['frame'], 'dist': round(math.hypot(gx - k['x'], gy - k['y']), 2),
                                'from': [k['x'], k['y']]})
            return res

        row = {
            'id': gid, 'game': meta['game'], 'seed': rep['seed'], 'teamSize': rep['teamSize'],
            'seat': me_team, 'score_me': meta['scores'][ME], 'score_opp': meta['scores'][next(k for k in meta['scores'] if k != ME)],
            'winner': meta['winner'], 'duration': meta['duration'], 'frames': meta['frames'], 'windows': meta['windows'],
            'kicks_me': stats[me_team]['kicks'], 'kicks_opp': stats[opp_team]['kicks'],
            'poss_me': stats[me_team]['possession'], 'poss_opp': stats[opp_team]['possession'],
            'fouls_me': stats[me_team]['fouls'], 'fouls_opp': stats[opp_team]['fouls'],
            'saves_me': sum(1 for e in saves if e['team'] == me_team),
            'saves_opp': sum(1 for e in saves if e['team'] == opp_team),
            'goals_me': sum(1 for e in goals if e['team'] == me_team),
            'goals_opp': sum(1 for e in goals if e['team'] == opp_team),
            'on_target_me': on_target_me, 'on_target_opp': on_target_opp,
            'shots_me': len(shots_me), 'shots_opp': len(shots_opp),
            'goal_events': gdet,
            'shot_events_me': shot_events(me_team),
            'shot_events_opp': shot_events(opp_team),
            'shot_rays_me': shots_me,
            'shot_rays_opp': shots_opp,
        }
        out.append(row)

    with open(os.path.join(os.path.dirname(__file__), f'round{rnd}_analysis.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # compact table
    hdr = f"{'id':6} {'sz':>2} {'seat':>4} {'score':>5} {'dur':>6} {'kick':>7} {'poss':>9} {'foul':>5} {'sav':>5} {'onT':>5} {'ray':>5} {'goals':>9}"
    print(hdr)
    for r in out:
        print(f"{r['id']:6} {r['teamSize']:2d} {r['seat']:4d} "
              f"{r['score_me']}-{r['score_opp']:<3} {r['duration']:6.2f} "
              f"{r['kicks_me']:3d}/{r['kicks_opp']:<3d} {r['poss_me']:4d}/{r['poss_opp']:<4d} "
              f"{r['fouls_me']:2d}/{r['fouls_opp']:<2d} {r['saves_me']:2d}/{r['saves_opp']:<2d} "
              f"{r['on_target_me']:2d}/{r['on_target_opp']:<2d} {r['shots_me']:2d}/{r['shots_opp']:<2d} "
              f"{r['goals_me']}:{r['goals_opp']}")

    # aggregates
    def agg(key_me, key_opp):
        return sum(r[key_me] for r in out), sum(r[key_opp] for r in out)
    print('\nTotals (me/opp): kicks', agg('kicks_me', 'kicks_opp'), 'poss', agg('poss_me', 'poss_opp'),
          'fouls', agg('fouls_me', 'fouls_opp'), 'saves', agg('saves_me', 'saves_opp'),
          'on_target', agg('on_target_me', 'on_target_opp'), 'rays', agg('shots_me', 'shots_opp'),
          'goals', agg('goals_me', 'goals_opp'))
    wins = sum(1 for r in out if r['winner'] == ME)
    losses = sum(1 for r in out if r['winner'] not in (ME, None))
    draws = sum(1 for r in out if r['winner'] is None)
    print('record', wins, losses, draws)


if __name__ == '__main__':
    main()
