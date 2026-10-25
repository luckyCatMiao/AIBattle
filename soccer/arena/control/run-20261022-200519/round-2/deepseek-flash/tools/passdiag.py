#!/usr/bin/env python3
"""Diagnose our kick outcomes from a harness dump: who owns the ball a few
windows after each of our kicks.  Tooling only."""
import json, sys, math

W, H = 44, 26


def main(path, team=0):
    rows = [json.loads(l) for l in open(path, encoding='utf-8')]
    n = 0
    for i, r in enumerate(rows):
        for fi, fr in enumerate(r.get(f'w{team}') or []):
            for ui, inp in enumerate(fr):
                if not inp.get('kick'):
                    continue
                b = r['ball']
                if b['owner'] != f't{team}u{ui}':
                    continue
                own = [u for u in r['units'] if u['id'] == f't{team}u{ui}'][0]
                mates = [u for u in r['units'] if u['id'].startswith(f't{team}') and u['id'] != own['id']]
                aim = inp.get('aim')
                if not isinstance(aim, (int, float)):
                    continue
                a = math.radians(aim)
                # nearest mate along the kick direction
                best = None
                for m in mates:
                    vx, vy = m['x'] - own['x'], m['y'] - own['y']
                    d = math.hypot(vx, vy)
                    if d < 0.3:
                        continue
                    dot = (vx * math.cos(a) + vy * math.sin(a)) / d
                    if dot > 0.96 and (best is None or d < best[0]):
                        best = (d, m['id'])
                nxt = rows[i + 3] if i + 3 < len(rows) else None
                owner3 = nxt['ball']['owner'] if nxt else None
                bp = min((math.hypot(f['x'] - b['x'], f['y'] - b['y'])
                          for f in r['units'] if f['id'].startswith(f't{1-team}')), default=99)
                n += 1
                print(f'win{i:3d} f{r["frame"]:5d} u{ui} ({own["x"]:5.1f},{own["y"]:5.1f}) aim{aim:6.1f} '
                      f'bp{bp:4.1f} mate={best[1] if best else "-":8s} d={best[0] if best else 0:4.1f} '
                      f'-> owner+3w {owner3}')
    print('total kicks', n)


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 0)
