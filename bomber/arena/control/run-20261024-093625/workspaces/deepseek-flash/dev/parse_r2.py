# -*- coding: utf-8 -*-
"""Parse dev/r2/events.txt: per-round bomb cadence, pickups, chains, for both owners."""
import json, re, sys, collections

def parse(path):
    games = {}
    cur = None
    name = None
    for line in open(path, encoding='utf-8', errors='replace'):
        line = line.rstrip('\n')
        m = re.match(r'^===== (\S+) seats=(\[.*\]) seed=(\d+)', line)
        if m:
            name = m.group(1)
            games[name] = {'seats': m.group(2), 'seed': int(m.group(3)), 'events': []}
            continue
        m = re.match(r'^frameIdx=\d+ tick=(\d+) roundNow=(\d+) (\{.*\})$', line)
        if m and name:
            tick, rnd, js = int(m.group(1)), int(m.group(2)), m.group(3)
            try:
                e = json.loads(js)
            except Exception:
                continue
            games[name]['events'].append((tick, rnd, e))
    return games

def main():
    games = parse(sys.argv[1] if len(sys.argv) > 1 else 'dev/r2/events.txt')
    for name, g in games.items():
        print('=' * 100)
        print(name, 'seed', g['seed'], 'seats', g['seats'])
        byround = collections.defaultdict(list)
        for tick, rnd, e in g['events']:
            byround[rnd].append((tick, e))
        for rnd in sorted(byround):
            evs = byround[rnd]
            print('--- round', rnd)
            bombs = {0: [], 1: []}
            pickups = {0: collections.Counter(), 1: collections.Counter()}
            deaths = []
            expl = []
            maxsim = {0: 0, 1: 0}
            openb = {0: set(), 1: set()}
            for tick, e in evs:
                t = e.get('type')
                if t == 'bomb' and e.get('owner') in (0, 1):
                    bombs[e['owner']].append((tick, e['x'], e['y']))
                    openb[e['owner']].add((e['x'], e['y']))
                    maxsim[e['owner']] = max(maxsim[e['owner']], len(openb[e['owner']]))
                elif t == 'explode':
                    expl.append((tick, e.get('owner'), e.get('x'), e.get('y'), e.get('cells')))
                    openb[e.get('owner')] = set()
                elif t in ('bomb', 'blast', 'speed') and e.get('owner') in (0, 1) and '拾取' in (e.get('text') or ''):
                    pickups[e['owner']][t] += 1
                elif t == 'death':
                    deaths.append((tick, e.get('owner'), e.get('x'), e.get('y')))
            for o in (0, 1):
                bs = bombs[o]
                gaps = [bs[i+1][0] - bs[i][0] for i in range(len(bs)-1)]
                print('  P%d bombs=%d  first=%s last=%s  median_gap=%s  pickups=%s' % (
                    o, len(bs), bs[0][0]/20.0 if bs else None, bs[-1][0]/20.0 if bs else None,
                    sorted(gaps)[len(gaps)//2]/20.0 if gaps else None, dict(pickups[o])))
            print('  deaths:', [(t/20.0, o, x, y) for t, o, x, y in deaths])
            # attack proximity: bombs within 3 cells of the other's bomb at similar time is hard; skip
            print('  last 8 sol bombs:', [(t/20.0, x, y) for t, x, y in bombs[1][-8:]] if len(g['seats']) > 1 else '')

if __name__ == '__main__':
    main()
