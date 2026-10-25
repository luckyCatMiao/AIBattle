import gzip,json,glob,sys,math
D=sys.argv[1]
for fn in sorted(glob.glob(D+'/r1-g*.json.gz')):
    d=json.load(gzip.open(fn,'rt',encoding='utf-8'))
    my=d['seats'].index('deepseek-g1')
    ev=d['final'].get('events') or []
    kicks=[e for e in ev if e.get('type')=='kick']
    goals=[e for e in ev if e.get('type')=='goal']
    fr=d['frames']
    print('==',fn.split('/')[-1],'n=%d'%d['teamSize'],'myseat',my,'score',d['scores'])
    for g in goals:
        if g['team']==my: continue
        # 找该进球前最后一次对手起脚
        k=[x for x in kicks if x['team']!=my and x['frame']<=g['frame'] and g['frame']-x['frame']<80]
        kk=k[-1] if k else None
        if not kk: 
            print('  goal t%.1f (no kick found)'%g['t']); continue
        f=fr[kk['frame']]
        mine=[u for u in f['units'] if u['team']==my]
        opp=[u for u in f['units'] if u['team']!=my]
        print('  GOAL t%.1f shot from (%.1f,%.1f) ang=%.0fdeg dist=%.1f'%(
            g['t'],kk['x'],kk['y'],math.degrees(kk['angle'])%360,
            math.hypot((1 if my==0 else 43)-kk['x'],13-kk['y'])))
        print('     mine:', ' '.join('#%d(%.1f,%.1f)'%(u['index'],u['x'],u['y']) for u in mine))
        print('     opp :', ' '.join('#%d(%.1f,%.1f)'%(u['index'],u['x'],u['y']) for u in opp))
