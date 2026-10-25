import json,io,math
from collections import defaultdict

def load(n): return json.load(io.open('tools/r3/%s.json'%n,encoding='utf-8'))
def proj(pts,x,y):
    best=(1e18,0,0); s=0.0
    for i in range(len(pts)-1):
        x1,y1=pts[i]['x'],pts[i]['y']; x2,y2=pts[i+1]['x'],pts[i+1]['y']
        dx,dy=x2-x1,y2-y1; L2=dx*dx+dy*dy
        t=max(0.0,min(1.0,((x-x1)*dx+(y-y1)*dy)/L2))
        px,py=x1+t*dx,y1+t*dy; d2=(x-px)**2+(y-py)**2
        if d2<best[0]:
            best=(d2,s+t*math.sqrt(L2),(dx*(y-y1)-dy*(x-x1))/math.sqrt(L2))
        s+=math.sqrt(L2)
    return best[1],best[2]

def curvature(pts):
    n=len(pts); seg=[]; lens=[]
    for i in range(n):
        a=pts[i]; b=pts[(i+1)%n]
        seg.append(math.atan2(b['y']-a['y'],b['x']-a['x'])); lens.append(math.hypot(b['x']-a['x'],b['y']-a['y']))
    k=[0.0]*n
    for i in range(n):
        j=(i-1)%n; da=(seg[i]-seg[j]+math.pi)%(2*math.pi)-math.pi
        k[i]=da/max(0.5*(lens[i]+lens[j]),1e-6)
    ksm=[0.0]*n
    for i in range(n):
        acc=0.0
        for d in range(-6,7): acc+=k[(i+d)%n]
        ksm[i]=acc/13.0
    return ksm

for name in ['r3-g1','r3-g2']:
    d=load(name); frames=d['frames']; pts=d['track']['points']; ksm=curvature(pts); n=len(pts)
    # arc lookup
    cum=[0.0]
    for i in range(n): cum.append(cum[-1]+math.hypot(pts[(i+1)%n]['x']-pts[i]['x'],pts[(i+1)%n]['y']-pts[i]['y']))
    L=cum[-1]
    def radius_at(s):
        s=s%L
        import bisect
        i=bisect.bisect_right(cum,s)-1; i=max(0,min(n-1,i))
        return 1.0/max(abs(ksm[i]),1e-9)
    print('='*100); print(name)
    for idx in range(2):
        bins=defaultdict(lambda: dict(n=0,sp=0.0,dr=0,bo=0,ov=0))
        for f in frames:
            if f['tick']<30: continue
            c=f['cars'][idx]
            if c['speed']<2: continue
            s,lat=proj(pts,c['x'],c['y']); r=radius_at(s)
            if r<4: b='<4'
            elif r<5: b='4-5'
            elif r<6: b='5-6'
            elif r<7: b='6-7'
            elif r<9: b='7-9'
            elif r<12: b='9-12'
            else: b='>=12'
            a=bins[b]; a['n']+=1; a['sp']+=c['speed']; a['dr']+=c['drifting']; a['bo']+=c['boosting']; a['ov']+=c['drifting'] and c['boosting']
        print(' car',idx,d['seats'][idx])
        print('  radius   frames  avgsp  drift%%  boost%%  overlap%%')
        for b in ['<4','4-5','5-6','6-7','7-9','9-12','>=12']:
            a=bins[b]
            if a['n']:
                print('  %-6s %6d  %6.2f  %6.0f  %6.0f  %6.0f'%(b,a['n'],a['sp']/a['n'],100*a['dr']/a['n'],100*a['bo']/a['n'],100*a['ov']/a['n']))
