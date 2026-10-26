# -*- coding: utf-8 -*-
"""自测：把同一串输入分别喂给真·simulation.js（node）和 Python 复刻，逐帧比对。

用法: python _sim/check_physics.py <seed> [windows]
"""
import json
import io
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, WS)
import duel  # noqa: E402
import agent as A  # noqa: E402

DIRS = ('N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR')
AIMS = (None,) + DIRS[1:]


class Rng(object):
    def __init__(self, s):
        self.s = s & 0xFFFFFFFF

    def next(self):
        self.s = ((self.s * 1664525) + 1013904223) & 0xFFFFFFFF
        return self.s / 4294967296.0


def gen_inputs(nwin, seed):
    r = Rng(seed * 7919 + 13)
    wins = []
    for _ in range(nwin):
        w = []
        for _p in range(2):
            fr = []
            for _k in range(3):
                d = DIRS[int(r.next() * 9)]
                a = AIMS[int(r.next() * 9)]
                f = r.next() < 0.45
                fr.append({'dir': d, 'aim': a, 'fire': f})
            w.append(fr)
        wins.append(w)
    return wins


def replay_py(seed, wins):
    m = duel.Match(seed, names=('A', 'B'))
    snaps = [snap(m)]
    for w in wins:
        norm = [duel.norm_inputs({'inputs': w[i]}) for i in range(2)]
        for k in range(3):
            if m.status != 'playing':
                break
            for i in range(2):
                m.p[i]['held'] = norm[i][k]
            m.step()
            snaps.append(snap(m))
        if m.status != 'playing':
            break
    return snaps


def snap(m):
    return {
        'frame': m.frame, 'now': m.now, 'status': m.status, 'winner': m.winner,
        'p': [{'x': p['x'], 'y': p['y'], 'fx': p['fx'], 'fy': p['fy'], 'alive': p['alive'],
               'cooldown': p['cooldown'], 'shots': p['shots']} for p in m.p],
        'b': [{'id': b['id'], 'owner': b['owner'], 'x': b['x'], 'y': b['y'],
               'vx': b['vx'], 'vy': b['vy'], 'bounces': b['bounces']} for b in m.bullets],
    }


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 7001
    nwin = int(sys.argv[2]) if len(sys.argv) > 2 else 120
    wins = gen_inputs(nwin, seed)
    ipath = os.path.join(HERE, '_inputs.json')
    opath = os.path.join(HERE, '_ref_out.jsonl')
    io.open(ipath, 'w', encoding='utf-8').write(json.dumps(wins))
    r = subprocess.run(['node', os.path.join(HERE, 'ref_run.js'), ipath, str(seed), opath],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    print('node:', r.stdout.strip(), r.stderr.strip()[:400])
    ref = [json.loads(l) for l in io.open(opath, encoding='utf-8') if l.strip()]
    mine = replay_py(seed, wins)
    print('frames ref=%d py=%d' % (len(ref), len(mine)))
    n = min(len(ref), len(mine))
    worst = 0.0
    bad = 0
    for i in range(n):
        a, b = ref[i], mine[i]
        for pi in range(2):
            for k in ('x', 'y', 'fx', 'fy'):
                d = abs(a['p'][pi][k] - b['p'][pi][k])
                worst = max(worst, d)
                if d > 1e-9:
                    bad += 1
                    if bad < 6:
                        print('frame %d p%d %s ref=%.12f py=%.12f' % (i, pi, k, a['p'][pi][k], b['p'][pi][k]))
        if len(a['b']) != len(b['b']):
            print('frame %d bullet count ref=%d py=%d' % (i, len(a['b']), len(b['b'])))
            bad += 1
        else:
            for j in range(len(a['b'])):
                for k in ('x', 'y', 'vx', 'vy'):
                    d = abs(a['b'][j][k] - b['b'][j][k])
                    worst = max(worst, d)
                    if d > 1e-9:
                        bad += 1
                        if bad < 6:
                            print('frame %d b%d %s ref=%.12f py=%.12f' % (i, j, k, a['b'][j][k], b['b'][j][k]))
        if a['status'] != b['status'] or a['winner'] != b['winner']:
            print('frame %d status ref=%s/%s py=%s/%s' % (i, a['status'], a['winner'], b['status'], b['winner']))
            bad += 1
    print('worst abs diff = %.3e ; mismatches = %d' % (worst, bad))
    print('PHYSICS OK' if bad == 0 else 'PHYSICS MISMATCH')


if __name__ == '__main__':
    main()
