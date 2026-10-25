#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""第 3 轮两场对局的复盘数据提取（只读回放，不参与运行期）。"""
import gzip, json, sys, math, os

sys.stdout.reconfigure(encoding='utf-8')

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUN = os.path.dirname(os.path.dirname(BASE))
SEAT = {0: 'deepseek-flash', 1: 'sol'}


def load(fn):
    raw = gzip.decompress(open(os.path.join(RUN, fn), 'rb').read())
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
    # 世界坐标 y=3 对应 tiles 行 height-1-3 = height-4（行 0 在最上面）
    gy = level['height'] - 4
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


def push_overlaps(d, r):
    """Return per-frame physical overlap episodes within one round."""
    out = []
    for fr in r['frames']:
        if fr['phase'] != 'race':
            continue
        a, b = fr['runners']
        half = 0.36
        ox = min(a['x'] + half, b['x'] + half) - max(a['x'] - half, b['x'] - half)
        oy = min(a['y'] + 1.35, b['y'] + 1.35) - max(a['y'], b['y'])
        if ox > 1e-9 and oy > 0.3:
            rear, front = (0, 1) if a['x'] <= b['x'] else (1, 0)
            out.append({'frame': fr['frame'], 't': fr['time'], 'round': r['round'],
                        'rear': rear, 'front': front,
                        'xr': a['x'] if rear == 0 else b['x'],
                        'xf': a['x'] if front == 0 else b['x'],
                        'vxr': a['vx'] if rear == 0 else b['vx'],
                        'vxf': a['vx'] if front == 0 else b['vx'],
                        'ox': ox, 'oy': oy})
    eps, cur = [], None
    for e in out:
        if cur and e['rear'] == cur['rear'] and e['frame'] == cur['frame1'] + 1:
            cur['frame1'] = e['frame']; cur['t1'] = e['t']; cur['n'] += 1
            cur['xf1'] = e['xf']; cur['maxox'] = max(cur['maxox'], e['ox'])
            cur['clamped'] = cur.get('clamped', 0) + (1 if e['vxr'] > 4.19 else 0)
            cur['vxr_min'] = min(cur.get('vxr_min', 99), e['vxr'])
        else:
            if cur:
                eps.append(cur)
            cur = {'round': e['round'], 'rear': e['rear'], 'front': e['front'],
                   'frame0': e['frame'], 'frame1': e['frame'], 't0': e['t'], 't1': e['t'],
                   'xr': e['xr'], 'xf0': e['xf'], 'xf1': e['xf'], 'n': 1,
                   'maxox': e['ox'], 'clamped': 1 if e['vxr'] > 4.19 else 0,
                   'vxr_min': e['vxr']}
    if cur:
        eps.append(cur)
    return out, eps


def death_context(d, ev, r):
    i = ev['frame'] - r['frames'][0]['frame']
    prev = r['frames'][max(0, i - 1)]
    p = prev['runners'][ev['team']]
    o = prev['runners'][1 - ev['team']]
    near_mon = min((math.hypot(p['x'] - m['x'], p['y'] - m['y'])
                    for m in prev['monsters']), default=None)
    recent_push = []
    for fr in r['frames'][max(0, i - 8):i]:
        rr = fr['runners']
        if abs(rr[0]['x'] - rr[1]['x']) < 0.75:
            recent_push.append((fr['frame'], round(rr[0]['x'] - rr[1]['x'], 2)))
    return {'id': ev['id'], 't': round(ev['t'], 2), 'frame': ev['frame'], 'round': r['round'],
            'team': ev['team'], 'who': d['seats'][ev['team']], 'reason': ev['reason'],
            'x': round(p['x'], 2), 'y': round(p['y'], 2), 'maxX': round(p['maxX'], 2),
            'opp_x': round(o['x'], 2), 'gap': round(o['x'] - p['x'], 2),
            'near_monster': None if near_mon is None else round(near_mon, 2),
            'monsters': [(round(m['x'], 1), round(m['y'], 1)) for m in prev['monsters']],
            'recent_dx': recent_push}


