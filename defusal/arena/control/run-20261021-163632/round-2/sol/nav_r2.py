import json,time,random
from agent import Agent,DIR,dist
obs=json.load(open('/workspace/example.json'))
a=Agent();a.initmap(obs)
random.seed(2701)
fail=[];start=time.perf_counter();longest=0
for n in range(160):
    k=random.choice(list(a.adj));p=(k%a.w+.5,k//a.w+.5)
    goal=(10.5,8.5) if n%2 else (45.5,8.5)
    for f in range(2600):
        if dist(p,goal)<.25:break
        wp=a.waypoint(p,goal)
        d=min(DIR,key=lambda d:dist(a.move(*p,d),wp))
        p=a.move(*p,d)
    else:fail.append({'start':k,'end':p,'goal':goal,'wp':wp})
    longest=max(longest,f)
print(json.dumps({'paths':160,'failures':fail[:10],'failureCount':len(fail),'maxFrames':longest,'seconds':time.perf_counter()-start}))
