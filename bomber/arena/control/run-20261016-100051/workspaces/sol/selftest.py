import json,subprocess,time,random,sys
from agent import Agent
class Bridge:
    def __init__(self):self.p=subprocess.Popen(['node','test_bridge.js'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
    def send(self,**kw):
        self.p.stdin.write(json.dumps(kw)+'\n');self.p.stdin.flush();o=json.loads(self.p.stdout.readline())
        if 'error'in o:raise RuntimeError(o['error'])
        return o
    def close(self):self.p.terminate();self.p.wait()
class Hunter(Agent):
    def potentials(self,tl):
        v,cd=super().potentials(tl)
        ed=self.distances(tl[3],[(self.ep,0)],6)
        if self.frame<650:
            for p in range(self.S):v[p]=v[p]*.3-min(100,ed[p])*.8
        return v,cd
class RandomBot:
    def __init__(self,seed,bomb=True):self.r=random.Random(seed);self.bomb=bomb
    def decide(self,o):
        return {'inputs':[{'dir':self.r.choice('UUDDLLRRN'),'btn':'BOMB' if self.bomb and self.r.random()<.07 else None} for _ in range(20)]}
class Still:
    def decide(self,o):return {'inputs':[{'dir':'N','btn':None} for _ in range(20)]}

def play(seed,kind,seat=0,trace=False):
    b=Bridge();o=b.send(op='new',seed=seed);agents=[None,None];agents[seat]=Agent()
    agents[1-seat]={'still':Still,'random':lambda:RandomBot(seed),'hunter':Hunter,'self':Agent}[kind]()
    maxt=0;steps=0
    while o['round']==1 and o['status']=='playing':
        ins=[]
        for i in range(2):
            o['yourPlayer']=i;t=time.perf_counter();ans=agents[i].decide(o);maxt=max(maxt,time.perf_counter()-t)
            assert len(ans['inputs'])==20
            assert all(a['dir']in'NULRD' and a['btn']in(None,'BOMB') for a in ans['inputs'])
            ins.append(ans['inputs'])
        if trace:
            f=o['fighters'][seat]; print(o['frame'],(f['x'],f['y']),[(bb['x'],bb['y'],bb['fuse']) for bb in o['bombs']],[(i,a) for i,a in enumerate(ins[seat]) if a['dir']!='N' or a['btn']],flush=True)
        o=b.send(op='advance',inputs=ins);steps+=1
        assert steps<100
    log=o['roundLog'][0];b.close()
    outcome='draw' if log['winner']is None else ('win' if log['winner']==('A'if seat==0 else'B') else'loss')
    return dict(seed=seed,kind=kind,seat=seat,result=outcome,max_response=maxt,**log)
if __name__=='__main__':
    if '--trace'in sys.argv: print(play(1,'still',trace=True));sys.exit()
    n=int(sys.argv[1]) if len(sys.argv)>1 else 3
    results=[]
    for kind in ['still','random','hunter','self']:
        for seed in range(1,n+1):
            for seat in [0,1]:
                r=play(seed,kind,seat);results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True)
    json.dump(results,open('selftest_results.json','w'),ensure_ascii=False,indent=2)
