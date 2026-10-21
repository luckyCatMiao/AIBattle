import sys,json,math
from round2_agent import Agent,DIR,aim,dist

class Sparring(Agent):
    # Locally authored adversaries, not competition opponent code.
    def __init__(self,style='orbit'):
        super().__init__();self.style=style
    def buy(self,o):
        out=[]
        for u in o['units']:
            p={'unit':u['index']};m=u['money']
            if m>=650 and u.get('armor',0)<50:p['armor']=True;m-=650
            if u['weapon']=='pistol':
                for w,c in [('rifle',2700),('smg',1250),('pdw',700)]:
                    if m>=c:p['weapon']=w;m-=c;break
            if o['side']=='defend' and m>=400:p['kit']=True
            out.append(p)
        return {'buys':out}
    def act(self,o):
        self.initmap(o)
        if o['phase']=='buy':return self.buy(o)
        b=o['bomb'];atk=o['side']=='attack';pl=b['state']=='planted';out=[[{'dir':'N','aim':'N'} for _ in range(5)] for _ in range(20)]
        enemies={e['id']:e for es in o['visibleEnemies'].values() for e in es}
        label='A' if self.style=='left' else 'B';s=o['map']['sites'][label];dest=((s['x1']+s['x2']+1)/2,8.5)
        for u in o['units']:
            if not u['alive']:continue
            x,y=u['x'],u['y'];i=u['index']
            if pl:g=(b['x'],b['y'])
            elif atk:g=(b['x'],b['y']) if b['state']=='dropped' else dest
            elif enemies:
                e=min(enemies.values(),key=lambda e:dist((x,y),(e['x'],e['y'])));g=(e['x'],e['y'])
            elif self.style=='split':g=(11.5 if i<2 else 44.5,9.5)
            else:g=(25.5+i,12.5 if self.style!='charge' else 25.5)
            if not self.fits(*g):k=self.nearest(g);g=(k%self.w+.5,k//self.w+.5)
            for f in range(20):
                es=[e for e in enemies.values() if self.los(x,y,e['x'],e['y'])]
                e=min(es,key=lambda e:dist((x,y),(e['x'],e['y']))) if es else None
                fixed=atk and b.get('carrier')==u['id'] and any(ss['x1']<=int(x)<=ss['x2'] and ss['y1']<=int(y)<=ss['y2'] for ss in o['map']['sites'].values())
                fixed|=pl and dist((x,y),g)<(.8 if not atk else 2)
                wp=self.waypoint((x,y),g)
                if fixed:d='N'
                elif e and self.style!='charge':
                    dx=e['x']-x;dy=e['y']-y;r=math.hypot(dx,dy) or 1;sign=1 if (o['frame']//60+i)%2 else -1
                    vx=dy/r*sign+dx/r*(.6 if r>3 else -.5);vy=-dx/r*sign+dy/r*(.6 if r>3 else -.5)
                    d=min(DIR,key=lambda n:(self.move(x,y,n)[0]-x-vx*.15)**2+(self.move(x,y,n)[1]-y-vy*.15)**2)
                else:d=min(DIR,key=lambda n:dist(self.move(x,y,n),wp)) if dist((x,y),g)>.2 else 'N'
                x,y=self.move(x,y,d)
                if e:a=aim(e['x']-x,e['y']-y)
                elif pl:a=aim(b['x']-x,b['y']-y) if atk else 'D'
                elif atk:a='U' if y>14 else ('R' if label=='A' else 'L')
                else:a='D'
                out[f][i]={'dir':d,'aim':a}
        return {'inputs':out}
if __name__=='__main__':
    a=Sparring(sys.argv[1] if len(sys.argv)>1 else 'orbit')
    for l in sys.stdin:print(json.dumps(a.act(json.loads(l)),separators=(',',':')),flush=True)
