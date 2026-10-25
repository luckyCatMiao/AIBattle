#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""差分测试：用真实引擎录下的逐窗口快照，检验 agent.py 里的 Python 复刻是否逐帧一致。
轮次切换（有人阵亡后引擎立刻开新局）会重新对齐，只比较同一局内的状态。"""
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent as A


def norm_key(snap):
    return {
        'tiles': list(snap['map']['tiles']),
        'fighters': [(f['x'], f['y'], f['px'], f['py'], f['alive'], f['bombs'], f['blast'],
                      f['speed'], f['activeBombs']) for f in snap['fighters']],
        'bombs': sorted((b['x'], b['y'], b['fuse'], b['blast'], b['owner']) for b in snap['bombs']),
        'blasts': sorted((c['x'], c['y'], c['frames']) for c in snap['blasts']),
        'drops': sorted((d['x'], d['y'], d['type']) for d in snap['drops']),
    }


def my_key(w):
    return {
        'tiles': list(w.tiles),
        'fighters': [(f.x, f.y,
                      round((f.from_x + (f.x - f.from_x) * f.move_progress) * 100) / 100,
                      round((f.from_y + (f.y - f.from_y) * f.move_progress) * 100) / 100,
                      f.alive, f.bombs, f.blast, f.speed, f.active_bombs) for f in w.fighters],
        'bombs': sorted((b['x'], b['y'], b['fuse'], b['blast'], b['owner']) for b in w.bombs),
        'blasts': sorted((c[0], c[1], c[2]) for c in w.blasts),
        'drops': sorted((d['x'], d['y'], d['type']) for d in w.drops),
    }


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'dev/diffcase.json'
    data = json.load(open(path, encoding='utf-8'))
    snaps = data['snaps']
    w = A.World.from_obs(snaps[0])
    cur_round = snaps[0]['round']
    bad = 0
    checked = 0
    resync = 0
    for i, win in enumerate(data['windows']):
        for f in range(20):
            if w.status != 'playing':
                break
            row = []
            for p in range(2):
                fr = win[p][f] if f < len(win[p]) else {'dir': 'N', 'btn': None}
                row.append((fr['dir'], fr['btn']))
            A.step(w, row)
        snap = snaps[i + 1]
        if snap['round'] != cur_round or w.status != 'playing':
            # 局已结束：引擎会直接开新局，这里重新对齐
            w = A.World.from_obs(snap)
            cur_round = snap['round']
            resync += 1
            continue
        checked += 1
        exp = norm_key(snap)
        got = my_key(w)
        if exp != got:
            bad += 1
            if bad <= 2:
                print('MISMATCH window', i, 'frame', (i + 1) * 20)
                for k in exp:
                    if exp[k] != got[k]:
                        print('  field', k)
                        print('    engine:', str(exp[k])[:260])
                        print('    python:', str(got[k])[:260])
    print('windows checked:', checked, 'resyncs:', resync, 'mismatches:', bad)
    return 0 if bad == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
