#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""第 3 轮补充分析：控球分区/连续持球，以及射正事件的射门点与门将深度。

输入：control/results.json + control/r3-g*.json.gz（逐物理帧回放）。
输出：work/round3_extra.json。

口径：
- 控球帧：ball.owner 非空的物理帧（20 帧 = 1 秒）。
- 本方半场：team0 x<22，team1 x>22；进攻三区：team0 x>29.333，team1 x<14.667。
- 连续持球：同一个 owner id 连续持有球的帧段。
- 射正：goal + save；goal 的射门方为 event.team，save 的射门方为 1-event.team。
- 射门点/门将点：射正事件前 120 帧内射门方最后一次 kick 的球位置；门将取
  kick 帧防守方 index 0 的位置。射门点距对方门中心 (x=43/1,y=13)；
  门将距本方门中心 (team0 x=1，team1 x=43,y=13)。
"""
import gzip
import json
import math
import os
import statistics
import sys

CONTROL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ME = 'deepseek-g1'
ROUND = int(sys.argv[1]) if len(sys.argv) > 1 else 3


def load_replay(gid):
    with gzip.open(os.path.join(CONTROL, gid + '.json.gz'), 'rt', encoding='utf-8') as f:
        return json.load(f)


def in_own_half(team, x):
    return x < 22.0 if team == 0 else x > 22.0


def in_attack_third(team, x):
    return x > 29.333 if team == 0 else x < 14.667


def keeper_distance(fr, team):
    gx = 1.0 if team == 0 else 43.0
    for u in fr['units']:
        if u['team'] == team and u['index'] == 0:
            return math.hypot(u['x'] - gx, u['y'] - 13.0)
    return None


def summarize_zones(rep, me):
    frames = rep['frames']
    stats = {0: {'poss': 0, 'own_half': 0, 'attack_third': 0, 'keeper': 0},
             1: {'poss': 0, 'own_half': 0, 'attack_third': 0, 'keeper': 0}}
    streaks = {0: [], 1: []}
    best = None
    cur_owner = None
    cur_start = 0
    cur_len = 0

    def close_streak(end):
        nonlocal best
        if cur_owner is None or cur_len <= 0:
            return
        team = int(cur_owner[1])
        idx = int(cur_owner[3:])
        seg = frames[cur_start:end + 1]
        xs = [f['ball']['x'] for f in seg]
        ys = [f['ball']['y'] for f in seg]
        rec = {
            'owner': cur_owner, 'team': team, 'index': idx,
            'start': cur_start, 'end': end, 'frames': cur_len,
            'seconds': round(cur_len / 20.0, 2),
            'avg_x': round(sum(xs) / len(xs), 2),
            'avg_y': round(sum(ys) / len(ys), 2),
        }
        streaks[team].append(rec)
        if best is None or rec['frames'] > best['frames']:
            best = rec

    for i, fr in enumerate(frames):
        owner = fr['ball'].get('owner')
        if owner is not None:
            team = int(owner[1])
            idx = int(owner[3:])
            c = stats[team]
            c['poss'] += 1
            x = fr['ball']['x']
            if in_own_half(team, x):
                c['own_half'] += 1
            if in_attack_third(team, x):
                c['attack_third'] += 1
            if idx == 0:
                c['keeper'] += 1
        if owner == cur_owner and owner is not None:
            cur_len += 1
        else:
            close_streak(i - 1)
            cur_owner = owner
            cur_start = i
            cur_len = 1 if owner else 0
    close_streak(len(frames) - 1)

    def pct(a, b):
        return round(100.0 * a / b, 1) if b else None

    out = {'id': rep['id'], 'teamSize': rep['teamSize'], 'seat': me, 'frames': len(frames)}
    for team, label in ((me, 'me'), (1 - me, 'opp')):
        c = stats[team]
        out[label] = {
            'poss': c['poss'], 'own_half': c['own_half'], 'attack_third': c['attack_third'],
            'keeper': c['keeper'],
            'own_half_pct': pct(c['own_half'], c['poss']),
            'attack_third_pct': pct(c['attack_third'], c['poss']),
            'keeper_pct': pct(c['keeper'], c['poss']),
            'longest': max(streaks[team], key=lambda r: r['frames']) if streaks[team] else None,
        }
    return out


def summarize_on_target(rep, me):
    ev = rep['final']['events']
    frames = rep['frames']
    kicks = [e for e in ev if e['type'] == 'kick']
    rows = []
    for e in ev:
        if e['type'] == 'goal':
            shooter, defending, typ = e['team'], 1 - e['team'], 'goal'
        elif e['type'] == 'save':
            defending, shooter, typ = e['team'], 1 - e['team'], 'save'
        else:
            continue
        prev = [k for k in kicks if k['team'] == shooter and 0 <= e['frame'] - k['frame'] <= 120]
        if not prev:
            continue
        k = prev[-1]
        gx = 43.0 if shooter == 0 else 1.0
        rows.append({
            'id': rep['id'], 'teamSize': rep['teamSize'],
            'side': 'me' if shooter == me else 'opp',
            'type': typ, 'goal_frame': e['frame'], 'kick_frame': k['frame'],
            'shot_dist': round(math.hypot(k['x'] - gx, k['y'] - 13.0), 2),
            'keeper_dist': keeper_distance(frames[min(k['frame'], len(frames) - 1)], defending),
        })
    return rows


def main():
    with open(os.path.join(CONTROL, 'results.json'), encoding='utf-8') as f:
        results = json.load(f)
    games = [g for g in results if g.get('round') == ROUND]
    zones = []
    shots = []
    for meta in games:
        gid = meta['id']
        rep = load_replay(gid)
        me = rep['seats'].index(ME)
        zones.append(summarize_zones(rep, me))
        shots.extend(summarize_on_target(rep, me))

    out = {'round': ROUND, 'zones': zones, 'on_target_shots': shots}
    path = os.path.join(os.path.dirname(__file__), f'round{ROUND}_extra.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print(f"wrote {path}: {len(zones)} games, {len(shots)} on-target shots")
    for sz in range(1, 7):
        Z = [z for z in zones if z['teamSize'] == sz]
        if not Z:
            continue
        p = sum(z['me']['poss'] for z in Z)
        oh = sum(z['me']['own_half'] for z in Z)
        at = sum(z['me']['attack_third'] for z in Z)
        kp = sum(z['me']['keeper'] for z in Z)
        op = sum(z['opp']['poss'] for z in Z)
        print(f"sz{sz}: n={len(Z)} me_poss={p} own_half={100*oh/p:.1f}% "
              f"att_third={100*at/p:.1f}% keeper={100*kp/p:.1f}% opp_poss={op}")
    for side in ('me', 'opp'):
        X = [s for s in shots if s['side'] == side]
        if not X:
            continue
        print(f"{side}: shots={len(X)} shot_dist_median={statistics.median(s['shot_dist'] for s in X):.2f} "
              f"keeper_dist_median={statistics.median(s['keeper_dist'] for s in X):.2f}")


if __name__ == '__main__':
    main()
