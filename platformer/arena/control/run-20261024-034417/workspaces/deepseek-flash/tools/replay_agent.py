#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把回放中的观察按窗口喂给 agent.py，对拍实际提交的输入，并打印决策分支。"""
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
    if a is None or b is None:
        return False
    if len(a) != len(b):
        return False
    return all(abs(x[0] - y[0]) < 1e-6 and x[1] == y[1] for x, y in zip(a, b))


def run(fn, player, tlo=None, thi=None, verbose=False):
    d = json.loads(gzip.decompress(open(os.path.join(RUN, fn), 'rb').read()).decode('utf-8'))
    ctx = {}
    agent.DEBUG = True
    diffs = []
    for w in d['windows']:
        end = w['frame']
        obs = json.loads(json.dumps(d['frames'][end - 5]))
        obs['yourPlayer'] = player
        # leanState 不带 level，回放把它按轮存在 levels 里
        obs['level'] = d['levels'][str(obs.get('round') or 1)]
        if obs.get('status') != 'playing':
            # agent 在非 playing 时也返回中立；仍调用以保持 ctx/round 状态，
            # 但只有 race 窗口才比较输入
            pass
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
        if verbose and tlo is not None and tlo <= d['frames'][end - 5]['time'] <= thi:
            r = obs['runners'][player]
            print('W end=%d t=%.2f R%d x=%.2f y=%.2f vx=%.2f vy=%.2f og=%s'
                  % (end, obs['time'], obs['round'], r['x'], r['y'], r['vx'], r['vy'], r['onGround']))
            print('   plan=', plan, ' actual=', actual, ' dbg=', dbg)
    print('%s player=%d windows=%d diffs=%d' % (fn, player, len(d['windows']), len(diffs)))
    for row in diffs[:30]:
        print('  DIFF end=%d R%d t=%.2f plan=%s actual=%s dbg=%s' % row)
    return diffs


if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'g1'
    fn = 'r1-g1.json.gz' if which == 'g1' else 'r1-g2.json.gz'
    # 座位：g1 deepseek=0, sol=1；g2 sol=0, deepseek=1
    player = int(sys.argv[2]) if len(sys.argv) > 2 else (0 if which == 'g1' else 1)
    run(fn, player, verbose=True)
