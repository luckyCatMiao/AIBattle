#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""第 2 轮两场对局的复盘数据提取（只读回放，不参与运行期）。"""
import gzip, json, sys, math, os

sys.stdout.reconfigure(encoding='utf-8')

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUN = os.path.dirname(os.path.dirname(BASE))


def load(fn):
    raw = gzip.decompress(open(fn, 'rb').read())
    return json.loads(raw.decode('utf-8', errors='replace'))


def rounds_of(d):
    out, cur = [], None
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
    gy = level['height'] - 13
    runs, s = [], None
    for x in range(level['width']):
        if tile_at(level, x, gy) == tile:
            if s is None:
                s = x
        else:
            if s is not None:
                runs.append((s, x - 1)); s = None
    if s is not None:
        runs.append((s, level['width'] - 1))
    return runs


def pits(level):
    gy = level['height'] - 13
    runs, s = [], None
    for x in range(level['width']):
        solid = any(tile_at(level, x, y) in (1, 2, 4) for y in range(gy, level['height']))
        if not solid:
            if s is None:
                s = x
        else:
            if s is not None:
                runs.append((s, x - 1)); s = None
    if s is not None:
        runs.append((s, level['width'] - 1))
    return [r for r in runs if r[1] - r[0] >= 1]


def level_of(d, rnd):
    lv = d['levels'][str(rnd)]
    lv['height'] = lv.get('height', 16)
    return lv


def snaps(d):
    infos = []
    for r in rounds_of(d):
        fr0, fr1 = r['frames'][0], r['frames'][-1]
        lv = level_of(d, r['round'])
        infos.append({
            'round': r['round'],
            'frame0': fr0['frame'], 'frame1': fr1['frame'],
            'time0': fr0['time'], 'time1': fr1['time'],
            'width': lv['width'], 'goalX': lv['goalX'], 'startX': lv['startX'],
            'maxX': [max(f['runners'][i]['maxX'] for f in r['frames']) for i in (0, 1)],
            'deaths_end': [fr1['runners'][i]['deaths'] for i in (0, 1)],
            'x_end': [fr1['runners'][i]['x'] for i in (0, 1)],
            'finished': [fr1['runners'][i]['finished'] for i in (0, 1)],
            'winner': fr1.get('winner'),
            'spikes': surface_runs(lv, 3), 'pits': pits(lv),
            'plants_n': sum(1 for y in range(lv['height']) for x in range(lv['width'])
                            if tile_at(lv, x, y) == 0) and None,
        })
    return infos


def push_events(d):
    return [e for e in d.get('events', []) if e.get('type') == 'push']


def overlap_frames(d):
    out = []
    for fr in d['frames']:
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
    eps, cur = [], None
    for e in ov:
        if cur and e['round'] == cur['round'] and e['rear'] == cur['rear'] and \
           e['frame'] == cur['frame1'] + 1:
            cur['frame1'] = e['frame']; cur['t1'] = e['t']; cur['n'] += 1
            cur['xf1'] = e['xf']; cur['maxox'] = max(cur['maxox'], e['ox'])
        else:
            if cur:
                eps.append(cur)
            cur = {'round': e['round'], 'rear': e['rear'], 'front': e['front'],
                   'frame0': e['frame'], 'frame1': e['frame'], 't0': e['t'], 't1': e['t'],
                   'xr': e['xr'], 'xf0': e['xf'], 'xf1': e['xf'], 'n': 1,
                   'maxox': e['ox']}
    if cur:
        eps.append(cur)
    return eps


def death_context(d, ev):
    i = ev['frame']
    prev = d['frames'][max(0, i - 1)]
    p = prev['runners'][ev['team']]
    o = prev['runners'][1 - ev['team']]
    near_mon = min((math.hypot(p['x'] - m['x'], p['y'] - m['y'])
                    for m in prev['monsters']), default=None)
    return {'id': ev['id'], 't': ev['t'], 'frame': ev['frame'], 'round': prev['round'],
            'team': ev['team'], 'who': d['seats'][ev['team']], 'reason': ev['reason'],
            'x': p['x'], 'y': p['y'], 'maxX': p['maxX'], 'deaths': p['deaths'],
            'opp_x': o['x'], 'gap': round(o['x'] - p['x'], 2),
            'near_monster': None if near_mon is None else round(near_mon, 2),
            'monsters': [(m['x'], m['y']) for m in prev['monsters']]}


