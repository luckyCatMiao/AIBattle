"""代理对手：全员追球；拿球就朝对方球门踢（远距离吊，近距离射）。风格接近观察到的 Sol。"""
import sys, json, math
W, H = 44.0, 26.0
DIRV = {'N':(0,0),'U':(0,-1),'D':(0,1),'L':(-1,0),'R':(1,0),
        'UL':(-.7071,-.7071),'UR':(.7071,-.7071),'DL':(-.7071,.7071),'DR':(.7071,.7071)}
def dname(dx,dy):
    if abs(dx)<1e-9 and abs(dy)<1e-9: return 'N'
    a=math.atan2(dy,dx); i=int(round(a/(math.pi/4)))%8
    return ('R','DR','D','DL','L','UL','U','UR')[i]
for line in sys.stdin:
    if not line.strip(): continue
    o=json.loads(line); n=o['teamSize']; me=o['yourTeam']
    mine=[u for u in o['units'] if u['team']==me]
    b=o['ball']; gx=43.0 if me==0 else 1.0
    owner=b.get('owner'); outs=[]
    for f in range(20):
        row=[]
        for u in mine:
            has=(owner=='t%du%d'%(me,u['index']))
            if has:
                # 射门：瞄向门将另一侧
                opp=[x for x in o['units'] if x['team']!=me]
                gk=min(opp,key=lambda z:math.hypot(z['x']-gx,z['y']-13))
                ty=10.8 if gk['y']>13 else 15.2
                ang=math.atan2(ty-u['y'],gx-u['x'])
                dist=math.hypot(gx-u['x'],13-u['y'])
                if dist<22: row.append((dname(math.cos(ang),math.sin(ang)),math.degrees(ang)%360,True))
                else:
                    ang=math.atan2(13-u['y'],gx-u['x'])
                    row.append((dname(math.cos(ang),math.sin(ang)),math.degrees(ang)%360,True))
            else:
                dx=b['x']-u['x']; dy=b['y']-u['y']
                d=math.hypot(dx,dy) or 1
                # 简单拦截：朝球位置跑
                row.append((dname(dx,dy),None,False))
        outs.append(row)
    print(json.dumps({"inputs":[[{"dir":d,"aim":a,"kick":k} for d,a,k in fr] for fr in outs]}),flush=True)
