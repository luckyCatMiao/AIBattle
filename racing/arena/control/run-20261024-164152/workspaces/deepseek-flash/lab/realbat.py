import subprocess, json, concurrent.futures as cf, statistics, sys
ROOT="D:/extraProj/AIBattle/racing/arena/control/run-20261024-164152/workspaces/deepseek-flash"
seeds=[int(x) for x in (sys.argv[1:] or ['5011','5012','6011','6012','6021','6022','7011','7012','8011','9011','10011','11011','3','7','10','16'])]
def run(s):
    r=subprocess.run(['node','mock_referee.js',str(s),'python','agent.py'], cwd=ROOT, capture_output=True, text=True, timeout=400)
    try: d=json.loads(r.stdout.strip().splitlines()[-1])
    except Exception: return s,None
    return s,d
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    res=list(ex.map(run, seeds))
ts=[]; bad=[]
for s,d in res:
    if d is None: bad.append((s,'parse')); continue
    m=d['me']
    if not m['finished']: bad.append((s,'dnf')); continue
    lap_ok = True
    ts.append(m['finishTime'])
    print('seed %-6d t=%6.2f best=%5.2f laps3 frames=%-5d maxMs=%d'%(s,m['finishTime'],m['bestLap'],d['frames'],d['maxMs']))
print('n=%d mean=%.2f worst=%.2f bad=%s'%(len(ts),statistics.mean(ts),max(ts),bad))