def monster_events(d):
    evs = [e for e in d['events'] if e['type'] == 'monster']
    out = []
    for e in evs:
        i0 = e['frame']
        i1 = min(len(d['frames']) - 1, i0 + 60)
        key = None
        for i in range(i0, i1 + 1):
            fr = d['frames'][i]
            for m in fr['monsters']:
                if abs(m['x'] - e['x']) <= 2.0:
                    key = m['id']; break
            if key:
                break
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
                        if mn[k] is None or dist < mn[k]:
                            mn[k] = dist
            if found:
                alive += 1
        out.append({'t': e['t'], 'frame': e['frame'], 'round': d['frames'][i0]['round'],
                    'x': e['x'], 'id': key,
                    'min_dist': [None if v is None else round(v, 2) for v in mn],
                    'seen_frames': alive})
    return out


def main():
    for fn in ('r2-g1.json.gz', 'r2-g2.json.gz'):
        d = load(os.path.join(RUN, fn))
        print('=' * 80)
        print(fn, 'seats=', d['seats'], 'winner=', d['seats'][d['winner']] if d['winner'] is not None else None,
              'reason=', d['reason'])
        print('总帧数 %d / 时间轴 %.2fs / frameMs=%s' % (len(d['frames']), len(d['frames']) * 0.05,
                                                     d.get('frameMs')))
        for it in snaps(d):
            print('  R%d 帧 %d-%d t %.2f-%.2f 关卡宽 %d goalX %d | maxX %s deaths %s endX %s finished %s winner=%s'
                  % (it['round'], it['frame0'], it['frame1'], it['time0'], it['time1'],
                     it['width'], it['goalX'], it['maxX'], it['deaths_end'], it['x_end'],
                     it['finished'], it['winner']))
            print('     地刺区间(地面行) %s' % (it['spikes'],))
            print('     坑 %s' % (it['pits'],))
        print(' -- 死亡 --')
        for e in d['events']:
            if e['type'] == 'respawn':
                print('  ', death_context(d, e))
        print(' -- 其它事件 --')
        for e in d['events']:
            if e['type'] in ('finish', 'round', 'go'):
                print('  ', {k: e.get(k) for k in ('id', 't', 'frame', 'type', 'team', 'reason')})
        print(' -- 怪物刷新（后 3 秒两人最近距离） --')
        for m in monster_events(d):
            print('  ', m)
        ov = overlap_frames(d)
        eps = episodes(ov)
        print(' -- 推挤：逐帧身体重叠 %d 帧，%d 段 --' % (len(ov), len(eps)))
        for ep in eps:
            print('     R%d t=%.2f-%.2f (%.2fs) rear=%s front=%s x %.2f->%.2f (front %.2f->%.2f) n=%d maxOverlap=%.2f'
                  % (ep['round'], ep['t0'], ep['t1'], ep['t1'] - ep['t0'] + 0.05,
                     d['seats'][ep['rear']], d['seats'][ep['front']],
                     ep['xr'], ep['xr'], ep['xf0'], ep['xf1'], ep['n'], ep['maxox']))
        # 每轮 x 差与关键拐点
        print(' -- 每轮 x 差（team0 - team1） --')
        for r in rounds_of(d):
            ds = [(f['runners'][0]['x'] - f['runners'][1]['x'], f) for f in r['frames']
                  if f['phase'] == 'race']
            if not ds:
                continue
            mn = min(ds, key=lambda z: z[0]); mx = max(ds, key=lambda z: z[0])
            print('   R%d: min %.2f @t %.2f | max %.2f @t %.2f | 末帧 %.2f'
                  % (r['round'], mn[0], mn[1]['time'], mx[0], mx[1]['time'], ds[-1][0]))


if __name__ == '__main__':
    main()
