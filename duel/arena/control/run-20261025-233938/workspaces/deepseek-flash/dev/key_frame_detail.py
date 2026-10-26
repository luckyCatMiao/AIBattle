import gzip,json,sys,math
sys.path.insert(0,'dev')
from replay import Match,HIT_R
specs=[('r1-g1',2193,'176'),('r1-g2',1280,'89'),('r2-g1',1144,'90'),('r2-g2',2080,'85'),('r3-g1',1867,'148'),('r3-g1',1743,None),('r3-g2',2336,'7'),('r3-g2',2005,'160')]
for gid,fr,bid in specs:
    d=json.load(gzip.open('../../'+gid+'.json.gz','rt',encoding='utf-8'))
    wins=[(w['frame'],{'inputs':w['inputs'][0]},{'inputs':w['inputs'][1]}) for w in d['windows']]
    m=Match(d['seed'],wins).run(); our=d['seats'].index('deepseek-flash'); opp=1-our
    n=len(m.frames); fr=min(fr,n-1)
    st=m.frames[fr]; px,py=st['px'][our],st['py'][our]; ox,oy=st['px'][opp],st['py'][opp]
    print('='*90)
    print(gid,'frame',fr,'t=%.2f'%(fr*0.05),'OUR site',('P%d'%our),'me=(%.2f,%.2f)'%(px,py),'opp=(%.2f,%.2f)'%(ox,oy),'sep=%.2f'%math.hypot(px-ox,py-oy))
    print('  wall dist x=%.2f/%.2f y=%.2f/%.2f'%(px-1,39-px,py-1,29-py))
    print('  cooldowns',st['cd'])
    if bid:
        for b in st['bullets']:
            if b[5]==int(bid):
                dd=math.hypot(px-b[0],py-b[1])
                print('  bullet b%s at (%.2f,%.2f) v=(%.2f,%.2f) d=%.3f clear=%.3f'%(bid,b[0],b[1],b[2],b[3],dd,dd-HIT_R))
                break
    else:
        for b in st['bullets']:
            if b[4]==our: continue
            dd=math.hypot(px-b[0],py-b[1])
            if dd<1.2: print('  near b%d d=%.3f'%(b[5],dd))
    # show 6 frames of movement + relevant input window
    print('  trajectory:')
    for f2 in range(max(0,fr-3),min(n,fr+3)):
        s2=m.frames[f2]
        print('   ',f2,'me=(%.2f,%.2f)'%(s2['px'][our],s2['py'][our]),'opp=(%.2f,%.2f)'%(s2['px'][opp],s2['py'][opp]),'sep=%.2f'%math.hypot(s2['px'][our]-s2['px'][opp],s2['py'][our]-s2['py'][opp]),'cd=',s2['cd'])
    # find window whose frames include fr: window label = smallest multiple of 3 >= fr
    lab=((fr+2)//3)*3
    for w in d['windows']:
        if w['frame']==lab:
            print('  input window',lab,'(applies frames %d-%d)'%(lab-2,lab))
            print('   OUR',json.dumps(w['inputs'][our]))
            print('   OPP',json.dumps(w['inputs'][opp]))
            break
