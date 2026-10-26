#!/usr/bin/env python3
"""Zone/possession analysis for round-2 replays (read-only)."""
import gzip, json, glob, sys

def load(p):
    with gzip.open(p, 'rt', encoding='utf-8') as f:
        return json.load(f)

def team_of_owner(o):
    if not o:
        return None
    if o.startswith('t0'):
        return 0
    if o.startswith('t1'):
        return 1
    return None

def main():
    pat = sys.argv[1] if len(sys.argv) > 1 else 'matches/r2-g*.json.gz'
    outpath = sys.argv[2] if len(sys.argv) > 2 else 'work/r2_zones.json'
    paths = sorted(glob.glob(pat), key=lambda s: int(s.split('-g')[-1].split('.')[0]))
    out = []
    for p in paths:
        d = load(p)
        seats = d['seats']
        our = seats.index('deepseek-g1')
        stats = {0: {'own': 0, 'mid': 0, 'att': 0, 'corr_att': 0, 'shotzone': 0, 'total': 0},
                 1: {'own': 0, 'mid': 0, 'att': 0, 'corr_att': 0, 'shotzone': 0, 'total': 0}}
        # count frames by owner and zone
        for fr in d['frames']:
            o = fr['ball'].get('owner')
            t = team_of_owner(o)
            if t is None:
                continue
            x, y = fr['ball']['x'], fr['ball']['y']
            # attacking direction: team 0 -> right (x=43), team 1 -> left (x=1)
            if t == 0:
                third = 'own' if x < 14.7 else ('mid' if x < 29.3 else 'att')
                corr = y < 6.0 or y > 20.0
                shotzone = 9.0 <= (43.0 - x) <= 14.0
            else:
                third = 'own' if x > 29.3 else ('mid' if x > 14.7 else 'att')
                corr = y < 6.0 or y > 20.0
                shotzone = 9.0 <= (x - 1.0) <= 14.0
            stats[t][third] += 1
            stats[t]['total'] += 1
            if third == 'att' and corr:
                stats[t]['corr_att'] += 1
            if shotzone:
                stats[t]['shotzone'] += 1
        out.append({'id': d['id'], 'teamSize': d['teamSize'], 'seats': seats,
                    'our_team': our, 'stats': {str(k): v for k, v in stats.items()},
                    'our': stats[our], 'opp': stats[1 - our]})
    with open(outpath, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('wrote', outpath)

if __name__ == '__main__':
    main()
