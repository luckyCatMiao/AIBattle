import subprocess, json, concurrent.futures as cf, statistics, sys
ROOT="D:/extraProj/AIBattle/racing/arena/control/run-20261024-164152/workspaces/deepseek-flash"
lo,hi=int(sys.argv[1]),int(sys.argv[2])
seeds=list(range(lo,hi))
def run(s):
    r=subprocess.run(['node','mock_referee.js',str(s),'python','agent.py'], cwd=ROOT, capture_output=True, text=True, timeout=400)
    try: d=json.loads(r.stdout.strip().splitlines()[-1])
    except Exception: return s,None,None,None
    m=d['me']
    return s,m['finishTime'] if m['finished'] else None, m['bestLap'], d['frames']
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    res=list(ex.map(run, seeds))
rows=[]
for s,t,b,fr in res:
    rows.append((s,t,b,fr))
ok=[r for r in rows if r[1]]
bad=[r for r in rows if not r[1]]
print('n=%d ok=%d bad=%s'%(len(rows),len(ok),bad))
if ok:
    print('mean t=%.2f worst=%.2f  mean bestlap=%.2f worst bestlap=%.2f'%(
        statistics.mean([r[1] for r in ok]), max(r[1] for r in ok),
        statistics.mean([r[2] for r in ok]), max(r[2] for r in ok)))
    # anomaly: any race where (t - 3*best) is large => missed cp / stuck
    anom=[r for r in ok if r[1]-3*r[2] > 8.0]
    print('anomalies(t-3*best>8s):', anom)
