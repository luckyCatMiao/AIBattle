#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""第 2 轮：把回放观察按窗口喂给 agent.py，对拍实际输入，并打印指定时间段的决策。"""
import gzip, json, sys, os, io, contextlib

sys.stdout.reconfigure(encoding='utf-8')
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
import agent

RUN = os.path.dirname(os.path.dirname(BASE))


def norm(inp):
    out = []
    for f in inp:
        o = f[0] if isinstance(f, list) else f
        out.append((float(o.get('move', 0.0) or 0.0), bool(o.get('jump', False))))
    return out


def same(a, b):
    if a is None or b is None or len(a) != len(b):
        return False
    return all(abs(x[0] - y[0]) < 1e-6 and x[1] == y[1] for x, y in zip(a, b))


def run(fn, player, lo=None, hi=None):
    d = json.loads(gzip.decompress(open(os.path.join(RUN, fn), 'rb').read()).decode('utf-8'))
    ctx = {}
    agent.DEBUG = True
    diffs = []
    for w in d['windows']:
        end = w['frame']
        obs = json.loads(json.dumps(d['frames'][end - 5]))
        obs['yourPlayer'] = player
        obs['level'] = d['levels'][str(obs.get('round') or 1)]
        err = io.StringIO()
        try:
            with contextlib.redirect_stderr(err):
                plan = agent.handle(obs, ctx)
        except Exception as e:
            print('EXC', fn, end, e)
            raise
        actual = norm(w['inputs'][player])
        dbg = err.getvalue().strip()
        if not same(plan, actual):
            diffs.append((end, d['frames'][end - 5]['round'], d['frames'][end - 5]['time'],
                          plan, actual, dbg))
        t = obs['time']
        if lo is not None and lo <= t <= hi:
            r = obs['runners'][player]
            o = obs['runners'][1 - player]
            print('W end=%d t=%.2f R%d x=%.2f/%.2f y=%.2f vx=%.2f vy=%.2f og=%s'
                  % (end, t, obs['round'], r['x'], o['x'], r['y'], r['vx'], r['vy'], r['onGround']))
            print('   plan=%s actual=%s dbg=%s' % (plan, actual, dbg))
    print('%s player=%d windows=%d diffs=%d' % (fn, player, len(d['windows']), len(diffs)))
    for row in diffs[:40]:
        print('  DIFF end=%d R%d t=%.2f plan=%s actual=%s dbg=%s' % row)
    return diffs


if __name__ == '__main__':
    fn = sys.argv[1]
    player = int(sys.argv[2])
    lo = float(sys.argv[3]) if len(sys.argv) > 3 else None
    hi = float(sys.argv[4]) if len(sys.argv) > 4 else None
    run(fn, player, lo, hi)
