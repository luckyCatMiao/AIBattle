import sys,json,math
import agent_r1 as a
STYLE=sys.argv[1] if len(sys.argv)>1 else 'fast'

def carry(u,friends,enemies,sgn):
    gx=43 if sgn==1 else 1
    j=a.toward(u,gx,13)
    gy=13
    if STYLE=='corner':
        e=min(enemies,key=lambda e:a.dist(u,e))
        gy=10.7 if e['y']>=13 else 15.3
    aim=a.angle(gx-u['x']-a.DIRS[j][1]*a.STEP,gy-u['y']-a.DIRS[j][2]*a.STEP)
    d=math.hypot(gx-u['x'],gy-u['y'])
    return j,aim,d<23 if STYLE!='dribble' else d<8

a.carry=carry
for line in sys.stdin:
    o=json.loads(line)
    r=a.decide(o)
    if STYLE in ('fast','corner'):
        # Make unexpected acquisitions shoot, too, instead of depending on an exact ownership forecast.
        for f in r['inputs']:
            for i,act in enumerate(f):
                u=[u for u in o['units'] if u['team']==o['yourTeam']][i]
                gx=43 if o['yourTeam']==0 else 1
                if abs(gx-u['x'])<22:
                    act['kick']=True
                    act['aim']=a.angle(gx-u['x'],13-u['y'])
    print(json.dumps(r),flush=True)
