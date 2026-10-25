import json, subprocess, sys, time
from agent import Agent
from baseline import Agent as Baseline

def run(seed, seat=0, rival=True, opponent=Baseline, close=False):
    proc=subprocess.Popen(['node','test_bridge.js'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8')
    def call(q):
        proc.stdin.write(json.dumps(q,separators=(',',':'))+'\n'); proc.stdin.flush()
        return json.loads(proc.stdout.readline())
    o=call({'seed':seed,'full':True,'close':close}); track=o['track']; rules=o['rules']
    agents=[Agent(),opponent()] if seat==0 else [opponent(),Agent()]
    off=[0,0]; frames=0; costs=[]; lastcp=[1,1]; stall=[0,0]
    while o['status']=='playing':
        windows=[]
        for j in range(2):
            o['yourPlayer']=j; o['track']=track; o['rules']=rules
            start=time.perf_counter()
            w=agents[j].act(o)['inputs']
            if j==seat: costs.append(time.perf_counter()-start)
            if not rival and j!=seat: w=[[{'throttle':0}] for _ in range(20)]
            windows.append(w)
        o=call({'windows':windows})
        for j,c in enumerate(o['cars']):
            off[j]+=c['offRoad']
            if c['nextCp']==lastcp[j]: stall[j]+=1
            else: stall[j]=0
            lastcp[j]=c['nextCp']
        frames+=1
    proc.terminate(); proc.wait()
    c=o['cars'][seat]; other=o['cars'][1-seat]
    return dict(seed=seed,seat=seat,winner=o['winner'],time=round(o['frame']/20,2),lap=c['lap'],progress=c['progress'],other=other['progress'],off_frames=o['testStats']['off'][seat],max_speed=round(o['testStats']['maxSpeed'][seat],2),boosts=c['boosts'],drift=c['driftTime'],collisions=c['collisions'],max_ms=round(max(costs)*1000,2),length=track['length'])

if __name__=='__main__':
    seeds=[int(x) for x in sys.argv[1:]] or list(range(1,6))
    for seed in seeds:
        print(json.dumps(run(seed),ensure_ascii=False),flush=True)
