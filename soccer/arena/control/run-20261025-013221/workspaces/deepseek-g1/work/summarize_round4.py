#!/usr/bin/env python3
"""Summarize round-4 (and round-3 comparison) replay analysis in markdown tables."""
import json
import os
import statistics

WORK = os.path.dirname(os.path.abspath(__file__))
ME = 'deepseek-g1'


def load(name):
    with open(os.path.join(WORK, name), encoding='utf-8') as f:
        return json.load(f)


def record(rows):
    w = sum(1 for r in rows if r['winner'] == ME)
    d = sum(1 for r in rows if r['winner'] is None)
    l = len(rows) - w - d
    gf = sum(r['goals_me'] for r in rows)
    ga = sum(r['goals_opp'] for r in rows)
    return w, d, l, gf, ga


def line(rows, label):
    w, d, l, gf, ga = record(rows)
    n = len(rows)
    kicks_me = sum(r['kicks_me'] for r in rows)
    kicks_op = sum(r['kicks_opp'] for r in rows)
    poss_me = sum(r['poss_me'] for r in rows)
    poss_op = sum(r['poss_opp'] for r in rows)
    on_me = sum(r['on_target_me'] for r in rows)
    on_op = sum(r['on_target_opp'] for r in rows)
    saves_me = sum(r['saves_me'] for r in rows)
    saves_op = sum(r['saves_opp'] for r in rows)
    fouls_me = sum(r['fouls_me'] for r in rows)
    fouls_op = sum(r['fouls_opp'] for r in rows)
    att_me = sum(r['att_half_me'] for r in rows)
    att_op = sum(r['att_half_opp'] for r in rows)
    conv_me = gf / on_me * 100 if on_me else 0
    conv_op = ga / on_op * 100 if on_op else 0
    save_me = saves_me / on_op * 100 if on_op else 0
    save_op = saves_op / on_me * 100 if on_me else 0
    poss_share = poss_me / (poss_me + poss_op) * 100 if poss_me + poss_op else 0
    att_share = att_me / poss_me * 100 if poss_me else 0
    return (f"| {label} | {n} | {w}-{d}-{l} | {w/n*100:.0f}% | {gf}:{ga} | "
            f"{kicks_me}/{kicks_op} | {poss_me}/{poss_op} | {poss_share:.1f}% | "
            f"{att_me}/{att_op} | {att_share:.1f}% | {on_me}/{on_op} | {gf}:{ga} | "
            f"{conv_me:.1f}%/{conv_op:.1f}% | {saves_me}/{saves_op} | "
            f"{save_me:.1f}%/{save_op:.1f}% | {fouls_me}/{fouls_op} |")


HEADER = ("| 分组 | 局 | 胜-平-负 | 胜率 | 进:失 | 踢球我/敌 | 控球帧我/敌 | 控球份额 | "
          "攻半场控球我/敌 | 攻半占比 | 射正我/敌 | 进球我/敌 | 射正转化我/敌 | 扑救我/敌 | "
          "扑救率我/敌 | 犯规我/敌 |")
SEP = "|" + "---|" * 16


def table(rows, groups, title):
    print(f"\n### {title}\n")
    print(HEADER)
    print(SEP)
    for label, subset in groups:
        if subset:
            print(line(subset, label))


