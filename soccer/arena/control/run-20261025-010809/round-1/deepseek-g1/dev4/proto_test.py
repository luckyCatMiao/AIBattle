import json,subprocess,sys,time,random,math
PY=sys.executable
def obs(n,me,freeze=0,golden=False,score=(0,0),ball_owner=None,timeLeft=120.0):
    units=[]
    for t in range(2):
        for i in range(n):
            units.append({"team":t,"index":i,
                "x":round(11.5+21*t+random.uniform(-2,2),3),"y":round(random.uniform(2,24),3),
                "facing":{"x":1-2*t,"y":0},"hasBall":False,"keeper":i==0,"inOwnBox":False,
                "kickCd":0,"controlLock":0,"goals":0,"kicks":0,"touches":0})
    b={"x":22,"y":13,"vx":0,"vy":0,"owner":None,"lastTouch":None,"lastTeam":None}
    if ball_owner is not None:
        b["owner"]=ball_owner
    return {"teamSize":n,"yourTeam":me,"frame":100,"units":units,"ball":b,"score":list(score),
            "freeze":freeze,"half":1,"golden":golden,"goldenLeft":20.0 if golden else None,
            "timeLeft":timeLeft,"status":"playing","phase":"live"}
bad=0; worst=0
DIRS={"N","U","D","L","R","UL","UR","DL","DR"}
for n in range(1,7):
    for me in (0,1):
        for freeze in (0,0.6):
            for golden in (False,True):
                for score in ((0,0),(1,0),(0,1)):
                    random.seed(n*100+me*10+int(golden)*3+score[0])
                    owner=("t%du0"%me) if random.random()<0.5 else None
                    o=obs(n,me,freeze,golden,score,owner)
                    t=time.time()
                    p=subprocess.run([PY,'agent.py'],input=json.dumps(o)+chr(10),capture_output=True,text=True,timeout=30)
                    dt=time.time()-t; worst=max(worst,dt)
                    try:
                        d=json.loads(p.stdout)
                        fr=d["inputs"]
                        assert len(fr)==20, "frames %d"%len(fr)
                        for f in fr:
                            assert len(f)==n, "units %d != %d"%(len(f),n)
                            for u in f:
                                assert u["dir"] in DIRS, u
                                a=u["aim"]
                                assert a is None or (isinstance(a,(int,float)) and 0<=a<360), u
                                assert isinstance(u["kick"],bool)
                        if p.stderr.strip(): print("stderr",n,me,p.stderr[:200]); bad+=1
                    except Exception as e:
                        bad+=1; print("FAIL n=%d me=%d "%(n,me), e, p.stdout[:200], p.stderr[:300])
print("protocol cases done, bad=%d, worst=%.2fs"%(bad,worst))
