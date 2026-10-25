import gzip, json, math, glob, sys, os

def load(p):
    with gzip.open(p, 'rt', encoding='utf-8') as f:
        return json.load(f)

def build_track(t):
    pts = t['points']
    L = t['length']
    seg = []
    cum = [0.0]
    for i in range(len(pts)):
        a = pts[i]
        b = pts[(i + 1) % len(pts)]
        dx = b['x'] - a['x']
        dy = b['y'] - a['y']
        d = math.hypot(dx, dy)
        seg.append((a['x'], a['y'], dx, dy, d))
        cum.append(cum[-1] + d)
    scale = L / cum[-1]
    cum = [x * scale for x in cum]
    return pts, seg, cum, L

def project(seg, cum, x, y):
    best = None
    for i, (ax, ay, dx, dy, d) in enumerate(seg):
        if d <= 1e-9:
            continue
        tt = ((x - ax) * dx + (y - ay) * dy) / (d * d)
        tt = max(0, min(1, tt))
        px = ax + tt * dx
        py = ay + tt * dy
        dd = (x - px) ** 2 + (y - py) ** 2
        if best is None or dd < best[0]:
            cross = (dx * (y - ay) - dy * (x - ax)) / d
            best = (dd, i, tt, cum[i] + tt * d, cross, math.atan2(dy, dx))
    return best[3], best[4], best[5]

def unwrap(series, L, start_s):
    out = []
    off = 0.0
    prev = start_s
    for s in series:
        v = s + off
        while v - prev > L / 2:
            off -= L
            v = s + off
        while v - prev < -L / 2:
            off += L
            v = s + off
        out.append(v)
        prev = v
    return out

def segs(flags, start=0):
    res = []
    i = 0
    while i < len(flags):
        if flags[i]:
            j = i
            while j + 1 < len(flags) and flags[j + 1]:
                j += 1
            res.append((i + start, j + start, j - i + 1))
            i = j + 1
        else:
            i += 1
    return res

def lap_events(events, team):
    return [(e['frame'], e['t'], e.get('time')) for e in events if e['type'] == 'lap' and e.get('team') == team]

def inputs_for(d, idx):
    mp = {}
    for w in d['windows']:
        f = w['frame']
        arr = w['inputs'][idx]
        for k, inp in enumerate(arr):
            if isinstance(inp, list):
                inp = inp[0]
            mp[f + k] = inp
    return mp

