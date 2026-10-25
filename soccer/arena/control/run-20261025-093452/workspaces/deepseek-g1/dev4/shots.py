import gzip,json,glob,sys,math
D=sys.argv[1]
for fn in sorted(glob.glob(D+'/r1-g*.json.gz')):
    d=json.load(gzip.open(fn,'rt',encoding='utf-8'))
    myseat=d['seats'].index('deepseek-g1')
    ev=d['final'].get('events') or []
    kicks=[e for e in ev if e.get('type')=='kick']
    goals=[e for e in ev if e.get('type')=='goal']
    mine=[k for k in kicks if k['team']==myseat]
    # 统计我方起脚位置
    from collections import Counter
    c=Counter()
    near=[]
    for k in mine:
        x,y=k['x'],k['y']
        # 是否射向对方球门（夹角<30度）
        gx=43 if myseat==0 else 1
        ang=math.degrees(math.atan2(13-y, gx-x))%360
        da=abs((k['angle']-ang+180)%360-180)
        zone = 'attack' if (gx-x)*(1 if myseat==0 else -1)>0 and abs(gx-x)<18 else 'other'
        if da<25 and zone=='attack':
            near.append((round(x,1),round(y,1),round(da,1)))
            c['shot@%d'%(int(x)//5*5)]+=1
        else:
            c['other']+=1
    print('==',fn.split('/')[-1],'n=%d'%d['teamSize'],'score',d['scores'],'mykicks',len(mine),'goals',[ (e['team'],round(e['t'],1)) for e in goals])
    print('   zones',dict(c))
    print('   shots',near[:40])
