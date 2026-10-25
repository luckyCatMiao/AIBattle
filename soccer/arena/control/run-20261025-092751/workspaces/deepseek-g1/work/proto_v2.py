import gzip,json,os,subprocess,sys,time,math
P=r"D:\extraProj\AIBattle\soccer\arena\control\practice-20261025-014818"
DIRS={"N","U","D","L","R","UL","UR","DL","DR"}
obs_list=[]
# take every 5th window start from each game, both seats as given
for g in range(1,7):
    d=json.load(gzip.open(os.path.join(P,f"r1-g{g}.json.gz"))); fr=d['frames']
    wins=d['windows']
    for wi in range(0,len(wins),7):
        f0=wins[wi]['frame']-20
        if f0<0 or f0>=len(fr): continue
        o=dict(fr[f0]); o['yourTeam']=0; o['map']=d['map']
        o['units']=[u for u in fr[f0]['units']]
        # pretend we are team 0 by swapping? no: keep actual yourTeam
        o['yourTeam']=d['seats'].index('deepseek-g1')
        obs_list.append((g,f0,o))
# add example.json
ex=json.load(open('example.json',encoding='utf-8'))
obs_list.insert(0,('ex',0,ex))
print("cases",len(obs_list))
p=subprocess.Popen([sys.executable,'agent_v2.py'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
worst=0.0; bad=0; times=[]
for g,f0,o in obs_list:
    t=time.time()
    p.stdin.write(json.dumps(o,ensure_ascii=False)+"\n"); p.stdin.flush()
    line=p.stdout.readline()
    dt=time.time()-t
    if not line:
        print("NO OUTPUT", g,f0, p.stderr.read()[:500]); bad+=1; break
    try:
        d=json.loads(line); fr=d["inputs"]
        n=int(o.get('teamSize') or 1)
        assert len(fr)==20, "frames %d"%len(fr)
        for row in fr:
            assert len(row)==n, "units %d"%len(row)
            for u in row:
                assert u["dir"] in DIRS, u
                a=u["aim"]
                assert a is None or (isinstance(a,(int,float)) and 0<=a<360), u
                assert isinstance(u["kick"],bool)
        times.append(dt); worst=max(worst,dt)
    except Exception as e:
        bad+=1; print("FAIL",g,f0,e,line[:200])
print("bad",bad,"worst %.2fs"%worst,"mean %.3fs"%(sum(times)/max(1,len(times))))
p.stdin.close()
try: p.wait(timeout=5)
except: p.kill()
err=p.stderr.read()
if err.strip(): print("STDERR:",err[:2000])
