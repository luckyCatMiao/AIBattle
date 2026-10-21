import sys,json,math
from agent_v1 import Agent,aim,d2,MOVES

class Baseline(Agent):
    def __init__(self,style):
        super().__init__(style)
    def combat_move(self,u,p,goal,t,idx,lastdir):
        if self.style in ('duel','rush'): return super().combat_move(u,p,goal,t,idx,lastdir)
        # A conventional focus-fire opponent: approach, stop, and shoot.
        visible=[e for e in self.enemies if self.now-e['t']<1.5 and d2(p,(e['x'],e['y']))<64 and self.los(*p,e['x'],e['y'])]
        if visible:
            e=min(visible,key=lambda e:d2(p,(e['x'],e['y'])))
            if self.style=='charge': return aim(e['x']-p[0],e['y']-p[1])
            return 'N'
        return None
    def goals(self,o):
        if self.style=='duel': return super().goals(o)
        g,h=super().goals(o)
        if self.side=='defend' and o['bomb']['state']!='planted':
            if self.style in ('rush','charge'):
                for u in o['units']:
                    if u['alive']: g[u['index']]=(27.5+(u['index']-2)*.5,23.5);h.pop(u['index'],None)
            elif self.style=='stack':
                for u in o['units']:
                    if u['alive']: g[u['index']]=(11.5+(u['index']%3-1),8.5+(u['index']//3));h[u['index']]=True
        return g,h

agent=Baseline(sys.argv[1] if len(sys.argv)>1 else 'hold')
for line in sys.stdin:
    print(json.dumps(agent.act(json.loads(line)),separators=(',',':')),flush=True)
