#!/usr/bin/env python3
"""Round-1 public replay analysis for the current run.

Reads:
  <workspace>/matches/r1-g*.json.gz
  <run>/results.json

Writes:
  work/round1_analysis.json
  work/round1_table.txt
  work/round1_agg.json

All statistics are re-derived from the replay; the public report is only used
for scores / wall-clock duration / winner cross-checks.
"""
import gzip
import json
import math
import os
import sys

WS = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
RUN = os.path.abspath(os.path.join(WS, '..', '..'))
MATCHES = os.path.join(WS, 'matches')
RESULTS = os.path.join(RUN, 'results.json')
ME = 'deepseek-g1'
OUT = os.path.dirname(os.path.abspath(__file__))

GOAL_TOP, GOAL_BOT = 10.0, 16.0
GOAL_CENTER = {0: (43.0, 13.0), 1: (1.0, 13.0)}


def line_to_goal(x, y, angle, team, max_dist=25.0):
    gx = 43.0 if team == 0 else 1.0
    dx = math.cos(angle)
    if team == 0 and dx <= 0.05:
        return None
    if team == 1 and dx >= -0.05:
        return None
    t = (gx - x) / dx
    if t < 0 or t > max_dist:
        return None
    yy = y + math.sin(angle) * t
    if GOAL_TOP <= yy <= GOAL_BOT:
        return {'ray_dist': round(t, 2), 'goal_y': round(yy, 2)}
    return None


def dist_to_goal(x, y, team):
    gx, gy = GOAL_CENTER[team]
    return math.hypot(gx - x, gy - y)


def load_game(gid):
    with gzip.open(os.path.join(MATCHES, gid + '.json.gz'), 'rt', encoding='utf-8') as f:
        return json.load(f)


def owner_team(ball):
    o = ball.get('owner')
    if not o or not o.startswith('t'):
        return None
    return int(o[1])


def half_of(x, team):
    """'own' / 'opp' half for a team, using the fixed pitch orientation."""
    if team == 0:
        return 'own' if x < 22.0 else 'opp'
    return 'own' if x > 22.0 else 'opp'


def in_final_third(x, team):
    if team == 0:
        return x >= 29.333
    return x <= 14.667


def in_penalty_zone(x, team):
    if team == 0:
        return 34.0 <= x <= 43.0 and 6.0 <= 0 <= 20.0
    return 1.0 <= x <= 10.0


