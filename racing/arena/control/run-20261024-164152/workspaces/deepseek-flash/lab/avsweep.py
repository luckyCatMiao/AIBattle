import subprocess, json, os, sys, concurrent.futures as cf
ROOT="D:/extraProj/AIBattle/racing/arena/control/run-20261024-164152/workspaces/deepseek-flash"
SEEDS=[5011,6011,6021,7011,8011,9011,10011,11011,3,7,10,16]
def game(args):
    seed, seat, envs = args
    env=dict(os.environ); env.update(envs)
    if seat==0:
        cmds=['node','mock_duel2.js',str(seed),'python','agent_av.py','--','python','proxy_agent.py']
    else:
        cmds=['node','mock_duel2.js',str(seed),'python','proxy_agent.py','--','python','agent_av.py']
    r=subprocess.run(cmds, cwd=ROOT, capture_output=True, text=True, env=env, timeout=180)
    try:
        d=json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:
        return seed,seat,None,None,None
    c=d['cars'][seat]
    return seed,seat,c['finished'],c['finishTime'],len(d['collisions'])
CFGS=[
 ('base', {}),
 ('d45l35', {'AV_DIST':'45','AV_LAT':'3.5','AV_MARGIN':'0.75'}),
 ('d45slow', {'AV_DIST':'45','AV_LAT':'3.5','AV_MARGIN':'0.75','AV_AV_SLOW_DIST':'10'}),
 ('d45slow2', {'AV_DIST':'45','AV_LAT':'3.5','AV_MARGIN':'0.75','AV_AV_SLOW_DIST':'14','AV_AV_SLOW_LAT':'2.4'}),
]
for name, envs in CFGS:
    jobs=[(s,seat,envs) for s in SEEDS for seat in (0,1)]
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        res=list(ex.map(game, jobs))
    ts=[r[3] for r in res if r[2]]
    col=sum(r[4] for r in res if r[4] is not None)
    fails=sum(1 for r in res if not r[2])
    print('%-8s games=%d fails=%d avgtime=%.2f collisions=%d %s'%(
        name,len(res),fails,sum(ts)/max(1,len(ts)),col,[r[3] for r in res]))
