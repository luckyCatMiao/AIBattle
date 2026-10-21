#!/usr/bin/env python3
"""铁拳谱参赛程序：stdin 每行一个观察，stdout 每行一个决策窗口。
主力是 brain.js（node 子进程，用公开规则逐帧模拟搜索）；node 不可用或超时则退回简单启发式。"""
import json, os, sys, subprocess, threading, queue, time

HERE = os.path.dirname(os.path.abspath(__file__))
DIRS = {'N', 'F', 'B', 'U', 'D', 'UF', 'UB', 'DF', 'DB'}
BTNS = {'LP', 'HP', 'LK', 'HK', 'G', None}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


class Brain:
    def __init__(self):
        self.proc = None
        self.q = queue.Queue()
        self.start()

    def start(self):
        try:
            self.proc = subprocess.Popen(['node', os.path.join(HERE, 'brain.js')], stdin=subprocess.PIPE,
                                         stdout=subprocess.PIPE, stderr=sys.stderr, text=True, bufsize=1, cwd='/tmp')
            self.q = queue.Queue()
            threading.Thread(target=self._reader, args=(self.proc, self.q), daemon=True).start()
        except Exception as e:  # noqa
            log('node 启动失败', e)
            self.proc = None

    @staticmethod
    def _reader(proc, q):
        for line in proc.stdout:
            q.put(line)
        q.put(None)

    def ask(self, obs, hist, timeout=3.6):
        if self.proc is None or self.proc.poll() is not None:
            return None
        try:
            self.proc.stdin.write(json.dumps({'obs': obs, 'hist': hist}, ensure_ascii=False) + '\n')
            self.proc.stdin.flush()
            line = self.q.get(timeout=timeout)
            if line is None:
                return None
            r = json.loads(line)
            if 'error' in r:
                log('brain 错误', r['error'][:400])
                return None
            return r
        except queue.Empty:
            log('brain 超时，重启')
            try:
                self.proc.kill()
            except Exception:
                pass
            self.start()
            return None
        except Exception as e:  # noqa
            log('brain 异常', e)
            return None


def fallback(obs):
    """简单启发式：远了发飞行道具/前进，近了轻招，对手出招就防御。"""
    me = obs.get('yourPlayer', 0) or 0
    fs = obs.get('fighters') or []
    if len(fs) < 2:
        return [{'dir': 'B', 'btn': None}] * 15
    f, o = fs[me], fs[1 - me]
    d = abs(f['x'] - o['x'])
    cat = (obs.get('catalog') or {}).get(f['char'], {})
    proj = None
    for s in (cat.get('specials') or {}).values():
        if s.get('projectile') and s.get('motion') == 'qcf':
            proj = s
    if o.get('move') or o.get('airborne'):
        return [{'dir': 'B', 'btn': None}] * 15
    if d > 300 and proj:
        return [{'dir': 'D', 'btn': None}, {'dir': 'DF', 'btn': None}, {'dir': 'F', 'btn': proj['button']}] + [{'dir': 'B', 'btn': None}] * 12
    if d > 140:
        return [{'dir': 'F', 'btn': None}] * 8 + [{'dir': 'B', 'btn': None}] * 7
    return [{'dir': 'D', 'btn': 'LK'}] + [{'dir': 'DB', 'btn': None}] * 14


def sanitize(inputs):
    out = []
    for fr in (inputs or [])[:15]:
        if not isinstance(fr, dict):
            continue
        d = fr.get('dir') or 'N'
        b = fr.get('btn')
        if d not in DIRS:
            d = 'N'
        if b not in BTNS:
            b = None
        out.append({'dir': d, 'btn': b})
    while len(out) < 15:
        out.append({'dir': 'N', 'btn': None})
    return out


def main():
    brain = Brain()
    hist = []
    last_round = None
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        note = ''
        try:
            obs = json.loads(line)
            key = (obs.get('round'), tuple((f or {}).get('id') for f in (obs.get('fighters') or [])))
            if key != last_round:
                hist, last_round = [], key
            r = brain.ask(obs, hist)
            if r and isinstance(r.get('inputs'), list):
                inputs, note = sanitize(r['inputs']), r.get('note', '')
            else:
                inputs, note = sanitize(fallback(obs)), '启发式后备'
        except Exception as e:  # noqa
            log('决策异常', e)
            inputs, note = sanitize(None), '异常-中立'
        hist = (hist + inputs)[-30:]
        sys.stdout.write(json.dumps({'inputs': inputs, 'note': str(note)[:80]}, ensure_ascii=False) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
