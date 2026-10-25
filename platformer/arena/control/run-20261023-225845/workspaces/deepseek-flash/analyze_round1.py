# -*- coding: utf-8 -*-
"""复盘第 1 轮两局：逐帧统计推挤、怪物接近、起跳/减速与每局分段时间。"""
import gzip, json, sys, os

RUN = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FILES = [os.path.join(RUN, 'r1-g1.json.gz'), os.path.join(RUN, 'r1-g2.json.gz')]

HALF = 0.36
PW, PH = 0.72, 1.35
MW, MH = 0.72, 0.62
DT = 0.05

def load(path):
    with gzip.open(path, 'rt', encoding='utf-8') as fh:
        return json.load(fh)

def pits(level):
    w, h = level['width'], level['height']
    tiles = level['tiles']; gy = 13
    spans = []; start = None
    for x in range(w):
        solid = bool(tiles[gy * w + x])
        if not solid and start is None:
            start = x
        elif solid and start is not None:
            spans.append((start, x - 1)); start = None
    if start is not None:
        spans.append((start, w - 1))
    return spans

def segs_of(frames_list):
    """把帧号列表切成连续区间 [(a,b), ...]。"""
    out = []
    for f in frames_list:
        if out and f == out[-1][1] + 1:
            out[-1] = (out[-1][0], f)
        else:
            out.append((f, f))
    return out

def main():
    for path in FILES:
        d = load(path)
        frames = d['frames']
        print('=' * 96)
        print('%s seed=%d seats=%s level width=%d goalX=%d'
              % (d['id'], d['seed'], d['seats'], d['level']['width'], d['level']['goalX']))
        print('pits:', pits(d['level']))
        bounds = []; cur = None
        for e in d['events']:
            if e['type'] == 'go':
                cur = {'round': e['round'], 'start': e['frame']}
            elif e['type'] == 'round' and cur is not None:
                cur['end'] = e['frame']; cur['winner'] = e['team']; cur['reason'] = e['reason']
                bounds.append(cur); cur = None
        for seg in bounds:
            f0 = seg['start']; f1 = seg['end'] - 1  # 避免把下一局重置帧算进来
            segframes = frames[f0:f1 + 1]
            print('\n-- round %d: frames %d..%d (%.2fs) winner=team%d' %
                  (seg['round'], f0, f1, (f1 - f0 + 1) * DT, seg['winner']))
            contacts = []
            speeds = {0: [], 1: []}
            jumps = {0: [], 1: []}
            mon_min = {0: (9e9, None), 1: (9e9, None)}
            mon_near = {0: [], 1: []}
            prev = None
            for fr in segframes:
                rs = fr['runners']
                x0, x1 = rs[0]['x'], rs[1]['x']
                y0, y1 = rs[0]['y'], rs[1]['y']
                gap = x1 - x0
                ov_y = min(y0 + PH, y1 + PH) - max(y0, y1)
                if abs(gap) < PW and ov_y > 0.3:
                    contacts.append((fr['frame'], gap, x0, x1))
                for i, r in enumerate(rs):
                    speeds[i].append((fr['frame'], r['vx'], r['x'], r['onGround']))
                    if prev is not None:
                        pr = prev['runners'][i]
                        was_og = pr['onGround']; now_og = r['onGround']
                        if was_og and not now_og and r['y'] > pr['y'] - 0.2:
                            jumps[i].append((fr['frame'], round(r['x'], 2), round(r['vx'], 2)))
                    for m in fr['monsters']:
                        dd = abs(r['x'] - m['x'])
                        if dd < mon_min[i][0]:
                            mon_min[i] = (dd, (fr['frame'], round(r['x'], 2), round(m['x'], 2), m['dir']))
                        if dd < 1.5:
                            mon_near[i].append((fr['frame'], round(dd, 2), round(m['x'], 2)))
                prev = fr
            print('contact frames: %d' % len(contacts))
            for a, b in segs_of([c[0] for c in contacts]):
                ca = next(c for c in contacts if c[0] == a)
                cb = next(c for c in contacts if c[0] == b)
                print('   contact %d..%d (%.2fs) gap %.3f..%.3f x0 %.2f..%.2f x1 %.2f..%.2f'
                      % (a, b, (b - a + 1) * DT, ca[1], cb[1], ca[2], cb[2], ca[3], cb[3]))
            for i in (0, 1):
                r = segframes[-1]['runners'][i]
                print('  team%d end x=%.2f maxX=%.2f deaths=%d finished=%s vx=%.2f'
                      % (i, r['x'], r['maxX'], r['deaths'], r['finished'], r['vx']))
                slow = [s for s in speeds[i] if s[1] < 6.7 and s[3]]
                print('    ground slow frames (vx<6.7): %d' % len(slow))
                for a, b in segs_of([s[0] for s in slow]):
                    sa = next(s for s in slow if s[0] == a)
                    sb = next(s for s in slow if s[0] == b)
                    print('      slow %d..%d (%.2fs) x %.2f..%.2f vx %.2f..%.2f'
                          % (a, b, (b - a + 1) * DT, sa[2], sb[2], sa[1], sb[1]))
                print('    jumps: %s' % (jumps[i][:40],))
                print('    closest monster: dist=%.2f at %s' % mon_min[i])
                near = segs_of([s[0] for s in mon_near[i]])
                if near:
                    print('    monster within 1.5: %s' % [(a, b) for a, b in near])
            for e in d['events']:
                if e['type'] == 'monster' and f0 <= e['frame'] <= f1:
                    print('  spawn t=%.2f frame=%d x=%.2f' % (e['t'], e['frame'], e['x']))

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
