import json, subprocess, time, sys, math, copy
from agent import Agent, aim, DIR

class Baseline(Agent):
    def __init__(self,style='rush'):
        super().__init__(); self.style=style
    def act(self,o):
        if (o.get('id'),o['round'],o['yourTeam'])!=self.key: self.setup(o)
        if o['phase']=='buy': return self.buy(o)
        us=o['units']; b=o['bomb']; side=o['side']; known={e['id']:e for es in o['visibleEnemies'].values() for e in es}
        actions=[]
        for u in us:
            if not u['alive']: actions.append([{'dir':'N','aim':'U'}]*20); continue
            x,y=u['x'],u['y']; field=self.sitefields['A' if self.style!='right' else 'B']; stop=False
            if side=='defend':
                if b['state']=='planted':
                    field=self.pointfield(b['x'],b['y']); stop=math.hypot(x-b['x'],y-b['y'])<.85
                else:
                    pos=(27.5+(u['index']-2)*1.1,16.5)
                    if self.style=='camp': pos=[(11.5,8.5),(14.5,8.5),(28.5,9.5),(41.5,8.5),(44.5,8.5)][u['index']]
                    if known:
                        e=min(known.values(),key=lambda e:math.hypot(e['x']-x,e['y']-y)); pos=(e['x'],e['y'])
                    field=self.pointfield(*pos)
            elif b['state']=='dropped': field=self.pointfield(b['x'],b['y'])
            elif b['state']=='planted': field=self.pointfield(b['x']+(u['index']-2),b['y']+1)
            if b.get('carrier')==u['id'] and any(s['x1']<=int(x)<=s['x2'] and s['y1']<=int(y)<=s['y2'] for s in o['map']['sites'].values()): stop=True
            es=list(known.values()); near=min(es,key=lambda e:math.hypot(e['x']-x,e['y']-y)) if es else None
            combat=near is not None and math.hypot(near['x']-x,near['y']-y)<10 and self.los(x,y,near['x'],near['y'])
            arr=[]
            for f in range(20):
                tx,ty=self.route(x,y,field); k=self.steer(x,y,tx,ty)
                if combat:
                    if self.style=='strafe':
                        dx=near['x']-x;dy=near['y']-y; sign=1 if (o['frame']//40+u['index'])%2 else -1
                        k=aim(-dy*sign,dx*sign)
                    elif self.style=='rush': k=aim(near['x']-x,near['y']-y)
                    else: k='N'
                if stop:k='N'
                facing=aim(near['x']-x,near['y']-y) if near else ('D' if side=='defend' and k=='N' else k if k!='N' else 'R')
                arr.append({'dir':k,'aim':facing});x,y=self.move(x,y,k)
            actions.append(arr)
        return {'inputs':[[actions[i][f] for i in range(5)] for f in range(20)]}

def run(seed,style,seat):
    p=subprocess.Popen(['node','/workspace/test_server.js'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
    def send(m):
        p.stdin.write(json.dumps(m,separators=(',',':'))+'\n');p.stdin.flush()
        r=json.loads(p.stdout.readline())
        if 'error'in r:raise RuntimeError(r['error'])
        return r
    r=send({'op':'new','seed':seed}); agents=[None,None];agents[seat]=Agent();agents[1-seat]=Agent() if style=='self' else Baseline(style)
    maxt=0; steps=0
    while r['status']=='playing' and steps<1000:
        actions=[]
        for a,o in zip(agents,r['views']):
            start=time.monotonic(); actions.append(a.act(o)); maxt=max(maxt,time.monotonic()-start)
        r=send({'op':'step','actions':actions});steps+=1
    p.terminate()
    return {'seed':seed,'style':style,'seat':seat,'wins':r['wins'],'max_response':round(maxt,3),'windows':steps,'rounds':[(a['winnerTeam'],a['reason'],a['frames']) for a in r['log']]}

if __name__=='__main__':
    results=[]
    for seed,style,seat in [(1,'rush',0),(2,'camp',1),(3,'strafe',0),(7,'right',1),(11,'self',0),(23,'strafe',1)]:
        r=run(seed,style,seat);results.append(r);print(json.dumps(r),flush=True)
    json.dump(results,open('/workspace/test_results.json','w'),indent=2)
