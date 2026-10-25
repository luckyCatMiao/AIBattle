#!/usr/bin/env python3
"""Aggregate tools/bench.js --verbose output by seat (A's seat). Tooling only."""
import subprocess, sys, re, collections

def run(a, b, seeds='9001-9004', sizes='1,2,3,4,5,6'):
    out = subprocess.run(['node', 'tools/bench.js', '--a', a, '--b', b,
                          '--seeds', seeds, '--sizes', sizes, '--parallel', '16', '--verbose'],
                         capture_output=True, text=True).stdout
    agg = collections.defaultdict(lambda: [0, 0, 0, 0, 0, 0])
    for line in out.splitlines():
        m = re.search(r'seed=(\d+) n=(\d+) seat=(\d) (\d+):(\d+) ([WDL])', line)
        if not m:
            continue
        _, n, seat, gf, ga, res = m.groups()
        s = agg[int(seat)]
        s[0] += 1
        s[1 + 'WDL'.index(res)] += 1
        s[4] += int(gf)
        s[5] += int(ga)
    return agg

if __name__ == '__main__':
    a, b = sys.argv[1], sys.argv[2]
    seeds = sys.argv[3] if len(sys.argv) > 3 else '9001-9004'
    sizes = sys.argv[4] if len(sys.argv) > 4 else '1,2,3,4,5,6'
    agg = run(a, b, seeds, sizes)
    print(f'A={a}  B={b}  seeds={seeds} sizes={sizes}')
    for seat in (0, 1):
        g, w, d, l, gf, ga = agg[seat]
        print(f'  seat={seat}: {w}W {d}D {l}L  gf={gf} ga={ga} gd={gf-ga}  games={g}')
