#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Summarize practice batches by variant (round-4 preparation).

Usage: python -I work/summarize.py [--check DIR ...]
Writes work/final_summary.json and prints a table.
"""
import glob, json, os, sys

GROUPS = {
    'v21 baseline': ['074632', '075203', '075206', '075209'],
    'v30 (new carrier+deep keeper)': ['075932', '075935', '075938'],
    'k26 keeper base2.6': ['080553', '080555'],
    'k40 keeper base4.0': ['080557', '080559'],
    'k70 keeper base7.0': ['080601', '080609'],
    'v50 (roles+offense+keeper)': ['081300', '081302'],
    'f (freeze fix only)': ['081256', '081258'],
    'w (freeze+wallrun)': ['081627', '081629', '081631'],
    'x (wallrun+k26 keeper)': ['082007', '082009', '082011'],
    'y2 (wallrun+keeper lead)': ['082830', '082832', '082834'],
    'y (wallrun+solo fix)': ['082656', '082658', '082700', '085059', '085101', '085103',
                             '090806', '090808', '090810'],
    'z (compact wall)': ['083104', '083106', '083108', '084214', '084216',
                         '085053', '085055', '085057', '090812', '090814', '090816',
                         '091432', '091434'],
    'z3 (lateral cut)': ['083649', '083651', '083653'],
    'z4 (anti-foul)': ['083752', '083754', '083756'],
    'za (keeper cap5)': ['084218', '084220'],
    'zb (keeper cap12)': ['084222', '084224'],
    'zc (path keeper model)': ['084602', '084604', '084606'],
    'zd (keeper cap7/9)': ['084608', '084610'],
    'ze (max shot volume)': ['085706', '085708', '085710'],
    'zf (aggressive passing)': ['090134', '090136', '090138'],
    'zg (14-16 sweet spot)': ['090154', '090156', '090158'],
    'zr (keeper rush)': ['090937', '090939', '090941'],
    'zs (desperation rush)': ['091450', '091452', '091454'],
}
ROOT = '../../../practice-20261025-'


def main():
    # extra dirs given as --check <full path> are appended under a '--check' group
    extra = []
    if '--check' in sys.argv:
        i = sys.argv.index('--check')
        extra = sys.argv[i + 1:]
        if extra:
            GROUPS['checked'] = extra
    out = {}
    for label, ids in GROUPS.items():
        W = D = L = GF = GA = games = 0
        sized = {}
        for i in ids:
            p = i if (os.sep in i or '/' in i) else ROOT + i
            p = p if p.endswith('practice.json') else p + '/practice.json'
            try:
                d = json.load(open(p, encoding='utf-8'))
            except Exception:
                print('missing', p, file=sys.stderr)
                continue
            for r in d['records']:
                n = r['teamSize']; w = r['winner']; games += 1
                if w == 'deepseek-g1':
                    W += 1
                elif w is None:
                    D += 1
                else:
                    L += 1
                GF += r['scores']['deepseek-g1']; GA += r['scores']['sol']
                sized.setdefault(n, [0, 0, 0, 0, 0])
                s = sized[n]
                s[0 if w == 'deepseek-g1' else (1 if w is None else 2)] += 1
                s[3] += r['scores']['deepseek-g1']; s[4] += r['scores']['sol']
        if not games:
            continue
        out[label] = dict(games=games, W=W, D=D, L=L, GF=GF, GA=GA,
                          wr=round(W / games, 3),
                          by_size={n: sized[n] for n in sorted(sized)})
        print('%-32s %3d games %2d-%2d-%2d wr=%5.1f%% gf:ga=%d:%d'
              % (label, games, W, D, L, 100.0 * W / games, GF, GA))
    json.dump(out, open(os.path.join('work', 'final_summary.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('written work/final_summary.json')


if __name__ == '__main__':
    main()
