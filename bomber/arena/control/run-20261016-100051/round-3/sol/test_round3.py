import json,collections,time,sys
from selftest import Bridge
from agent import Agent
from compare_versions import load,play

def gate(frame,seat,controller=Agent,trace=False):
 b=Bridge();o=b.send(op='new',seed=51,raw=True)
 fs=o['raw']['fighters'];tiles=[1 if x%2==0 and y%2==0 else 0 for y in range(17)for x in range(19)]
 positions=[(9,8),(11,9)] if seat==0 else [(7,7),(9,8)]
 for f,(x,y)in zip(fs,positions):f.update(x=x,y=y,fromX=x,fromY=y,moveProgress=1)
 o=b.send(op='set',state={'tiles':tiles,'fighters':fs,'roundFrames':frame})
 aa=[load('agent_round2')(),load('agent_round2')()];aa[seat]=controller()
 while o['round']==1:
  ins=[]
  for i in range(2):
   o['yourPlayer']=i;ins.append(aa[i].decide(o)['inputs'])
  if trace:print(o['frame'],[(f['x'],f['y'])for f in o['fighters']],[(i,a)for i,a in enumerate(ins[seat])if a['btn']])
  o=b.send(op='advance',inputs=ins)
 log=o['roundLog'][0];b.close();return {'frame':frame,'seat':seat,**log}
if __name__=='__main__':
 rows=[]
 for frame in [1100,1110,1120,1130]:
  for seat in [0,1]:
   r=gate(frame,seat,trace='--trace'in sys.argv);rows.append(r);print(r,flush=True)
 json.dump(rows,open('r3_gate_results.json','w'),indent=2)
