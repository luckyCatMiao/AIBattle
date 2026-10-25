import gzip,json,glob,sys
D=sys.argv[1]
for fn in sorted(glob.glob(D+'/r1-g*.json.gz')):
    d=json.load(gzip.open(fn,'rt',encoding='utf-8'))
    myseat=d['seats'].index('deepseek-g1')
    fr=d['frames']
    prev=(0,0); goals=[]
    for f in fr:
        s=tuple(f['score'])
        if s!=prev:
            # 判断是谁进的
            if s[0]!=prev[0]: gt=0
            else: gt=1
            goals.append((f['frame'],gt,prev,s)); prev=s
    st=d['final']['stats']
    print('==',fn.split('/')[-1],'n=%d'%d['teamSize'],'seat',myseat,'score',d['scores'],
          'stat(my)',st[myseat],'stat(opp)',st[1-myseat])
    for gf,gt,before,after in goals:
        tag='ME ' if gt==myseat else 'OPP'
        # 找进球前 4 帧内最后一次 kick 事件
        ev=d['final'].get('events') or []
        prev_frames=fr[max(0,gf-30):gf]
        print('   %s %5.1fs %s->%s'%(tag,gf/20,before,after))
        for f in prev_frames[::6]:
            b=f['ball']
            mine=[u for u in f['units'] if u['team']==myseat]
            opp=[u for u in f['units'] if u['team']!=myseat]
            print('      f%4d ball(%5.1f,%4.1f)v(%4.1f,%4.1f)own=%-5s mine=%s opp=%s'%(
                f['frame'],b['x'],b['y'],b['vx'],b['vy'],str(b.get('owner')),
                ' '.join('%d:(%.1f,%.1f)'%(u['index'],u['x'],u['y']) for u in mine),
                ' '.join('%d:(%.1f,%.1f)'%(u['index'],u['x'],u['y']) for u in opp)))
