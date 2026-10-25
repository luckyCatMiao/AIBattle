"""离线喂观察，检查 agent 是否真正用上内嵌帧数据。"""
import json, os, sys, importlib.util
WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('agentmod', os.path.join(WS, 'agent.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

obs_list = [json.loads(l) for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'obs_g1.ndjson'), encoding='utf-8') if l.strip()]
TARGETS = {2265, 3195, 4200}

def run(with_cat, add_cat):
    a = mod.Agent()
    rows = []
    for obs in obs_list:
        o = json.loads(json.dumps(obs))
        if add_cat:
            o['catalog'] = mod.EMBEDDED_CATALOG
        out = a.decide(o)
        rows.append((o['frame'], out.get('note'), len((getattr(a, 'C', {}) or {}).get('normals') or {})))
    return rows

no = run(False, False)
yes = run(True, True)
for (f1, n1, c1), (f2, n2, c2) in zip(no, yes):
    if f1 in TARGETS or n1 != n2:
        print(f1, 'noCat:', n1, 'C.normals=', c1, '| withCat:', n2, 'C.normals=', c2, '| SAME' if n1 == n2 else '| DIFF')
