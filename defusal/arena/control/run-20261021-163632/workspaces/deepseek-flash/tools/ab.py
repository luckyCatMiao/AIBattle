#!/usr/bin/env python3
"""A/B 对照：同一份 agent.py，只改环境变量；每个种子跑两局（座位互换），
按“策略身份”而不是座位统计。用法：

  python3 tools/ab.py --seeds 1-32 --envNew 'AGENT_X=1' --envOld '' [--jobs 16]
"""
import argparse, json, subprocess, tempfile, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run(seeds, envA, envB, jobs, out):
    cmd = ['node', os.path.join(ROOT, 'tools', 'bench.js'),
           '--seeds', seeds,
           '--agentA', 'python3 -u agent.py',
           '--agentB', 'python3 -u agent.py',
           '--envA', envA, '--envB', envB,
           '--jobs', str(jobs), '--json', out]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stdout + '\n' + r.stderr + '\n')
        raise SystemExit('bench failed')
    return r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seeds', required=True)
    ap.add_argument('--envNew', default='')
    ap.add_argument('--envOld', default='')
    ap.add_argument('--jobs', type=int, default=16)
    args = ap.parse_args()
    f1 = tempfile.mktemp(suffix='.json')
    f2 = tempfile.mktemp(suffix='.json')
    run(args.seeds, args.envNew, args.envOld, args.jobs, f1)
    run(args.seeds, args.envOld, args.envNew, args.jobs, f2)
    agg = {
        'games': 0, 'newWins': 0, 'oldWins': 0, 'draws': 0,
        'newAtk': {'win': 0, 'lose': 0, 'plant': 0},
        'newDef': {'win': 0, 'lose': 0, 'vsPlant': 0, 'vsNoPlant': 0},
        'oldAtk': {'win': 0, 'lose': 0, 'plant': 0},
        'oldDef': {'win': 0, 'lose': 0, 'vsPlant': 0, 'vsNoPlant': 0},
        'reasons': {}, 'errors': 0,
    }
    for path, new_team in ((f1, 0), (f2, 1)):
        res = json.load(open(path))
        for g in res:
            if g.get('error'):
                agg['errors'] += 1
                continue
            agg['games'] += 1
            w = g.get('winner')
            if w is None:
                agg['draws'] += 1
            elif w == new_team:
                agg['newWins'] += 1
            else:
                agg['oldWins'] += 1
            for r in g.get('rounds') or []:
                atk_team = 0 if r.get('side0') == 'attack' else 1
                new_atk = (new_team == atk_team)
                won = (r.get('winnerTeam') == new_team)
                bucket = agg['newAtk'] if new_atk else agg['newDef']
                obucket = agg['oldDef'] if new_atk else agg['oldAtk']
                bucket['win' if won else 'lose'] += 1
                obucket['win' if not won else 'lose'] += 1
                if r.get('plant'):
                    (agg['newAtk'] if new_atk else agg['oldAtk'])['plant'] += 1
                (agg['oldDef'] if new_atk else agg['newDef'])[
                    'vsPlant' if r.get('plant') else 'vsNoPlant'] += 1
                key = ('atk:' if new_atk else 'def:') + str(r.get('reason'))
                agg['reasons'][key] = agg['reasons'].get(key, 0) + 1
    # 胜负回合数（按回合而不是整场）
    na, nd = agg['newAtk'], agg['newDef']
    agg['newRoundWinRate'] = round((na['win'] + nd['win']) / max(1, na['win'] + na['lose'] + nd['win'] + nd['lose']), 4)
    agg['newAtkWinRate'] = round(na['win'] / max(1, na['win'] + na['lose']), 4)
    agg['newDefWinRate'] = round(nd['win'] / max(1, nd['win'] + nd['lose']), 4)
    oa, od = agg['oldAtk'], agg['oldDef']
    agg['oldRoundWinRate'] = round((oa['win'] + od['win']) / max(1, oa['win'] + oa['lose'] + od['win'] + od['lose']), 4)
    agg['oldAtkWinRate'] = round(oa['win'] / max(1, oa['win'] + oa['lose']), 4)
    agg['oldDefWinRate'] = round(od['win'] / max(1, od['win'] + od['lose']), 4)
    print(json.dumps(agg, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
