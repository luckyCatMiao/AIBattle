# -*- coding: utf-8 -*-
"""分析 dumpgame 输出的 JSONL：球权分布、球所在三区、起脚位置与方向、进球。"""
import json, sys, math, collections

recs = [json.loads(l) for l in open(sys.argv[1], encoding='utf-8')]
me = int(sys.argv[2]) if len(sys.argv) > 2 else 0
sg = 1 if me == 0 else -1
GL = 43.0 if me == 0 else 1.0
OL = 1.0 if me == 0 else 43.0

N = len(recs) - 1
third = collections.Counter(); poss = collections.Counter()
carrier_pos = collections.Counter()
kicks = []          # (window, team, x, y, angle, in_zone)
goals = []
for i in range(1, N + 1):
    st = recs[i]['state']
    prev = recs[i - 1]['state']
    b = st['ball']
    x = b['x']; fx = x if me == 0 else 44 - x
    third['own' if fx < 15 else ('mid' if fx < 29 else 'att')] += 1
    own = b['owner']
    if own:
        poss[int(own[1])] += 1
        if int(own[1]) == me:
            u = next((u for u in st['units'] if 't%du%d' % (u['team'], u['index']) == own), None)
            if u:
                carrier_pos[round(u['x'] / 3) * 3] += 1
    # 本窗口双方输入
    for team, key in ((0, 'w0'), (1, 'w1')):
        w = recs[i - 1].get(key)
        if not w: continue
        for f, fr in enumerate(w):
            for j, inp in enumerate(fr):
                if inp.get('kick'):
                    # 起脚瞬间球的近似位置 = 上一窗口末状态
                    u = next((u for u in prev['units'] if u['team'] == team and u['index'] == j), None)
                    if u:
                        a = inp.get('aim')
                        kicks.append((i - 1, team, u['x'], u['y'], a, f))
    if st['score'] != prev['score']:
        goals.append((st['frame'], prev['score'], st['score']))

print('windows %d  frames %d  final %s' % (N, recs[-1]['state']['frame'], recs[-1]['state']['score']))
print('球三区(我方视角)', dict(third))
print('控球窗口  mine=%d theirs=%d loose=%d' % (poss[me], poss[1 - me], N - poss[me] - poss[1 - me]))
print('我方持球 x 分桶:', sorted(carrier_pos.items()))
km = [k for k in kicks if k[1] == me]
ko = [k for k in kicks if k[1] != me]
print('起脚 mine=%d theirs=%d' % (len(km), len(ko)))
def zone(x):  # 我方视角的前场
    fx = x if me == 0 else 44 - x
    return 'own' if fx < 15 else ('mid' if fx < 29 else 'att')
print('我方起脚区域', collections.Counter(zone(k[2]) for k in km))
print('对方起脚区域', collections.Counter(zone(k[2]) for k in ko))
print('我方起脚明细(win,x,y,aim,frame):')
for k in km[:60]: print('   ', k)
print('进球:', goals)