def timing(rows, team_key, opp_key):
    buckets = [0, 0, 0, 0, 0]  # 0-30,30-60,60-90,90-120,120+
    for r in rows:
        for e in r['goal_events']:
            t = e['t']
            idx = min(int(t // 30), 4)
            if e['team'] == team_key:
                buckets[idx] += 1
    return buckets


def main():
    r4 = load('round4_analysis.json')
    r3 = load('round3_analysis_r4schema.json')
    for name, rows in (('第 4 轮', r4), ('第 3 轮（对照）', r3)):
        print(f"\n# {name}\n")
        print(f"总计：{line(rows, '全部')}")
        by_size = [(f"{s}v{s}", [r for r in rows if r['teamSize'] == s]) for s in range(1, 7)]
        table(rows, by_size, f'{name} 分人数')
        by_seat = [(f"座位 {s}", [r for r in rows if r['seat'] == s]) for s in (0, 1)]
        table(rows, by_seat, f'{name} 分座位')
        halves = [('前 10 局', rows[:10]), ('后 10 局', rows[10:])]
        table(rows, halves, f'{name} 前后半段')

    print('\n# 第 4 轮进球时间分布（0-30/30-60/60-90/90-120/120+）\n')
    me = timing(r4, 'me', 'opp')
    op = timing(r4, 'opp', 'me')
    print('我方', me, '合计', sum(me))
    print('对方', op, '合计', sum(op))

    # first goal
    print('\n# 第 4 轮先进球与结果\n')
    for who in ('me', 'opp', None):
        sub = [r for r in r4 if r['first_goal_team'] == who]
        if sub:
            w, d, l, gf, ga = record(sub)
            label = {'me': '我方先进', 'opp': '对方先进', None: '0:0 结束（无进球）'}[who]
            print(f"{label}: {len(sub)} 局 {w}-{d}-{l}，进 {gf} 失 {ga}")

    # goal profile
    print('\n# 第 4 轮进球/射正位置画像\n')
    for team, label in (('me', '我方进球'), ('opp', '对方进球')):
        goals = [g for r in r4 for g in r['goal_events'] if g['team'] == team and g['last_kick']]
        dists = [g['last_kick']['dist_to_goal_center'] for g in goals]
        wide = sum(1 for g in goals if g['last_kick']['wide'])
        flights = [g['last_kick']['flight_s'] for g in goals]
        print(f"{label}: {len(goals)} 个有同队最后一脚；距离中位 {statistics.median(dists):.1f} 格 "
              f"({min(dists):.1f}–{max(dists):.1f})；外线(y≤9或≥19) {wide} 个；"
              f"飞行中位 {statistics.median(flights):.2f}s ({min(flights):.2f}–{max(flights):.2f})")

    # team-mode goals by size
    print('\n我方进球按人数：')
    for s in range(1, 7):
        sub = [r for r in r4 if r['teamSize'] == s]
        if sub:
            gf = sum(r['goals_me'] for r in sub)
            ga = sum(r['goals_opp'] for r in sub)
            print(f"  {s}v{s}: {len(sub)} 局，{gf}:{ga}")

    # on-target profile incl. saves
    print('\n# 第 4 轮射正（进球+扑救）的最后一脚\n')
    for team, label in (('me', '我方射正'), ('opp', '对方射正')):
        shots = []
        for r in r4:
            evs = r['goal_events'] if team == 'me' else r['goal_events']
            for e in evs:
                if e['team'] == team and e['last_kick']:
                    shots.append(e['last_kick'])
            for e in r['save_events']:
                if e['shooter_team'] == team and e['last_kick']:
                    shots.append(e['last_kick'])
        dists = [s['dist_to_goal_center'] for s in shots]
        wide = sum(1 for s in shots if s['wide'])
        flights = [s['flight_s'] for s in shots]
        print(f"{label}: {len(shots)} 次有记录；距离中位 {statistics.median(dists):.1f} 格 "
              f"({min(dists):.1f}–{max(dists):.1f})；外线 {wide} 次 ({wide/len(shots)*100:.1f}%)；"
              f"飞行中位 {statistics.median(flights):.2f}s")

    # per-game compact markdown
    print('\n# 第 4 轮逐局表\n')
    print('| 对局 | seed | 人数 | 座位 | 比分(我:敌) | 结果 | 帧数（模拟秒） | 战报墙钟 s | 踢球我/敌 | 控球我/敌 | 犯规我/敌 | 扑救我/敌 | 射正我/敌 | 射线我/敌 |')
    print('|---|---:|---:|---:|---:|:---:|---:|---:|---:|---:|---:|---:|---:|---:|')
    for r in r4:
        if r['winner'] == ME:
            res = '胜'
        elif r['winner'] is None:
            res = '平'
        else:
            res = '负'
        print(f"| {r['id']} | {r['seed']} | {r['teamSize']} | {r['seat']} | "
              f"{r['score_me']}:{r['score_opp']} | {res} | {r['frames']}（{r['sim_seconds']:.1f}） | "
              f"{r['duration']:.2f} | {r['kicks_me']}/{r['kicks_opp']} | "
              f"{r['poss_me']}/{r['poss_opp']} | {r['fouls_me']}/{r['fouls_opp']} | "
              f"{r['saves_me']}/{r['saves_opp']} | {r['on_target_me']}/{r['on_target_opp']} | "
              f"{r['shots_me']}/{r['shots_opp']} |")


if __name__ == '__main__':
    main()
