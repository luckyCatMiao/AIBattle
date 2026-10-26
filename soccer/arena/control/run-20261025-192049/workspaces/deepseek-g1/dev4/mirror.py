import json,subprocess,sys,copy
def run(o):
    p=subprocess.run([sys.executable,'agent2.py'],input=json.dumps(o)+'\n',capture_output=True,text=True,timeout=30)
    if p.stderr.strip(): print('ERR',p.stderr[:400])
    return json.loads(p.stdout)['inputs']
def mirror(o):
    o=copy.deepcopy(o)
    for u in o['units']:
        u['x']=44-u['x']; u['facing']['x']=-u['facing']['x']
        u['team']=1-u['team']
    b=o['ball']; b['x']=44-b['x']; b['vx']=-b['vx']
    if b.get('owner'): b['owner']='t%d%s'%(1-int(b['owner'][1]),b['owner'][2:])
    o['yourTeam']=1-o['yourTeam']; o['score']=o['score'][::-1]
    return o
U=[{"team":0,"index":0,"x":2.4,"y":13,"facing":{"x":1,"y":0}},
   {"team":0,"index":1,"x":31.5,"y":13,"facing":{"x":1,"y":0}},
   {"team":0,"index":2,"x":30,"y":11,"facing":{"x":1,"y":0}},
   {"team":1,"index":0,"x":40.5,"y":13,"facing":{"x":-1,"y":0}},
   {"team":1,"index":1,"x":32.5,"y":15,"facing":{"x":-1,"y":0}},
   {"team":1,"index":2,"x":32.5,"y":19.5,"facing":{"x":-1,"y":0}}]
B={"x":32.1,"y":13,"vx":0,"vy":0,"owner":"t0u1"}
o={"teamSize":3,"yourTeam":0,"frame":100,"units":U,"ball":B,"score":[0,0],"freeze":0,"half":1,"golden":False,"status":"playing"}
a=run(o)
m=mirror(o)
b=run(m)
print('original (team0 attacking +x):')
for i,f in enumerate(a[:2]): print(' ',i,f)
print('mirror (team1 attacking -x):')
for i,f in enumerate(b[:2]): print(' ',i,f)
