# -*- coding: utf-8 -*-
"""把真实第 2 轮录像的观察序列喂回当前 agent.py，核对输出是否与录像一致，
并统计每个小局里 agent 自己认为在执行什么（note）。只读录像，不模拟引擎。"""
import gzip, json, os, sys, importlib.util, collections

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('agentmod', os.path.join(WS, 'agent.py'))
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

for fn in sys.argv[1:]:
    d = json.load(gzip.open(fn, 'rt', encoding='utf-8'))
    seats = d['seats']; us = seats.index('deepseek-flash')
    a = mod.Agent()
    notes_round = collections.defaultdict(collections.Counter)
    diff = 0; total = 0
    diffs = []
    for i, w in enumerate(d['windows']):
        obs = d['frames'][i]
        obs['yourPlayer'] = us
        obs['yourTeam'] = d['teams'][us]
        obs['lastErrors'] = []
        obs['decisionWindows'] = True
        obs['framesPerWindow'] = 15
        out = a.decide(obs)
        mine = [(x['dir'], x['btn']) for x in out['inputs']]
        real = [(x['dir'], x['btn']) for x in w['inputs'][us]]
        total += 1
        if mine != real:
            diff += 1
            if len(diffs) < 8:
                diffs.append((i, obs['round'], obs['frame'], out.get('note'), mine, real))
        note = (out.get('note') or '').split('@')[0].split(':')[0]
        notes_round[obs['round']][note] += 1
    print('='*70)
    print(fn, 'seats', seats, 'us', us, 'windows', total, 'input mismatches', diff)
    for i, r, f, note, mine, real in diffs:
        print('  DIFF win', i, 'R', r, 'frame', f, 'note', note)
        print('    mine', mine[:6], '...')
        print('    real', real[:6], '...')
    for r in sorted(notes_round):
        print(f'  R{r} notes: {notes_round[r].most_common()}')
