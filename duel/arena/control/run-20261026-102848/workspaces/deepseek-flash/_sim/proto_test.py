# -*- coding: utf-8 -*-
"""自测：按裁判协议真实地跑子进程 `python agent.py`，逐窗口收发 JSON。

检查：输出合法性、响应耗时、UTF-8（事件里有中文）、整场能否跑完。
用法: python -u _sim/proto_test.py [seeds] [opp]
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, WS)

import duel  # noqa: E402

DIRS = ('N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR')
OPP_CLS = {'greedy': 'GreedyBot', 'rusher': 'RusherBot', 'spray': 'SprayBot',
           'mirror': 'MirrorBot', 'random': 'RandomBot'}


def check_frame(fr):
    if not isinstance(fr, dict):
        return 'frame not object'
    d = fr.get('dir', 'N')
    if d is None:
        d = 'N'
    if str(d).upper() not in DIRS:
        return 'bad dir %r' % (d,)
    a = fr.get('aim', None)
    if a is not None and str(a).upper() not in DIRS:
        return 'bad aim %r' % (a,)
    f = fr.get('fire', False)
    if f is not None and not isinstance(f, bool):
        return 'bad fire %r' % (f,)
    return None


def run(seed, opp_name, py='python'):
    import bots
    opp = getattr(bots, OPP_CLS[opp_name])(seed=seed)
    m = duel.Match(seed, names=('A', 'B'))
    proc = subprocess.Popen([py, os.path.join(WS, 'agent.py')], cwd=WS,
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    my_seat = 0
    worst = 0.0
    errors = []
    try:
        while m.status == 'playing':
            obs = m.snapshot(my_seat)
            payload = (json.dumps(obs, ensure_ascii=False) + '\n').encode('utf-8')
            t0 = time.perf_counter()
            proc.stdin.write(payload)
            proc.stdin.flush()
            line = proc.stdout.readline()
            dt = time.perf_counter() - t0
            worst = max(worst, dt)
            if not line:
                errors.append('agent 无输出（提前退出）')
                break
            try:
                rep = json.loads(line.decode('utf-8'))
            except Exception as exc:
                errors.append('非法 JSON: %r (%r)' % (exc, line[:120]))
                break
            if not isinstance(rep, dict) or not isinstance(rep.get('inputs'), (list, dict)):
                errors.append('返回封套不合法: %r' % (rep,))
                break
            ins = rep['inputs']
            if isinstance(ins, dict):
                ins = [ins]
            if len(ins) > 3:
                errors.append('帧数超过 3: %d' % len(ins))
                break
            for fr in ins:
                e = check_frame(fr)
                if e:
                    errors.append(e)
            if errors:
                break
            mine = duel.norm_inputs(rep)
            other = duel.norm_inputs(opp.act(m.snapshot(1 - my_seat)))
            wins = [None, None]
            wins[my_seat] = mine
            wins[1 - my_seat] = other
            for k in range(3):
                if m.status != 'playing':
                    break
                for i in range(2):
                    m.p[i]['held'] = wins[i][k]
                m.step()
    finally:
        try:
            proc.stdin.close()
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            pass
    return m, worst, errors


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    opp = sys.argv[2] if len(sys.argv) > 2 else 'greedy'
    py = sys.argv[3] if len(sys.argv) > 3 else sys.executable
    seeds = [7000 + 13 * i for i in range(n)]
    allerr = 0
    worstall = 0.0
    for s in seeds:
        m, worst, errors = run(s, opp, py)
        worstall = max(worstall, worst)
        allerr += len(errors)
        print('seed %d: 结果=%-8s 帧=%4d 子弹=%3d 单窗口最慢 %.0fms %s' % (
            s, m.reason or 'draw', m.frame, len(m.bullets), worst * 1000,
            ('ERRORS: ' + '; '.join(errors[:3])) if errors else 'OK'))
    print('协议检查: %s（最慢单窗口 %.0fms，硬上限 5000ms）' % (
        'PASS' if allerr == 0 else 'FAIL(%d)' % allerr, worstall * 1000))


if __name__ == '__main__':
    main()