def monster_spawns(d):
    out = []
    for e in d['events']:
        if e['type'] != 'monster':
            continue
        i0 = e['frame']
        i1 = min(len(d['frames']) - 1, i0 + 60)
        key = None
        for i in range(i0, i1 + 1):
            for m in d['frames'][i]['monsters']:
                if abs(m['x'] - e['x']) <= 2.0:
                    key = m['id']; break
            if key:
                break
        mn = [None, None]
        first = 0
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
                first += 1
        out.append({'t': round(e['t'], 2), 'frame': e['frame'],
                    'round': d['frames'][i0]['round'], 'x': round(e['x'], 2), 'id': key,
                    'min_dist': [None if v is None else round(v, 2) for v in mn],
                    'seen_frames': first})
    return out


def main():
    for fn in ('r3-g1.json.gz', 'r3-g2.json.gz'):
        d = load(fn)
        print('=' * 90)
        print(fn, 'seats=', d['seats'], 'seed=', d['seed'],
              'winner=', None if d['winner'] is None else d['seats'][d['winner']],
              'reason=', d['reason'], 'errors=', d['errors'])
        nw = d.get('windows')
        nw = len(nw) if isinstance(nw, list) else nw
        print('总帧数 %d / 时间轴 %.2fs / frameMs=%s / windows=%s'
              % (len(d['frames']), len(d['frames']) * 0.05, d.get('frameMs'), nw))
        for r in rounds_of(d):
            rnd = r['round']
            lv = level_of(d, rnd)
            fr0, fr1 = r['frames'][0], r['frames'][-1]
            maxX = [max(f['runners'][i]['maxX'] for f in r['frames']) for i in (0, 1)]
            deaths = [fr1['runners'][i]['deaths'] for i in (0, 1)]
            print('  R%d 帧 %d-%d t %.2f-%.2f | 关卡 %d / goalX %d | maxX %s | deaths %s | '
                  'endX %s finished %s | winner=%s reason=%s'
                  % (rnd, fr0['frame'], fr1['frame'], fr0['time'], fr1['time'],
                     lv['width'], lv['goalX'], maxX, deaths,
                     [round(fr1['runners'][i]['x'], 2) for i in (0, 1)],
                     [fr1['runners'][i]['finished'] for i in (0, 1)],
                     fr1.get('winner'), fr1.get('reason')))
            print('     地刺 %s' % (surface_runs(lv, 3),))
            print('     坑 %s' % (pits(lv),))
            # x diff stats (team0 - team1)
            ds = [(f['runners'][0]['x'] - f['runners'][1]['x'], f) for f in r['frames']
                  if f['phase'] == 'race']
            if ds:
                mn = min(ds, key=lambda z: z[0]); mx = max(ds, key=lambda z: z[0])
                print('     x差(0-1): min %.2f @t%.2f | max %.2f @t%.2f | 末 %.2f'
                      % (mn[0], mn[1]['time'], mx[0], mx[1]['time'], ds[-1][0]))
            # per-round deaths (respawn events may lack a round field)
            for e in d['events']:
                if e['type'] == 'respawn' and fr0['frame'] <= e['frame'] <= fr1['frame']:
                    print('     [死亡]', death_context(d, e, r))
        print(' -- 怪物刷新（后 3 秒两人最近距离） --')
        for m in monster_spawns(d):
            print('  ', m)
        print(' -- 推挤（逐帧身体重叠还原） --')
        for r in rounds_of(d):
            ov, eps = push_overlaps(d, r)
            print('  R%d: %d 帧 / %d 段' % (r['round'], len(ov), len(eps)))
            for ep in eps:
                print('     t=%.2f-%.2f (%.2fs) rear=%s front=%s x %.2f->%.2f '
                      '(rear) front %.2f->%.2f n=%d maxOverlap=%.2f clamped=%d vxr_min=%.2f'
                      % (ep['t0'], ep['t1'], ep['t1'] - ep['t0'] + 0.05,
                         d['seats'][ep['rear']], d['seats'][ep['front']],
                         ep['xr'], ep['xr'], ep['xf0'], ep['xf1'], ep['n'],
                         ep['maxox'], ep['clamped'], ep['vxr_min']))
        print(' -- 其它事件 --')
        for e in d['events']:
            if e['type'] in ('finish', 'round'):
                print('  ', {k: e.get(k) for k in ('id', 't', 'frame', 'type', 'team', 'reason', 'round', 'wins')})


if __name__ == '__main__':
    main()
