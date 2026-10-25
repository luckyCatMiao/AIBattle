import json, time, subprocess, sys
from experiment import Agent
from round1 import Agent as Old

def run(seed, cls=Agent, rival=Old, seat=0, close=False):
    p=subprocess.Popen(['node','test_bridge.js'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8')
    def call(q):
        p.stdin.write(json.dumps(q,separators=(',',':'))+'\n'); p.stdin.flush()
        return json.loads(p.stdout.readline())
    o=call(dict(seed=seed,full=True,close=close)); track=o['track']; rules=o['rules']
    agents=[cls(),rival()] if seat==0 else [rival(),cls()]
    costs=[]
    while o['status']=='playing':
        windows=[]
        for j in range(2):
            o.update(yourPlayer=j,track=track,rules=rules)
            ts=time.perf_counter(); windows.append(agents[j].act(o)['inputs'])
            if j==seat: costs.append(time.perf_counter()-ts)
        o=call(dict(windows=windows))
    p.terminate(); p.wait()
    c=o['cars'][seat]; b=o['cars'][1-seat]
    return dict(seed=seed,seat=seat,win=o['winner']==seat,time=o['frame']/20,lap=c['lap'],progress=c['progress'],other=b['progress'],best=c['bestLap'],other_best=b['bestLap'],off=o['testStats']['off'][seat],collisions=c['collisions'],drift=c['driftTime'],boosts=c['boosts'],ms=round(max(costs)*1000,2))

if __name__=='__main__':
    variants=[{},dict(curvature_limit=1.5,err_limit=.65,slip_limit=.7),dict(curvature_limit=3.2,err_limit=1,slip_limit=1),dict(curvature_limit=.8,release=.3),dict(curvature_limit=1.5,release=.3),dict(curvature_limit=1.5,release=.15),dict(curvature_limit=1.5,period=10,on=9)]
    for k,params in enumerate(variants):
        C=type('Candidate',(Agent,),params)
        for seed in [1,4,42,6011,6012]:
            r=run(seed,C); r.update(variant=k,params=params)
            print(json.dumps(r),flush=True)
