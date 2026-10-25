# -*- coding: utf-8 -*-
"""快速评估：两个 seed base 覆盖 6 种人数 x 2 种开球方 = 12 个确定性对局。"""
import json, os, subprocess, sys, glob, pathlib
HERE = pathlib.Path(__file__).resolve().parent.parent
BASES = [9500, 20001]
rows = []
for base in BASES:
    out = subprocess.run([sys.executable, str(HERE / 'practice.py'), '--games', '6',
                          '--seed-base', str(base)], cwd=str(HERE),
                         capture_output=True, text=True, encoding='utf-8', errors='replace')
    line = [l for l in out.stdout.splitlines() if l.startswith('PRACTICE_RESULT')]
    if not line:
        print(out.stdout[-2000:], out.stderr[-2000:]); sys.exit(1)
    sc = json.loads(line[-1][len('PRACTICE_RESULT '):])
    d = json.load(open(os.path.join(sc['replay_dir'], 'practice.json'), encoding='utf-8'))
    for r in d['records']:
        rows.append((base, r['teamSize'], r['seat'], r['scores']['deepseek-g1'],
                     r['scores']['sol'], r['winner']))
w = sum(1 for r in rows if r[5] == 'deepseek-g1')
l = sum(1 for r in rows if r[5] is not None and r[5] != 'deepseek-g1')
d_ = len(rows) - w - l
print('base  n seat  us:them  result')
for r in rows:
    print('%5d %d %d   %d:%-2d   %s' % (r[0], r[1], r[2], r[3], r[4],
                                        'WIN' if r[5] == 'deepseek-g1' else ('LOSS' if r[5] else 'DRAW')))
print('TOTAL %dW %dL %dD  win_rate=%.3f' % (w, l, d_, w / len(rows)))
