#!/usr/bin/env python3
"""Generate Markdown tables for review.md from round-2 analysis outputs."""
import json, collections, gzip, glob

A = json.load(open('work/r2_analysis.json', encoding='utf-8'))
Z = {g['id']: g for g in json.load(open('work/r2_zones.json', encoding='utf-8'))}
S = {g['id']: g for g in json.load(open('work/r2_spells.json', encoding='utf-8'))}
K = {g['id']: g for g in json.load(open('work/r2_kickoffs.json', encoding='utf-8'))}
HOLD = {}
for p in glob.glob('matches/r2-g*.json.gz'):
    with gzip.open(p, 'rt', encoding='utf-8') as f:
        d = json.load(f)
    our = d['seats'].index('deepseek-g1')
    cur = mx = total = 0
    for fr in d['frames']:
        o = fr['ball'].get('owner') or ''
        if d['teamSize'] > 1 and o == 't%du0' % our:
            cur += 1; total += 1; mx = max(mx, cur)
        else:
            cur = 0
    HOLD[d['id']] = (total, mx)

# report saves [ours, opp]
report_saves = {
 'r2-g1':[1,2],'r2-g2':[1,2],'r2-g3':[2,0],'r2-g4':[1,1],'r2-g5':[0,0],
 'r2-g6':[0,4],'r2-g7':[2,1],'r2-g8':[3,1],'r2-g9':[1,0],'r2-g10':[2,2],
 'r2-g11':[0,0],'r2-g12':[0,3],'r2-g13':[0,3],'r2-g14':[3,0],'r2-g15':[2,0],
 'r2-g16':[1,1],'r2-g17':[0,0],'r2-g18':[1,2],'r2-g19':[1,3],'r2-g20':[4,0]}

