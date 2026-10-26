import sys, json, subprocess, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cf

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = cf.load('D:/extraProj/AIBattle/soccer/arena/control/practice-20261025-121820/r1-g6.json.gz')
lines = []
for i in range(0, 2380, 20):
    obs = cf.obs_from_frame(d, d['frames'][i])
    obs['yourTeam'] = d['seats'].index('deepseek-g1')
    obs['players'] = []
    obs.pop('status', None)
    lines.append(json.dumps(obs))
# freeze case (goal frame) and end case
obs = cf.obs_from_frame(d, d['frames'][1031]); obs['yourTeam']=1; lines.append(json.dumps(obs))
obs = cf.obs_from_frame(d, d['frames'][2400-1]); obs['yourTeam']=1; obs['status']='finished'; lines.append(json.dumps(obs))
inp = "\n".join(lines) + "\n"
p = subprocess.run([sys.executable, os.path.join(WS, 'agent.py')], input=inp, capture_output=True, text=True, timeout=120)
outs = [l for l in p.stdout.splitlines() if l.strip()]
print('lines in', len(lines), 'lines out', len(outs), 'rc', p.returncode)
bad = 0
for j, l in enumerate(outs):
    try:
        o = json.loads(l)
    except Exception as e:
        print('bad json line', j, e); bad += 1; continue
    inp_ = o.get('inputs')
    n = d['teamSize']
    if not isinstance(inp_, list) or len(inp_) != 20:
        print('bad frame count', j, 0 if not isinstance(inp_, list) else len(inp_)); bad += 1; continue
    for f in inp_:
        if len(f) != n:
            print('bad unit count', j, len(f)); bad += 1; break
        for u in f:
            if u['dir'] not in ('N','U','D','L','R','UL','UR','DL','DR'):
                print('bad dir', u); bad += 1; break
            if u['aim'] is not None and not (isinstance(u['aim'], (int,float)) and 0 <= u['aim'] < 360):
                print('bad aim', u); bad += 1; break
            if not isinstance(u['kick'], bool):
                print('bad kick', u); bad += 1; break
print('BAD', bad)
print('stderr tail', p.stderr[-500:] if p.stderr else '')
