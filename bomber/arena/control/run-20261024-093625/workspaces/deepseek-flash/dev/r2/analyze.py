# -*- coding: utf-8 -*-
"""Round-2 replay analysis (own tool, not submitted)."""
import gzip, json, sys, os

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
# BASE -> run-20261024-093625

def load(name):
    with gzip.open(os.path.join(BASE, name + '.json.gz'), 'rt', encoding='utf-8') as f:
        return json.load(f)

def evkey(e):
    return (e.get('id'), e.get('frame'), e.get('type'), e.get('owner'), e.get('x'), e.get('y'))

def new_events(frames, upto_idx, since_idx):
    seen = set()
    out = []
    for i in range(0, upto_idx + 1):
        for e in frames[i].get('events', []):
            k = evkey(e)
            if k in seen:
                continue
            seen.add(k)
            if i >= since_idx:
                out.append(e)
    return out

def fmt_inputs(inp):
    """20 frames -> compact string; BOMB marked []."""
    s = []
    for i, f in enumerate(inp):
        d = f.get('dir', 'N')
        if f.get('btn') == 'BOMB':
            s.append('%s*' % d)
        else:
            s.append(d)
    # run length encode
    out = []
    cur, n = s[0], 1
    for x in s[1:]:
        if x == cur:
            n += 1
        else:
            out.append('%s%d' % (cur, n))
            cur, n = x, 1
    out.append('%s%d' % (cur, n))
    return ' '.join(out)

def describe_state(s):
    fs = []
    for f in s.get('fighters', []):
        fs.append('P%d(%s)@(%s,%s) alive=%s eq=%d/%d/%d active=%d' % (
            f['owner'], f['id'], f['px'], f['py'], f['alive'],
            f['bombs'], f['blast'], f['speed'], f['activeBombs']))
    bombs = '; '.join('B%d@(%s,%s)fuse%d blast%d' % (b['owner'], b['x'], b['y'], b['fuse'], b['blast'])
                     for b in s.get('bombs', []))
    blasts = ','.join('(%s,%s)' % (b['x'], b['y']) for b in s.get('blasts', []))
    return ' | '.join(fs) + '\n      bombs: ' + (bombs or '-') + '\n      blasts: ' + (blasts or '-')

def main():
    name = sys.argv[1]
    d = load(name)
    frames = d['frames']
    windows = d['windows']
    seats = d['seats']
    print('===== %s seed=%s seats=%s total_tick=%s' % (name, d['seed'], seats, d['final']['tick']))
    # deaths
    seen = set()
    deaths = []
    for i, s in enumerate(frames):
        for e in s.get('events', []):
            k = evkey(e)
            if k in seen:
                continue
            seen.add(k)
            if e.get('type') == 'death':
                deaths.append((i, e))
    print('deaths:', [(i, e['owner'], frames[i]['tick'], e['frame'], e['x'], e['y']) for i, e in deaths])
    for i, e in deaths:
        tick = frames[i]['tick']          # tick of the window in which the death was reported
        round_frame = e['frame']
        w = (tick - 1) // 20
        print('\n' + '=' * 100)
        print('DEATH owner=%s abs_tick=%s round_frame=%s at (%s,%s)' % (e['owner'], tick, round_frame, e['x'], e['y']))
        lo = max(0, w - 4)
        for i in range(lo, min(len(frames), w + 2)):
            s = frames[i]
            print('\n[tick %d round %d] %s' % (s['tick'], s['round'], describe_state(s)))
        print('\n-- inputs by window (seat order %s) --' % seats)
        for i in range(lo, min(len(windows), w + 1)):
            win = windows[i]
            print('window %d (frames %d-%d):' % (i, win['frame'] - 19, win['frame']))
            for seat in range(2):
                inp = win['inputs'][seat]
                bombs = [str(j) for j, f in enumerate(inp) if f.get('btn') == 'BOMB']
                print('  seat%d %-15s %s   BOMB@%s' % (seat, seats[seat], fmt_inputs(inp), ','.join(bombs) or '-'))
        since = max(0, w - 2)
        print('\n-- new events since frame index %d --' % since)
        for ev in new_events(frames, min(w + 1, len(frames) - 1), since):
            print('  ', json.dumps(ev, ensure_ascii=False))

if __name__ == '__main__':
    main()
