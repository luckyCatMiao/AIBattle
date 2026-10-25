#!/usr/bin/env python3
# 自测对手：摆大巴 + 得球大脚解围。仅用于本地压力测试。
import sys, json, math
D={'N':(0,0),'U':(0,-1),'D':(0,1),'L':(-1,0),'R':(1,0),'UL':(-.7071,-.7071),'UR':(.7071,-.7071),'DL':(-.7071,.7071),'DR':(.7071,.7071)}
def dn(vx,vy):
    if math.hypot(vx,vy)<1e-6:return 'N'
    a=math.degrees(math.atan2(vy,vx))%360
    return ['R','DR','D','DL','L','UL','U','UR'][int((a+22.5)//45)%8]
def tw(a,b):return dn(b[0]-a[0],b[1]-a[1])
def ang(a,b):return math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]))%360
def decide(o):
    n=int(o['teamSize']); mt=int(o['yourTeam'])
    my=sorted([u for u in o['units'] if u['team']==mt], key=lambda u:u['index'])
    b=o['ball']; bp=(b['x'],b['y'])
    gx=43.0 if mt==0 else 0.0
    own=0.0 if mt==0 else 43.0
    ad=1 if mt==0 else -1
    kp=min(my,key=lambda u:math.hypot(u['x']-own,u['y']-13))
    ch=min(my,key=lambda u:math.hypot(u['x']-bp[0],u['y']-bp[1]))
    danger=math.hypot(bp[0]-own,bp[1]-13)<13
    frames=[]
    for k in range(20):
        fr=[None]*n
        for u in my:
            if b.get('owner')==u['id']:
                # 大脚朝对方球门方向解围
                fr[u['index']]={'dir':'N','aim':ang((u['x'],u['y']),(gx,13.0)),'kick':True}
            elif u is kp:
                t=(own+ad*1.2, max(11.0,min(15.0,bp[1])))
                fr[u['index']]={'dir':tw((u['x'],u['y']),t),'aim':None,'kick':False}
            elif u is ch and danger:
                fr[u['index']]={'dir':tw((u['x'],u['y']),bp),'aim':None,'kick':False}
            else:
                i=u['index']
                # 收缩在门前 3~6 格，按 index 散布在 y=9.5..16.5
                yy = 9.5 + (i%5)*1.6
                tx = own + ad*(3.0 + (i%3)*1.5)
                if danger:
                    # 球侧收缩
                    yy = yy*0.5 + bp[1]*0.5
                    tx = own + ad*2.5
                fr[u['index']]={'dir':tw((u['x'],u['y']),(tx,max(2.0,min(24.0,yy)))),'aim':None,'kick':False}
        frames.append(fr)
    return {'inputs':frames}
def main():
    for line in sys.stdin:
        line=line.strip()
        if not line:continue
        try: out=decide(json.loads(line))
        except Exception as e:
            try: n=int(json.loads(line)['teamSize'])
            except Exception: n=3
            out={'inputs':[[{'dir':'N','aim':None,'kick':False} for _ in range(n)] for _ in range(20)]}
        print(json.dumps(out,separators=(',',':')),flush=True)
main()