def analyze(p):
    d = load(p)
    frames = d['frames']
    seats = d['seats']
    our = seats.index('deepseek-flash')
    opp = 1 - our
    L = d['track']['length']
    pts, seg, cum, _ = build_track(d['track'])
    data = {'id': d['id'], 'seed': d['seed'], 'seats': seats, 'our': our, 'opp': opp,
            'trackL': L, 'halfWidth': d['track']['halfWidth'], 'frames': len(frames),
            'events': d['events'], 'winner': d['winner'], 'reason': d['reason']}
    cars = [[f['cars'][i] for f in frames] for i in (0, 1)]
    proj = {}
    for i in (0, 1):
        ss = []
        lats = []
        tang = []
        for f in frames:
            c = f['cars'][i]
            s, lat, ta = project(seg, cum, c['x'], c['y'])
            ss.append(s)
            lats.append(lat)
            tang.append(ta)
        un = unwrap(ss, L, ss[0])
        proj[i] = {'s': ss, 'lat': lats, 'tan': tang, 'un': un}
    carstats = {}
    for i in (0, 1):
        c = cars[i]
        run = [(k, c[k]) for k in range(len(c)) if frames[k]['tick'] * 0.05 >= 1.5]
        flags_b = [bool(x['boosting']) for k, x in run]
        flags_d = [bool(x['drifting']) for k, x in run]
        flags_o = [bool(x['offRoad']) for k, x in run]
        ov = [flags_b[j] and flags_d[j] for j in range(len(run))]
        base = run[0][0]
        bsegs = segs(flags_b, base)
        dsegs = segs(flags_d, base)
        osegs = segs(flags_o, base)
        sp = [x['speed'] for k, x in run]
        e = [x['boostEnergy'] for k, x in run]
        carstats[i] = {
            'boost_frames': sum(flags_b), 'drift_frames': sum(flags_d),
            'offroad_frames': sum(flags_o), 'overlap_frames': sum(ov),
            'boost_segs': bsegs, 'drift_segs': dsegs, 'offroad_segs': osegs,
            'speed_min': min(sp), 'speed_avg': sum(sp) / len(sp), 'speed_max': max(sp),
            'energy_min': min(e), 'energy_avg': sum(e) / len(e), 'energy_max': max(e),
            'collisions': c[-1]['collisions'], 'finishTime': c[-1]['finishTime'],
            'first_drift': dsegs[0] if dsegs else None, 'first_boost': bsegs[0] if bsegs else None,
            'first_drift_state': next((k for k, x in enumerate(c) if x['drifting']), None),
            'first_boost_state': next((k for k, x in enumerate(c) if x['boosting']), None),
            'bestLap': c[-1]['bestLap'], 'boosts': c[-1]['boosts'], 'driftTime': c[-1]['driftTime'],
            'lap_events': lap_events(d['events'], i)}
        evs = [e for e in d['events'] if e['type'] == 'lap' and e.get('team') == i]
        bounds = [30] + [e['frame'] for e in evs]
        laps = []
        for a, b in zip(bounds, bounds[1:]):
            dist = sum(math.hypot(cars[i][k + 1]['x'] - cars[i][k]['x'],
                                  cars[i][k + 1]['y'] - cars[i][k]['y']) for k in range(a, b))
            lats = proj[i]['lat'][a:b]
            laps.append({'start': a, 'end': b, 'frames': b - a, 'dist': dist,
                         'lat_abs_avg': sum(abs(x) for x in lats) / len(lats),
                         'lat_avg': sum(lats) / len(lats)})
        carstats[i]['laps_path'] = laps
    gaps = []
    for k in range(30, len(frames), 10):
        gaps.append((k, round(k * 0.05, 2),
                     round(proj[our]['un'][k] - proj[opp]['un'][k], 2),
                     round(cars[our][k]['speed'], 2), round(cars[opp][k]['speed'], 2)))
    data['carstats'] = carstats
    data['gaps'] = gaps
    data['proj'] = proj
    inp_our = inputs_for(d, our)
    neg = [(k, v['throttle']) for k, v in sorted(inp_our.items()) if v.get('throttle', 1) < 0]
    data['neg_throttle'] = neg
    data['input_boost_frames'] = sorted(k for k, v in inp_our.items() if v.get('boost'))
    data['input_drift_frames'] = sorted(k for k, v in inp_our.items() if v.get('drift'))
    return data

if __name__ == '__main__':
    out = {}
    for p in sorted(glob.glob('r*-g*.json.gz')):
        a = analyze(p)
        out[a['id']] = a
        cs = a['carstats']
        our = a['our']
        opp = a['opp']
        print('=' * 100)
        print(a['id'], 'seed', a['seed'], 'L=%.3f hw=%.3f frames=%d seats=%s' % (
            a['trackL'], a['halfWidth'], a['frames'], a['seats']))
        for i in (our, opp):
            c = cs[i]
            tag = 'OUR' if i == our else 'OPP'
            print(' %s car%d: laps=%s finish=%s best=%s' % (
                tag, i, [(e[0], e[1], e[2]) for e in c['lap_events']], c['finishTime'], c['bestLap']))
            print('   boost %df/%.2fs segs %d first=%s | drift %df/%.2fs segs %d first=%s | overlap %.2fs' % (
                c['boost_frames'], c['boost_frames'] * 0.05, len(c['boost_segs']), c['first_boost_state'],
                c['drift_frames'], c['drift_frames'] * 0.05, len(c['drift_segs']), c['first_drift_state'],
                c['overlap_frames'] * 0.05))
            print('   speed %.2f/%.2f/%.2f energy %.3f/%.3f/%.3f offroad %d coll %d' % (
                c['speed_min'], c['speed_avg'], c['speed_max'],
                c['energy_min'], c['energy_avg'], c['energy_max'],
                c['offroad_frames'], c['collisions']))
            print('   laps_path', [(x['start'], x['end'], round(x['dist'], 2), round(x['lat_abs_avg'], 2))
                                   for x in c['laps_path']])
        print(' gaps (frame,t,gap,speed_our,speed_opp):')
        for g in a['gaps']:
            print('  ', g)
        print(' neg throttle frames:', a['neg_throttle'])
        print(' last frame:', a['frames'] - 1, 'our un:', round(a['proj'][our]['un'][-1], 2),
              'opp un:', round(a['proj'][opp]['un'][-1], 2),
              'diff:', round(a['proj'][our]['un'][-1] - a['proj'][opp]['un'][-1], 2))
        a.pop('proj', None)
    with open('tools/series_metrics.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1, default=str)
