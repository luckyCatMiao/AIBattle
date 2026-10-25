import json, subprocess, time, sys, random
from agent import Agent, Forecast, Planner, duration
from baseline import Agent as Baseline

class Engine:
    def __init__(self,seed,patch=None):
        self.p=subprocess.Popen(['node','/workspace/test_engine.js'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
        self.state=self.req({'op':'init','seed':seed,'patch':patch})
    def req(self,obj):
        self.p.stdin.write(json.dumps(obj)+'\n'); self.p.stdin.flush()
        ans=json.loads(self.p.stdout.readline())
        if 'error' in ans: raise RuntimeError(ans['error'])
        return ans
    def step(self,inputs):
        self.state=self.req({'op':'advance','inputs':inputs}); return self.state
    def close(self):
        self.p.terminate(); self.p.wait()

class Opponent(Agent):
    def __init__(self,mode):
        super().__init__(); self.mode=mode
    def decide(self,o):
        if self.mode=='idle':
            return {'inputs':[{'dir':'N','btn':None} for _ in range(20)]}
        if self.mode=='random':
            return {'inputs':[{'dir':random.choice('NULRD'),'btn':'BOMB' if random.random()<.04 else None} for _ in range(20)]}
        if self.mode=='mirror': return super().decide(o)
        # Adversarial pursuer: fast close-in bomb pressure, same safety planner.
        return super().decide(o)
    def static_values(self,o,fc,f,e):
        v,w,a,d=super().static_values(o,fc,f,e)
        if self.mode=='rush':
            for i in range(fc.N):
                a[i]*=3
                w[i]*=.6
                v[i]=a[i]+w[i]
        return v,w,a,d

def run(seed,mode='idle',windows=180,verbose=False,patch=None,seat=0):
    engine=Engine(seed,patch)
    opponent=Baseline() if mode=='baseline' else Opponent(mode)
    agents=[Agent(),opponent] if seat==0 else [opponent,Agent()]
    timings=[]; first_round=engine.state['round']; desync=0
    try:
        for step in range(windows):
            o=engine.state
            if o['status']!='playing': break
            ins=[]
            for owner,ag in enumerate(agents):
                o['yourPlayer']=owner
                ts=time.perf_counter(); ans=ag.decide(o); timings.append(time.perf_counter()-ts)
                assert len(ans['inputs'])==20
                ins.append(ans['inputs'])
            old=o
            o=engine.step(ins)
            if o['round']==old['round']:
                for owner,ag in enumerate(agents):
                    f=o['fighters'][owner]
                    if ag.prev and f['alive']:
                        cd=ag.cooldown(o,f)
                        raw=o['raw'][owner]['moveProgress']
                        if raw<1 and cd==0: desync+=1
            if verbose and step%10==0:
                print('step',step,'f',[(f['x'],f['y'],f['bombs'],f['blast'],f['speed']) for f in o['fighters']], 'bombs',len(o['bombs']), 'soft',o['map']['tiles'].count(2),flush=True)
            if o['round']!=first_round or o['status']=='finished': break
        result={'seed':seed,'mode':mode,'seat':seat,'windows':step+1,'rounds':engine.state['roundLog'],'max_time':round(max(timings),3),'avg_time':round(sum(timings)/len(timings),3),'desync':desync}
        print(json.dumps(result,ensure_ascii=False),flush=True)
        return result
    finally: engine.close()

if __name__=='__main__':
    mode=sys.argv[1] if len(sys.argv)>1 else 'idle'
    n=int(sys.argv[2]) if len(sys.argv)>2 else 1
    for seed in range(1,n+1): run(seed,mode,verbose='--verbose' in sys.argv)
