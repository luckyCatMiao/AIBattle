import subprocess, json, concurrent.futures as cf, statistics, os
ROOT="D:/extraProj/AIBattle/racing/arena/control/run-20261024-164152/workspaces/deepseek-flash"
LENS=json.load(open('lab/lens.json'))
SEEDS=[5011,5012,6011,6021,7011,8011,9011,10011,3,7,10,16,4,6,9,12]
def run(args):
    s, envs = args
    env=dict(os.environ); env.update(envs)
    r=subprocess.run(['node','mock_referee.js',str(s),'python','agent_av.py'], cwd=ROOT,
                     capture_output=True, text=True, timeout=400, env=env)
    try: d=json.loads(r.stdout.strip().splitlines()[-1])
    except Exception: return s,None
    t=d['me']['finishTime']
    ln=LENS[str(s)]
    return s, (3.0*ln/t if (t and d['me']['finished']) else None)
CFGS=[('gd14w85',{}),
      ('gd8w35',{'AV_CP_GUARD_DIST':'8','AV_CP_GUARD_W':'0.35'}),
      ('gd8w60',{'AV_CP_GUARD_DIST':'8','AV_CP_GUARD_W':'0.6'}),
      ('gd5w35',{'AV_CP_GUARD_DIST':'5','AV_CP_GUARD_W':'0.35'}),
      ('gd20w35',{'AV_CP_GUARD_DIST':'20','AV_CP_GUARD_W':'0.35'})]
for name, envs in CFGS:
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        res=list(ex.map(run, [(s,envs) for s in SEEDS]))
    ts=[t for s,t in res if t]
    bad=[(s,t) for s,t in res if not t]
    print('%-8s n=%d rate mean=%.2f worst=%.2f bad=%s'%(name,len(ts),statistics.mean(ts),min(ts),bad))
