import gzip,json,glob,sys,math
D=sys.argv[1]
for fn in sorted(glob.glob(D+'/r1-g*.json.gz')):
    d=json.load(gzip.open(fn,'rt',encoding='utf-8'))
    my=d['seats'].index('deepseek-g1')
    ev=d['final'].get('events') or []
    gx=43 if my==0 else 1
    kicks=[e for e in ev if e.get('type')=='kick']
    mine=[k for k in kicks if k['team']==my]
    shots=[]
    for k in mine:
        x,y,a=k['x'],k['y'],math.degrees(k['angle'])%360
        ang=math.degrees(math.atan2(13-y,gx-x))%360
        da=abs((a-ang+180)%360-180)
        dist=math.hypot(gx-x,13-y)
        if da<30 and dist<20: shots.append((round(k['t'],1),round(x,1),round(y,1),round(dist,1),round(da,1)))
    goals=[(e['team'],round(e['t'],1)) for e in ev if e.get('type')=='goal']
    print('==',fn.split('/')[-1],'n=%d'%d['teamSize'],'score',d['scores'],'mykicks',len(mine),'shots',len(shots),'goals',goals)
    print('   ',shots[:15])
