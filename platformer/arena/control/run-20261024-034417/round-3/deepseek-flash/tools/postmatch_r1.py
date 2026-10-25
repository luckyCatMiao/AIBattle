#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""第 1 轮两场对局的复盘数据提取（只读回放，不参与运行期）。"""
import gzip, json, sys, math, os

sys.stdout.reconfigure(encoding='utf-8')

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUN = os.path.dirname(os.path.dirname(BASE))

def load(fn):
    raw = gzip.decompress(open(fn, 'rb').read())
    # 回放里事件 reason 是 GBK 字节、比分等尾部字段是 UTF-8，混在一起；
    # 结构字段全是 ASCII，用 GBK + replace 即可读回绝大部分中文。
    return json.loads(raw.decode('gbk', errors='replace'))

def rounds_of(d):
    out = []
    cur = None
    for fr in d['frames']:
        r = fr['round']
        if cur is None or r != cur['round']:
            cur = {'round': r, 'frames': []}
            out.append(cur)
        cur['frames'].append(fr)
    return out

def tile_at(level, x, y):
    w = level['width']
    if 0 <= x < w and 0 <= y < level['height']:
        return level['tiles'][y * w + x]
    return 0

def surface_runs(level, tile=3):
    """地面行上连续 tile 的区间。"""
    gy = level['height'] - 13
    runs, s = [], None
    for x in range(level['width']):
        if tile_at(level, x, gy) == tile:
            if s is None: s = x
        else:
            if s is not None: runs.append((s, x - 1)); s = None
    if s is not None: runs.append((s, level['width'] - 1))
    return runs

def pits(level):
    gy = level['height'] - 13
    runs, s = [], None
    for x in range(level['width']):
        solid = any(tile_at(level, x, y) in (1, 2, 4) for y in range(gy, level['height']))
        if not solid:
            if s is None: s = x
        else:
            if s is not None: runs.append((s, x - 1)); s = None
    if s is not None: runs.append((s, level['width'] - 1))
    return [r for r in runs if r[1] - r[0] >= 1]

def snaps(d):
    """取每轮开始/结束帧、以及每轮内两人 maxX。"""
    rs = rounds_of(d)
    infos = []
    for r in rs:
        fr0, fr1 = r['frames'][0], r['frames'][-1]
        lvl = d['levels'][str(r['round'])]
        infos.append({
            'round': r['round'],
            'frame0': fr0['frame'], 'frame1': fr1['frame'],
            'width': lvl['width'], 'goalX': lvl['goalX'], 'startX': lvl['startX'],
            'maxX': [max(f['runners'][i]['maxX'] for f in r['frames']) for i in (0, 1)],
            'deaths_end': [fr1['runners'][i]['deaths'] for i in (0, 1)],
            'x_end': [fr1['runners'][i]['x'] for i in (0, 1)],
            'spikes': surface_runs(lvl, 3), 'pits': pits(lvl),
        })
    return infos

def push_events(d):
    return [e for e in d.get('final', {}).get('events', []) if e['type'] == 'push']

def overlap_frames(d):
    """逐帧检测两人身体重叠（push 只在重叠且前面未被挡住时发出）。"""
    out = []
    for i, fr in enumerate(d['frames']):
        a, b = fr['runners']
        half = 0.36
        ox = min(a['x'] + half, b['x'] + half) - max(a['x'] - half, b['x'] - half)
        oy = min(a['y'] + 1.35, b['y'] + 1.35) - max(a['y'], b['y'])
        if ox > 1e-9 and oy > 0.3:
            rear, front = (0, 1) if a['x'] <= b['x'] else (1, 0)
            out.append({'frame': fr['frame'], 'round': fr['round'], 't': fr['time'],
                        'rear': rear, 'front': front,
                        'xr': fr['runners'][rear]['x'], 'xf': fr['runners'][front]['x'],
                        'ox': round(ox, 3), 'oy': round(oy, 3)})
    return out

def episodes(ov):
    eps = []
    cur = None
    for e in ov:
        if cur and e['round'] == cur['round'] and e['rear'] == cur['rear'] and \
           e['frame'] == cur['frame1'] + 1:
            cur['frame1'] = e['frame']; cur['t1'] = e['t']; cur['n'] += 1
            cur['xf1'] = e['xf']; cur['maxox'] = max(cur['maxox'], e['ox'])
        else:
            if cur: eps.append(cur)
            cur = {'round': e['round'], 'rear': e['rear'], 'front': e['front'],
                   'frame0': e['frame'], 'frame1': e['frame'], 't0': e['t'], 't1': e['t'],
                   'xr': e['xr'], 'xf0': e['xf'], 'xf1': e['xf'], 'n': 1,
                   'maxox': e['ox']}
    if cur: eps.append(cur)
    return eps

def death_context(d, ev):
    """用 respawn 事件前一帧还原死亡位置与原因。"""
    i = ev['frame']
    prev = d['frames'][max(0, i - 1)]
    p = prev['runners'][ev['team']]
    o = prev['runners'][1 - ev['team']]
    near_mon = min((math.hypot(p['x'] - m['x'], p['y'] - m['y']) for m in prev['monsters']), default=None)
    return {'id': ev['id'], 't': ev['t'], 'frame': ev['frame'], 'round': prev['round'],
            'team': ev['team'], 'reason': ev['reason'],
            'x': p['x'], 'y': p['y'], 'maxX': p['maxX'], 'deaths': p['deaths'],
            'opp_x': o['x'], 'gap': round(o['x'] - p['x'], 2),
            'near_monster': None if near_mon is None else round(near_mon, 2),
            'monsters': [(m['x'], m['y']) for m in prev['monsters']]}

