#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地对局矩阵：并发调用 tools/match.js，汇总 W/D/L、进失球与控球。
只用于自测；不修改任何受保护文件。"""
import argparse, json, subprocess, sys, concurrent.futures, os

MATCH = '/workspace/tools/match.js'

def run_one(agent, opp, n, side, seed=1):
    a, b = (agent, opp) if side == 'a' else (opp, agent)
    cmd = ['node', MATCH, '--seed', str(seed), '--teamSize', str(n), '--a', a, '--b', b]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        out = p.stdout.strip().splitlines()
        r = json.loads(out[-1]) if out else {}
    except Exception as e:
        return {'n': n, 'side': side, 'error': repr(e)}
    if not r or 'score' not in r:
        return {'n': n, 'side': side, 'error': 'badout', 'raw': (p.stdout or '')[:200], 'err': (p.stderr or '')[:300]}
    my = r['score'][0] if side == 'a' else r['score'][1]
    og = r['score'][1] if side == 'a' else r['score'][0]
    poss = r['stats'][0]['possession'] if side == 'a' else r['stats'][1]['possession']
    oposs = r['stats'][1]['possession'] if side == 'a' else r['stats'][0]['possession']
    kicks = r['stats'][0]['kicks'] if side == 'a' else r['stats'][1]['kicks']
    return {'n': n, 'side': side, 'my': my, 'og': og, 'reason': r['reason'],
            'poss': poss, 'oposs': oposs, 'kicks': kicks,
            'errors': r.get('errors'), 'seed': r.get('seed')}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--agent', default='python3 /workspace/agent.py')
    ap.add_argument('--opps', default='v0,noshield')
    ap.add_argument('--sizes', default='1-6')
    ap.add_argument('--par', type=int, default=8)
    ap.add_argument('--seeds', default='1')
    ap.add_argument('--json', default=None, help='把逐局结果写到该文件')
    args = ap.parse_args()
    lo, hi = (map(int, args.sizes.split('-')) if '-' in args.sizes else (int(args.sizes), int(args.sizes)))
    seeds = [int(x) for x in args.seeds.split(',')]
    jobs = []
    for name in args.opps.split(','):
        opp = args.opps
        opp_cmd = name if ' ' in name else 'python3 /workspace/agents/%s.py' % name
        for n in range(lo, hi + 1):
            for seed in seeds:
                for side in ('a', 'b'):
                    jobs.append((opp_cmd, name, n, side, seed))
    results = {name: [] for name in args.opps.split(',')}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.par) as ex:
        futs = {ex.submit(run_one, args.agent, j[0], j[2], j[3], j[4]): (j[1], j[2], j[3], j[4]) for j in jobs}
        for f in concurrent.futures.as_completed(futs):
            name = futs[f][0]
            results[name].append(f.result())
    grand = {}
    for name, rs in results.items():
        rs.sort(key=lambda r: (r.get('n', 0), r.get('side', ''), r.get('seed', 0)))
        w = d = l = gf = ga = 0
        poss = oposs = 0
        errs = []
        per_n = {}
        for r in rs:
            if 'error' in r:
                errs.append(r); continue
            if r['my'] > r['og']: w += 1
            elif r['my'] == r['og']: d += 1
            else: l += 1
            gf += r['my']; ga += r['og']; poss += r['poss']; oposs += r['oposs']
            e = per_n.setdefault(r['n'], [0, 0, 0, 0, 0])
            e[0] += 1 if r['my'] > r['og'] else 0
            e[1] += 1 if r['my'] == r['og'] else 0
            e[2] += 1 if r['my'] < r['og'] else 0
            e[3] += r['my']; e[4] += r['og']
        grand[name] = dict(W=w, D=d, L=l, GF=gf, GA=ga, poss=poss, oposs=oposs, errors=errs, per_n=per_n)
        print('%-14s W%-2d D%-2d L%-2d  GF%-4d GA%-4d  poss %d:%d' % (name, w, d, l, gf, ga, poss, oposs))
        for n in sorted(per_n):
            e = per_n[n]
            print('   n=%d  W%d D%d L%d  %d:%d' % (n, e[0], e[1], e[2], e[3], e[4]))
        if errs:
            print('   ERRORS:', json.dumps(errs[:3]))
    if args.json:
        with open(args.json, 'w') as f:
            json.dump({'agent': args.agent, 'results': results, 'grand': grand}, f, ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
