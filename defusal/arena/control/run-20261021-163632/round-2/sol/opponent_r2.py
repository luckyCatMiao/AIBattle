import json, sys
from round1_agent import Agent as OldAgent, DIR

class Opponent(OldAgent):
    """A separately specified objective controller using the frozen navigation layer."""
    def __init__(self, style):
        super().__init__()
        self.style = style

    def buy(self, o):
        out = []
        for u in o['units']:
            money = u['money']
            p = {'unit': u['index']}
            if self.style == 'sniper' and money >= 4750:
                p['weapon'] = 'sniper'; money -= 4750
            elif money >= 2700 and u['weapon'] != 'rifle':
                p['weapon'] = 'rifle'; money -= 2700
            elif money >= 1250 and u['weapon'] == 'pistol':
                p['weapon'] = 'smg'; money -= 1250
            elif money >= 700 and u['weapon'] == 'pistol':
                p['weapon'] = 'pdw'; money -= 700
            if money >= 650 and u.get('armor', 0) < 70:
                p['armor'] = True; money -= 650
            if o['side'] == 'defend' and money >= 400:
                p['kit'] = True
            out.append(p)
        return {'buys': out}

    def act(self, o):
        from round1_agent import aim, dist
        self.initmap(o)
        if o['phase'] == 'buy':
            return self.buy(o)
        us = [u for u in o['units'] if u['alive']]
        attack = o['side'] == 'attack'
        b = o['bomb']; planted = b['state'] == 'planted'
        label = 'B' if self.style == 'right' else 'A'
        s = o['map']['sites'][label]
        dest = ((s['x1']+s['x2']+1)/2, 8.5)
        all_enemies = {e['id']: e for es in o['visibleEnemies'].values() for e in es}
        frames = [[{'dir':'N','aim':'N'} for _ in range(5)] for _ in range(20)]
        for u in us:
            x, y = u['x'], u['y']; i=u['index']
            if planted:
                g = (b['x'], b['y'])
            elif attack:
                g = (b['x'], b['y']) if b['state']=='dropped' else dest
            elif self.style == 'rush':
                g = (27.5, 26.5)
            elif self.style in ('turret', 'sniper'):
                g = (25.5+i, 10.5)
            else:
                ss = o['map']['sites']['A' if i<3 else 'B']
                g = ((ss['x1']+ss['x2']+1)/2+(i%3-1), 11.5)
            if not self.fits(*g):
                k=self.nearest(g); g=(k%self.w+.5,k//self.w+.5)
            for f in range(20):
                stop = planted and dist((x,y),g)<(.8 if not attack else 3)
                stop |= attack and b.get('carrier')==u['id'] and any(ss['x1']<=int(x)<=ss['x2'] and ss['y1']<=int(y)<=ss['y2'] for ss in o['map']['sites'].values())
                enemies = [e for e in all_enemies.values() if self.los(x,y,e['x'],e['y'])]
                target = min(enemies, key=lambda e:dist((x,y),(e['x'],e['y']))) if enemies else None
                if stop:
                    d='N'
                elif target and self.style not in ('rush','right'):
                    # Alternating long strafes, not the submitted agent's combat scorer.
                    a=aim(target['x']-x,target['y']-y)
                    names=['R','DR','D','DL','L','UL','U','UR']
                    d=names[(names.index(a)+(2 if (o['frame']//24+i)%2 else -2))%8]
                    if dist((x,y),(target['x'],target['y']))<2: d='N'
                else:
                    wp=self.waypoint((x,y),g)
                    d=min(DIR,key=lambda n:dist(self.move(x,y,n),wp)) if dist((x,y),g)>.2 else 'N'
                x,y=self.move(x,y,d)
                if target: a=aim(target['x']-x,target['y']-y)
                elif attack: a='U' if y>12 else ('R' if label=='A' else 'L')
                else: a='D'
                frames[f][i]={'dir':d,'aim':a}
        return {'inputs':frames}

if __name__ == '__main__':
    bot=Opponent(sys.argv[1] if len(sys.argv)>1 else 'left')
    for line in sys.stdin:
        print(json.dumps(bot.act(json.loads(line)),separators=(',',':')),flush=True)
