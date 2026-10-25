# -*- coding: utf-8 -*-
"""逐帧计算玩家与怪物的真实二维间距：贴身擦过 / 跳过怪物。"""
import gzip, json, sys, os
RUN = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PW, PH, MW, MH = 0.72, 1.35, 0.72, 0.62
DT = 0.05
NAMES = {0: 'team0', 1: 'team1'}

def segs(fs):
    out = []
    for f in fs:
        if out and f == out[-1][1] + 1: out[-1][1] = f
        else: out.append([f, f])
    return out

for fn in ['r1-g1.json.gz', 'r1-g2.json.gz']:
    with gzip.open(os.path.join(RUN, fn), 'rt', encoding='utf-8') as fh: d = json.load(fh)
    print('=' * 90); print(d['id'], 'seats', d['seats'])
    cur = None
    for e in d['events']:
        if e['type'] == 'go': cur = {'r': e['round'], 'f0': e['frame']}
        elif e['type'] == 'round' and cur:
            cur['f1'] = e['frame'] - 1
            seg = d['frames'][cur['f0']:cur['f1'] + 1]
            print('\nround %d frames %d..%d winner team%d' % (cur['r'], cur['f0'], cur['f1'], e['team']))
            for t in (0, 1):
                near = []      # dx<1.0 且纵向重叠
                over = []      # dx<0.72 但纵向无重叠（跳过）
                min_dx = (9e9, None)
                for f in seg:
                    p = f['runners'][t]
                    for m in f['monsters']:
                        dx = abs(p['x'] - m['x'])
                        ov = min(p['y'] + PH, m['y'] + MH) - max(p['y'], m['y'])
                        if dx < min_dx[0]: min_dx = (dx, (f['frame'], round(p['x'],2), round(m['x'],2), round(p['y'],2), round(ov,2)))
                        if dx < 1.0 and ov > 0:
                            near.append((f['frame'], round(dx,2), round(ov,2)))
                        if dx < PW and ov <= 0:
                            over.append((f['frame'], round(dx,2), round(ov,2), round(p['y'],2)))
                print(' %s closest dx=%.2f @ %s' % (NAMES[t], min_dx[0], min_dx[1]))
                print('   dx<1.0 & 纵向重叠: %d 帧 %s' % (len(near), segs([n[0] for n in near])))
                if over:
                    print('   跳过怪物(dx<0.72,纵向重叠<=0): %d 帧 %s; 最深纵向间隙 %.2f'
                          % (len(over), segs([o[0] for o in over]), min(o[2] for o in over)))
            cur = None
