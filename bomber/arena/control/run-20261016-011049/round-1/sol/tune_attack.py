import json,sys,collections
from compare_versions import play
from agent import Agent
class Aggro(Agent):attack_weight=1.5
class Mid(Agent):attack_weight=1.0
results=[]
# play() uses Agent as the main seat; report the challenger from its opposite seat.
for name,cls in [('aggressive',Aggro),('medium',Mid)]:
 for seed in range(1,13):
  for seat in [0,1]:
   r=play(seed,seat,cls);r['challenger']=name;results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True)
json.dump(results,open('tuning_results.json','w'),ensure_ascii=False,indent=2)
