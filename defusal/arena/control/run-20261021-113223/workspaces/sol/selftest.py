import subprocess,json,time,sys
from agent import Agent

class Engine:
    def __init__(self): self.p=subprocess.Popen(['node','/workspace/test_driver.js'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
    def ask(self,q):
        self.p.stdin.write(json.dumps(q)+'\n');self.p.stdin.flush()
        r=json.loads(self.p.stdout.readline())
        if 'error' in r: raise RuntimeError(r['error'])
        return r
    def close(self):self.p.terminate();self.p.wait()

class Baseline(Agent):
    def __init__(self,kind):super().__init__('pdw');self.kind=kind
    def act(self,o):
        if o['phase']!='live':return super().act(o)
        if self.key!=(o['id'],o['round']):
            self.key=(o['id'],o['round']);self.fields={};self.w=o['map']['width'];self.h=o['map']['height'];self.tiles=o['map']['tiles']
        units=o['units'];pos={u['index']:(u['x'],u['y']) for u in units};out=[]
        for t in range(20):
            row=[]
            for u in units:
                i=u['index'];x,y=pos[i];b=o['bomb'];attack=o['side']=='attack'
                lane=9.5 if self.kind=='left' else 30.5 if self.kind=='right' else 19 if self.kind=='rush' else [9.5,10.5,19.,29.5,30.5][i]
                if attack:
                    if b['state']=='planted':target=(b['x'],b['y']);stop=math.hypot(x-b['x'],y-b['y'])<4
                    elif b['state']=='dropped':target=(b['x'],b['y']);stop=False
                    else:
                        target=(lane,21.5) if y>20.8 and abs(x-lane)>1 else (lane,9.5) if y>10 else (9.5 if lane<20 else 30.5,7.5)
                        stop=(x<11 and 4<=y<8 or x>29 and 4<=y<8) and b.get('carrier')==u['id']
                elif b['state']=='planted':target=(b['x'],b['y']);stop=math.hypot(x-b['x'],y-b['y'])<.85
                else:
                    target=(lane,9.3 if self.kind!='rush' else 20.5);stop=False
                d='N' if stop else self.nav(x,y,target)
                es=o['visibleEnemies'].get(u['id'],[])
                if es:
                    e=min(es,key=lambda e:math.hypot(e['x']-x,e['y']-y));aim=direction(e['x']-x,e['y']-y)
                    if math.hypot(e['x']-x,e['y']-y)<8 and not stop:d='N'
                else:aim='U' if attack else 'D'
                pos[i]=self.move(x,y,d);row.append({'dir':d,'aim':aim})
            out.append(row)
        return {'inputs':out}

import math
from agent import direction

def match(seed,kind,seat):
    engine=Engine();r=engine.ask({'op':'new','seed':seed}); agents=[None,None];agents[seat]=Agent();agents[1-seat]=Baseline(kind) if kind!='self' else Agent('right')
    windows=0;worst=0
    while r['status']=='playing' and windows<700:
        actions=[]
        for a,v in zip(agents,r['views']):
            start=time.perf_counter();actions.append(a.act(v));worst=max(worst,time.perf_counter()-start)
        r=engine.ask({'op':'buy' if r['views'][0]['phase']=='buy' else 'step','actions':actions});windows+=1
    engine.close()
    return {'seed':seed,'kind':kind,'seat':seat,'wins':r['wins'],'windows':windows,'max_response':round(worst,4),'rounds':[{k:q[k] for k in ('round','winnerTeam','reason','frames')} for q in r['log']]}

if __name__=='__main__':
    results=[]
    for kind in (sys.argv[1:] or ['left','right','rush','spread','self']):
        for seat in (0,1):
            result=match(1,kind,seat);results.append(result);print(json.dumps(result),flush=True)
    with open('/workspace/test_results.json','w') as f:json.dump(results,f,indent=2)
