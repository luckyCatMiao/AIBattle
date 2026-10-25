import json, time
from selftest import Engine, Opponent
from agent import Agent

peak=0
mismatch=[]
frames=0
for seed in range(201,206):
    e=Engine(seed)
    a=Agent()
    try:
        for k in range(150):
            o=e.state
            o['yourPlayer']=0
            act=a.decide(o)['inputs']
            # Verify the output itself frame by frame with a stationary opponent.
            last_round=o['round']
            for item in act:
                actual=e.req({'op':'frame','inputs':[item,{'dir':'N','btn':None}]})
                frames+=1
                if actual['round']!=last_round or actual['status']!='playing':break
            e.state=actual
            if actual['round']!=last_round or actual['status']!='playing':break
            pred=a.prev
            f=actual['fighters'][0]
            raw=actual['raw'][0]['moveProgress']
            if pred['x']!=f['x'] or pred['y']!=f['y'] or abs(pred['progress']-raw)>1e-8 or pred['speed']!=f['speed']:
                mismatch.append({'seed':seed,'window':k,'pred':pred,'actual':f,'raw':raw})
    finally:e.close()
print(json.dumps({'frames':frames,'mismatches':len(mismatch),'examples':mismatch[:3]}))
