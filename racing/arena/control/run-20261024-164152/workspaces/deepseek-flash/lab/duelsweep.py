import subprocess, json, os, concurrent.futures as cf, statistics
ROOT="D:/extraProj/AIBattle/racing/arena/control/run-20261024-164152/workspaces/deepseek-flash"
SEEDS=[5011,5012,6011,6021,7011,8011,9011,10011,3,7,10,16]
def game(args):
    seed, seat, envs = args
    env=dict(os.environ); env.update(envs)
    if seat==0: cmds=['node','mock_duel2.js',str(seed),'python','agent_av.py','--','python','proxy_agent.py']
    else: cmds=['node','mock_duel2.js',str(seed),'python','proxy_agent.py','--','python','agent_av.py']
    r=subprocess.run(cmds, cwd=ROOT, capture_output=True, text=True, timeout=400, env=env)
    try: d=json.loads(r.stdout.strip().splitlines()[-1])
    except Exception: return seed,seat,None,None,None
    c=d['cars'][seat]
    return seed,seat,d['winner']==seat,c['finishTime'],len(d['collisions'])
CFGS=[('base',{}),
      ('d45l35',{'AV_AV_DIST':'45','AV_AV_LAT':'3.5','AV_AV_MARGIN':'0.75'}),
      ('d30l30',{'AV_AV_DIST':'30','AV_AV_LAT':'3.0','AV_AV_MARGIN':'0.8'}),
      ('d45l35s',{'AV_AV_DIST':'45','AV_AV_LAT':'3.5','AV_AV_MARGIN':'0.75','AV_AV_SLOW_DIST':'4','AV_AV_SLOW_LAT':'1.2'})]
for name, envs in CFGS:
    jobs=[(s,seat,envs) for s in SEEDS for seat in (0,1)]
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        res=list(ex.map(game, jobs))
    wins=sum(1 for r in res if r[2]); fails=[r for r in res if r[3] is None]
    ts=[r[3] for r in res if r[3]]
    print('%-8s games=%d wins=%d fails=%d avg=%.2f worst=%.2f coll=%.1f'%(
        name,len(res),wins,len(fails),statistics.mean(ts) if ts else 0,max(ts) if ts else 0,
        statistics.mean([r[4] for r in res])))
