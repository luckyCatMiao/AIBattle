import json, io, math

def load(name):
    return json.load(io.open('tools/r3/%s.json'%name,encoding='utf-8'))

def runs(frames, idx, key):
    out=[]; start=None
    for f in frames:
        v=bool(f['cars'][idx][key])
        if v and start is None: start=f['tick']
        if not v and start is not None:
            out.append((start,f['tick'],(f['tick']-start)*0.05)); start=None
    if start is not None:
        out.append((start,frames[-1]['tick'],(frames[-1]['tick']-start)*0.05))
    return out

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
    d=load(name); frames=d['frames']; L=d['track']['length']
    fin=d['final']
    print('='*100)
    print(name,'seed',d['seed'],'track L=%.3f halfWidth=%.3f roadTiles=%d minSelfDist=%.3f attempt=%d'%(
        L,d['track']['halfWidth'],d['track']['audit']['roadTiles'],d['track']['audit']['minSelfDistance'],d['track']['audit']['attempt']))
    # lap times from events
    laps={0:[],1:[]}
    for e in d['events']:
        if e['type']=='lap': laps[e['team']].append((e['t'],e['lap'],e['time']))
    for idx in range(2):
        car=frames[0]['cars'][idx]
        # after go
        run=[f for f in frames if f['tick']>=30]
        dr=runs(frames,idx,'drifting'); bo=runs(frames,idx,'boosting')
        overlap=sum(1 for f in run if f['cars'][idx]['drifting'] and f['cars'][idx]['boosting'])
        off=sum(1 for f in run if f['cars'][idx]['offRoad'])
        maxsp=max(f['cars'][idx]['speed'] for f in run)
        avgsp=sum(f['cars'][idx]['speed'] for f in run)/len(run)
        # excluding stationary first 5 ticks
        mov=[f['cars'][idx]['speed'] for f in run if f['cars'][idx]['speed']>1]
        firstbo=bo[0][0]*0.05 if bo else None
        firstdr=dr[0][0]*0.05 if dr else None
        # progress: cumulative lap*L + s within lap (projection)
        f_last=frames[-1]; c=f_last['cars'][idx]
        s,lat=proj(d['track']['points'],c['x'],c['y'])
        total=c['lap']*L+s
        print('\ncar%d %s'%(idx,d['seats'][idx]))
        print('  laps:',laps[idx])
        print('  bestLap public %.2f  finishTime %.2f  finished %s'%(c['bestLap'] or -1,c['finishTime'] or -1,c['finished']))
        print('  driftTime public %.2f  drift frames %d (%.2fs), segments %d, first %.2fs, longest %.2fs'%(
            c['driftTime'],sum(x[2] for x in dr)*20,len(dr),len(dr),firstdr or -1,max([x[2] for x in dr] or [0]))) if False else None
        print('  drift: public %.2f  frames %d (%.2fs) segments %d first %s longest %.2fs'%(
            c['driftTime'],sum((x[1]-x[0]) for x in dr),sum((x[1]-x[0]) for x in dr)*0.05,len(dr),('%.2f'%firstdr if firstdr else '-'),max([x[2] for x in dr] or [0])))
        print('  boost: public count %d  frames %d (%.2fs) segments %d first %s longest %.2fs'%(
            c['boosts'],sum((x[1]-x[0]) for x in bo),sum((x[1]-x[0]) for x in bo)*0.05,len(bo),('%.2f'%firstbo if firstbo else '-'),max([x[2] for x in bo] or [0])))
        print('  overlap drift+boost frames %d (%.2fs)'%(overlap,overlap*0.05))
        print('  offroad %d frames, collisions %d, max speed %.2f, avg speed %.2f (moving %.2f)'%(
            off,c['collisions'],maxsp,avgsp,sum(mov)/len(mov)))
        print('  final total distance %.2f (%.3f laps), last lap s=%.2f lat=%+.2f'%(total,total/L,s,lat))
        print('  boost run lengths (s):',[round(x[2],2) for x in bo])
        print('  drift run lengths (s):',[round(x[2],2) for x in dr])
    # gap at finish: winner finish time, other projection
    winner=d['winner']; loser=1-winner
    tw=[e for e in d['events'] if e['type']=='finish'][0]['t']
    # find frame of finish
    fr=[f for f in frames if f['tick']*0.05>=tw][0]
    cw=fr['cars'][winner]; cl=fr['cars'][loser]
    sw,law=proj(d['track']['points'],cw['x'],cw['y']); sl,lal=proj(d['track']['points'],cl['x'],cl['y'])
    # winner at finish has total maybe lap Lapped
    totalw=cw['lap']*L+sw; totall=cl['lap']*L+sl
    # winner finish line should be laps*L (approx)
    print('\nfinish t=%.2f: winner car%d lap%d total %.2f; loser car%d lap%d total %.2f; gap %.2f m (%.3f lap), loser remaining %.2f m'%(
        tw,winner,cw['lap'],totalw,loser,cl['lap'],totall,totalw-totall,(totalw-totall)/L, (3*L-totall)))
