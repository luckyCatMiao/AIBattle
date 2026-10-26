# -*- coding: utf-8 -*-
"""用真实复盘的观察帧喂给 agent.py，复现某一窗口的决策（调试用）。"""
import gzip
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(replay):
    with gzip.open(replay, 'rt', encoding='utf-8') as fh:
        return json.load(fh)


def obs_from_frame(fr, team):
    o = dict(fr)
    o['yourTeam'] = team
    return o


def main():
    replay = sys.argv[1]
    team = int(sys.argv[2])
    target = int(sys.argv[3])
    start = max(0, target - 60)
    d = load(os.path.join(ROOT, replay)) if not os.path.isabs(replay) else load(replay)
    by_frame = {fr['frame']: fr for fr in d['frames']}
    env = dict(os.environ)
    env['SOCCER_DEBUG'] = '1'
    env['SOCCER_DEBUGFILE'] = os.path.join(ROOT, 'dev2', 'probe_dbg.txt')
    if os.path.exists(env['SOCCER_DEBUGFILE']):
        os.remove(env['SOCCER_DEBUGFILE'])
    p = subprocess.Popen([sys.executable, os.path.join(ROOT, 'agent.py')],
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, encoding='utf-8', env=env)
    out = None
    for f in range(start, target + 1, 20):
        fr = by_frame.get(f)
        if fr is None:
            continue
        p.stdin.write(json.dumps(obs_from_frame(fr, team), ensure_ascii=False) + '\n')
        p.stdin.flush()
        line = p.stdout.readline()
        if f == target:
            out = line
    p.stdin.close()
    err = p.stderr.read()
    p.wait(timeout=10)
    outj = json.loads(out) if out else None
    kicks = []
    if outj:
        for fi, fr in enumerate(outj['inputs']):
            for ui, u in enumerate(fr):
                if u.get('kick'):
                    kicks.append((fi, ui, u.get('aim')))
    print('TARGET', target, 'KICKS', kicks)
    print('STDERR', err[:500])
    dbg = env['SOCCER_DEBUGFILE']
    if os.path.exists(dbg):
        print('--- DBG ---')
        print(open(dbg, encoding='utf-8').read())


if __name__ == '__main__':
    main()
