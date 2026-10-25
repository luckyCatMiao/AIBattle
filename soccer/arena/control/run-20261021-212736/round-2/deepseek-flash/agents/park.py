#!/usr/bin/env python3
# 对手E：摆大巴。门将+全员退守，得球后大脚解围/反击。
import sys, json, math
D={'N':(0,0),'U':(0,-1),'D':(0,1),'L':(-1,0),'R':(1,0),'UL':(-.7071,-.7071),'UR':(.7071,-.7071),'DL':(-.7071,.7071),'DR':(.7071,.7071)}
def dn(vx,vy):
    if math.hypot(vx,vy)<1e-6:return 'N'
    a=math.degrees(math.atan2(vy,vx))%360
    return ['R','DR','D','DL','L','UL','U','UR'][int((a+22.5)//45)%8]
def tw(a,b):return dn(b[0]-a[0],b[1]-a[1])
def ang(a,b):return math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]))%360
def decide(o):
    n=int(o['teamSize']);mt=int(o['yourTeam'])
    my=sorted([u for u in o['units'] if u['team']==mt],key=lambda u:u['index'])
    b=o['ball']; bp=(b['x'],b['y'])
    gx=43.0 if mt==0 else 0.0; own=0.0 if mt==0 else 43.0; ad=1 if mt==0 else -1
    kp=min(my,key=lambda u:math.hypot(u['x']-own,u['y']-13))
    ch=min(my,key=lambda u:math.hypot(u['x']-bp[0],u['y']-bp[1]))
    danger=math.hypot(bp[0]-own,bp[1]-13)<12
    frames=[]
    for k in range(20):
        fr=[None]*n
        for u in my:
            if b.get('owner')==u['id']:
                fr[u['index']]={'dir':'N','aim':ang((u['x'],u['y']),(gx,13.0)),'kick':True}
            elif u is kp:
                t=(own+ad*1.8,max(11,min(15,bp[1])))
                fr[u['index']]={'dir':tw((u['x'],u['y']),t),'aim':None,'kick':False}
            elif u is ch and danger:
                fr[u['index']]={'dir':tw((u['x'],u['y']),bp),'aim':None,'kick':False}
            else:
                i=u['index']
                t=(own+ad*(8+i*1.5), 5+(i*16/max(1,n-1)))
                fr[u['index']]={'dir':tw((u['x'],u['y']),t),'aim':None,'kick':False}
        frames.append(fr)
    return {'inputs':frames}
def main():
    for line in sys.stdin:
        line=line.strip()
        if not line:continue
        try:out=decide(json.loads(line))
        except Exception as e:
            print('ERR',repr(e),file=sys.stderr,flush=True)
            try:n=int(json.loads(line)['teamSize'])
            except Exception:n=3
            out={'inputs':[[{'dir':'N','aim':None,'kick':False} for _ in range(n)] for _ in range(20)]}
        print(json.dumps(out,separators=(',',':')),flush=True)
main()
