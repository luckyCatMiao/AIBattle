# -*- coding: utf-8 -*-
"""自测：用 _sim/duel.py 的本地物理，按回放记录的双方输入逐步重演，
并与回放逐快照比对，确认本地模拟器与裁判一致。

用法: python -I _sim/verify_replay.py ../../r1-g1.json.gz [more...]
"""
import gzip
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import duel  # noqa: E402


def verify(path):
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        d = json.load(f)
    m = duel.Match(d['seed'], names=tuple(d['names']))
    obs_frames = d['frames']
    max_pos = 0.0
    max_now = 0.0
    bad_bullets = 0
    k = 0
    for w in d['windows']:
        for i in range(2):
            m.p[i]['held'] = duel.norm_inputs({'inputs': w['inputs'][i]})[0]
        for _ in range(3):
            if m.status != 'playing':
                break
            for i in range(2):
                m.p[i]['held'] = duel.norm_inputs({'inputs': w['inputs'][i]})[_]
            m.step()
        # 该窗口结束后的记录快照
        k += 1
        if k >= len(obs_frames):
            break
        rec = obs_frames[k]
        if rec['frame'] != m.frame:
            print('  frame mismatch rec=%s sim=%s' % (rec['frame'], m.frame))
        for i in range(2):
            a, b = rec['players'][i], m.p[i]
            e = math.hypot(a['x'] - b['x'], a['y'] - b['y'])
            max_pos = max(max_pos, e)
        if len(rec['bullets']) != len(m.bullets):
            bad_bullets += 1
        max_now = max(max_now, abs(rec['now'] - m.now))
    print('%-28s recorded_frames=%d windows=%d  final rec=%s sim=(frame %d, now %.2f)  '
          'max_pos_err=%.6f  max_now_err=%.6f  bullet_count_mismatch=%d  status rec=%s sim=%s'
          % (os.path.basename(path), len(obs_frames), len(d['windows']),
             obs_frames[-1]['frame'], m.frame, m.now, max_pos, max_now, bad_bullets,
             obs_frames[-1]['status'], m.status))
    return max_pos, bad_bullets


if __name__ == '__main__':
    for p in sys.argv[1:]:
        verify(p)
