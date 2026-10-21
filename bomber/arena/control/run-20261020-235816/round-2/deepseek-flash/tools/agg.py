import sys, os, json, collections
d = sys.argv[1]
g = collections.defaultdict(lambda: {'ser': [0, 0, 0], 'rnd': [0, 0], 'cdeaths': 0, 'cwins': 0,
                                     'errors': 0, 'matches': 0, 'timeout_rounds': 0, 'decided': 0})
for fn in sorted(os.listdir(d)):
    if not fn.endswith('.json'):
        continue
    parts = fn[:-5].split('__')
    cand, opp, seat = parts[0], parts[1], parts[2]
    recs = json.load(open(os.path.join(d, fn)))
    for r in recs:
        k = (cand, opp, seat)
        s = g[k]
        s['matches'] += 1
        s['rnd'][0] += r['cw']; s['rnd'][1] += r['ow']
        s['cdeaths'] += r['cdeaths']; s['cwins'] += r['cwins']
        s['errors'] += r['errors']
        for l in r['log']:
            if l[2] is None:
                s['timeout_rounds'] += 1
            else:
                s['decided'] += 1
        if r['cw'] > r['ow']:
            s['ser'][0] += 1
        elif r['cw'] < r['ow']:
            s['ser'][1] += 1
        else:
            s['ser'][2] += 1
for k in sorted(g):
    s = g[k]
    print('%-8s vs %-10s %-2s  series %2d-%2d-%2d  rounds %3d-%3d  kills %2d deaths %2d  err %d  timeouts %3d decided %3d' % (
        k[0], k[1], k[2], s['ser'][0], s['ser'][1], s['ser'][2],
        s['rnd'][0], s['rnd'][1], s['cwins'], s['cdeaths'], s['errors'],
        s['timeout_rounds'], s['decided']))
