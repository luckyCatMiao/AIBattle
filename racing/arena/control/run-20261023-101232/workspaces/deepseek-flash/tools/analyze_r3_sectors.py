import json, io, math

def load(name):
    return json.load(io.open('tools/r3/%s.json'%name,encoding='utf-8'))

def proj(pts, x, y):
    # returns arc length s, signed lateral (left +), distance
    best=(1e18,0,0)
    s=0.0
    for i in range(len(pts)-1):
        x1,y1=pts[i]['x'],pts[i]['y']; x2,y2=pts[i+1]['x'],pts[i+1]['y']
        dx,dy=x2-x1,y2-y1; L2=dx*dx+dy*dy
        t=((x-x1)*dx+(y-y1)*dy)/L2
        t=max(0.0,min(1.0,t))
        px,py=x1+t*dx,y1+t*dy
        d2=(x-px)**2+(y-py)**2
        if d2<best[0]:
            # cross product sign: left of direction
            cross=dx*(y-y1)-dy*(x-x1)
            best=(d2,s+t*math.sqrt(L2),cross/math.sqrt(L2))
        s+=math.sqrt(L2)
    return best[1],best[2],math.sqrt(best[0])

def inputs_by_frame(d):
    # frame -> [seat0,seat1]
    out={}
    for w in d['windows']:
        n=len(w['inputs'][0])
        for i in range(n):
            out[w['frame']+i]=[w['inputs'][0][i][0],w['inputs'][1][i][0]]
    return out

for name in ['r3-g1','r3-g2']:
    d=load(name); frames=d['frames']; L=d['track']['length']; pts=d['track']['points']
    inp=inputs_by_frame(d)
    print('='*100)
    print(name,'seed',d['seed'],'length %.3f halfWidth %.3f'%(L,d['track']['halfWidth']))
    for idx in range(2):
        print('\n### car',idx,d['seats'][idx],d['names'][idx])
        # cp crossings per lap
        cur=None; events=[]   # (t, lap_before, cp_from, cp_to, speed, s)
        prev_lap=0
        for f in frames:
            c=f['cars'][idx]; t=f['tick']*0.05
            lap,cp=c['lap'],c['nextCp']
            s,lat,dist=proj(pts,c['x'],c['y'])
            key=(lap,cp)
            if cur is None:
                cur=key
            elif key!=cur:
                events.append((t,cur[0],cur[1],cp,c['speed'],s,lat,c['boostEnergy'],c['drifting'],c['boosting']))
                cur=key
        # print cp crossings summarized
        print('checkpoint crossings: t lap cp_before->cp_after speed s lat E')
        for e in events:
            print('  %6.2f lap%d cp%d->%d sp%6.2f s%7.2f lat%6.2f E%.2f d%d b%d'%e)
        # segment durations between cp crossings within same lap
        print('segment times (same lap):')
        for i in range(1,len(events)):
            a,b=events[i-1],events[i]
            if a[1]==b[1]:
                print('  lap%d cp%d->cp%d: %.2f s  (t %.2f -> %.2f)'%(a[1],a[2],b[2],b[0]-a[0],a[0],b[0]))
        # per-frame states: worst speed segments between cp crossings
        # count boost/drift/throttle by lap
        from collections import defaultdict
        agg=defaultdict(lambda: dict(frames=0, boost=0, drift=0, throttle_lt1=0, speed=0.0, lat_abs=0.0, steer_abs=0.0, brake=0))
        for f in frames:
            if f['tick']<30: continue
            c=f['cars'][idx]; t=f['tick']*0.05
            lap=c['lap']; s,lat,dist=proj(pts,c['x'],c['y'])
            i=inp.get(f['tick'],[None,None])[idx]
            a=agg[lap]; a['frames']+=1
            if c['boosting']: a['boost']+=1
            if c['drifting']: a['drift']+=1
            a['speed']+=c['speed']; a['lat_abs']+=abs(lat)
            if i:
                if i['throttle']<1: a['throttle_lt1']+=1
                if i['throttle']<0: a['brake']+=1
                a['steer_abs']+=abs(i['steer'])
        print('per-lap aggregates: lap frames boost drift thr<1 brake avgsp avg|lat| avg|steer|')
        for lap in sorted(agg):
            a=agg[lap]; n=a['frames']
            print('  lap%d %3d  b%3d d%3d thr<1 %2d brake %2d  sp%6.2f lat%5.2f steer%5.2f'%(
                lap,n,a['boost'],a['drift'],a['throttle_lt1'],a['brake'],a['speed']/n,a['lat_abs']/n,a['steer_abs']/n))
        # slow frames where speed<16 and lap>=1
        print('slow frames (speed<16, t>=1.5):')
        run=[]
        for f in frames:
            c=f['cars'][idx]; t=f['tick']*0.05
            if t<1.5: continue
            if c['speed']<16:
                s,lat,dist=proj(pts,c['x'],c['y'])
                i=inp.get(f['tick'],[None,None])[idx]
                run.append((t,c['lap'],c['speed'],s,lat,i))
        # group contiguous
        groups=[]
        for r in run:
            if groups and r[0]-groups[-1][-1][0]<=0.0501:
                groups[-1].append(r)
            else:
                groups.append([r])
        for g in groups:
            ins=set((round(x[5]['throttle'],2),round(x[5]['steer'],2),x[5]['drift'],x[5]['boost']) for x in g if x[5])
            print('  t %.2f-%.2f (%d fr) lap%d speed %.1f-%.1f s %.1f-%.1f lat %.2f..%.2f inputs %s'%(
                g[0][0],g[-1][0],len(g),g[0][1],min(x[2] for x in g),max(x[2] for x in g),min(x[3] for x in g),max(x[3] for x in g),min(x[4] for x in g),max(x[4] for x in g),list(ins)[:4]))
