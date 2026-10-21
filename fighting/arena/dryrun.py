"""Dry run of the fighting arena controller with scripted stand-ins.

Runs the real train.py orchestration (bootstrap, freeze, referee pipeline,
replay writing, audit, report) against two local rule-based agents instead of
the model clients, so orchestration bugs surface before spending model budget.

Usage:  python fighting/arena/dryrun.py [--rounds 1]
"""
import argparse, importlib.util, json, pathlib, shutil, sys, threading, concurrent.futures, time

ROOT = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('train', ROOT / 'train.py')
train = importlib.util.module_from_spec(spec)
sys.modules['train'] = train
spec.loader.exec_module(train)

STUB = '''#!/usr/bin/env python3
"""A scripted stand-in: reads one observation per line, answers with a window."""
import json, sys

STATE = {'tick': 0}

def choose(obs):
    me = obs['fighters'][obs['yourPlayer']]
    foe = obs['fighters'][1 - obs['yourPlayer']]
    dist = abs(foe['x'] - me['x'])
    frames = []
    def push(d, b=None):
        frames.append({'dir': d, 'btn': b})
    if dist > 320:
        for _ in range(5):
            push('F')
        for _ in range(4):
            push('F')
        push('D'); push('DF'); push('F', 'LP'); push('N')
    elif dist > 150:
        push('DB'); push('DB')
        push('DF', 'LK')
        for _ in range(6):
            push('N')
        push('F', 'LP')
    else:
        push('N', 'LP')
        push('N')
        push('N', 'LK')
        for _ in range(5):
            push('N')
        push('N', 'HK')
    while len(frames) < 15:
        push('N')
    return frames[:15]

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        obs = json.loads(line)
        out = {'inputs': choose(obs), 'note': 'scripted stand-in'}
    except Exception as exc:
        out = {'error': str(exc)}
    sys.stdout.write(json.dumps(out) + '\\n')
    sys.stdout.flush()
'''

ENTRY = {'mode': 'program', 'command': ['python3', 'agent.py'],
         'team': ['aegis', 'vex', 'kestrel']}
ENTRY_B = {'mode': 'program', 'command': ['python3', 'agent.py'],
           'team': ['torv', 'nyx', 'sable']}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rounds', type=int, default=1)
    ap.add_argument('--port', type=int, default=8797)
    args = ap.parse_args()

    # 只保留这一轮：把 rounds 降到 1，避免演练占用太久。
    train.ARGS = argparse.Namespace(rounds=args.rounds, players=['opus', 'sol'], incumbent=None,
                                    from_run=None, source_round=1, continue_both=False,
                                    prepare_seconds=60, port=args.port, seed_base=1000)
    train.MODELS = {'opus': 'claude-opus-5-5', 'sol': 'gpt-6.1-sol'}
    train.RUN = train.CONTROL / time.strftime('run-%Y%m%d-%H%M%S')
    train.RUN.mkdir(parents=True, exist_ok=True)
    train.CONTROL.mkdir(parents=True, exist_ok=True)

    # 假选手代替模型客户端
    def fake_prepare(who, iteration):
        folder = train.RUN / 'workspaces' / who
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'agent.py').write_text(STUB, encoding='utf-8')
        entry = ENTRY if who == 'opus' else ENTRY_B
        (folder / 'entry.json').write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding='utf-8')
        (folder / 'review.md').write_text(f'# 第 {iteration} 轮演练复盘\n\n假选手，无实际策略。', encoding='utf-8')
        print(f'[dryrun] prepared {who}', flush=True)
        return train.freeze(who, iteration, [])

    train.prepare = fake_prepare

    print('[dryrun] bootstrap', flush=True)
    train.REF = train.transport.JsonProcess(['node', str(ROOT / 'referee.js')], train.RUN / 'referee.stderr.log')
    try:
        train.bootstrap()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            for iteration in range(1, args.rounds + 1):
                entries = {w: fake_prepare(w, iteration) for w in train.MODELS}
                (train.CONTROL / 'engine-paths.json').write_text(json.dumps(
                    {w: (train.RUN / f'round-{iteration}' / w).relative_to(ROOT).as_posix() for w in train.MODELS}), encoding='utf-8')
                for game_number, order in enumerate([list(train.MODELS), list(reversed(train.MODELS))], 1):
                    result = train.play(iteration, entries, order, game_number, pool)
                    print('[dryrun] game', json.dumps({k: v for k, v in result.items() if k != 'sha256'}, ensure_ascii=False), flush=True)
        print('[dryrun] done — run dir:', train.RUN, flush=True)
    finally:
        train.REF.close()


if __name__ == '__main__':
    main()
