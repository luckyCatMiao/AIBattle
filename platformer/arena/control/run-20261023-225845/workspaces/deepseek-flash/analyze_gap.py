# -*- coding: utf-8 -*-
"""分轮查看两人 x 间距变化、超车点与异常减速。"""
import gzip, json, sys, os
RUN = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DT = 0.05
for fn in ['r1-g1.json.gz', 'r1-g2.json.gz']:
    with gzip.open(os.path.join(RUN, fn), 'rt', encoding='utf-8') as fh:
        d = json.load(fh)
    frames = d['frames']
    print('=' * 90); print(d['id'], 'seats', d['seats'])
    cur = None
    for e in d['events']:
        if e['type'] == 'go':
            cur = {'r': e['round'], 'f0': e['frame']}
        elif e['type'] == 'round' and cur:
            cur['f1'] = e['frame'] - 1; cur['w'] = e['team']
            seg = frames[cur['f0']:cur['f1'] + 1]
            gaps = [(f['frame'], f['runners'][1]['x'] - f['runners'][0]['x']) for f in seg]
            init = gaps[0][1]
            gmin = min(gaps, key=lambda t: t[1]); gmax = max(gaps, key=lambda t: t[1])
            print('\nround %d winner team%d init gap %.2f min %.2f@%d max %.2f@%d'
                  % (cur['r'], cur['w'], init, gmin[1], gmin[0], gmax[1], gmax[0]))
            # 每 20 帧抽样
            sample = []
            for i in range(0, len(seg), 20):
                f = seg[i]
                r0, r1 = f['runners']
                sample.append('%d:%.1f/%.1f g%.2f' % (f['frame'], r0['x'], r1['x'], r1['x'] - r0['x']))
            print('  ' + ' | '.join(sample))
            # 显著减速（vx 从 >=6 掉到 <5，且在地面）
            events = []
            for i in range(1, len(seg)):
                a, b = seg[i - 1]['runners'], seg[i]['runners']
                for t in (0, 1):
                    if a[t]['vx'] >= 6 and b[t]['vx'] < 5 and b[t]['onGround']:
                        events.append((seg[i]['frame'], t, a[t]['x'], b[t]['vx']))
            print('  hard slows (vx>=6 -> <5):', events[:20])
            # 0 交叉 / 超车
            crosses = []
            for i in range(1, len(gaps)):
                if (gaps[i - 1][1] > 0) != (gaps[i][1] > 0):
                    crosses.append((gaps[i][0], gaps[i - 1][1], gaps[i][1]))
            print('  gap zero crossings:', crosses)
            cur = None
