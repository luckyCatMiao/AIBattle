#!/usr/bin/env python3
"""Possession-spell extraction for round-2 replays (read-only)."""
import gzip, json, glob, sys

def load(p):
    with gzip.open(p, 'rt', encoding='utf-8') as f:
        return json.load(f)

def owner_team(o):
    if not o:
        return None
    return 0 if o.startswith('t0') else (1 if o.startswith('t1') else None)

def main():
    pat = sys.argv[1] if len(sys.argv) > 1 else 'matches/r2-g*.json.gz'
    outpath = sys.argv[2] if len(sys.argv) > 2 else 'work/r2_spells.json'
    paths = sorted(glob.glob(pat), key=lambda s: int(s.split('-g')[-1].split('.')[0]))
    out = []
    for p in paths:
        d = load(p)
        seats = d['seats']; our = seats.index('deepseek-g1')
        kicks = {}
        team_kicks = {0: [], 1: []}
        for e in d['events']:
            if e['type'] == 'kick':
                kicks.setdefault(e['unit'], []).append(e)
                team_kicks[e['team']].append(e['frame'])
        spells = []
        cur = None
        for fr in d['frames']:
            b = fr['ball']; t = owner_team(b.get('owner'))
            if cur is None or cur['team'] != t:
                if cur is not None:
                    cur['end_frame'] = fr['frame'] - 1
                    cur['end_t'] = round((fr['frame'] - 1) / 20.0, 2)
                    spells.append(cur)
                if t is None:
                    cur = None
                else:
                    cur = {'team': t, 'start_frame': fr['frame'], 'start_t': round(fr['frame']/20.0, 2),
                           'start_x': round(b['x'], 2), 'start_y': round(b['y'], 2),
                           'frames': 0, 'kicks': 0, 'max_adv': None}
            if cur is not None and cur['team'] == t:
                cur['frames'] += 1
                x, y = b['x'], b['y']
                adv = x if t == 0 else (44.0 - x)
                if cur['max_adv'] is None or adv > cur['max_adv']:
                    cur['max_adv'] = adv
        if cur is not None:
            cur['end_frame'] = d['final']['frame']
            cur['end_t'] = round(d['final']['frame'] / 20.0, 2)
            spells.append(cur)
        for s in spells:
            s['kicks'] = sum(1 for f in team_kicks[s['team']] if s['start_frame'] <= f <= s['end_frame'])
        # summarize per team
        summary = {}
        for t in (0, 1):
            ss = [s for s in spells if s['team'] == t and s['frames'] >= 10]
            summary[seats[t]] = {
                'n': len(ss),
                'frames': sum(s['frames'] for s in ss),
                'avg_frames': round(sum(s['frames'] for s in ss) / len(ss), 1) if ss else 0,
                'att_start': sum(1 for s in ss if (s['start_x'] > 22 if t == 0 else s['start_x'] < 22)),
                'adv_end_30': sum(1 for s in ss if s['max_adv'] and s['max_adv'] >= 30),
                'kicks': sum(s['kicks'] for s in ss),
                'long': sum(1 for s in ss if s['frames'] >= 100),
            }
        out.append({'id': d['id'], 'teamSize': d['teamSize'], 'seats': seats,
                    'our_team': our, 'summary': summary,
                    'our': summary[seats[our]], 'opp': summary[seats[1-our]],
                    'spells': spells})
    with open(outpath, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('wrote', outpath)

if __name__ == '__main__':
    main()
