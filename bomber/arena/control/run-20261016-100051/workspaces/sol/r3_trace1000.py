import json,sys
from selftest import Bridge
from compare_versions import load
seed=int(sys.argv[1]);seat=int(sys.argv[2]);name=sys.argv[3]if len(sys.argv)>3 else'agent'
b=Bridge();o=b.send(op='new',seed=seed);aa=[load('agent_round2')(),load('agent_round2')()];aa[seat]=load(name)()
while o['round']==1:
 ins=[]
 for i in range(2):o['yourPlayer']=i;ins.append(aa[i].decide(o)['inputs'])
 if o['frame']>=900:
  print(o['frame'],[(f['x'],f['y'])for f in o['fighters']],[(z['owner'],z['x'],z['y'],z['fuse'])for z in o['bombs']],[[ (j,a)for j,a in enumerate(acts)if a['dir']!='N'or a['btn']]for acts in ins])
  if o['frame']==1000:json.dump(dict(o,yourPlayer=seat),open('r3_loss32_observation.json','w'))
 o=b.send(op='advance',inputs=ins)
print(o['roundLog'][0]);b.close()
