import sys,json
from agent_v1 import Agent, distance

class Baseline(Agent):
    def __init__(self,style):
        super().__init__()
        self.style=style

    def combat(self,u,pos,enemies,goal,obs):
        es=[e for e in enemies if self.now-e['t']<1.1 and distance(pos,(e['x'],e['y']))<10 and self.los(pos,(e['x'],e['y']))]
        if not es:return None
        e=min(es,key=lambda e:distance(pos,(e['x'],e['y'])))
        if self.style=='turret':return 'N',e
        if self.style=='rush':
            from agent import aimdir
            return aimdir(e['x']-pos[0],e['y']-pos[1]),e
        return super().combat(u,pos,enemies,goal,obs)

    def goals(self,obs,enemies):
        if self.style=='rush' and obs['side']=='defend' and obs['bomb']['state']!='planted':
            goals={}
            es=[e for e in self.memory.values() if self.now-e['t']<5]
            for u in obs['units']:
                if es:
                    e=min(es,key=lambda e:distance((u['x'],u['y']),(e['x'],e['y'])))
                    goals[u['id']]=(e['x'],e['y'])
                else:goals[u['id']]=(27.5,25.5)
            return goals,set()
        return super().goals(obs,enemies)

agent=Baseline(sys.argv[1] if len(sys.argv)>1 else 'turret')
for line in sys.stdin:
    o=json.loads(line)
    print(json.dumps(agent.act(o),separators=(',',':')),flush=True)
