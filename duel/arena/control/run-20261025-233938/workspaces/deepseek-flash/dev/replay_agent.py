import gzip, json, subprocess, sys, os
BASE='D:/extraProj/AIBattle/duel/arena/control/run-20261025-233938'
gid=sys.argv[1] if len(sys.argv)>1 else 'r2-g1'
seat=sys.argv[2] if len(sys.argv)>2 else 'deepseek-flash'
start=int(sys.argv[3]) if len(sys.argv)>3 else 0
end=int(sys.argv[4]) if len(sys.argv)>4 else 10**9
d=json.load(gzip.open(f'{BASE}/{gid}.json.gz','rt',encoding='utf-8'))
mi=d['seats'].index(seat)
fr=[f for f in d['frames'] if start <= f['frame'] <= end]
win={w['frame']:w for w in d['windows']}
p=subprocess.Popen([sys.executable,'agent.py'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',cwd='.')
env=dict(os.environ)
try:
    for f in fr:
        obs=dict(f); obs['yourPlayer']=mi
        p.stdin.write(json.dumps(obs,ensure_ascii=False)+'\n'); p.stdin.flush()
        line=p.stdout.readline()
        got=json.loads(line)['inputs']
        # recorded inputs are for the window that starts here (window label = frame+3)
        rec=win.get(f['frame']+3)
        recin=rec['inputs'][mi] if rec else None
        mark='OK' if recin==[{k:v for k,v in x.items()} for x in got] else 'DIFF'
        if mark=='DIFF' or (recin is None):
            print('frame',f['frame'],'agent',got,'recorded',recin)
        elif f['frame']%300==0 or f['frame']>=2091:
            print('frame',f['frame'],'OK',got)
finally:
    p.stdin.close(); p.terminate()
    err=p.stderr.read()
    if err: print('STDERR',err[:500],file=sys.stderr)
