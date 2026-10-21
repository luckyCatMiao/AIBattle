import json, random, time
from selftest import Engine
from agent import Forecast, duration, Agent


def check_forecast(seed):
    e=Engine(seed)
    random.seed(seed)
    checks=0
    try:
        for scenario in range(10):
            o=e.state
            fc=Forecast(o)
            # Forecast the next 60 neutral frames against the unchanged public engine.
            for t in range(1,61):
                o=e.req({'op':'frame'})
                if o['round']!=e.state['round'] or o['status']!='playing': break
                actual={b['y']*fc.W+b['x'] for b in o['blasts']}
                predicted={i for i in range(fc.N) if fc.hazard[i]>>t&1}
                assert actual==predicted,(seed,scenario,t,actual^predicted)
                for i,v in enumerate(o['map']['tiles']):
                    assert (v==0)==(fc.clear[i]<=t),(seed,t,i,'tile')
                checks+=1
            # Fresh randomized bombs in a cleared arena give many chains.
            bombs=[]
            points=random.sample([(x,y) for y in range(1,16) for x in range(1,18) if x%2 or y%2],14)
            for j,(x,y) in enumerate(points):
                bombs.append({'id':'z'+str(j),'owner':j%2,'x':x,'y':y,'fuse':random.randint(1,40),'blast':random.randint(1,6)})
            e.close()
            e=Engine(seed,{'empty':scenario%2==0,'fighters':[{'invulnUntil':10000},{'invulnUntil':10000}],'bombs':bombs})
        return checks
    finally:e.close()


def protocol_check():
    import subprocess
    o=json.load(open('/workspace/example.json'))
    p=subprocess.Popen(['python3','/workspace/agent.py'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        for _ in range(3):
            p.stdin.write(json.dumps(o)+'\n');p.stdin.flush()
            a=json.loads(p.stdout.readline())
            assert len(a['inputs'])==20
            assert all(v['dir'] in 'NUDLR' and v['btn'] in [None,'BOMB'] for v in a['inputs'])
    finally:p.terminate();p.wait()

if __name__=='__main__':
    n=sum(check_forecast(seed) for seed in range(1,11))
    protocol_check()
    print(json.dumps({'forecast_frames_checked':n,'protocol':'passed','movement_durations':[duration(s) for s in range(4)]}))
