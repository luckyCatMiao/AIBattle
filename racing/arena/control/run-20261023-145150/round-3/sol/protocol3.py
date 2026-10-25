import json, subprocess, time, math
from agent import Agent

def main():
    entry=json.load(open('entry.json',encoding='utf-8'))
    o=json.load(open('example.json',encoding='utf-8'))
    p=subprocess.Popen(entry['command'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8')
    costs=[]
    for i in range(100):
        t=time.perf_counter()
        p.stdin.write(json.dumps(o)+'\n');p.stdin.flush()
        raw=p.stdout.readline()
        out=json.loads(raw)
        assert len(out['inputs'])==20
        for frame in out['inputs']:
            assert isinstance(frame,list) and len(frame)==1
            u=frame[0]
            assert math.isfinite(u['throttle']) and -1<=u['throttle']<=1
            assert math.isfinite(u['steer']) and -1<=u['steer']<=1
            assert type(u['drift']) is bool and type(u['boost']) is bool
        costs.append(time.perf_counter()-t)
    p.stdin.close();assert p.wait(timeout=5)==0
    print(json.dumps(dict(protocol='passed',responses=len(costs),max_ms=max(costs)*1000,mean_ms=sum(costs)/len(costs)*1000,command=entry['command'])),flush=True)

if __name__=='__main__':main()
