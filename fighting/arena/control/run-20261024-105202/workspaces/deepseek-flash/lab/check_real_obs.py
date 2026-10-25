"""用真实第 1 轮录像的观察序列检查新 agent 的决策（不是对局重放，只是静态响应统计）。
obs_g1.ndjson 的观察里没有 catalog，和真实裁判一致。
"""
import json, os, sys, importlib.util

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('agentmod', os.path.join(WS, 'agent.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
EMB = mod.EMBEDDED_CATALOG['characters']

obs_list = [json.loads(l) for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'obs_g1.ndjson'), encoding='utf-8') if l.strip()]
a = mod.Agent()
n = 0
attack_windows = 0
guard_ok = 0
guard_bad = 0
guards = 0
pokes = 0
supers = 0
notes = {}
for obs in obs_list:
    out = a.decide(obs)
    n += 1
    note = out.get('note') or ''
    notes[note] = notes.get(note, 0) + 1
    ins = out['inputs']
    me = obs['fighters'][obs['yourPlayer']]
    op = obs['fighters'][1 - obs['yourPlayer']]
    dp = [x['dir'] for x in ins]
    ng = sum(1 for d in dp if d in ('B', 'DB'))
    if ng >= 8:
        guards += 1
    if note.startswith(('poke', 'killpoke', 'punish', 'combo', 'super', 'counterpoke', 'blocktake')):
        attack_windows += 1
    if note.startswith('poke'):
        pokes += 1
    if 'super' in note:
        supers += 1
    # 对手正在出招时，检查我方多数方向是否挡得住
    mv = op.get('move')
    if op.get('state') == 'attack' and mv:
        md = None
        for pool in ('normals', 'specials'):
            for x in (EMB.get(op['char'], {}).get(pool) or {}).values():
                if x.get('name') == mv.get('name'):
                    md = x
        sup = EMB.get(op['char'], {}).get('super') or {}
        if sup.get('name') == mv.get('name'):
            md = sup
        gt = (md or {}).get('guard', 'mid')
        if gt == 'overhead':
            ok = dp.count('B') > dp.count('DB')
        elif gt == 'low':
            ok = dp.count('DB') > dp.count('B')
        else:
            ok = (dp.count('DB') + dp.count('B')) >= 8
        if ok:
            guard_ok += 1
        else:
            guard_bad += 1
print('windows', n, 'guard-heavy windows', guards, 'attack windows', attack_windows, 'pokes', pokes, 'super-notes', supers)
print('opponent attacking windows: guard ok', guard_ok, 'bad', guard_bad)
print('top notes', sorted(notes.items(), key=lambda x: -x[1])[:15])