def monster_events(d):
    evs = [e for e in d['events'] if e['type'] == 'monster']
    out = []
    for e in evs:
        # 找 t 之后 3 秒内、离刷新点最近的一只怪，统计两人最近距离
        i0, i1 = e['frame'], min(len(d['frames']) - 1, e['frame'] + 60)
        key = None
        best = None
        for i in range(i0, i1 + 1):
            fr = d['frames'][i]
            for m in fr['monsters']:
                if abs(m['x'] - e['x']) <= 2.0:
                    key = m['id']
                    break
            if key: break
        mn = [None, None]
        alive = 0
        for i in range(i0, i1 + 1):
            fr = d['frames'][i]
            found = False
            for m in fr['monsters']:
                if key is None or m['id'] == key:
                    found = True
                    for k in (0, 1):
                        p = fr['runners'][k]
                        dist = math.hypot(p['x'] - m['x'], p['y'] - m['y'])
                        if mn[k] is None or dist < mn[k]: mn[k] = dist
            if found: alive += 1
        out.append({'t': e['t'], 'frame': e['frame'], 'round': d['frames'][e['frame']]['round'],
                    'x': e['x'], 'id': key, 'min_dist': [None if v is None else round(v, 2) for v in mn],
                    'seen_frames': alive})
    return out

def main():
    for fn in ('r1-g1.json.gz', 'r1-g2.json.gz'):
        path = os.path.join(RUN, fn)
        d = load(path)
        print('=' * 78)
        print(fn, 'seats=', d['seats'], 'winner=', d['seats'][d['winner']], 'reason=', d['reason'])
        print('总帧数/时长: %d / %.2fs' % (len(d['frames']), len(d['frames']) * 0.05))
        for it in snaps(d):
            print('  R%d 帧 %d-%d 关卡宽 %d goalX %d | maxX %s deaths %s endX %s'
                  % (it['round'], it['frame0'], it['frame1'], it['width'], it['goalX'],
                     it['maxX'], it['deaths_end'], it['x_end']))
            print('     地刺区间(地面行) %s | 坑 %s' % (it['spikes'], it['pits']))
        print(' -- 死亡 --')
        for e in d['events']:
            if e['type'] == 'respawn':
                print('  ', death_context(d, e))
        print(' -- 怪物刷新（每个刷新点后 3 秒内两人最近距离） --')
        for m in monster_events(d):
            print('  ', m)
        print(' -- 推挤（回放事件，仅最后 60 条；逐帧重叠检测为补充） --')
        pe = push_events(d)
        print('   回放中 push 事件 %d 条' % len(pe))
        for e in pe:
            print('    ', e)
        ov = overlap_frames(d)
        eps = episodes(ov)
        print('   逐帧重叠 %d 帧，分为 %d 段：' % (len(ov), len(eps)))
        for ep in eps:
            print('     R%d t=%.2f-%.2f (%.2fs) rear=%s front=%s x %.2f->%.2f (front %.2f->%.2f) n=%d maxOverlap=%.2f'
                  % (ep['round'], ep['t0'], ep['t1'], ep['t1'] - ep['t0'] + 0.05,
                     d['seats'][ep['rear']], d['seats'][ep['front']],
                     ep['xr'], ep['xr'], ep['xf0'], ep['xf1'], ep['n'], ep['maxox']))
        # 每轮内两人 x 差随时间的极值
        print(' -- 每轮 x 差（team0 - team1） --')
        for r in rounds_of(d):
            ds = [(f['runners'][0]['x'] - f['runners'][1]['x'], f) for f in r['frames']
                  if f['phase'] == 'race']
            if not ds: continue
            mn = min(ds, key=lambda z: z[0]); mx = max(ds, key=lambda z: z[0])
            print('   R%d: min %.2f @t %.2f | max %.2f @t %.2f | 末帧 %.2f'
                  % (r['round'], mn[0], mn[1]['time'], mx[0], mx[1]['time'],
                     ds[-1][0]))
    # 逐秒轨迹（只打最后 10 秒 / 关键段）
    print('=' * 78)
    d = load(os.path.join(RUN, 'r1-g2.json.gz'))
    for lo, hi in ((195, 206), (60, 67), (15, 20)):
        print(' -- r1-g2 t=%d..%d 轨迹 --' % (lo, hi))
        for fr in d['frames']:
            if fr['phase'] != 'race': continue
            t = fr['time']
            if lo <= t <= hi and abs((t * 20) % 20) < 1e-6:
                r0, r1 = fr['runners']
                print('  t=%6.2f R%d x:%6.2f/%6.2f y:%5.2f/%5.2f vx:%5.2f/%5.2f deaths:%d/%d mon:%d'
                      % (t, fr['round'], r0['x'], r1['x'], r0['y'], r1['y'],
                         r0['vx'], r1['vx'], r0['deaths'], r1['deaths'], len(fr['monsters'])))

if __name__ == '__main__':
    main()
