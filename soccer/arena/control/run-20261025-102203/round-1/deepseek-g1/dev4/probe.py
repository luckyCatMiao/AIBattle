import json,subprocess,sys
def obs(units,ball,me=0,n=3,score=(0,0)):
    return {"teamSize":n,"yourTeam":me,"frame":100,"units":units,"ball":ball,"score":list(score),"freeze":0,"half":1,"golden":False,"status":"playing"}
U=[{"team":0,"index":0,"x":2.4,"y":13,"facing":{"x":1,"y":0}},
   {"team":0,"index":1,"x":31.5,"y":13,"facing":{"x":1,"y":0}},
   {"team":0,"index":2,"x":30,"y":11,"facing":{"x":1,"y":0}},
   {"team":1,"index":0,"x":40.5,"y":13,"facing":{"x":-1,"y":0}},
   {"team":1,"index":1,"x":32.5,"y":15,"facing":{"x":-1,"y":0}},
   {"team":1,"index":2,"x":32.5,"y":19.5,"facing":{"x":-1,"y":0}}]
B={"x":32.1,"y":13,"vx":0,"vy":0,"owner":"t0u1"}
p=subprocess.run([sys.executable,'agent2.py'],input=json.dumps(obs(U,B))+'\n',capture_output=True,text=True,timeout=30)
print(p.stderr[:500])
d=json.loads(p.stdout)
for f in d['inputs'][:4]: print(f)
