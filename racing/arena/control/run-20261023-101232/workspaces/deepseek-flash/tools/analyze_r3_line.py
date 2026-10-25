import json,io,math
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
for name in ['r3-g1','r3-g2']:
    d=load(name); pts=d['track']['points']; L=d['track']['length']
    print('='*100); print(name)
    for idx in range(2):
        # path length between lap events, signed lat stats per lap
        prev=None; dist=0; lap_dist={}; cur_lap=0
        lats={}; signed={}; absl={}
        for f in d['frames']:
            c=f['cars'][idx]
            if prev is not None:
                dd=math.hypot(c['x']-prev['x'],c['y']-prev['y']); dist+=dd; lap_dist[cur_lap]=lap_dist.get(cur_lap,0)+dd
            s,lat=proj(pts,c['x'],c['y'])
            if f['tick']>=30:
                lats.setdefault(c['lap'],[]).append(lat)
                signed.setdefault(c['lap'],[]).append(lat)
            prev=c
            if c['lap']!=cur_lap: cur_lap=c['lap']
        print(' car',idx,d['seats'][idx])
        for lap in sorted(lap_dist):
            if lap_dist[lap]<1: continue
            a=signed.get(lap,[])
            print('   lap%d path %.2f m (L %+.2f)  signed lat mean %+.2f  |lat| mean %.2f  lat>0 %.0f%%  min/max %+.2f/%+.2f'%(
                lap,lap_dist[lap],lap_dist[lap]-L,sum(a)/len(a) if a else 0,sum(abs(x) for x in a)/len(a) if a else 0,
                100*sum(1 for x in a if x>0)/len(a) if a else 0,min(a) if a else 0,max(a) if a else 0))
