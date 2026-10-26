# -*- coding: utf-8 -*-
"""Replay the exact round-1 seeds/team sizes against the frozen Sol.

This is a black-box practice harness: it uses the same referee and the
opponent's entry.json (command) only, never its source.  It lets us compare
a candidate agent.py against the exact 20 conditions of the official round.

Usage:
    python -I work/replay_official.py --agent work/replay_ws_base/agent.py --tag base
"""
import argparse, concurrent.futures, importlib.util, json, pathlib, random, sys, time

HERE = pathlib.Path(__file__).resolve().parent.parent
ARENA = HERE.parents[3]  # .../soccer/arena
TRAIN = ARENA / 'train.py'
OPP = pathlib.Path(r'D:\extraProj\AIBattle\soccer\arena\control\run-20261022-200519\round-2\sol')
def seed_list(seed_base, iteration):
    return [seed_base + iteration * 1000 + i for i in range(1, 21)]


def size_list(seed_base):
    sizes = list(range(1, 7))
    random.Random(seed_base).shuffle(sizes)
    return sizes * 4
ME = 'deepseek-g1'
RIVAL = 'sol'


def load_train():
    spec = importlib.util.spec_from_file_location('arenatrain', str(TRAIN))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--agent', required=True)
    ap.add_argument('--tag', required=True)
    ap.add_argument('--games', type=int, default=20)
    ap.add_argument('--seed-base', type=int, default=5900)
    ap.add_argument('--iteration', type=int, default=1)
    args = ap.parse_args()

    ws = HERE / 'work' / ('replay_ws_' + args.tag)
    ws.mkdir(parents=True, exist_ok=True)
    (ws / 'agent.py').write_bytes(pathlib.Path(args.agent).read_bytes())
    (ws / 'entry.json').write_text(json.dumps({'mode': 'program', 'command': ['python3', 'agent.py']}),
                                   encoding='utf-8')

    seeds = seed_list(args.seed_base, args.iteration)
    sizes = size_list(args.seed_base)
    T = load_train()
    T.ARGS = argparse.Namespace(seed_base=args.seed_base, games_per_round=20, prepare_seconds=0)
    T.MODELS = {ME: T.CATALOG[ME], RIVAL: T.CATALOG[RIVAL]}
    T.transport.MODELS = T.MODELS
    run = T.CONTROL / ('replay-%s-%s' % (args.tag, time.strftime('%Y%m%d-%H%M%S')))
    run.mkdir(parents=True, exist_ok=True)
    T.RUN = run
    T.NO_ISOLATION = True
    T.REF = T.transport.JsonProcess(['node', str(T.ROOT / 'referee.js')], run / 'referee.stderr.log')
    entries = {ME: json.loads((ws / 'entry.json').read_text(encoding='utf-8')),
               RIVAL: json.loads((OPP / 'entry.json').read_text(encoding='utf-8'))}
    engine_dirs = {ME: ws, RIVAL: OPP}
    records = []
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            for g in range(1, args.games + 1):
                order = [ME, RIVAL] if g % 2 == 1 else [RIVAL, ME]
                res = T.play(1, entries, order, g, pool, engine_dirs=engine_dirs,
                             seed=seeds[g - 1], team_size=sizes[g - 1])
                records.append({k: v for k, v in res.items() if k not in ('windows',)})
                print('%02d seed=%d ts=%d seats=%s score=%s winner=%s' % (
                    g, seeds[g - 1], sizes[g - 1], res['seats'], res['scores'], res['winner']), flush=True)
    finally:
        T.REF.close()
    (run / 'replay_results.json').write_text(json.dumps(records, ensure_ascii=False, indent=2),
                                             encoding='utf-8')
    wins = sum(1 for r in records if r['winner'] == ME)
    draws = sum(1 for r in records if r['winner'] is None)
    losses = len(records) - wins - draws
    print('RESULT %d games: %dW %dD %dL (%.1f%%)' % (len(records), wins, draws, losses,
                                                      100.0 * wins / len(records)))
    print('RUN', run)


if __name__ == '__main__':
    main()