print('## 表 1 逐局数据\n')
print('| 对局 | 人数 | 我方座位 | 比分 | 结果 | 帧数 | 模拟秒 | 墙钟秒 | 我方踢球 | 我方控球帧 | 我方射门(射正) | 对方射门(射正) | 扑救(我/对) | 红牌 |')
print('|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
for g in A:
    r = 'W' if g['winner'] == g['our_team'] else ('D' if g['winner'] is None else 'L')
    st = g['stats'][g['our_team']]
    sv = report_saves[g['id']]
    print('| %s | %d | %d | %d-%d | %s | %d | %.2f | %.2f | %d | %d | %d(%d) | %d(%d) | %d/%d | %d |' % (
        g['id'], g['teamSize'], g['our_team'], g['score_us'], g['score_them'], r,
        g['frames_count'], g['sim_seconds'], g['wall_duration_s'],
        st['kicks'], st['possession'], g['our_shots']['n'], g['our_shots']['on_target'],
        g['opp_shots']['n'], g['opp_shots']['on_target'], sv[0], sv[1], len(g['cards'])))

print('\n## 表 2 我方进球（全部 20 球）\n')
print('| 对局 | 时间s | 帧 | 进球者 | 射门起点 | 目标 y | 距门 | 结果 |')
print('|---|---:|---:|---|---|---:|---:|---|')
for g in A:
    for x in g['our_goals']:
        s = x['shot']
        if s:
            print('| %s | %.2f | %d | %s | (%.1f, %.1f) | %.2f | %.1f | %d-%d |' % (
                g['id'], x['t'], x['frame'], x['scorer'], s['x'], s['y'], s['target_y'], s['dist_to_goal'],
                x['score'][0], x['score'][1]))
        else:
            print('| %s | %.2f | %d | %s | - | - | - | %d-%d |' % (
                g['id'], x['t'], x['frame'], x['scorer'], x['score'][0], x['score'][1]))

print('\n## 表 3 对方进球（全部 41 球）\n')
print('| 对局 | 时间s | 帧 | 进球者 | 射门起点 | 目标 y | 距门 | 结果 |')
print('|---|---:|---:|---|---|---:|---:|---|')
for g in A:
    for x in g['opp_goals']:
        s = x['shot']
        if s:
            print('| %s | %.2f | %d | %s | (%.1f, %.1f) | %.2f | %.1f | %d-%d |' % (
                g['id'], x['t'], x['frame'], x['scorer'], s['x'], s['y'], s['target_y'], s['dist_to_goal'],
                x['score'][0], x['score'][1]))
        else:
            print('| %s | %.2f | %d | %s | - | - | - | %d-%d |' % (
                g['id'], x['t'], x['frame'], x['scorer'], x['score'][0], x['score'][1]))

print('\n## 表 4 我方门将持球时间\n')
print('| 对局 | 人数 | 门将持球帧 | 门将持球秒 | 最长连续(s) | 结果 |')
print('|---|---:|---:|---:|---:|---|')
for g in A:
    tot, mx = HOLD[g['id']]
    r = 'W' if g['winner'] == g['our_team'] else ('D' if g['winner'] is None else 'L')
    print('| %s | %d | %d | %.1f | %.1f | %s |' % (g['id'], g['teamSize'], tot, tot/20.0, mx/20.0, r))

print('\n## 聚合数字\n')
w = sum(1 for g in A if g['winner'] == g['our_team'])
d = sum(1 for g in A if g['winner'] is None)
l = len(A) - w - d
print('- 战绩：%d 胜 %d 平 %d 负；进球 %d，失球 %d，净胜 %+d' % (
    w, d, l, sum(g['score_us'] for g in A), sum(g['score_them'] for g in A),
    sum(g['score_us'] - g['score_them'] for g in A)))
for seat in (0, 1):
    arr = [g for g in A if g['our_team'] == seat]
    ww = sum(1 for g in arr if g['winner'] == seat)
    dd = sum(1 for g in arr if g['winner'] is None)
    print('- 座位 team%d：%d 局 %d 胜 %d 平 %d 负，进 %d 失 %d' % (
        seat, len(arr), ww, dd, len(arr)-ww-dd,
        sum(g['score_us'] for g in arr), sum(g['score_them'] for g in arr)))
for n in range(1, 7):
    arr = [g for g in A if g['teamSize'] == n]
    ww = sum(1 for g in arr if g['winner'] == g['our_team'])
    dd = sum(1 for g in arr if g['winner'] is None)
    print('- 人数 %d：%d 局 %d 胜 %d 平 %d 负，进 %d 失 %d' % (
        n, len(arr), ww, dd, len(arr)-ww-dd,
        sum(g['score_us'] for g in arr), sum(g['score_them'] for g in arr)))
our_shots = [s for g in A for s in g['shots'] if s['team'] == g['our_team']]
opp_shots = [s for g in A for s in g['shots'] if s['team'] != g['our_team']]
print('- 我方射门 %d（射正 %d，进球 %d，转化率 %.1f%%，射正转化 %.1f%%）' % (
    len(our_shots), sum(1 for s in our_shots if s['outcome'] in ('goal','save')),
    sum(1 for s in our_shots if s['outcome'] == 'goal'),
    100.0*sum(1 for s in our_shots if s['outcome']=='goal')/max(1,len(our_shots)),
    100.0*sum(1 for s in our_shots if s['outcome']=='goal')/max(1,sum(1 for s in our_shots if s['outcome'] in ('goal','save')))))
print('- 对方射门 %d（射正 %d，进球 %d，转化率 %.1f%%，射正转化 %.1f%%）' % (
    len(opp_shots), sum(1 for s in opp_shots if s['outcome'] in ('goal','save')),
    sum(1 for s in opp_shots if s['outcome'] == 'goal'),
    100.0*sum(1 for s in opp_shots if s['outcome']=='goal')/max(1,len(opp_shots)),
    100.0*sum(1 for s in opp_shots if s['outcome']=='goal')/max(1,sum(1 for s in opp_shots if s['outcome'] in ('goal','save')))))
zz_our = [Z[g['id']]['our'] for g in A]; zz_opp = [Z[g['id']]['opp'] for g in A]
our_tot = sum(x['total'] for x in zz_our); opp_tot = sum(x['total'] for x in zz_opp)
for key, label in [('own','本方三区'),('mid','中场三区'),('att','进攻三区'),('corr_att','进攻三区走廊'),('shotzone','射程区(距门9-14)')]:
    o = sum(x[key] for x in zz_our); p = sum(x[key] for x in zz_opp)
    print('- %s：我方 %d 帧（%.1f%%），对方 %d 帧（%.1f%%）' % (
        label, o, 100.0*o/our_tot, p, 100.0*p/opp_tot))
print('- 我方门将持球合计 %d 帧（%.1f s），20 局中 9 局最长持球≥5 s，4 局≥20 s' % (
    sum(v[0] for v in HOLD.values()), sum(v[0] for v in HOLD.values())/20.0))
# shot distributions
def dist(arr):
    c = collections.Counter()
    for s in arr:
        dd = s['dist_to_goal']
        c['<6' if dd < 6 else ('6-10' if dd < 10 else ('10-14' if dd < 14 else '>=14'))] += 1
    return c
print('- 我方射门距离分布：%s' % dict(dist(our_shots)))
print('- 对方射门距离分布：%s' % dict(dist(opp_shots)))
def target(arr):
    c = collections.Counter()
    for s in arr:
        ty = s['target_y']
        c['<12' if ty < 12 else ('12-14' if ty <= 14 else '>14')] += 1
    return c
print('- 对方射门目标 y 分布：%s' % dict(target(opp_shots)))
def nearfar(arr):
    c = collections.Counter()
    for s in arr:
        c['near' if (s['y']-13.0)*(s['target_y']-13.0) >= 0 else 'far'] += 1
    return c
print('- 对方射门近角/远角：%s' % dict(nearfar(opp_shots)))
print('- 对方进球近角/远角：%s' % dict(nearfar([x['shot'] for g in A for x in g['opp_goals'] if x['shot']])))
print('- 我方进球近角/远角：%s' % dict(nearfar([x['shot'] for g in A for x in g['our_goals'] if x['shot']])))

