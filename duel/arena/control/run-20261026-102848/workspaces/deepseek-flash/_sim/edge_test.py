# -*- coding: utf-8 -*-
"""自测：给 agent.py 喂各种边界输入，确认永不崩、永远输出合法 JSON。"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, WS)

import duel  # noqa: E402

DIRS = ('N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR')


def valid(line):
    rep = json.loads(line.decode('utf-8'))
    if not isinstance(rep, dict) or not isinstance(rep.get('inputs'), list):
        return False
    if len(rep['inputs']) > 3:
        return False
    for fr in rep['inputs']:
        if not isinstance(fr, dict):
            return False
        if str(fr.get('dir', 'N')).upper() not in DIRS:
            return False
        a = fr.get('aim')
        if a is not None and str(a).upper() not in DIRS:
            return False
        if not isinstance(fr.get('fire', False), bool):
            return False
    return True


def main():
    m = duel.Match(7000, names=('A', 'B'))
    cases = []

    # 1) 正常开局观察
    cases.append(('正常开局', json.dumps(m.snapshot(0), ensure_ascii=False)))
    # 2) 对手视角（yourPlayer=1）
    cases.append(('yourPlayer=1', json.dumps(m.snapshot(1), ensure_ascii=False)))
    # 3) 空子弹
    obs = m.snapshot(0)
    obs['bullets'] = []
    cases.append(('空子弹', json.dumps(obs, ensure_ascii=False)))
    # 4) 巨量子弹（400 发贴脸）
    obs = m.snapshot(0)
    obs['bullets'] = [{'id': 'b%d' % i, 'owner': 1 - (i % 2),
                       'x': 5 + (i % 7) * 0.3, 'y': 14.5 + (i % 5) * 0.3,
                       'vx': 6.01, 'vy': -6.01, 'speed': 8.5, 'bounces': 3} for i in range(400)]
    cases.append(('400 发子弹', json.dumps(obs, ensure_ascii=False)))
    # 5) 对局已结束
    obs = m.snapshot(0)
    obs['status'] = 'finished'
    obs['winner'] = 0
    obs['reason'] = 'B 被击中'
    cases.append(('已结束', json.dumps(obs, ensure_ascii=False)))
    # 6) 缺字段（没有 bullets / rules / players 名字）
    obs = {'status': 'playing', 'yourPlayer': 0,
           'map': m.snapshot(0)['map'],
           'players': m.snapshot(0)['players']}
    cases.append(('缺 bullets/rules', json.dumps(obs, ensure_ascii=False)))
    # 7) 非法 JSON
    cases.append(('非法 JSON', 'this is not json'))
    # 8) 空行后继续
    cases.append(('空行', ''))
    # 9) 又一个正常窗口（确认没被前面的坏输入搞挂）
    cases.append(('恢复后正常', json.dumps(m.snapshot(0), ensure_ascii=False)))

    proc = subprocess.Popen([sys.executable, os.path.join(WS, 'agent.py')], cwd=WS,
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    payload = ''.join((c[1] + '\n') for c in cases).encode('utf-8')
    out, err = proc.communicate(payload, timeout=60)
    lines = [l for l in out.split(b'\n') if l.strip()]
    ok = True
    expect = len([c for c in cases if c[1].strip() != ''])
    for i, name in enumerate([c[0] for c in cases]):
        if cases[i][1].strip() == '':
            continue
        pass
    print('收到 %d 行输出（期望 %d 行，空行不回复）' % (len(lines), expect))
    if len(lines) != expect:
        ok = False
    for i, l in enumerate(lines):
        try:
            if not valid(l):
                ok = False
                print('  第 %d 行不合法: %r' % (i, l[:120]))
        except Exception as exc:
            ok = False
            print('  第 %d 行解析失败: %r %r' % (i, exc, l[:120]))
    if err.strip():
        print('stderr:', err.decode('utf-8', 'replace')[:600])
    print('边界输入: %s' % ('PASS' if ok else 'FAIL'))


if __name__ == '__main__':
    main()