def main():
    with open(RESULTS, encoding='utf-8') as f:
        results = json.load(f)
    results = [g for g in results if g.get('round') == 1]
    results.sort(key=lambda g: g['game'])

    out = []
    for meta in results:
        gid = meta['id']
        rep = load_game(gid)
        seats = rep['seats']
        me_team = seats.index(ME)
        opp_team = 1 - me_team
        ev = rep['final']['events']
        stats = rep['final']['stats']

        goals = [e for e in ev if e['type'] == 'goal']
        saves = [e for e in ev if e['type'] == 'save']
        fouls = [e for e in ev if e['type'] == 'foul']
        cards = [e for e in ev if e['type'] == 'card']
        kicks = [e for e in ev if e['type'] == 'kick']
        tackles = [e for e in ev if e['type'] == 'tackle']

        def side(team):
            return 'me' if team == me_team else 'opp'

        # ---- goal detail ----
        gdet = []
        for e in goals:
            frame = e['frame']
            team = e['team']
            prev = [k for k in kicks if k['frame'] <= frame and k['team'] == team]
            last = prev[-1] if prev else None
            kick_info = None
            if last:
                gx, gy = GOAL_CENTER[team]
                d = math.hypot(gx - last['x'], gy - last['y'])
                kick_info = {
                    'kick_frame': last['frame'],
                    'kick_t': last['t'],
                    'kicker': last['unit'],
                    'from': [last['x'], last['y']],
                    'dist': round(d, 2),
                    'angle': round(last['angle'], 3),
                    'flight': round(e['t'] - last['t'], 2),
                    'open': not any(
                        f['frame'] < frame and f['frame'] > last['frame'] - 200 for f in fouls
                    ),
                }
            gdet.append({
                't': e['t'], 'frame': frame, 'team': side(team),
                'scorer': e.get('scorer'), 'ownGoal': e.get('ownGoal', False),
                'score': e['score'], 'last_kick': kick_info,
            })

        # ---- on target = goals + saves by the opponent keeper ----
        on_target_me = (sum(1 for e in goals if e['team'] == me_team)
                        + sum(1 for e in saves if e['team'] == opp_team))
        on_target_opp = (sum(1 for e in goals if e['team'] == opp_team)
                         + sum(1 for e in saves if e['team'] == me_team))

        # ---- estimated shots: straight kick ray crosses goal mouth ----
        shots_me, shots_opp = [], []
        for k in kicks:
            hit = line_to_goal(k['x'], k['y'], k['angle'], k['team'])
            if hit:
                rec = {'t': k['t'], 'frame': k['frame'], 'unit': k['unit'],
                       'from': [k['x'], k['y']], 'angle': round(k['angle'], 3), **hit}
                (shots_me if k['team'] == me_team else shots_opp).append(rec)

        # ---- kicks that led directly to goal/save (<= 40 frames earlier) ----
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
                    res.append({'type': e['type'], 't': e['t'], 'frame': e['frame'],
                                'kick_frame': k['frame'],
                                'dist': round(dist_to_goal(k['x'], k['y'], team), 2),
                                'from': [k['x'], k['y']]})
            return res

        # ---- possession / territory from per-frame snapshots ----
        possess = {0: 0, 1: 0}
        possess_own = {0: 0, 1: 0}
        possess_opp = {0: 0, 1: 0}
        possess_final = {0: 0, 1: 0}
        ball_owner_frames = 0
        spells = {0: [], 1: []}
        cur_team = None
        cur_len = 0
        cur_kicks = 0
        kick_frames = sorted(k['frame'] for k in kicks)
        kick_by_frame = {}
        for k in kicks:
            kick_by_frame.setdefault(k['frame'], []).append(k)
        # deepest progress while owning: max x for team0, min x for team1
        deepest = {0: None, 1: None}
        for fr in rep['frames']:
            b = fr['ball']
            t = owner_team(b)
            if t is not None:
                ball_owner_frames += 1
                possess[t] += 1
                h = half_of(b['x'], t)
                if h == 'own':
                    possess_own[t] += 1
                else:
                    possess_opp[t] += 1
                if in_final_third(b['x'], t):
                    possess_final[t] += 1
                if deepest[t] is None:
                    deepest[t] = b['x']
                elif t == 0:
                    deepest[t] = max(deepest[t], b['x'])
                else:
                    deepest[t] = min(deepest[t], b['x'])
                if cur_team == t:
                    cur_len += 1
                else:
                    if cur_team is not None and cur_len:
                        spells[cur_team].append({'len': cur_len, 'kicks': cur_kicks})
                    cur_team = t
                    cur_len = 1
                    cur_kicks = 0
                if fr['frame'] in kick_by_frame:
                    cur_kicks += len(kick_by_frame[fr['frame']])
            else:
                if cur_team is not None and cur_len:
                    spells[cur_team].append({'len': cur_len, 'kicks': cur_kicks})
                cur_team, cur_len, cur_kicks = None, 0, 0
        if cur_team is not None and cur_len:
            spells[cur_team].append({'len': cur_len, 'kicks': cur_kicks})

        def spell_stats(t):
            ss = spells[t]
            if not ss:
                return {'n': 0, 'max_len': 0, 'med_len': 0, 'kicks_per_spell': 0,
                        'zero_kick': 0, 'long_no_kick': 0}
            lens = sorted(s['len'] for s in ss)
            nk = sum(s['kicks'] for s in ss)
            return {
                'n': len(ss),
                'max_len': max(lens),
                'med_len': lens[len(lens) // 2],
                'kicks_per_spell': round(nk / len(ss), 2),
                'zero_kick': sum(1 for s in ss if s['kicks'] == 0),
                'long_no_kick': sum(1 for s in ss if s['kicks'] == 0 and s['len'] >= 100),
            }

        # ---- kick distance distribution (to opponent goal center) ----
        kick_dist_me = [dist_to_goal(k['x'], k['y'], me_team) for k in kicks if k['team'] == me_team]
        kick_dist_opp = [dist_to_goal(k['x'], k['y'], opp_team) for k in kicks if k['team'] == opp_team]

        # ---- possession share ----
        total_owner = possess[0] + possess[1]

        row = {
            'id': gid, 'game': meta['game'], 'seed': rep['seed'], 'teamSize': rep['teamSize'],
            'seat': me_team,
            'score_me': meta['scores'][ME],
            'score_opp': meta['scores'][next(k for k in meta['scores'] if k != ME)],
            'winner': meta['winner'], 'reason': meta['reason'],
            'duration': meta['duration'], 'frames': meta['frames'], 'windows': meta['windows'],
            'sim_seconds': round(meta['frames'] * rep['frameMs'] / 1000.0, 2),
            'golden': bool(rep['frames'] and rep['frames'][-1].get('golden')),
            'kicks_me': stats[me_team]['kicks'], 'kicks_opp': stats[opp_team]['kicks'],
            'poss_me': stats[me_team]['possession'], 'poss_opp': stats[opp_team]['possession'],
            'fouls_me': stats[me_team]['fouls'], 'fouls_opp': stats[opp_team]['fouls'],
            'saves_me': sum(1 for e in saves if e['team'] == me_team),
            'saves_opp': sum(1 for e in saves if e['team'] == opp_team),
            'goals_me': sum(1 for e in goals if e['team'] == me_team),
            'goals_opp': sum(1 for e in goals if e['team'] == opp_team),
            'on_target_me': on_target_me, 'on_target_opp': on_target_opp,
            'shots_me': len(shots_me), 'shots_opp': len(shots_opp),
            'poss_frames_me': possess[me_team], 'poss_frames_opp': possess[opp_team],
            'poss_share_me': round(possess[me_team] / total_owner, 4) if total_owner else 0,
            'poss_own_me': possess_own[me_team], 'poss_opp_half_me': possess_opp[me_team],
            'poss_own_opp': possess_own[opp_team], 'poss_opp_half_opp': possess_opp[opp_team],
            'poss_final_me': possess_final[me_team], 'poss_final_opp': possess_final[opp_team],
            'deepest_me': deepest[me_team], 'deepest_opp': deepest[opp_team],
            'spells_me': spell_stats(me_team), 'spells_opp': spell_stats(opp_team),
            'kick_dist_me_med': round(sorted(kick_dist_me)[len(kick_dist_me) // 2], 2) if kick_dist_me else None,
            'kick_dist_opp_med': round(sorted(kick_dist_opp)[len(kick_dist_opp) // 2], 2) if kick_dist_opp else None,
            'tackles_me': sum(1 for e in tackles if e['team'] == me_team),
            'tackles_opp': sum(1 for e in tackles if e['team'] == opp_team),
            'cards_me': sum(1 for e in cards if e.get('team') == me_team),
            'cards_opp': sum(1 for e in cards if e.get('team') == opp_team),
            'goal_events': gdet,
            'shot_events_me': shot_events(me_team),
            'shot_events_opp': shot_events(opp_team),
            'shot_rays_me': shots_me,
            'shot_rays_opp': shots_opp,
        }
        out.append(row)

    with open(os.path.join(OUT, 'round1_analysis.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # ---------------- compact table ----------------
    lines = []
    hdr = (f"{'id':6} {'sz':>2} {'seat':>4} {'score':>5} {'sim_s':>6} {'wall_s':>6} "
           f"{'kick':>7} {'poss':>9} {'own%':>5} {'foul':>5} {'sav':>5} {'onT':>5} {'ray':>5} {'goals':>5}")
    lines.append(hdr)
    for r in out:
        ownpct = 100.0 * r['poss_own_me'] / r['poss_frames_me'] if r['poss_frames_me'] else 0.0
        lines.append(
            f"{r['id']:6} {r['teamSize']:2d} {r['seat']:4d} "
            f"{r['score_me']}-{r['score_opp']:<3} {r['sim_seconds']:6.1f} {r['duration']:6.2f} "
            f"{r['kicks_me']:3d}/{r['kicks_opp']:<3d} {r['poss_me']:4d}/{r['poss_opp']:<4d} "
            f"{ownpct:4.0f}% {r['fouls_me']:2d}/{r['fouls_opp']:<2d} "
            f"{r['saves_me']:2d}/{r['saves_opp']:<2d} {r['on_target_me']:2d}/{r['on_target_opp']:<2d} "
            f"{r['shots_me']:2d}/{r['shots_opp']:<2d} {r['goals_me']:2d}:{r['goals_opp']:<2d}"
        )

    def agg(rows):
        return {
            'games': len(rows),
            'wins': sum(1 for r in rows if r['winner'] == ME),
            'draws': sum(1 for r in rows if r['winner'] is None),
            'losses': sum(1 for r in rows if r['winner'] not in (ME, None)),
            'goals_me': sum(r['goals_me'] for r in rows),
            'goals_opp': sum(r['goals_opp'] for r in rows),
            'kicks_me': sum(r['kicks_me'] for r in rows),
            'kicks_opp': sum(r['kicks_opp'] for r in rows),
            'poss_me': sum(r['poss_me'] for r in rows),
            'poss_opp': sum(r['poss_opp'] for r in rows),
            'poss_frames_me': sum(r['poss_frames_me'] for r in rows),
            'poss_frames_opp': sum(r['poss_frames_opp'] for r in rows),
            'poss_own_me': sum(r['poss_own_me'] for r in rows),
            'poss_opp_half_me': sum(r['poss_opp_half_me'] for r in rows),
            'poss_final_me': sum(r['poss_final_me'] for r in rows),
            'fouls_me': sum(r['fouls_me'] for r in rows),
            'fouls_opp': sum(r['fouls_opp'] for r in rows),
            'saves_me': sum(r['saves_me'] for r in rows),
            'saves_opp': sum(r['saves_opp'] for r in rows),
            'on_target_me': sum(r['on_target_me'] for r in rows),
            'on_target_opp': sum(r['on_target_opp'] for r in rows),
            'shots_me': sum(r['shots_me'] for r in rows),
            'shots_opp': sum(r['shots_opp'] for r in rows),
        }

    by_size = {}
    for sz in sorted({r['teamSize'] for r in out}):
        by_size[sz] = agg([r for r in out if r['teamSize'] == sz])
    by_seat = {str(s): agg([r for r in out if r['seat'] == s]) for s in (0, 1)}
    first10 = agg([r for r in out if r['game'] <= 10])
    last10 = agg([r for r in out if r['game'] >= 11])
    overall = agg(out)
    aggout = {'overall': overall, 'by_size': by_size, 'by_seat': by_seat,
              'first10': first10, 'last10': last10}
    with open(os.path.join(OUT, 'round1_agg.json'), 'w', encoding='utf-8') as f:
        json.dump(aggout, f, ensure_ascii=False, indent=1)

    def fmt_agg(name, a):
        return (f"{name:8} {a['games']:2d}局 {a['wins']}-{a['draws']}-{a['losses']} "
                f"进/失 {a['goals_me']}:{a['goals_opp']} 射正 {a['on_target_me']}:{a['on_target_opp']} "
                f"射线 {a['shots_me']}:{a['shots_opp']} 踢 {a['kicks_me']}:{a['kicks_opp']} "
                f"控球帧 {a['poss_frames_me']}:{a['poss_frames_opp']} "
                f"犯规 {a['fouls_me']}:{a['fouls_opp']}")

    lines.append('')
    lines.append(fmt_agg('总', overall))
    for sz in sorted(by_size):
        lines.append(fmt_agg(f'{sz}v{sz}', by_size[sz]))
    for s in (0, 1):
        lines.append(fmt_agg(f'seat{s}', by_seat[str(s)]))
    lines.append(fmt_agg('g1-g10', first10))
    lines.append(fmt_agg('g11-g20', last10))

    lines.append('')
    lines.append('Goals:')
    for r in out:
        for g in r['goal_events']:
            lk = g['last_kick']
            extra = ''
            if lk:
                extra = (f" kick f{lk['kick_frame']} {lk['kicker']} "
                         f"from ({lk['from'][0]:.1f},{lk['from'][1]:.1f}) "
                         f"d={lk['dist']:.2f} flight={lk['flight']:.2f}s")
            lines.append(f"  {r['id']} f{g['frame']:4d} t={g['t']:6.2f} {g['team']:3} "
                         f"{g['scorer']} score={g['score']}{extra}")
    lines.append('')
    lines.append('Shot events (goal/save + preceding kick <=40f):')
    for r in out:
        for tag in ('me', 'opp'):
            for s in r[f'shot_events_{tag}']:
                lines.append(f"  {r['id']} {tag:3} {s['type']:5} f{s['frame']:4d} "
                             f"t={s['t']:6.2f} kickf={s['kick_frame']:4d} "
                             f"from ({s['from'][0]:.1f},{s['from'][1]:.1f}) d={s['dist']:.2f}")

    text = '\n'.join(lines) + '\n'
    with open(os.path.join(OUT, 'round1_table.txt'), 'w', encoding='utf-8') as f:
        f.write(text)
    print(text)


if __name__ == '__main__':
    main()
