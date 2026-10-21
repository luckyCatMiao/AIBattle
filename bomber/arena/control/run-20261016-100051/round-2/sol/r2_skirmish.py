import random,json,time,collections,sys
from selftest import Bridge
from compare_versions import load
from agent import Agent

def play(seed,seat,foe,weight=None):
 rng=random.Random(seed);b=Bridge();o=b.send(op='new',seed=seed,raw=True)
 fs=o['raw']['fighters'];tiles=[1 if x%2==0 and y%2==0 else (2 if rng.random()<.15 else 0)for y in range(17)for x in range(19)]
 frame=rng.choice([700,800,900,1000,1060])
 ring=0 if frame<=800 else 1+(frame-800)//50
 ps=rng.sample([p for p,v in enumerate(tiles)if not v and min(p%19,p//19,18-p%19,16-p//19)>=max(5,ring)],2)
 for i,p in enumerate(ps):fs[i].update(x=p%19,y=p//19,fromX=p%19,fromY=p//19,moveProgress=1)
 o=b.send(op='set',state={'tiles':tiles,'fighters':fs,'roundFrames':frame})
 aa=[None,None];aa[seat]=Agent();aa[1-seat]=foe()
 if weight is not None:aa[seat].attack_weight=weight
 maxt=0
 while o['round']==1:
  ins=[]
  for i in range(2):
   o['yourPlayer']=i;t=time.perf_counter();ins.append(aa[i].decide(o)['inputs']);maxt=max(maxt,time.perf_counter()-t)
  o=b.send(op='advance',inputs=ins)
 log=o['roundLog'][0];b.close()
 return {'seed':seed,'seat':seat,'start_frame':frame,'result':'draw' if log['winner']is None else ('win' if log['winner']==('A'if seat==0 else'B')else'loss'),'max_seconds':maxt,**log}
if __name__=='__main__':
 rs=[];foe=load('agent_round1')
 for seed in range(1,61):
  for seat in [0,1]:rs.append(play(seed,seat,foe))
  if seed%5==0:print(seed,dict(collections.Counter(r['result']for r in rs)),flush=True)
 json.dump(rs,open('r2_skirmish_results.json','w'),indent=2)
